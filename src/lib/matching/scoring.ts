import type { CreatorMetrics, TikTokCreator } from "@/lib/tiktok/schemas";
import {
  type ConfidenceLevel,
  type CreatorContentEvaluation,
  type CreatorQualification,
  DEFAULT_MATCHING_WEIGHTS,
  type MatchingScoreBreakdown,
  type MatchingWeights,
  MatchingWeightsSchema,
  type RankedKOLRecommendation,
} from "./schemas";

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}

/**
 * Pure function: Computes the deterministic Content Fit score (0-100) from the AI rubric subscores.
 *
 * Formula:
 * `0.40 * categoryRelevanceScore + 0.35 * productRelevanceScore + 0.25 * contentStyleScore`
 */
export function calculateDeterministicContentFitScore(
  evaluation: Pick<
    CreatorContentEvaluation,
    "categoryRelevanceScore" | "productRelevanceScore" | "contentStyleScore"
  > | null
): number | null {
  if (!evaluation) return null;

  const { categoryRelevanceScore, productRelevanceScore, contentStyleScore } =
    evaluation;
  if (
    !Number.isFinite(categoryRelevanceScore) ||
    !Number.isFinite(productRelevanceScore) ||
    !Number.isFinite(contentStyleScore)
  ) {
    return null;
  }

  const raw =
    0.4 * categoryRelevanceScore +
    0.35 * productRelevanceScore +
    0.25 * contentStyleScore;

  return clampScore(raw);
}

/**
 * Pure function: Computes the Market Fit score (0-100 or null).
 *
 * Missing-Data Policy:
 * - If `qualification.marketRelevance === "not_observed"` and `aiMarketFitScore === null`,
 *   returns `null` (never fabricates a score when market evidence is unavailable).
 * - Otherwise blends deterministic language/script qualification signals (50%) with
 *   `aiMarketFitScore` (50%) when present.
 */
export function calculateDeterministicMarketFitScore(
  qualification: Pick<CreatorQualification, "marketRelevance">,
  aiMarketFitScore: number | null
): number | null {
  if (
    qualification.marketRelevance === "not_observed" &&
    aiMarketFitScore === null
  ) {
    return null;
  }

  let deterministicSignalScore: number;
  if (qualification.marketRelevance === "relevant") {
    deterministicSignalScore = 90;
  } else if (qualification.marketRelevance === "uncertain") {
    deterministicSignalScore = 50;
  } else {
    deterministicSignalScore = 20;
  }

  if (aiMarketFitScore === null || !Number.isFinite(aiMarketFitScore)) {
    return clampScore(deterministicSignalScore);
  }

  return clampScore(0.5 * deterministicSignalScore + 0.5 * aiMarketFitScore);
}

/**
 * Pure function: Normalizes engagement rate by views `(likes + comments + shares) / views`
 * onto a 0-100 scale using a logarithmic saturation curve so extreme viral outliers do not
 * distort rankings linearly.
 *
 * Returns `null` if `engagementRate` is `null` or negative.
 */
export function normalizeEngagementRateScore(
  engagementRate: number | null
): number | null {
  if (
    engagementRate === null ||
    typeof engagementRate !== "number" ||
    !Number.isFinite(engagementRate) ||
    engagementRate < 0
  ) {
    return null;
  }

  if (engagementRate === 0) return 0;

  // Saturates at 15% engagement rate (0.15 -> 100) using natural log
  const scaled = (Math.log(1 + engagementRate * 100) / Math.log(1 + 15)) * 100;
  return clampScore(scaled);
}

/**
 * Pure function: Normalizes `medianViews` onto a 0-100 scale using a log10 curve
 * bounded between 100 views (0) and 5,000,000 views (100).
 *
 * Note: Raw follower count is intentionally NOT used as a linear ranking factor.
 * Returns `null` if `medianViews` is `null` or negative.
 */
export function normalizeMedianViewsScore(
  medianViews: number | null
): number | null {
  if (
    medianViews === null ||
    typeof medianViews !== "number" ||
    !Number.isFinite(medianViews) ||
    medianViews < 0
  ) {
    return null;
  }

  if (medianViews <= 100) return 0;

  const minLog = 2; // log10(100)
  const maxLog = Math.log10(5_000_000); // ~6.69897
  const currentLog = Math.log10(medianViews);

  const scaled = ((currentLog - minLog) / (maxLog - minLog)) * 100;
  return clampScore(scaled);
}

/**
 * Pure function: Returns the sample-size reliability factor based on `sampledVideosCount`.
 *
 * - `0` videos -> `0`
 * - `1` video (single-video sample) -> `0.75` (provisional cap; single video is not representative)
 * - `2` videos -> `0.88`
 * - `>= 3` videos -> `1.0`
 */
