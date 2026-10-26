import { z } from "zod";
import { BrandProfileSchema } from "@/lib/brand/schemas";

export const MATCHING_ALGORITHM_VERSION = "1.0.0-mvp" as const;

export const QualificationStatusSchema = z.enum([
  "eligible",
  "needs_review",
  "excluded",
]);
export type QualificationStatus = z.infer<typeof QualificationStatusSchema>;

export const CreatorAccountTypeSchema = z.enum([
  "individual_creator",
  "brand_account",
  "unknown",
]);
export type CreatorAccountType = z.infer<typeof CreatorAccountTypeSchema>;

export const CollaborationAvailabilitySchema = z.enum([
  "open_to_collab",
  "restricted",
  "unknown",
]);
export type CollaborationAvailability = z.infer<
  typeof CollaborationAvailabilitySchema
>;

export const MarketRelevanceStatusSchema = z.enum([
  "relevant",
  "uncertain",
  "not_observed",
]);
export type MarketRelevanceStatus = z.infer<typeof MarketRelevanceStatusSchema>;

export const QualificationReasonCodeSchema = z.enum([
  "OFFICIAL_BRAND_OR_STORE_ACCOUNT",
  "MANUAL_BRAND_ACCOUNT_OVERRIDE",
  "EXPLICIT_NO_REVIEW_RESTRICTION",
  "NO_SAMPLED_VIDEOS",
  "EXPLICIT_WORK_CONTACT_OBSERVED",
  "COLLABORATION_AVAILABILITY_UNSPECIFIED",
  "AMBIGUOUS_STORE_OR_CURATOR_HANDLE",
  "MISSING_CREATOR_BIO",
  "THAI_MARKET_SIGNAL_OBSERVED",
  "UNCERTAIN_MARKET_RELEVANCE",
  "SINGLE_VIDEO_SAMPLE_LIMITATION",
  "INCOMPLETE_PERFORMANCE_METRICS",
]);
export type QualificationReasonCode = z.infer<
  typeof QualificationReasonCodeSchema
>;

/**
 * Deterministic Creator Qualification output (Section 2 & 6).
 */
export const CreatorQualificationSchema = z.object({
  creatorId: z.string().min(1),
  username: z.string().min(1),
  status: QualificationStatusSchema,
  accountType: CreatorAccountTypeSchema,
  collaborationAvailability: CollaborationAvailabilitySchema,
  marketRelevance: MarketRelevanceStatusSchema,
  reasonCodes: z.array(QualificationReasonCodeSchema),
  evidence: z.array(z.string()),
  manualReviewRequired: z.boolean(),
});
export type CreatorQualification = z.infer<typeof CreatorQualificationSchema>;

/**
 * Single piece of supporting evidence cited by the AI Content Fit evaluator.
 * Every videoId or videoUrl is verified against the creator's actual sampled videos.
 */
export const SupportingEvidenceItemSchema = z.object({
  sourceField: z.enum([
    "bio",
    "nickname",
    "username",
    "video_caption",
    "video_hashtag",
    "video_metadata",
  ]),
  videoId: z.string().nullable(),
  videoUrl: z.string().nullable(),
  quotedText: z.string(),
  relevanceNote: z.string(),
});
export type SupportingEvidenceItem = z.infer<
  typeof SupportingEvidenceItemSchema
>;

export const ConfidenceLevelSchema = z.enum(["low", "medium", "high"]);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

/**
 * OpenAI Structured Outputs schema for creator content relevance evaluation (Section 3 & 6).
 */
export const CreatorContentEvaluationSchema = z.object({
  contentFitScore: z.number().min(0).max(100),
  categoryRelevanceScore: z.number().min(0).max(100),
  contentStyleScore: z.number().min(0).max(100),
  productRelevanceScore: z.number().min(0).max(100),
  marketFitScore: z.number().min(0).max(100).nullable(),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  explanation: z.string(),
  supportingEvidence: z.array(SupportingEvidenceItemSchema),
  missingEvidence: z.array(z.string()),
  confidenceLevel: ConfidenceLevelSchema,
});
export type CreatorContentEvaluation = z.infer<
  typeof CreatorContentEvaluationSchema
>;

/**
 * Configurable dimension weights for deterministic ranking (Section 4).
 * Initial MVP defaults: Content Fit 50%, Market Fit 20%, Performance Fit 20%, Creator Suitability 10%.
 */
export const MatchingWeightsSchema = z
  .object({
    contentFit: z.number().min(0).max(1).default(0.5),
    marketFit: z.number().min(0).max(1).default(0.2),
    performanceFit: z.number().min(0).max(1).default(0.2),
    creatorSuitability: z.number().min(0).max(1).default(0.1),
  })
  .refine(
    (w) => {
      const sum =
        w.contentFit + w.marketFit + w.performanceFit + w.creatorSuitability;
      return Math.abs(sum - 1) <= 0.001;
    },
    {
      message:
        "Matching weights (contentFit + marketFit + performanceFit + creatorSuitability) must sum to 1.0.",
    }
  );
