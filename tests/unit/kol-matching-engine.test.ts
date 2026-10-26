import { describe, expect, it } from "vitest";
import { POST as matchingEvaluateRoutePost } from "@/app/api/matching/evaluate/route";
import {
  OpenAIAnalysisError,
  OpenAIConfigurationError,
} from "@/lib/ai/openai-client";
import { loadBrandAnalyzerFixture } from "@/lib/brand";
import {
  buildCreatorRecommendation,
  calculateDeterministicContentFitScore,
  calculateDeterministicCreatorSuitabilityScore,
  calculateDeterministicMarketFitScore,
  calculateDeterministicPerformanceFitScore,
  calculateMatchingScoreBreakdown,
  CreatorContentEvaluationSchema,
  DEFAULT_MATCHING_WEIGHTS,
  deduplicateCreators,
  evaluateCreatorContentFit,
  getHumanLabeledEvaluationCases,
  getOfflineFixtureContentEvaluation,
  normalizeEngagementRateScore,
  normalizeMedianViewsScore,
  qualifyCreator,
  rankRecommendationsDeterministically,
  runKOLMatchingPipeline,
  validateAndSanitizeContentEvaluation,
} from "@/lib/matching";
import {
  loadNormalizedTikTokFixture,
  normalizeRawApifyFixture,
} from "@/lib/tiktok";

