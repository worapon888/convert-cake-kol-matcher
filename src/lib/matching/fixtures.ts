import matchingFixtureJson from "@/data/fixtures/kol-matching-fixture.json";
import type { BrandProfile } from "@/lib/brand/schemas";
import {
  loadNormalizedTikTokFixture,
  normalizeRawApifyFixture,
} from "@/lib/tiktok/fixtures";
import type { TikTokCreator } from "@/lib/tiktok/schemas";
import {
  type CollaborationAvailability,
  type CreatorAccountType,
  type CreatorContentEvaluation,
  CreatorContentEvaluationSchema,
  type MarketRelevanceStatus,
  type QualificationStatus,
} from "./schemas";

const savedEvaluationsRecord =
  matchingFixtureJson.evaluationsByCreatorId as Record<string, unknown>;

/**
 * Retrieves a deterministic offline test `CreatorContentEvaluation` for `fixture_mock` mode.
 * Clearly marks all explanations as `[Offline Test Evaluation]` so fixture test results are
 * never confused with live OpenAI responses.
 */
export function getOfflineFixtureContentEvaluation(
  creator: TikTokCreator,
  brandProfile: BrandProfile
): CreatorContentEvaluation {
  const preSaved = savedEvaluationsRecord[creator.creatorId];
  if (preSaved) {
    return CreatorContentEvaluationSchema.parse(preSaved);
  }

  // Deterministic fallback for batch2 or synthetic test creators in fixture_mock mode
  const firstVideo = creator.videos[0] ?? null;
  const captionText = firstVideo?.caption ?? "";
  const hashtagsText = firstVideo?.hashtags.join(" ") ?? "";
  const combinedText =
    `${creator.bio ?? ""} ${captionText} ${hashtagsText}`.toLowerCase();

  const hasSkincareOverlap =
    /(skincare|สกินแคร์|ผิว|สิว|เซรั่ม|ครีม|กันแดด|serum|barrier|glow|skin)/i.test(
      combinedText
    );
  const hasThaiScript = /[\u0E00-\u0E7F]/.test(combinedText);

  const categoryRelevanceScore = hasSkincareOverlap ? 82 : 45;
  const productRelevanceScore = hasSkincareOverlap ? 78 : 40;
  const contentStyleScore = captionText.trim().length > 30 ? 75 : 55;
  const marketFitScore = hasThaiScript
    ? 85
    : firstVideo?.textLanguage && firstVideo.textLanguage !== "th"
      ? 30
      : null;
  const contentFitScore = Math.round(
    0.4 * categoryRelevanceScore +
      0.35 * productRelevanceScore +
      0.25 * contentStyleScore
  );

  const supportingEvidence = [];
  if (firstVideo && firstVideo.caption) {
    supportingEvidence.push({
      sourceField: "video_caption" as const,
      videoId: firstVideo.videoId,
      videoUrl: firstVideo.videoUrl,
      quotedText: firstVideo.caption.slice(0, 160),
      relevanceNote: `Observed video caption evaluated against ${brandProfile.brandName ?? "Target Brand"}.`,
    });
  } else if (creator.bio) {
    supportingEvidence.push({
      sourceField: "bio" as const,
      videoId: null,
      videoUrl: null,
      quotedText: creator.bio.slice(0, 160),
      relevanceNote: "Observed profile bio.",
    });
  }

  return CreatorContentEvaluationSchema.parse({
    contentFitScore,
    categoryRelevanceScore,
    contentStyleScore,
    productRelevanceScore,
    marketFitScore,
    strengths: hasSkincareOverlap
      ? ["Observed skincare/beauty content alignment in sampled profile data."]
      : ["Public creator profile available for review."],
    concerns: [
      "Evaluated in offline fixture_mock mode.",
      ...(creator.metrics.isSingleVideoSample
        ? [
            "Only 1 sampled video available; creator-level consistency is unverified.",
          ]
        : []),
    ],
    explanation: `[Offline Test Evaluation] Deterministic fixture evaluation for @${creator.username} against ${brandProfile.brandName ?? "Brand Profile"}.`,
    supportingEvidence,
    missingEvidence: [
      ...(creator.metrics.isSingleVideoSample
        ? ["Single sampled video only."]
        : []),
    ],
    confidenceLevel: hasSkincareOverlap && hasThaiScript ? "medium" : "low",
  });
}

/**
 * Human-reviewed evaluation benchmark case (Section 9).
 * Clearly separates human reference labels from automated system output.
 */
export interface HumanLabeledCreatorEvaluationCase {
  caseId: string;
  description: string;
  creator: TikTokCreator;
  humanReferenceLabels: {
    expectedQualificationStatus: QualificationStatus;
    expectedAccountType: CreatorAccountType;
    expectedCollaborationAvailability: CollaborationAvailability;
    expectedMarketRelevance: MarketRelevanceStatus;
    expectedPerformanceFitNull: boolean;
    humanReviewRationale: string;
  };
}

/**
 * Builds the 5 manually labeled benchmark evaluation cases built from real creator records
 * (Section 9 requirement: relevant creator, official brand account, explicit review refusal,
 * unclear Thai-market relevance, and missing metrics).
 */
