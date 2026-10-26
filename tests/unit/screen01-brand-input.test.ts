import { describe, expect, it } from "vitest";
import {
  BrandAnalysisRequestSchema,
  BrandProfileSchema,
} from "@/lib/brand/schemas";
import {
  loadBrandAnalyzerFixture,
  buildControlledBrandAnalysisResult,
} from "@/lib/brand/fixtures";

describe("Screen 01 — Brand Input Specification & Safeguards", () => {
  describe("BrandAnalysisRequestSchema validation", () => {
    it("accepts a valid brand website URL", () => {
      const parsed = BrandAnalysisRequestSchema.parse({
        websiteUrl: "https://lumina-skincare-th.example.com",
        targetMarket: "Thailand",
      });
      expect(parsed.websiteUrl).toBe("https://lumina-skincare-th.example.com");
      expect(parsed.targetMarket).toBe("Thailand");
    });

    it("accepts Facebook page URL as alternative information source", () => {
      const parsed = BrandAnalysisRequestSchema.parse({
        facebookPageUrl: "https://www.facebook.com/luminaskincareth",
      });
      expect(parsed.facebookPageUrl).toBe(
        "https://www.facebook.com/luminaskincareth"
      );
      expect(parsed.targetMarket).toBe("Thailand");
    });

    it("accepts manual brand description fallback", () => {
      const parsed = BrandAnalysisRequestSchema.parse({
        manualDescription:
          "Lumina Skin is a gentle barrier care skincare brand in Thailand.",
      });
      expect(parsed.manualDescription).toContain("Lumina Skin");
    });

    it("rejects when no website, facebook, or manual description is provided", () => {
      const result = BrandAnalysisRequestSchema.safeParse({
        websiteUrl: "",
        facebookPageUrl: "",
        manualDescription: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(
          /Provide at least a Brand Website URL, a Facebook Page URL, or a Manual Brand Description/i
        );
      }
    });

    it("enforces 8,000 character maximum on manual brand description", () => {
      const excessive = "a".repeat(8001);
      const result = BrandAnalysisRequestSchema.safeParse({
        manualDescription: excessive,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Controlled Local Fixture for Offline Preview", () => {
    it("loads controlled local BrandAnalyzer fixture without network calls", () => {
      const fixture = loadBrandAnalyzerFixture();
      expect(fixture.sampleWebsiteUrl).toBe(
        "https://lumina-skincare-th.example.com"
      );
      expect(fixture.sampleFacebookPageUrl).toBe(
        "https://www.facebook.com/luminaskincareth"
      );
      expect(fixture.expectedBrandProfile.brandName).toBe(
        "Lumina Skin Thailand"
      );
      expect(fixture.expectedBrandProfile.targetMarket).toBe("Thailand");
    });

    it("controlled fixture strictly matches BrandProfileSchema", () => {
      const fixture = loadBrandAnalyzerFixture();
      const validated = BrandProfileSchema.parse(fixture.expectedBrandProfile);
      expect(validated.brandTone.length).toBeGreaterThan(0);
      expect(
        validated.suggestedTikTokSearchKeywords.length
      ).toBeGreaterThanOrEqual(4);
      expect(validated.suggestedTikTokSearchKeywords).toEqual(
        expect.arrayContaining(["รีวิวสกินแคร์ผิวแพ้ง่าย"])
      );
    });

    it("buildControlledBrandAnalysisResult yields complete offline analysis payload", () => {
      const result = buildControlledBrandAnalysisResult();
      expect(result.modelUsed).toBe("fixture:controlled-local-demo");
      expect(result.extractionStatus.website.status).toBe("success");
      expect(result.extractionStatus.facebook.status).toBe("restricted");
    });
  });
});