export function getSampleSizeReliabilityFactor(
  sampledVideosCount: number
): number {
  if (sampledVideosCount <= 0) return 0;
  if (sampledVideosCount === 1) return 0.75;
  if (sampledVideosCount === 2) return 0.88;
  return 1.0;
}

/**
 * Pure function: Computes the Performance Fit score (0-100 or null) from Step 2 `CreatorMetrics`.
 *
 * Missing-Data Policy:
 * - If `sampledVideosCount === 0`, `medianViews === null`, or `averageEngagementRate === null`,
 *   returns `score: null` so missing performance statistics never become fabricated or zero scores.
 * - Preserves single-video sample limitations by applying `sampleSizeReliabilityFactor = 0.75`
 *   when `sampledVideosCount === 1` (`isProvisionalSingleVideo: true`).
 */
export function calculateDeterministicPerformanceFitScore(
  metrics: Pick<
    CreatorMetrics,
    | "sampledVideosCount"
    | "medianViews"
    | "averageEngagementRate"
    | "isSingleVideoSample"
  >
): {
  score: number | null;
  engagementScore: number | null;
  viewReachScore: number | null;
  sampleSizeReliabilityFactor: number;
  isProvisionalSingleVideo: boolean;
} {
  const engagementScore = normalizeEngagementRateScore(
    metrics.averageEngagementRate
  );
  const viewReachScore = normalizeMedianViewsScore(metrics.medianViews);
  const sampleSizeReliabilityFactor = getSampleSizeReliabilityFactor(
    metrics.sampledVideosCount
  );
  const isProvisionalSingleVideo = metrics.isSingleVideoSample;

  if (
    metrics.sampledVideosCount <= 0 ||
    engagementScore === null ||
    viewReachScore === null
  ) {
    return {
      score: null,
      engagementScore,
      viewReachScore,
      sampleSizeReliabilityFactor,
      isProvisionalSingleVideo,
    };
  }

  const combinedRaw = 0.6 * engagementScore + 0.4 * viewReachScore;
  const score = clampScore(combinedRaw * sampleSizeReliabilityFactor);

  return {
    score,
    engagementScore,
    viewReachScore,
    sampleSizeReliabilityFactor,
    isProvisionalSingleVideo,
  };
}

/**
 * Pure function: Computes the Creator Suitability score (0-100 or null) from qualification evidence.
 *
 * Rules:
 * - Never awards positive collaboration suitability when collaboration evidence is missing.
 * - Returns `null` when both bio and collaboration availability are missing (`MISSING_CREATOR_BIO`).
 * - Returns a conservative sub-neutral score (`45`) when bio exists but does not mention collaboration terms.
 * - Awards `95` for verified `individual_creator` with explicit work contact and no store-handle ambiguity (`70` if handle is ambiguous).
 */
export function calculateDeterministicCreatorSuitabilityScore(
  qualification: CreatorQualification
): number | null {
  if (qualification.status === "excluded") {
    return 0;
  }

  if (
    qualification.collaborationAvailability === "unknown" &&
    qualification.reasonCodes.includes("MISSING_CREATOR_BIO")
  ) {
    return null;
  }

  if (qualification.collaborationAvailability === "open_to_collab") {
    const hasAmbiguousStoreSignal = qualification.reasonCodes.includes(
      "AMBIGUOUS_STORE_OR_CURATOR_HANDLE"
    );
    return hasAmbiguousStoreSignal ? 70 : 95;
  }

  // Bio is present, but no explicit collaboration contact or restriction was observed
  return 45;
}

/**
 * Pure function: Computes the full `MatchingScoreBreakdown` using configurable weights
 * and the documented missing-data policy.
 *
 * Missing-Data Policy:
 * - Unavailable components remain `null` and are listed in `missingComponents`.
 * - `observedWeightCoverage` is the sum of weights for non-null components.
 * - `rawWeightedScore` is the weighted average across observed components.
 * - `finalMatchScore` applies a deterministic coverage factor `(0.85 + 0.15 * observedWeightCoverage)`
 *   so partially observed records are never treated as zero nor ranked as equally certain as fully observed records.
 */