export type MatchingWeights = z.infer<typeof MatchingWeightsSchema>;

export const DEFAULT_MATCHING_WEIGHTS: MatchingWeights = {
  contentFit: 0.5,
  marketFit: 0.2,
  performanceFit: 0.2,
  creatorSuitability: 0.1,
};

/**
 * Detailed breakdown of a creator's deterministic matching score (Section 4 & 6).
 */
export const MatchingScoreBreakdownSchema = z.object({
  contentFitScore: z.number().min(0).max(100).nullable(),
  marketFitScore: z.number().min(0).max(100).nullable(),
  performanceFitScore: z.number().min(0).max(100).nullable(),
  creatorSuitabilityScore: z.number().min(0).max(100).nullable(),
  performanceSubscores: z.object({
    engagementScore: z.number().min(0).max(100).nullable(),
    viewReachScore: z.number().min(0).max(100).nullable(),
    sampleSizeReliabilityFactor: z.number().min(0).max(1),
    isProvisionalSingleVideo: z.boolean(),
  }),
  appliedWeights: MatchingWeightsSchema,
  observedWeightCoverage: z.number().min(0).max(1),
  rawWeightedScore: z.number().min(0).max(100).nullable(),
  finalMatchScore: z.number().min(0).max(100),
  missingComponents: z.array(z.string()),
});
export type MatchingScoreBreakdown = z.infer<
  typeof MatchingScoreBreakdownSchema
>;

/**
 * Explainable recommendation item for a ranked KOL candidate (Section 6).
 */
export const RankedKOLRecommendationSchema = z.object({
  creatorId: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().min(1),
  profileUrl: z.string().nullable(),
  followers: z.number().nullable(),
  matchScore: z.number().min(0).max(100),
  rank: z.number().int().positive(),
  scoreBreakdown: MatchingScoreBreakdownSchema,
  qualificationStatus: QualificationStatusSchema,
  qualification: CreatorQualificationSchema,
  contentEvaluation: CreatorContentEvaluationSchema,
  contentFitExplanation: z.string(),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  supportingVideoUrls: z.array(z.string()),
  sampledVideosCount: z.number().int().nonnegative(),
  medianViews: z.number().nullable(),
  averageEngagementRate: z.number().nullable(),
  dataCompleteness: z.number().min(0).max(1),
  confidenceLevel: ConfidenceLevelSchema,
  missingDataWarnings: z.array(z.string()),
  requiresManualReview: z.boolean(),
});
export type RankedKOLRecommendation = z.infer<
  typeof RankedKOLRecommendationSchema
>;

/**
 * Auditable record for hard-excluded creators (e.g., official brand accounts or explicit review refusals).
 */
export const ExcludedCreatorRecordSchema = z.object({
  creatorId: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().min(1),
  profileUrl: z.string().nullable(),
  followers: z.number().nullable(),
  qualification: CreatorQualificationSchema,
  exclusionSummary: z.string(),
});
export type ExcludedCreatorRecord = z.infer<typeof ExcludedCreatorRecordSchema>;

export const MatchingDataSourceModeSchema = z.enum([
  "fixture",
  "fixture_batch2",
  "fixture_combined",
]);
export type MatchingDataSourceMode = z.infer<
  typeof MatchingDataSourceModeSchema
>;

export const MatchingExecutionModeSchema = z.enum(["fixture_mock", "live_ai"]);
export type MatchingExecutionMode = z.infer<typeof MatchingExecutionModeSchema>;

/**
 * Full response container for the KOL Matching and Ranking Engine (Section 6).
 */
export const KOLMatchingResultSchema = z.object({
  metadata: z.object({
    algorithmVersion: z.string(),
    weights: MatchingWeightsSchema,
    dataSource: MatchingDataSourceModeSchema,
    executionMode: MatchingExecutionModeSchema,
    isOfflineDemoOutput: z.boolean(),
    sourceDatasetTimestamp: z.string().nullable(),
    scoringTimestamp: z.string(),
    llmModelUsed: z.string(),
    totalCandidatesEvaluated: z.number().int().nonnegative(),
    recommendedCount: z.number().int().nonnegative(),
    excludedCount: z.number().int().nonnegative(),
    manualReviewCount: z.number().int().nonnegative(),
    globalWarnings: z.array(z.string()),
  }),
  recommendations: z.array(RankedKOLRecommendationSchema),
  excludedCreators: z.array(ExcludedCreatorRecordSchema),
});
export type KOLMatchingResult = z.infer<typeof KOLMatchingResultSchema>;

/**
 * Request body schema for `POST /api/matching/evaluate` (Section 7).
 */
export const MatchingEvaluateRequestSchema = z.object({
  brandProfile: BrandProfileSchema,
  dataSource: MatchingDataSourceModeSchema.default("fixture"),
  executionMode: MatchingExecutionModeSchema.default("fixture_mock"),
  limit: z.number().int().min(1).max(20).default(10),
  weights: MatchingWeightsSchema.optional(),
});
export type MatchingEvaluateRequest = z.infer<
  typeof MatchingEvaluateRequestSchema
>;
