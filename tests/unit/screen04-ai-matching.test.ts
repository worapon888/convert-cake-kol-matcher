import { describe, expect, it } from "vitest";
import { POST as matchingEvaluateRoutePost } from "@/app/api/matching/evaluate/route";
import { loadBrandAnalyzerFixture } from "@/lib/brand";
import {
  KOLMatchingResultSchema,
  MatchingEvaluateRequestSchema,
  RankedKOLRecommendationSchema,
  runKOLMatchingPipeline,
} from "@/lib/matching";
import {
  loadNormalizedTikTokFixture,
  normalizeRawApifyFixture,
} from "@/lib/tiktok";
import type { TikTokCreator } from "@/lib/tiktok/schemas";

describe("Step 5A.4 — Screen 4: AI Matching & Ranking Flow Refinements", () => {
  const brandFixture = loadBrandAnalyzerFixture();
  const sampleBrandProfile = brandFixture.expectedBrandProfile;
  const primaryTikTokFixture = loadNormalizedTikTokFixture();
  const batch2TikTokFixture = normalizeRawApifyFixture("batch2");

  describe("1. Dataset & Brand Profile Ingestion", () => {
    it("accepts custom TikTokCreator dataset from Screen 3 instead of default fixture", async () => {
      // Use batch2 creators as the custom discovered dataset from Screen 3
      const customCreators = batch2TikTokFixture.creators.slice(0, 3);
      const customUsernames = customCreators.map((c) => c.username);

      const result = await runKOLMatchingPipeline({
        brandProfile: sampleBrandProfile,
        creators: customCreators,
        executionMode: "fixture_mock",
        limit: 10,
      });

      expect(result.metadata.dataSource).toBe("custom");
      expect(result.recommendations.length).toBeGreaterThan(0);

      // Verify evaluated creators match the custom set, NOT the primary fixture
      for (const rec of result.recommendations) {
        expect(customUsernames).toContain(rec.username);
      }
    });

    it("evaluates custom non-skincare brand profiles without reverting to default skincare profile", async () => {
      const nonSkincareBrand = {
        ...sampleBrandProfile,
        brandName: "PIR SQUARE Audio",
        industry: "Consumer Electronics",
        keyProductsOrServices: ["Wireless Headphones", "Studio Monitors"],
        contentThemes: ["Audiophile sound", "Product unboxing"],
      };

      const customCreators = batch2TikTokFixture.creators
        .filter((c) => !c.username.toLowerCase().includes("etude"))
        .slice(0, 2);

      const result = await runKOLMatchingPipeline({
        brandProfile: nonSkincareBrand,
        creators: customCreators,
        executionMode: "fixture_mock",
        limit: 5,
      });

      expect(result.metadata.dataSource).toBe("custom");
      expect(result.recommendations.length).toBe(2);
      // Explanations for non-presaved creators reference the evaluated brand name
      for (const rec of result.recommendations) {
        expect(rec.contentFitExplanation).toContain("PIR SQUARE Audio");
      }
    });
  });

  describe("2. API Endpoint /api/matching/evaluate with Custom Creators", () => {
    it("validates request payload with creators array using Zod schema", () => {
      const validPayload = {
        brandProfile: sampleBrandProfile,
        creators: primaryTikTokFixture.creators.slice(0, 3),
        executionMode: "fixture_mock",
        limit: 10,
      };

      const parsed = MatchingEvaluateRequestSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.creators).toHaveLength(3);
        expect(parsed.data.executionMode).toBe("fixture_mock");
      }
    });

    it("successfully handles POST /api/matching/evaluate with passed creators and returns validated results", async () => {
      const selectedCreators = primaryTikTokFixture.creators.slice(0, 3);

      const req = new Request("http://localhost:3000/api/matching/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandProfile: sampleBrandProfile,
          creators: selectedCreators,
          executionMode: "fixture_mock",
          limit: 10,
        }),
      });

      const res = await matchingEvaluateRoutePost(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      const validation = KOLMatchingResultSchema.safeParse(json.data);
      expect(validation.success).toBe(true);
      expect(json.data.metadata.dataSource).toBe("custom");
    });
  });

  describe("3. Ranking & Score Dimensions", () => {
    it("sorts recommendations in strictly descending order of matchScore", async () => {
      const creators = primaryTikTokFixture.creators.slice(0, 5);

      const result = await runKOLMatchingPipeline({
        brandProfile: sampleBrandProfile,
        creators,
        executionMode: "fixture_mock",
        limit: 5,
      });

      const scores = result.recommendations.map((r) => r.matchScore);
      for (let i = 0; i < scores.length - 1; i++) {
        expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]);
      }

      // Ranks should be 1, 2, 3...
      result.recommendations.forEach((r, idx) => {
        expect(r.rank).toBe(idx + 1);
      });
    });

    it("contains all 4 standard backend score dimensions in scoreBreakdown", async () => {
      const creators = primaryTikTokFixture.creators.slice(0, 2);

      const result = await runKOLMatchingPipeline({
        brandProfile: sampleBrandProfile,
        creators,
        executionMode: "fixture_mock",
        limit: 2,
      });

      for (const rec of result.recommendations) {
        // Must contain Content Fit, Market Fit, Performance Fit, Creator Suitability
        expect(rec.scoreBreakdown).toHaveProperty("contentFitScore");
        expect(rec.scoreBreakdown).toHaveProperty("marketFitScore");
        expect(rec.scoreBreakdown).toHaveProperty("performanceFitScore");
        expect(rec.scoreBreakdown).toHaveProperty("creatorSuitabilityScore");

        // Verify with Zod schema
        const validatedRec = RankedKOLRecommendationSchema.safeParse(rec);
        expect(validatedRec.success).toBe(true);
      }
    });
  });

  describe("4. Cost Control & Candidate Bounding", () => {
    it("bounds candidate creators to at most 10 in MVP", async () => {
      // Create pool of 15 creators (repeat/slice)
      const largePool: TikTokCreator[] = [
        ...primaryTikTokFixture.creators,
        ...batch2TikTokFixture.creators,
      ].slice(0, 15);

      const result = await runKOLMatchingPipeline({
        brandProfile: sampleBrandProfile,
        creators: largePool,
        executionMode: "fixture_mock",
        limit: 10,
      });

      // Total recommendations must not exceed evaluation bounds
      expect(result.recommendations.length).toBeLessThanOrEqual(10);
    });

    it("automatically identifies and excludes official brand accounts from recommendations", async () => {
      // Include @remo.thailand (official brand account)
      const remo = primaryTikTokFixture.creators.find(
        (c) => c.username === "remo.thailand"
      )!;
      const normalCreator = primaryTikTokFixture.creators.find(
        (c) => c.username === "zzdaozz"
      )!;

      const result = await runKOLMatchingPipeline({
        brandProfile: sampleBrandProfile,
        creators: [remo, normalCreator],
        executionMode: "fixture_mock",
        limit: 10,
      });

      // Remo should be in excludedCreators, not recommendations
      const recUsernames = result.recommendations.map((r) => r.username);
      const excUsernames = result.excludedCreators.map((e) => e.username);

      expect(recUsernames).toContain("zzdaozz");
      expect(recUsernames).not.toContain("remo.thailand");
      expect(excUsernames).toContain("remo.thailand");
    });
  });

  describe("5. Refined Flow: Cache Signature & Deduplication", () => {
    function computeSig(
      brand: {
        brandName?: string | null;
        industry?: string | null;
        keyProductsOrServices?: string[] | null;
      },
      creators: Array<{ creatorId: string; username: string }>
    ): string {
      const brandKey = `${brand.brandName ?? ""}|${brand.industry ?? ""}|${(
        brand.keyProductsOrServices || []
      ).join(",")}`;
      const creatorKey = creators
        .slice(0, 10)
        .map((c) => c.creatorId || c.username)
        .sort()
        .join(",");
      return `${brandKey}::${creatorKey}`;
    }

    it("generates identical cache signatures when inputs are unchanged", () => {
      const sig1 = computeSig(
        sampleBrandProfile,
        primaryTikTokFixture.creators
      );
      const sig2 = computeSig(
        sampleBrandProfile,
        primaryTikTokFixture.creators
      );
      expect(sig1).toBe(sig2);
    });

    it("invalidates cache signature when brand profile or creator dataset changes", () => {
      const sigOriginal = computeSig(
        sampleBrandProfile,
        primaryTikTokFixture.creators
      );

      const modifiedBrand = {
        ...sampleBrandProfile,
        brandName: "SRICHAND REFORMULATED",
      };
      const sigBrandChanged = computeSig(
        modifiedBrand,
        primaryTikTokFixture.creators
      );
      expect(sigBrandChanged).not.toBe(sigOriginal);

      const sigCreatorsChanged = computeSig(
        sampleBrandProfile,
        batch2TikTokFixture.creators
      );
      expect(sigCreatorsChanged).not.toBe(sigOriginal);
    });
  });

  describe("6. Security & Client Privacy Safeguards", () => {
    it("never exposes OPENAI_API_KEY or APIFY_TOKEN via NEXT_PUBLIC_ variables", () => {
      const publicKeys = Object.keys(process.env).filter((k) =>
        k.startsWith("NEXT_PUBLIC_")
      );

      for (const key of publicKeys) {
        expect(key).not.toMatch(/OPENAI/i);
        expect(key).not.toMatch(/APIFY/i);
        expect(key).not.toMatch(/SECRET/i);
      }
    });

    it("rejects live_ai execution gracefully when credentials are not configured", async () => {
      // In tests without live OpenAI token or mock override, pipeline rejects with configuration error
      // and never silently substitutes mock data
      await expect(
        runKOLMatchingPipeline(
          {
            brandProfile: sampleBrandProfile,
            creators: primaryTikTokFixture.creators.slice(0, 1),
            executionMode: "live_ai",
            limit: 5,
          },
          {
            contentEvaluation: {
              openai: { apiKey: "" },
            },
          }
        )
      ).rejects.toThrow();
    });
  });
});