export function calculateMatchingScoreBreakdown(params: {
  qualification: CreatorQualification;
  contentEvaluation: CreatorContentEvaluation;
  metrics: CreatorMetrics;
  weights?: Partial<MatchingWeights>;
}): MatchingScoreBreakdown {
  const appliedWeights = MatchingWeightsSchema.parse({
    ...DEFAULT_MATCHING_WEIGHTS,
    ...params.weights,
  });

  const contentFitScore = calculateDeterministicContentFitScore(
    params.contentEvaluation
  );
  const marketFitScore = calculateDeterministicMarketFitScore(
    params.qualification,
    params.contentEvaluation.marketFitScore
  );
  const perfResult = calculateDeterministicPerformanceFitScore(params.metrics);
  const performanceFitScore = perfResult.score;
  const creatorSuitabilityScore = calculateDeterministicCreatorSuitabilityScore(
    params.qualification
  );

  const missingComponents: string[] = [];
  let weightedSum = 0;
  let observedWeightCoverage = 0;

  if (contentFitScore !== null) {
    weightedSum += appliedWeights.contentFit * contentFitScore;
    observedWeightCoverage += appliedWeights.contentFit;
  } else {
    missingComponents.push("contentFit");
  }

  if (marketFitScore !== null) {
    weightedSum += appliedWeights.marketFit * marketFitScore;
    observedWeightCoverage += appliedWeights.marketFit;
  } else {
    missingComponents.push("marketFit");
  }

  if (performanceFitScore !== null) {
    weightedSum += appliedWeights.performanceFit * performanceFitScore;
    observedWeightCoverage += appliedWeights.performanceFit;
  } else {
    missingComponents.push("performanceFit");
  }

  if (creatorSuitabilityScore !== null) {
    weightedSum += appliedWeights.creatorSuitability * creatorSuitabilityScore;
    observedWeightCoverage += appliedWeights.creatorSuitability;
  } else {
    missingComponents.push("creatorSuitability");
  }

  const normalizedCoverage = Math.min(
    1,
    Math.max(0, Math.round(observedWeightCoverage * 1000) / 1000)
  );

  if (normalizedCoverage <= 0) {
    return {
      contentFitScore,
      marketFitScore,
      performanceFitScore,
      creatorSuitabilityScore,
      performanceSubscores: {
        engagementScore: perfResult.engagementScore,
        viewReachScore: perfResult.viewReachScore,
        sampleSizeReliabilityFactor: perfResult.sampleSizeReliabilityFactor,
        isProvisionalSingleVideo: perfResult.isProvisionalSingleVideo,
      },
      appliedWeights,
      observedWeightCoverage: 0,
      rawWeightedScore: null,
      finalMatchScore: 0,
      missingComponents,
    };
  }

  const rawWeightedScore = clampScore(weightedSum / normalizedCoverage);
  const coverageAdjustment = 0.85 + 0.15 * normalizedCoverage;
  const finalMatchScore = clampScore(rawWeightedScore * coverageAdjustment);

  return {
    contentFitScore,
    marketFitScore,
    performanceFitScore,
    creatorSuitabilityScore,
    performanceSubscores: {
      engagementScore: perfResult.engagementScore,
      viewReachScore: perfResult.viewReachScore,
      sampleSizeReliabilityFactor: perfResult.sampleSizeReliabilityFactor,
      isProvisionalSingleVideo: perfResult.isProvisionalSingleVideo,
    },
    appliedWeights,
    observedWeightCoverage: normalizedCoverage,
    rawWeightedScore,
    finalMatchScore,
    missingComponents,
  };
}

/**
 * Pure function: Computes the overall recommendation confidence level (`low` | `medium` | `high`),
 * separating ranking score from data confidence.
 *
 * Rules:
 * - Single-video samples (`sampledVideosCount < 3`) can never have `"high"` confidence;
 *   they are capped at `"medium"` (or `"low"` if components are missing or qualification requires review).
 */
export function resolveOverallConfidenceLevel(params: {
  qualification: CreatorQualification;
  contentEvaluation: CreatorContentEvaluation;
  metrics: CreatorMetrics;
  scoreBreakdown: MatchingScoreBreakdown;
}): ConfidenceLevel {
  const { qualification, contentEvaluation, metrics, scoreBreakdown } = params;

  if (
    scoreBreakdown.observedWeightCoverage < 0.8 ||
    metrics.dataCompleteness < 0.85 ||
    contentEvaluation.confidenceLevel === "low" ||
    qualification.marketRelevance === "not_observed" ||
    qualification.accountType === "unknown"
  ) {
    return "low";
  }

  // Single-video samples cannot reach "high" confidence because creator-level consistency is unproven
  if (
    metrics.isSingleVideoSample ||
    !metrics.isRepresentativeCreatorPerformance ||
    qualification.status === "needs_review" ||
    contentEvaluation.confidenceLevel === "medium"
  ) {
    return "medium";
  }

  return "high";
}

/**
 * Pure function: Builds an unranked `RankedKOLRecommendation` (with `rank: 1` placeholder)
 * prior to deterministic sorting.
 */
