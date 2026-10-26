import { z } from "zod";

/**
 * Request payload schema for `POST /api/brands/analyze`.
 * Requires at least one information source: `websiteUrl`, `facebookPageUrl`, or `manualDescription`.
 */
export const BrandAnalysisRequestSchema = z
  .object({
    websiteUrl: z.string().trim().optional().nullable(),
    facebookPageUrl: z.string().trim().optional().nullable(),
    manualDescription: z
      .string()
      .trim()
      .max(8000, "Manual description must not exceed 8,000 characters.")
      .optional()
      .nullable(),
    targetMarket: z.string().trim().min(1).default("Thailand"),
  })
  .refine(
    (data) => {
      const hasWebsite = Boolean(
        data.websiteUrl && data.websiteUrl.trim().length > 0
      );
      const hasFacebook = Boolean(
        data.facebookPageUrl && data.facebookPageUrl.trim().length > 0
      );
      const hasManual = Boolean(
        data.manualDescription && data.manualDescription.trim().length > 0
      );
      return hasWebsite || hasFacebook || hasManual;
    },
    {
      message:
        "Provide at least a Brand Website URL, a Facebook Page URL, or a Manual Brand Description.",
      path: ["websiteUrl"],
    }
  );

export type BrandAnalysisRequest = z.infer<typeof BrandAnalysisRequestSchema>;

/**
 * Source reference entry linking extracted facts to their origin URL or input source.
 * Uses strict object properties compatible with OpenAI Structured Outputs.
 */
export const BrandSourceReferenceSchema = z.object({
  url: z.string(),
  sourceType: z.enum(["website", "facebook", "manual"]),
  title: z.string().nullable(),
  extractedFactsSummary: z.string(),
});

export type BrandSourceReference = z.infer<typeof BrandSourceReferenceSchema>;

/**
 * Confidence and provenance breakdown separating observed source facts from AI-inferred recommendations.
 */
export const BrandConfidenceNotesSchema = z.object({
  observedFacts: z.array(z.string()),
  inferredRecommendations: z.array(z.string()),
  overallConfidence: z.enum(["high", "medium", "low"]),
  rationale: z.string(),
});

export type BrandConfidenceNotes = z.infer<typeof BrandConfidenceNotesSchema>;

/**
 * Strongly typed Brand Profile schema validated via Zod and OpenAI Structured Outputs.
 *
 * Important Data Integrity Rules:
 * - Unsupported scalar fields must be `null`; unsupported list fields must be `[]`.
 * - Observed source facts must be distinguished from inferred recommendations in `confidenceNotes`.
 * - Target audience demographics must not be presented as verified unless explicitly stated in source data.
 * - `suggestedTikTokSearchKeywords` should be a focused set of 4–7 Thai phrases when `targetMarket` is Thailand.
 */
export const BrandProfileSchema = z.object({
  brandName: z.string().nullable(),
  brandDescription: z.string().nullable(),
  industry: z.string().nullable(),
  productCategories: z.array(z.string()),
  keyProductsOrServices: z.array(z.string()),
  targetAudienceDescription: z.string().nullable(),
  targetMarket: z.string().nullable(),
  brandTone: z.array(z.string()),
  contentThemes: z.array(z.string()),
  idealCreatorCharacteristics: z.array(z.string()),
  excludedCreatorCharacteristics: z.array(z.string()),
  suggestedTikTokSearchKeywords: z.array(z.string()),
  sourceReferences: z.array(BrandSourceReferenceSchema),
  missingInformation: z.array(z.string()),
  confidenceNotes: BrandConfidenceNotesSchema,
});

export type BrandProfile = z.infer<typeof BrandProfileSchema>;

/**
 * Extraction status for an individual external URL source (website or Facebook page).
 */
export const SourceExtractionStatusSchema = z.object({
  sourceType: z.enum(["website", "facebook"]),
  requestedUrl: z.string().nullable(),
  normalizedUrl: z.string().nullable(),
  status: z.enum(["success", "inaccessible", "restricted", "skipped"]),
  extractedTitle: z.string().nullable(),
  visitedUrls: z.array(z.string()),
  warning: z.string().nullable(),
});

export type SourceExtractionStatus = z.infer<
  typeof SourceExtractionStatusSchema
>;

/**
 * Full response payload returned by `POST /api/brands/analyze`.
 */
export const BrandAnalysisResultSchema = z.object({
  brandProfile: BrandProfileSchema,
  extractionStatus: z.object({
    website: SourceExtractionStatusSchema,
    facebook: SourceExtractionStatusSchema,
    manualDescriptionProvided: z.boolean(),
  }),
  warnings: z.array(z.string()),
  missingInformation: z.array(z.string()),
  modelUsed: z.string(),
  analyzedAt: z.string(),
});

export type BrandAnalysisResult = z.infer<typeof BrandAnalysisResultSchema>;
