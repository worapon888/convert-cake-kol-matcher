import {
  OpenAIAnalysisError,
  OpenAIConfigurationError,
} from "@/lib/ai/openai-client";
import { BrandProfileSchema } from "@/lib/brand/schemas";
import {
  loadNormalizedTikTokFixture,
  normalizeRawApifyFixture,
} from "@/lib/tiktok/fixtures";
import type { TikTokCreator } from "@/lib/tiktok/schemas";
import {
  type ContentEvaluationOptions,
  evaluateCreatorContentFit,
  validateAndSanitizeContentEvaluation,
} from "./content-evaluator";
import { getOfflineFixtureContentEvaluation } from "./fixtures";
import { deduplicateCreators, qualifyCreator } from "./qualification";
import {
  DEFAULT_MATCHING_WEIGHTS,
  type ExcludedCreatorRecord,
  type KOLMatchingResult,
  KOLMatchingResultSchema,
  MATCHING_ALGORITHM_VERSION,
  type MatchingDataSourceMode,
  type MatchingEvaluateRequest,
  MatchingEvaluateRequestSchema,
  type MatchingExecutionMode,
  type MatchingWeights,
  MatchingWeightsSchema,
  type RankedKOLRecommendation,
} from "./schemas";
import {
  buildCreatorRecommendation,
  rankRecommendationsDeterministically,
} from "./scoring";

/** Maximum number of non-excluded creators evaluated in a single matching request */
export const MAX_EVALUATED_CREATORS = 20;

export interface RunKOLMatchingOptions {
  /**
   * Optional custom creator pool (used in unit tests or custom dataset evaluations).
   * If omitted, loads creators from the specified `dataSource` fixture.
   */
  creators?: readonly TikTokCreator[];
  contentEvaluation?: ContentEvaluationOptions;
  maxCandidatesToEvaluate?: number;
}

function loadCreatorsForDataSource(dataSource: MatchingDataSourceMode): {
  creators: TikTokCreator[];
  sourceDatasetTimestamp: string | null;
} {
  if (dataSource === "fixture") {
    const primary = loadNormalizedTikTokFixture();
    return {
      creators: primary.creators,
      sourceDatasetTimestamp: "2026-10-26T13:14:36.815Z",
    };
  }

  if (dataSource === "fixture_batch2") {
    const batch2 = normalizeRawApifyFixture("batch2");
    return {
      creators: batch2.creators,
      sourceDatasetTimestamp: "2026-10-26T13:21:37.182Z",
    };
  }

  const primary = loadNormalizedTikTokFixture();
  const batch2 = normalizeRawApifyFixture("batch2");
  return {
    creators: [...primary.creators, ...batch2.creators],
    sourceDatasetTimestamp: "2026-10-26T13:21:37.182Z",
  };
}

function buildExclusionSummary(
  creator: TikTokCreator,
  reasonCodes: readonly string[]
): string {
  if (
    reasonCodes.includes("OFFICIAL_BRAND_OR_STORE_ACCOUNT") ||
    reasonCodes.includes("MANUAL_BRAND_ACCOUNT_OVERRIDE")
  ) {
    return `Excluded @${creator.username}: Identified as an official brand or company storefront account rather than an independent creator.`;
  }
  if (reasonCodes.includes("EXPLICIT_NO_REVIEW_RESTRICTION")) {
    return `Excluded @${creator.username}: Creator bio explicitly states they do not accept sponsored reviews or collaborations.`;
  }
  if (reasonCodes.includes("NO_SAMPLED_VIDEOS")) {
    return `Excluded @${creator.username}: No sampled videos available in the dataset.`;
  }
  return `Excluded @${creator.username}: Did not meet minimum creator qualification criteria (${reasonCodes.join(", ")}).`;
}

/**
 * Executes the end-to-end KOL Matching & Ranking pipeline:
 * 1. Validates `BrandProfile` and request configuration
 * 2. Loads and deduplicates candidate `TikTokCreator` records
 * 3. Runs deterministic `qualifyCreator` to separate `excluded` vs. `eligible` / `needs_review`
 * 4. Runs content relevance evaluation (`fixture_mock` or `live_ai`) with evidence verification
 * 5. Computes deterministic weighted scores (`scoring.ts`) and ranks candidates
 */