export function buildCreatorRecommendation(params: {
  creator: TikTokCreator;
  qualification: CreatorQualification;
  contentEvaluation: CreatorContentEvaluation;
  evidenceWarnings?: string[];
  weights?: Partial<MatchingWeights>;
}): RankedKOLRecommendation {
  const { creator, qualification, contentEvaluation } = params;

  const scoreBreakdown = calculateMatchingScoreBreakdown({
    qualification,
    contentEvaluation,
    metrics: creator.metrics,
    weights: params.weights,
  });

  const confidenceLevel = resolveOverallConfidenceLevel({
    qualification,
    contentEvaluation,
    metrics: creator.metrics,
    scoreBreakdown,
  });

  const missingDataWarnings: string[] = [];
  if (creator.metrics.isSingleVideoSample) {
    missingDataWarnings.push(creator.metrics.sampleRepresentativenessNote);
  }
  if (creator.metrics.missingFields.length > 0) {
    missingDataWarnings.push(
      `Missing raw fields: ${creator.metrics.missingFields.join(", ")}`
    );
  }
  if (scoreBreakdown.missingComponents.length > 0) {
    missingDataWarnings.push(
      `Unavailable score dimensions (${scoreBreakdown.missingComponents.join(", ")}); score coverage is ${Math.round(scoreBreakdown.observedWeightCoverage * 100)}%.`
    );
  }
  for (const me of contentEvaluation.missingEvidence) {
    if (!missingDataWarnings.includes(me)) {
      missingDataWarnings.push(me);
    }
  }
  for (const ew of params.evidenceWarnings ?? []) {
    missingDataWarnings.push(ew);
  }

  // Collect verified video URLs cited in supportingEvidence, falling back to creator's sampled video URLs
  const citedUrls = contentEvaluation.supportingEvidence
    .map((e) => e.videoUrl)
    .filter((u): u is string => typeof u === "string" && u.length > 0);
  const allCreatorVideoUrls = creator.videos
    .map((v) => v.videoUrl)
    .filter((u): u is string => typeof u === "string" && u.length > 0);
  const supportingVideoUrls = Array.from(
    new Set(citedUrls.length > 0 ? citedUrls : allCreatorVideoUrls)
  );

  const concerns = [...contentEvaluation.concerns];
  if (
    qualification.reasonCodes.includes("AMBIGUOUS_STORE_OR_CURATOR_HANDLE") &&
    !concerns.some((c) => /store|curator|ร้าน/i.test(c))
  ) {
    concerns.push(
      "Handle or bio contains store/curator indicators; verify individual creator status before outreach."
    );
  }
  if (
    qualification.collaborationAvailability === "unknown" &&
    !concerns.some((c) => /collaboration|contact|ติดต่องาน/i.test(c))
  ) {
    concerns.push(
      "No explicit collaboration contact found in bio; availability for sponsored work is unconfirmed."
    );
  }

  return {
    creatorId: creator.creatorId,
    username: creator.username,
    displayName: creator.nickname?.trim() || creator.username,
    profileUrl: creator.profileUrl,
    followers: creator.followers,
    matchScore: scoreBreakdown.finalMatchScore,
    rank: 1,
    scoreBreakdown,
    qualificationStatus: qualification.status,
    qualification,
    contentEvaluation,
    contentFitExplanation: contentEvaluation.explanation,
    strengths: contentEvaluation.strengths,
    concerns,
    supportingVideoUrls,
    sampledVideosCount: creator.metrics.sampledVideosCount,
    medianViews: creator.metrics.medianViews,
    averageEngagementRate: creator.metrics.averageEngagementRate,
    dataCompleteness: creator.metrics.dataCompleteness,
    confidenceLevel,
    missingDataWarnings,
    requiresManualReview: qualification.manualReviewRequired,
  };
}

/**
 * Pure function: Sorts recommendations deterministically and assigns 1-based `rank`.
 *
 * Tie-breaking order:
 * 1. `matchScore` descending
 * 2. `scoreBreakdown.contentFitScore` descending
 * 3. `scoreBreakdown.observedWeightCoverage` descending
 * 4. `creatorId` lexical ascending
 */
export function rankRecommendationsDeterministically(
  items: readonly RankedKOLRecommendation[],
  limit?: number
): RankedKOLRecommendation[] {
  const sorted = [...items].sort((a, b) => {
    if (b.matchScore !== a.matchScore) {
      return b.matchScore - a.matchScore;
    }

    const aContent = a.scoreBreakdown.contentFitScore ?? -1;
    const bContent = b.scoreBreakdown.contentFitScore ?? -1;
    if (bContent !== aContent) {
      return bContent - aContent;
    }

    if (
      b.scoreBreakdown.observedWeightCoverage !==
      a.scoreBreakdown.observedWeightCoverage
    ) {
      return (
        b.scoreBreakdown.observedWeightCoverage -
        a.scoreBreakdown.observedWeightCoverage
      );
    }

    return a.creatorId.localeCompare(b.creatorId);
  });

  const sliced =
    typeof limit === "number" && limit > 0 ? sorted.slice(0, limit) : sorted;

  return sliced.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}
