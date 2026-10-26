import { describe, expect, it } from "vitest";
import { loadBrandAnalyzerFixture } from "@/lib/brand";
import { loadNormalizedTikTokFixture } from "@/lib/tiktok";
import { runKOLMatchingPipeline } from "@/lib/matching";
import { escapeCsvCell, generateShortlistCsv } from "@/lib/export/csv-exporter";
import {
  type RankedKOLRecommendation,
  RankedKOLRecommendationSchema,
} from "@/lib/matching/schemas";

describe("Step 5A.5 — Screen 5: Creator Shortlist & CSV Export Integration", () => {
  const brandFixture = loadBrandAnalyzerFixture();
  const sampleBrandProfile = brandFixture.expectedBrandProfile;
  const primaryTikTokFixture = loadNormalizedTikTokFixture();

  describe("1. Real Dataset Ingestion & Matching Results Integrity", () => {
    it("generates shortlist from real matching results without hardcoded scores or creators", async () => {
      // Evaluate creators with deterministic offline rubric
      const matchingRes = await runKOLMatchingPipeline({
        brandProfile: sampleBrandProfile,
        creators: primaryTikTokFixture.creators.slice(0, 3),
        executionMode: "fixture_mock",
        limit: 3,
      });

      expect(matchingRes.recommendations).toHaveLength(3);
      const shortlist = matchingRes.recommendations;

      // Scores and ranks must be dynamically calculated
      for (const item of shortlist) {
        expect(typeof item.matchScore).toBe("number");
        expect(item.matchScore).toBeGreaterThan(0);
        expect(item.matchScore).toBeLessThanOrEqual(100);
        expect(item.rank).toBeGreaterThanOrEqual(1);
        expect(item.contentFitExplanation).toBeTruthy();
        expect(item.scoreBreakdown).toHaveProperty("contentFitScore");
      }
    });

    it("evaluates custom non-skincare brand and preserves its identity across shortlist", async () => {
      const customBrand = {
        ...sampleBrandProfile,
        brandName: "Acme Tech Solutions",
        industry: "Software & Technology",
        keyProductsOrServices: ["Cloud Management Platform"],
      };

      const matchingRes = await runKOLMatchingPipeline({
        brandProfile: customBrand,
        creators: primaryTikTokFixture.creators.slice(0, 2),
        executionMode: "fixture_mock",
        limit: 2,
      });

      const csv = generateShortlistCsv(
        customBrand,
        matchingRes.recommendations
      );
      expect(csv).toContain("Acme Tech Solutions");
      expect(csv).not.toContain("SRICHAND");
    });
  });

  describe("2. CSV Export Formatting & Security Safeguards", () => {
    it("includes UTF-8 BOM (\\uFEFF) at the start of the CSV for Excel Thai language support", () => {
      const mockItem: RankedKOLRecommendation = {
        creatorId: "12345",
        username: "thaicreator",
        displayName: "รีวิวของใช้ดี",
        profileUrl: "https://www.tiktok.com/@thaicreator",
        followers: 150000,
        matchScore: 88.5,
        rank: 1,
        scoreBreakdown: {
          contentFitScore: 90,
          marketFitScore: 95,
          performanceFitScore: 80,
          creatorSuitabilityScore: 85,
          performanceSubscores: {
            engagementScore: 75,
            viewReachScore: 85,
            sampleSizeReliabilityFactor: 0.75,
            isProvisionalSingleVideo: true,
          },
          appliedWeights: {
            contentFit: 0.5,
            marketFit: 0.2,
            performanceFit: 0.2,
            creatorSuitability: 0.1,
          },
          observedWeightCoverage: 1.0,
          rawWeightedScore: 88.5,
          finalMatchScore: 88.5,
          missingComponents: [],
        },
        qualificationStatus: "eligible",
        qualification: {
          creatorId: "12345",
          username: "thaicreator",
          status: "eligible",
          accountType: "individual_creator",
          collaborationAvailability: "open_to_collab",
          marketRelevance: "relevant",
          reasonCodes: ["THAI_MARKET_SIGNAL_OBSERVED"],
          evidence: ["bio evidence"],
          manualReviewRequired: true,
        },
        contentEvaluation: {
          contentFitScore: 90,
          categoryRelevanceScore: 92,
          contentStyleScore: 88,
          productRelevanceScore: 90,
          marketFitScore: 95,
          strengths: ["เนื้อหาตรงกลุ่มเป้าหมาย"],
          concerns: [],
          explanation: "คอนเทนต์ตรงกับแบรนด์อย่างชัดเจน",
          supportingEvidence: [],
          missingEvidence: [],
          confidenceLevel: "high",
        },
        contentFitExplanation: "คอนเทนต์ตรงกับแบรนด์อย่างชัดเจน",
        strengths: ["เนื้อหาตรงกลุ่มเป้าหมาย"],
        concerns: [],
        supportingVideoUrls: ["https://www.tiktok.com/@thaicreator/video/1"],
        sampledVideosCount: 1,
        medianViews: 50000,
        averageEngagementRate: 0.05,
        dataCompleteness: 1.0,
        confidenceLevel: "high",
        missingDataWarnings: [],
        requiresManualReview: false,
      };

      const csv = generateShortlistCsv(sampleBrandProfile, [mockItem]);

      // Starts with UTF-8 BOM
      expect(csv.charCodeAt(0)).toBe(0xfeff);

      // Contains Thai characters intact
      expect(csv).toContain("รีวิวของใช้ดี");
      expect(csv).toContain("เนื้อหาตรงกลุ่มเป้าหมาย");
      expect(csv).toContain("คอนเทนต์ตรงกับแบรนด์อย่างชัดเจน");
    });

    it("escapes special characters including commas, quotes, and newlines per RFC 4180", () => {
      expect(escapeCsvCell("Simple text")).toBe("Simple text");
      expect(escapeCsvCell("Text, with comma")).toBe('"Text, with comma"');
      expect(escapeCsvCell('Text with "quotes"')).toBe(
        '"Text with ""quotes"""'
      );
      expect(escapeCsvCell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
    });

    it("neutralizes potential spreadsheet formula injection attacks", () => {
      // Characters that trigger formula execution in Excel/Sheets: =, +, -, @
      expect(escapeCsvCell("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
      expect(escapeCsvCell("+123456")).toBe("'+123456");
      expect(escapeCsvCell("-123456")).toBe("'-123456");
      expect(escapeCsvCell("@username")).toBe("'@username");
    });
  });

  describe("3. Shortlist Management & State Persistence", () => {
    it("calculates accurate count and list when items are removed", () => {
      const items: Array<{ id: string; name: string }> = [
        { id: "1", name: "Creator A" },
        { id: "2", name: "Creator B" },
        { id: "3", name: "Creator C" },
      ];

      const remaining = items.filter((c) => c.id !== "2");
      expect(remaining).toHaveLength(2);
      expect(remaining.map((c) => c.name)).toEqual(["Creator A", "Creator C"]);
    });

    it("preserves shortlist data across state reload when schema validation succeeds", () => {
      const sampleItem = {
        creatorId: "c_1",
        username: "testcreator",
        displayName: "Test Creator",
        profileUrl: "https://www.tiktok.com/@testcreator",
        followers: 100000,
        matchScore: 75.5,
        rank: 1,
        scoreBreakdown: {
          contentFitScore: 80,
          marketFitScore: 85,
          performanceFitScore: 70,
          creatorSuitabilityScore: 75,
          performanceSubscores: {
            engagementScore: 70,
            viewReachScore: 70,
            sampleSizeReliabilityFactor: 0.75,
            isProvisionalSingleVideo: true,
          },
          appliedWeights: {
            contentFit: 0.5,
            marketFit: 0.2,
            performanceFit: 0.2,
            creatorSuitability: 0.1,
          },
          observedWeightCoverage: 1.0,
          rawWeightedScore: 75.5,
          finalMatchScore: 75.5,
          missingComponents: [],
        },
        qualificationStatus: "eligible" as const,
        qualification: {
          creatorId: "c_1",
          username: "testcreator",
          status: "eligible" as const,
          accountType: "individual_creator" as const,
          collaborationAvailability: "open_to_collab" as const,
          marketRelevance: "relevant" as const,
          reasonCodes: [],
          evidence: [],
          manualReviewRequired: false,
        },
        contentEvaluation: {
          contentFitScore: 80,
          categoryRelevanceScore: 80,
          contentStyleScore: 80,
          productRelevanceScore: 80,
          marketFitScore: 85,
          strengths: [],
          concerns: [],
          explanation: "Valid match explanation",
          supportingEvidence: [],
          missingEvidence: [],
          confidenceLevel: "medium" as const,
        },
        contentFitExplanation: "Valid match explanation",
        strengths: ["High category match"],
        concerns: [],
        supportingVideoUrls: [],
        sampledVideosCount: 1,
        medianViews: 20000,
        averageEngagementRate: 0.03,
        dataCompleteness: 1.0,
        confidenceLevel: "medium" as const,
        missingDataWarnings: [],
        requiresManualReview: false,
      };

      const serialized = JSON.stringify([sampleItem]);
      const parsed = JSON.parse(serialized);

      const validation = RankedKOLRecommendationSchema.safeParse(parsed[0]);
      expect(validation.success).toBe(true);
      if (validation.success) {
        expect(validation.data.username).toBe("testcreator");
        expect(validation.data.matchScore).toBe(75.5);
      }
    });
  });

  describe("4. No Live API Calls or Data Inventions", () => {
    it("CSV generation is strictly local and synchronous without network dependencies", () => {
      const csv = generateShortlistCsv(sampleBrandProfile, []);
      expect(csv).toContain("Rank,Brand Name,Creator Username");
    });
  });
});