export function getHumanLabeledEvaluationCases(): HumanLabeledCreatorEvaluationCase[] {
  const primaryDataset = loadNormalizedTikTokFixture();
  const batch2Dataset = normalizeRawApifyFixture("batch2");

  const zzdaozz = primaryDataset.creators.find(
    (c) => c.username === "zzdaozz"
  )!;
  const remoThailand = primaryDataset.creators.find(
    (c) => c.username === "remo.thailand"
  )!;
  const etudeThailand = batch2Dataset.creators.find(
    (c) => c.username === "etudethailand"
  )!;
  const honestGlowUp = batch2Dataset.creators.find(
    (c) => c.username === "honestglowup5"
  )!;
  const lsabella = primaryDataset.creators.find(
    (c) => c.username === "lsabella5733"
  )!;

  // Case 3: Real creator structure with explicit "ไม่รับงานรีวิว" collaboration restriction in bio
  const refusingCreator: TikTokCreator = {
    ...zzdaozz,
    creatorId: "eval-refusing-creator-01",
    username: "thai_skincare_diary_no_ads",
    bio: "บันทึกสกินแคร์ใช้เอง จ่ายเองทุกชิ้น ❌ ไม่รับงานรีวิว ไม่รับสปอนเซอร์ทุกชนิด ❌",
  };

  // Case 5: Real creator record (`lsabella5733`) with missing performance metrics (`views: null`, `likes: null`)
  const missingMetricsCreator: TikTokCreator = {
    ...lsabella,
    creatorId: "eval-missing-metrics-01",
    videos: lsabella.videos.map((v) => ({
      ...v,
      views: null,
      likes: null,
      engagementRateByViews: null,
    })),
    metrics: {
      ...lsabella.metrics,
      medianViews: null,
      averageEngagementRate: null,
      engagementRatesByVideo: [null],
      dataCompleteness: 11 / 13,
      missingFields: ["videos[0].views", "videos[0].likes"],
    },
  };

  return [
    {
      caseId: "EVAL-01-RELEVANT-CREATOR",
      description:
        "Relevant Thai skincare creator (@zzdaozz) with sensitive-skin/barrier content and explicit work contact",
      creator: zzdaozz,
      humanReferenceLabels: {
        expectedQualificationStatus: "eligible",
        expectedAccountType: "individual_creator",
        expectedCollaborationAvailability: "open_to_collab",
        expectedMarketRelevance: "relevant",
        expectedPerformanceFitNull: false,
        humanReviewRationale:
          "Human Reviewer Label: @zzdaozz posts Thai skincare content (#ผิวแพ้ง่าย, #เกราะป้องกันผิว) and explicitly lists 'For work Line @workwithdjdao' in her bio.",
      },
    },
    {
      caseId: "EVAL-02A-OFFICIAL-BRAND-ACCOUNT-REMO",
      description:
        "Official brand/company account (@remo.thailand) declaring 'ช่องบริษัท' in bio",
      creator: remoThailand,
      humanReferenceLabels: {
        expectedQualificationStatus: "excluded",
        expectedAccountType: "brand_account",
        expectedCollaborationAvailability: "unknown",
        expectedMarketRelevance: "relevant",
        expectedPerformanceFitNull: false,
        humanReviewRationale:
          "Human Reviewer Label: @remo.thailand states 'ช่องบริษัท มูสกำจัดขนสูตรเย็น' in its bio, identifying it as a brand-owned storefront rather than an independent KOL.",
      },
    },
    {
      caseId: "EVAL-02B-OFFICIAL-BRAND-ACCOUNT-ETUDE",
      description:
        "Official cosmetics brand account (@etudethailand) declaring 'ETUDE Thailand Official TikTok' with isAd=false",
      creator: etudeThailand,
      humanReferenceLabels: {
        expectedQualificationStatus: "excluded",
        expectedAccountType: "brand_account",
        expectedCollaborationAvailability: "unknown",
        expectedMarketRelevance: "relevant",
        expectedPerformanceFitNull: false,
        humanReviewRationale:
          "Human Reviewer Label: @etudethailand is an official brand account ('ETUDE Thailand Official TikTok') even though its sampled video has isAd=false.",
      },
    },
    {
      caseId: "EVAL-03-EXPLICIT-REVIEW-REFUSAL",
      description:
        "Creator explicitly stating in bio that they do not accept sponsored reviews ('ไม่รับงานรีวิว')",
      creator: refusingCreator,
      humanReferenceLabels: {
        expectedQualificationStatus: "excluded",
        expectedAccountType: "unknown",
        expectedCollaborationAvailability: "restricted",
        expectedMarketRelevance: "relevant",
        expectedPerformanceFitNull: false,
        humanReviewRationale:
          "Human Reviewer Label: Bio explicitly states 'ไม่รับงานรีวิว ไม่รับสปอนเซอร์ทุกชนิด'; creator must be excluded from sponsored outreach recommendations.",
      },
    },
    {
      caseId: "EVAL-04-UNCLEAR-THAI-MARKET-RELEVANCE",
      description:
        "Skincare creator (@honestglowup5) from real Apify scrape whose video caption is in Burmese (textLanguage='my') without Thai script",
      creator: honestGlowUp,
      humanReferenceLabels: {
        expectedQualificationStatus: "needs_review",
        expectedAccountType: "unknown",
        expectedCollaborationAvailability: "unknown",
        expectedMarketRelevance: "not_observed",
        expectedPerformanceFitNull: false,
        humanReviewRationale:
          "Human Reviewer Label: @honestglowup5 posts skincare reviews in Burmese (textLanguage='my') with no observed Thai script; market relevance to Thailand is unconfirmed (not hard-excluded, but requires human review).",
      },
    },
    {
      caseId: "EVAL-05-MISSING-PERFORMANCE-METRICS",
      description:
        "Creator record (@lsabella5733 variant) with null bio and missing video view/like counts",
      creator: missingMetricsCreator,
      humanReferenceLabels: {
        expectedQualificationStatus: "needs_review",
        expectedAccountType: "unknown",
        expectedCollaborationAvailability: "unknown",
        expectedMarketRelevance: "relevant",
        expectedPerformanceFitNull: true,
        humanReviewRationale:
          "Human Reviewer Label: Profile has null bio and missing view/like counts; performanceFitScore must remain null rather than 0, and manual review is required.",
      },
    },
  ];
}