describe("Step 4 — AI TikTok KOL Matching & Ranking Engine", () => {
  const brandFixture = loadBrandAnalyzerFixture();
  const sampleBrandProfile = brandFixture.expectedBrandProfile;
  const primaryTikTokFixture = loadNormalizedTikTokFixture();
  const batch2TikTokFixture = normalizeRawApifyFixture("batch2");

  describe("1. Creator ID Grouping & Duplicate Prevention", () => {
    it("deduplicates creators by creatorId and merges unique sampled videos", () => {
      const creatorA = primaryTikTokFixture.creators[0];
      const duplicateWithSecondVideo = {
        ...creatorA,
        videos: [
          creatorA.videos[0],
          {
            ...creatorA.videos[0],
            videoId: "7685725641450449999",
            views: 500000,
          },
        ],
      };

      const deduped = deduplicateCreators([creatorA, duplicateWithSecondVideo]);
      expect(deduped).toHaveLength(1);
      expect(deduped[0].videos).toHaveLength(2);
      expect(deduped[0].metrics.sampledVideosCount).toBe(2);
      expect(deduped[0].metrics.isSingleVideoSample).toBe(false);
    });
  });

  describe("2. Deterministic Creator Qualification Rules", () => {
    it("qualifies an independent Thai skincare creator with explicit work contact as eligible", () => {
      const zzdaozz = primaryTikTokFixture.creators.find(
        (c) => c.username === "zzdaozz"
      )!;
      const q = qualifyCreator(zzdaozz, sampleBrandProfile);

      expect(q.status).toBe("eligible");
      expect(q.accountType).toBe("individual_creator");
      expect(q.collaborationAvailability).toBe("open_to_collab");
      expect(q.marketRelevance).toBe("relevant");
      expect(q.reasonCodes).toContain("EXPLICIT_WORK_CONTACT_OBSERVED");
      expect(q.reasonCodes).toContain("THAI_MARKET_SIGNAL_OBSERVED");
      expect(q.reasonCodes).toContain("SINGLE_VIDEO_SAMPLE_LIMITATION");
      // Manual review remains true because sampledVideosCount === 1
      expect(q.manualReviewRequired).toBe(true);
    });

    it("detects and excludes official brand accounts using explicit profile evidence without relying on isAd", () => {
      // @remo.thailand has isAd=true and bio "ช่องบริษัท มูสกำจัดขนสูตรเย็น..."
      const remo = primaryTikTokFixture.creators.find(
        (c) => c.username === "remo.thailand"
      )!;
      const qRemo = qualifyCreator(remo, sampleBrandProfile);
      expect(qRemo.status).toBe("excluded");
      expect(qRemo.accountType).toBe("brand_account");
      expect(qRemo.reasonCodes).toContain("OFFICIAL_BRAND_OR_STORE_ACCOUNT");

      // @etudethailand has isAd=false and bio "ETUDE Thailand Official TikTok"
      const etude = batch2TikTokFixture.creators.find(
        (c) => c.username === "etudethailand"
      )!;
      expect(etude.videos[0].isAd).toBe(false);
      const qEtude = qualifyCreator(etude, sampleBrandProfile);
      expect(qEtude.status).toBe("excluded");
      expect(qEtude.accountType).toBe("brand_account");
      expect(qEtude.reasonCodes).toContain("OFFICIAL_BRAND_OR_STORE_ACCOUNT");
    });

    it("detects and excludes creators who explicitly refuse sponsored reviews ('ไม่รับงานรีวิว')", () => {
      const baseCreator = primaryTikTokFixture.creators[1];
      const refusingCreator = {
        ...baseCreator,
        bio: "รีวิวของใช้เองทุกชิ้น ไม่รับงานรีวิว งดรับสปอนเซอร์ค่ะ",
      };

      const q = qualifyCreator(refusingCreator, sampleBrandProfile);
      expect(q.status).toBe("excluded");
      expect(q.collaborationAvailability).toBe("restricted");
      expect(q.reasonCodes).toContain("EXPLICIT_NO_REVIEW_RESTRICTION");
    });

    it("classifies accounts with missing bio or ambiguous store/curator signals as unknown and needs_review", () => {
      const lsabella = primaryTikTokFixture.creators.find(
        (c) => c.username === "lsabella5733"
      )!;
      const qLsabella = qualifyCreator(lsabella, sampleBrandProfile);
      expect(qLsabella.accountType).toBe("unknown");
      expect(qLsabella.collaborationAvailability).toBe("unknown");
      expect(qLsabella.status).toBe("needs_review");
      expect(qLsabella.reasonCodes).toContain("MISSING_CREATOR_BIO");
      expect(qLsabella.manualReviewRequired).toBe(true);

      const thedailypal = primaryTikTokFixture.creators.find(
        (c) => c.username === "thedailypal"
      )!;
      const qDailyPal = qualifyCreator(thedailypal, sampleBrandProfile);
      expect(qDailyPal.accountType).toBe("unknown");
      expect(qDailyPal.status).toBe("needs_review");
      expect(qDailyPal.reasonCodes).toContain(
        "AMBIGUOUS_STORE_OR_CURATOR_HANDLE"
      );
    });

    it("marks Thai-market relevance as uncertain or not_observed without auto-excluding when language is non-Thai or 'un'", () => {
      const nnampunnn = primaryTikTokFixture.creators.find(
        (c) => c.username === "nnampunnn"
      )!;
      const qNnam = qualifyCreator(nnampunnn, sampleBrandProfile);
      expect(qNnam.marketRelevance).toBe("uncertain");
      expect(qNnam.status).toBe("needs_review");
      expect(qNnam.reasonCodes).toContain("UNCERTAIN_MARKET_RELEVANCE");

      const honestGlowUp = batch2TikTokFixture.creators.find(
        (c) => c.username === "honestglowup5"
      )!;
      const qHonest = qualifyCreator(honestGlowUp, sampleBrandProfile);
      expect(qHonest.marketRelevance).toBe("not_observed");
      expect(qHonest.status).toBe("needs_review");
    });
  });

  describe("3. OpenAI Content Fit Output Validation & Evidence Verification", () => {
    it("validates structured CreatorContentEvaluation and strips unsupported videoId/videoUrl evidence with a warning", async () => {
      const creator = primaryTikTokFixture.creators.find(
        (c) => c.username === "zzdaozz"
      )!;
      const validFixtureEval = getOfflineFixtureContentEvaluation(
        creator,
        sampleBrandProfile
      );

      expect(
        CreatorContentEvaluationSchema.safeParse(validFixtureEval).success
      ).toBe(true);

      const evalWithHallucinatedVideo = {
        ...validFixtureEval,
        supportingEvidence: [
          ...validFixtureEval.supportingEvidence,
          {
            sourceField: "video_caption" as const,
            videoId: "9999999999999999999", // Hallucinated video ID not in creator.videos
            videoUrl:
              "https://www.tiktok.com/@zzdaozz/video/9999999999999999999",
            quotedText: "Invented quote",
            relevanceNote: "Invented note",
          },
        ],
      };

      const sanitized = validateAndSanitizeContentEvaluation(
        evalWithHallucinatedVideo,
        creator
      );

      expect(sanitized.evaluation.supportingEvidence).toHaveLength(
        validFixtureEval.supportingEvidence.length
      );
      expect(sanitized.evidenceWarnings).toHaveLength(1);
      expect(sanitized.evidenceWarnings[0]).toContain(
        'Removed unsupported AI evidence item referencing unknown videoId "9999999999999999999"'
      );

      // Test evaluateCreatorContentFit with injected mock
      const evaluated = await evaluateCreatorContentFit(
        sampleBrandProfile,
        creator,
        {
          generateEvaluationFn: async () => ({
            data: evalWithHallucinatedVideo,
            modelUsed: "gpt-4o-mini-mock",
          }),
        }
      );

      expect(evaluated.modelUsed).toBe("gpt-4o-mini-mock");
      expect(evaluated.evidenceWarnings).toHaveLength(1);
    });
  });

  describe("4. Deterministic Scoring, Normalization, Missing Components & Tie-Breaking", () => {
    it("normalizes engagement rate and median views logarithmically and never uses raw follower counts linearly", () => {
      const erLow = normalizeEngagementRateScore(0.0075)!;
      const erMid = normalizeEngagementRateScore(0.05)!;
      const erOutlier = normalizeEngagementRateScore(0.21)!;

      expect(erLow).toBeGreaterThan(15);
      expect(erMid).toBeGreaterThan(erLow);
      expect(erOutlier).toBe(100);
      expect(normalizeEngagementRateScore(null)).toBeNull();

      const viewsLow = normalizeMedianViewsScore(1000)!;
      const viewsHigh = normalizeMedianViewsScore(3600000)!;
      expect(viewsHigh).toBeGreaterThan(viewsLow);
      expect(viewsHigh).toBeLessThanOrEqual(100);
      expect(normalizeMedianViewsScore(null)).toBeNull();

      expect(calculateDeterministicContentFitScore(null)).toBeNull();
      expect(
        calculateDeterministicMarketFitScore(
          { marketRelevance: "not_observed" },
          null
        )
      ).toBeNull();
      expect(
        calculateDeterministicPerformanceFitScore({
          sampledVideosCount: 0,
          medianViews: null,
          averageEngagementRate: null,
          isSingleVideoSample: false,
        }).score
      ).toBeNull();
      expect(
        calculateDeterministicCreatorSuitabilityScore({
          creatorId: "1",
          username: "test",
          status: "excluded",
          accountType: "brand_account",
          collaborationAvailability: "unknown",
          marketRelevance: "relevant",
          reasonCodes: ["OFFICIAL_BRAND_OR_STORE_ACCOUNT"],
          evidence: [],
          manualReviewRequired: false,
        })
      ).toBe(0);
    });

    it("applies the 50/20/20/10 weighting model and 0.75x single-video provisional reliability cap", () => {
      expect(DEFAULT_MATCHING_WEIGHTS).toEqual({
        contentFit: 0.5,
        marketFit: 0.2,
        performanceFit: 0.2,
        creatorSuitability: 0.1,
      });

      const zzdaozz = primaryTikTokFixture.creators.find(
        (c) => c.username === "zzdaozz"
      )!;
      const qualification = qualifyCreator(zzdaozz, sampleBrandProfile);
      const evaluation = getOfflineFixtureContentEvaluation(
        zzdaozz,
        sampleBrandProfile
      );

      const breakdown = calculateMatchingScoreBreakdown({
        qualification,
        contentEvaluation: evaluation,
        metrics: zzdaozz.metrics,
      });

      // Content Fit: 0.40*95 + 0.35*92 + 0.25*88 = 38 + 32.2 + 22 = 92.2
      expect(breakdown.contentFitScore).toBe(92.2);
      // Market Fit: 0.50*90 (relevant) + 0.50*94 = 92
      expect(breakdown.marketFitScore).toBe(92);
      // Creator Suitability: individual_creator + open_to_collab = 95
      expect(breakdown.creatorSuitabilityScore).toBe(95);
      // Performance Fit is provisional (0.75 factor) because sampledVideosCount === 1
      expect(breakdown.performanceSubscores.isProvisionalSingleVideo).toBe(
        true
      );
      expect(breakdown.performanceSubscores.sampleSizeReliabilityFactor).toBe(
        0.75
      );
      expect(breakdown.observedWeightCoverage).toBe(1);
      expect(breakdown.missingComponents).toEqual([]);
      expect(breakdown.finalMatchScore).toBeGreaterThan(75);
      expect(breakdown.finalMatchScore).toBeLessThanOrEqual(100);
    });

    it("preserves missing score components as null, reports coverage < 1, and never fabricates zero or perfect scores", () => {
      const lsabella = primaryTikTokFixture.creators.find(
        (c) => c.username === "lsabella5733"
      )!;
      const creatorMissingMetrics = {
        ...lsabella,
        metrics: {
          ...lsabella.metrics,
          medianViews: null,
          averageEngagementRate: null,
        },
      };

      const qualification = qualifyCreator(
        creatorMissingMetrics,
        sampleBrandProfile
      );
      const evaluation = {
        ...getOfflineFixtureContentEvaluation(
          creatorMissingMetrics,
          sampleBrandProfile
        ),
        marketFitScore: null,
      };

      const breakdown = calculateMatchingScoreBreakdown({
        qualification: {
          ...qualification,
          marketRelevance: "not_observed",
        },
        contentEvaluation: evaluation,
        metrics: creatorMissingMetrics.metrics,
      });

      expect(breakdown.performanceFitScore).toBeNull();
      expect(breakdown.creatorSuitabilityScore).toBeNull();
      expect(breakdown.marketFitScore).toBeNull();
      expect(breakdown.contentFitScore).not.toBeNull();
      expect(breakdown.observedWeightCoverage).toBe(0.5);
      expect(breakdown.missingComponents).toEqual([
        "marketFit",
        "performanceFit",
        "creatorSuitability",
      ]);
      // Coverage discount applied: rawWeightedScore * (0.85 + 0.15 * 0.5)
      expect(breakdown.finalMatchScore).toBeLessThan(
        breakdown.rawWeightedScore!
      );
    });

    it("sorts recommendations deterministically with tie-breaking by contentFitScore, coverage, and creatorId", () => {
      const c1 = primaryTikTokFixture.creators[1];
      const c2 = primaryTikTokFixture.creators[2];
      const q1 = qualifyCreator(c1, sampleBrandProfile);
      const e1 = getOfflineFixtureContentEvaluation(c1, sampleBrandProfile);

      const recA = buildCreatorRecommendation({
        creator: { ...c1, creatorId: "creator-b" },
        qualification: q1,
        contentEvaluation: e1,
      });
      const recB = buildCreatorRecommendation({
        creator: { ...c2, creatorId: "creator-a" },
        qualification: q1,
        contentEvaluation: e1,
      });

      // Identical matchScore and contentFitScore -> tie broken by creatorId ascending ("creator-a" before "creator-b")
      const ranked = rankRecommendationsDeterministically([recA, recB]);
      expect(ranked[0].creatorId).toBe("creator-a");
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].creatorId).toBe("creator-b");
      expect(ranked[1].rank).toBe(2);
    });
  });

  describe("5. End-to-End Fixture Matching, Live AI Error Handling & Route Validation", () => {
    it("executes end-to-end fixture_mock matching on the 10-creator dataset, excluding @remo.thailand and ranking the remaining 9 creators", async () => {
      const result = await runKOLMatchingPipeline({
        brandProfile: sampleBrandProfile,
        dataSource: "fixture",
        executionMode: "fixture_mock",
        limit: 10,
      });

      expect(result.metadata.isOfflineDemoOutput).toBe(true);
      expect(result.metadata.totalCandidatesEvaluated).toBe(10);
      expect(result.metadata.excludedCount).toBe(1);
      expect(result.excludedCreators[0].username).toBe("remo.thailand");
      expect(result.metadata.recommendedCount).toBe(9);
      expect(result.recommendations[0].username).toBe("zzdaozz");
      expect(result.recommendations[0].rank).toBe(1);

      // Every single-video creator is capped at "medium" or "low" confidence, never "high"
      for (const rec of result.recommendations) {
        expect(rec.sampledVideosCount).toBe(1);
        expect(rec.confidenceLevel).not.toBe("high");
        expect(rec.requiresManualReview).toBe(true);
      }
    });

    it("never silently substitutes mock AI evaluations when live_ai mode fails", async () => {
      await expect(
        runKOLMatchingPipeline(
          {
            brandProfile: sampleBrandProfile,
            dataSource: "fixture",
            executionMode: "live_ai",
            limit: 5,
          },
          {
            contentEvaluation: {
              generateEvaluationFn: async () => {
                throw new OpenAIConfigurationError("Missing OPENAI_API_KEY");
              },
            },
          }
        )
      ).rejects.toThrow(OpenAIConfigurationError);

      await expect(
        runKOLMatchingPipeline(
          {
            brandProfile: sampleBrandProfile,
            dataSource: "fixture",
            executionMode: "live_ai",
            limit: 5,
          },
          {
            contentEvaluation: {
              generateEvaluationFn: async () => {
                throw new OpenAIAnalysisError(
                  "API_ERROR",
                  "HTTP 401 Invalid API key",
                  401
                );
              },
            },
          }
        )
      ).rejects.toThrow(OpenAIAnalysisError);
    });

    it("validates POST /api/matching/evaluate requests and returns structured recommendations in fixture_mock mode", async () => {
      const invalidReq = new Request(
        "http://localhost:3000/api/matching/evaluate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 999 }),
        }
      );
      const invalidRes = await matchingEvaluateRoutePost(invalidReq);
      expect(invalidRes.status).toBe(400);

      const validReq = new Request(
        "http://localhost:3000/api/matching/evaluate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandProfile: sampleBrandProfile,
            dataSource: "fixture",
            executionMode: "fixture_mock",
            limit: 5,
          }),
        }
      );
      const validRes = await matchingEvaluateRoutePost(validReq);
      expect(validRes.status).toBe(200);
      const body = await validRes.json();
      expect(body.ok).toBe(true);
      expect(body.data.recommendations).toHaveLength(5);
      expect(body.data.excludedCreators).toHaveLength(1);
    });
  });

  describe("6. Manually Labeled Evaluation Benchmark (Human Reference vs. System Output)", () => {
    it("matches human-reviewed reference labels across all 6 evaluation benchmark cases", () => {
      const cases = getHumanLabeledEvaluationCases();
      expect(cases).toHaveLength(6);

      for (const testCase of cases) {
        const qualification = qualifyCreator(
          testCase.creator,
          sampleBrandProfile
        );
        const evaluation = getOfflineFixtureContentEvaluation(
          testCase.creator,
          sampleBrandProfile
        );
        const breakdown = calculateMatchingScoreBreakdown({
          qualification,
          contentEvaluation: evaluation,
          metrics: testCase.creator.metrics,
        });

        expect(
          qualification.status,
          `Case ${testCase.caseId} qualificationStatus mismatch`
        ).toBe(testCase.humanReferenceLabels.expectedQualificationStatus);

        expect(
          qualification.accountType,
          `Case ${testCase.caseId} accountType mismatch`
        ).toBe(testCase.humanReferenceLabels.expectedAccountType);

        expect(
          qualification.collaborationAvailability,
          `Case ${testCase.caseId} collaborationAvailability mismatch`
        ).toBe(testCase.humanReferenceLabels.expectedCollaborationAvailability);

        expect(
          qualification.marketRelevance,
          `Case ${testCase.caseId} marketRelevance mismatch`
        ).toBe(testCase.humanReferenceLabels.expectedMarketRelevance);

        expect(
          breakdown.performanceFitScore === null,
          `Case ${testCase.caseId} performanceFitScore nullability mismatch`
        ).toBe(testCase.humanReferenceLabels.expectedPerformanceFitNull);
      }
    });
  });
});