export async function runKOLMatchingPipeline(
  rawRequest: unknown,
  options: RunKOLMatchingOptions = {}
): Promise<KOLMatchingResult> {
  const request: MatchingEvaluateRequest =
    MatchingEvaluateRequestSchema.parse(rawRequest);
  const brandProfile = BrandProfileSchema.parse(request.brandProfile);
  const weights: MatchingWeights = MatchingWeightsSchema.parse(
    request.weights ?? DEFAULT_MATCHING_WEIGHTS
  );
  const executionMode: MatchingExecutionMode = request.executionMode;

  const { creators: rawCreators, sourceDatasetTimestamp } = options.creators
    ? { creators: [...options.creators], sourceDatasetTimestamp: null }
    : loadCreatorsForDataSource(request.dataSource);

  const deduplicated = deduplicateCreators(rawCreators);
  const maxBound = options.maxCandidatesToEvaluate ?? MAX_EVALUATED_CREATORS;
  const boundedCandidates = deduplicated.slice(0, maxBound);

  const globalWarnings: string[] = [];
  if (deduplicated.length > maxBound) {
    globalWarnings.push(
      `Candidate pool truncated from ${deduplicated.length} to ${maxBound} creators to bound evaluation latency and API cost.`
    );
  }

  const allSingleVideo =
    boundedCandidates.length > 0 &&
    boundedCandidates.every((c) => c.metrics.isSingleVideoSample);
  if (allSingleVideo) {
    globalWarnings.push(
      "Dataset Limitation: Every evaluated creator currently has only 1 sampled video (sampledVideosCount = 1). Performance Fit scores are marked provisional (0.75x reliability cap) and must not be interpreted as representative creator-level averages."
    );
  }

  if (executionMode === "fixture_mock") {
    globalWarnings.push(
      "Execution Mode: fixture_mock (Offline Demo/Test Mode). Content Fit scores use deterministic offline test evaluations rather than live OpenAI calls."
    );
  }

  const excludedCreators: ExcludedCreatorRecord[] = [];
  const qualifiedCandidates: Array<{
    creator: TikTokCreator;
    qualification: ReturnType<typeof qualifyCreator>;
  }> = [];

  for (const creator of boundedCandidates) {
    const qualification = qualifyCreator(creator, brandProfile);
    if (qualification.status === "excluded") {
      excludedCreators.push({
        creatorId: creator.creatorId,
        username: creator.username,
        displayName: creator.nickname?.trim() || creator.username,
        profileUrl: creator.profileUrl,
        followers: creator.followers,
        qualification,
        exclusionSummary: buildExclusionSummary(
          creator,
          qualification.reasonCodes
        ),
      });
    } else {
      qualifiedCandidates.push({ creator, qualification });
    }
  }

  const unrankedRecommendations: RankedKOLRecommendation[] = [];
  let llmModelUsed =
    executionMode === "fixture_mock"
      ? "fixture_mock:offline-test-rubric"
      : "openai:pending";
  let lastLiveAiError: Error | null = null;

  for (const { creator, qualification } of qualifiedCandidates) {
    if (executionMode === "fixture_mock") {
      const rawEval = options.contentEvaluation?.generateEvaluationFn
        ? (
            await options.contentEvaluation.generateEvaluationFn({
              creator,
              brandProfile,
              systemInstructions: "fixture_mock",
              userPrompt: "fixture_mock",
            })
          ).data
        : getOfflineFixtureContentEvaluation(creator, brandProfile);

      const { evaluation, evidenceWarnings } =
        validateAndSanitizeContentEvaluation(rawEval, creator);

      unrankedRecommendations.push(
        buildCreatorRecommendation({
          creator,
          qualification,
          contentEvaluation: evaluation,
          evidenceWarnings,
          weights,
        })
      );
      continue;
    }

    // executionMode === "live_ai"
    // Never silently substitute mock AI analysis during a requested live evaluation!
    try {
      const liveResult = await evaluateCreatorContentFit(
        brandProfile,
        creator,
        options.contentEvaluation
      );
      llmModelUsed = liveResult.modelUsed;

      unrankedRecommendations.push(
        buildCreatorRecommendation({
          creator,
          qualification,
          contentEvaluation: liveResult.evaluation,
          evidenceWarnings: liveResult.evidenceWarnings,
          weights,
        })
      );
    } catch (err) {
      if (err instanceof OpenAIConfigurationError) {
        // Fail fast if API key or model configuration is missing/invalid
        throw err;
      }

      lastLiveAiError =
        err instanceof Error ? err : new Error("OpenAI evaluation failed");
      const reason = lastLiveAiError.message;

      // If the error is an authentication (401) or rate-limit/quota (429) error on the first candidate, fail immediately
      if (
        err instanceof OpenAIAnalysisError &&
        (err.statusCode === 401 ||
          err.statusCode === 403 ||
          (err.code === "RATE_LIMIT" && unrankedRecommendations.length === 0))
      ) {
        throw err;
      }

      globalWarnings.push(
        `Live AI evaluation failed for @${creator.username} (${reason}); candidate was skipped instead of substituting mock data.`
      );
    }
  }

  // If live_ai was requested and every single qualified candidate failed AI evaluation, throw the error
  if (
    executionMode === "live_ai" &&
    qualifiedCandidates.length > 0 &&
    unrankedRecommendations.length === 0 &&
    lastLiveAiError
  ) {
    throw lastLiveAiError;
  }

  const rankedRecommendations = rankRecommendationsDeterministically(
    unrankedRecommendations,
    request.limit
  );

  const manualReviewCount = rankedRecommendations.filter(
    (r) => r.requiresManualReview
  ).length;

  return KOLMatchingResultSchema.parse({
    metadata: {
      algorithmVersion: MATCHING_ALGORITHM_VERSION,
      weights,
      dataSource: request.dataSource,
      executionMode,
      isOfflineDemoOutput: executionMode === "fixture_mock",
      sourceDatasetTimestamp,
      scoringTimestamp: new Date().toISOString(),
      llmModelUsed,
      totalCandidatesEvaluated: boundedCandidates.length,
      recommendedCount: rankedRecommendations.length,
      excludedCount: excludedCreators.length,
      manualReviewCount,
      globalWarnings,
    },
    recommendations: rankedRecommendations,
    excludedCreators,
  });
}
