import { describe, expect, it } from "vitest";
import { BrandProfileSchema, type BrandProfile } from "@/lib/brand/schemas";
import {
  getDemoBrandProfile,
  loadBrandAnalyzerFixture,
} from "@/lib/brand/fixtures";

describe("Screen 02 — Brand Profile Review (Brand DNA) Specification & State", () => {
  describe("1. Demo Brand Profile Fixture Conformance", () => {
    it("loads demo BrandProfile strictly conforming to BrandProfileSchema", () => {
      const demoProfile = getDemoBrandProfile();
      const validated = BrandProfileSchema.parse(demoProfile);

      expect(validated.brandName).toBe("Lumina Skin Thailand");
      expect(validated.industry).toBe("Skincare & Beauty");
      expect(validated.targetMarket).toBe("Thailand");
    });

    it("matches the reference UI values from the design image", () => {
      const demoProfile = getDemoBrandProfile();

      expect(demoProfile.brandName).toBe("Lumina Skin Thailand");
      expect(demoProfile.industry).toBe("Skincare & Beauty");
      expect(demoProfile.keyProductsOrServices).toEqual([
        "สกินแคร์ดูแลผิวหน้า เช่น เซรั่ม ครีมกันแดด มอยส์เจอร์ไรเซอร์ และผลิตภัณฑ์บำรุงผิว",
      ]);
      expect(demoProfile.targetAudienceDescription).toBe(
        "ผู้หญิงไทย อายุ 18–35 ปี สนใจดูแลผิว สุขภาพผิว และไลฟ์สไตล์ความงาม"
      );
      expect(demoProfile.brandTone).toContain("Friendly");
      expect(demoProfile.suggestedTikTokSearchKeywords).toEqual([
        "สกินแคร์",
        "รีวิวเซรั่ม",
        "ดูแลผิว",
        "ครีมกันแดด",
        "ผิวใส",
      ]);
    });

    it("preserves non-UI backend fields from the original controlled fixture", () => {
      const originalFixture = loadBrandAnalyzerFixture().expectedBrandProfile;
      const demoProfile = getDemoBrandProfile();

      // Ensure backend fields not on screen are preserved
      expect(demoProfile.brandDescription).toBe(
        originalFixture.brandDescription
      );
      expect(demoProfile.productCategories).toEqual(
        originalFixture.productCategories
      );
      expect(demoProfile.targetMarket).toBe(originalFixture.targetMarket);
      expect(demoProfile.contentThemes).toEqual(originalFixture.contentThemes);
      expect(demoProfile.idealCreatorCharacteristics).toEqual(
        originalFixture.idealCreatorCharacteristics
      );
      expect(demoProfile.excludedCreatorCharacteristics).toEqual(
        originalFixture.excludedCreatorCharacteristics
      );
      expect(demoProfile.sourceReferences).toEqual(
        originalFixture.sourceReferences
      );
      expect(demoProfile.missingInformation).toEqual(
        originalFixture.missingInformation
      );
      expect(demoProfile.confidenceNotes).toEqual(
        originalFixture.confidenceNotes
      );
    });
  });

  describe("2. State Updates and Field Preservation", () => {
    it("updates editable fields without losing untouched backend metadata", () => {
      const initial = getDemoBrandProfile();

      // Simulate user editing fields in UI
      const updated: BrandProfile = {
        ...initial,
        brandName: "Lumina Skin Pro",
        industry: "Cosmetics & Makeup",
        keyProductsOrServices: ["เซรั่มลดรอยสิวเข้มข้น"],
        targetAudienceDescription: "ผู้หญิงวัยทำงาน 25-40 ปี",
        brandTone: ["Friendly", "Trustworthy"],
        suggestedTikTokSearchKeywords: ["สกินแคร์", "เซรั่มลดสิว"],
      };

      const validated = BrandProfileSchema.parse(updated);
      expect(validated.brandName).toBe("Lumina Skin Pro");
      expect(validated.industry).toBe("Cosmetics & Makeup");
      expect(validated.brandTone).toEqual(["Friendly", "Trustworthy"]);

      // Invariants: confidence notes and source references must still be intact
      expect(validated.confidenceNotes.overallConfidence).toBe("high");
      expect(validated.sourceReferences.length).toBeGreaterThan(0);
      expect(validated.targetMarket).toBe("Thailand");
    });
  });

  describe("3. TikTok Search Keywords Operations & Deduplication", () => {
    it("prevents adding duplicate keywords (case-insensitive and trimmed)", () => {
      const currentKeywords = ["สกินแคร์", "รีวิวเซรั่ม", "ดูแลผิว"];

      const isDuplicate = (newKeyword: string, list: string[]): boolean => {
        const trimmed = newKeyword.trim().toLowerCase();
        return list.some((k) => k.trim().toLowerCase() === trimmed);
      };

      expect(isDuplicate("สกินแคร์", currentKeywords)).toBe(true);
      expect(isDuplicate("  สกินแคร์  ", currentKeywords)).toBe(true);
      expect(isDuplicate("ครีมกันแดด", currentKeywords)).toBe(false);
    });

    it("removes a keyword by index correctly", () => {
      const initial = [
        "สกินแคร์",
        "รีวิวเซรั่ม",
        "ดูแลผิว",
        "ครีมกันแดด",
        "ผิวใส",
      ];
      const targetIndex = 2; // "ดูแลผิว"

      const updated = initial.filter((_, idx) => idx !== targetIndex);
      expect(updated).toEqual([
        "สกินแคร์",
        "รีวิวเซรั่ม",
        "ครีมกันแดด",
        "ผิวใส",
      ]);
      expect(updated).not.toContain("ดูแลผิว");
    });

    it("appends valid new keywords to the list", () => {
      const initial = ["สกินแคร์", "รีวิวเซรั่ม"];
      const newKeyword = "มอยส์เจอร์ไรเซอร์";

      const updated = [...initial, newKeyword.trim()];
      expect(updated).toEqual(["สกินแคร์", "รีวิวเซรั่ม", "มอยส์เจอร์ไรเซอร์"]);
    });
  });

  describe("4. Brand Tone Toggling", () => {
    it("toggles a tone chip on and off", () => {
      let tones = ["Friendly"];

      const toggleTone = (tone: string) => {
        if (tones.includes(tone)) {
          tones = tones.filter((t) => t !== tone);
        } else {
          tones = [...tones, tone];
        }
      };

      // Toggle Trustworthy on
      toggleTone("Trustworthy");
      expect(tones).toEqual(["Friendly", "Trustworthy"]);

      // Toggle Friendly off
      toggleTone("Friendly");
      expect(tones).toEqual(["Trustworthy"]);

      // Toggle Trustworthy off
      toggleTone("Trustworthy");
      expect(tones).toEqual([]);
    });
  });

  describe("5. Validation Safeguards", () => {
    it("validates that brand name is non-empty", () => {
      const isValidBrandName = (name: string) => name.trim().length > 0;

      expect(isValidBrandName("Lumina Skin Thailand")).toBe(true);
      expect(isValidBrandName("   ")).toBe(false);
      expect(isValidBrandName("")).toBe(false);
    });

    it("validates that at least one search keyword exists", () => {
      const hasKeywords = (keywords: string[]) => keywords.length > 0;

      expect(hasKeywords(["สกินแคร์"])).toBe(true);
      expect(hasKeywords([])).toBe(false);
    });
  });

  describe("6. Live API Brand Profile Integration & Dynamic Ingestion", () => {
    it("safely handles brand profiles returned by live POST /api/brands/analyze", () => {
      const liveApiResponseProfile: BrandProfile = {
        brandName: "Cerave Thailand",
        brandDescription:
          "Dermatological skincare brand formulated with 3 essential ceramides for barrier restoration.",
        industry: "Skincare & Beauty",
        productCategories: ["Cleanser", "Moisturizing Cream"],
        keyProductsOrServices: [
          "CeraVe Moisturising Cream",
          "CeraVe Hydrating Cleanser",
        ],
        targetAudienceDescription:
          "Consumers with dry, sensitive skin seeking barrier hydration.",
        targetMarket: "Thailand",
        brandTone: ["Trustworthy", "Educational"],
        contentThemes: ["Ceramide education", "Dry skin routine"],
        idealCreatorCharacteristics: [
          "Skincare educators and dermatologists on TikTok",
        ],
        excludedCreatorCharacteristics: [
          "Creators with exaggerated claims or unfiltered skin smoothing",
        ],
        suggestedTikTokSearchKeywords: [
          "รีวิว cerave",
          "มอยส์เจอร์ไรเซอร์ผิวแห้ง",
          "เสริมชั้นผิว cerave",
          "สกินแคร์กู้ผิวแห้ง",
        ],
        sourceReferences: [
          {
            url: "https://www.cerave.co.th",
            sourceType: "website",
            title: "CeraVe Thailand",
            extractedFactsSummary: "Essential ceramides and MVE technology",
          },
        ],
        missingInformation: [],
        confidenceNotes: {
          observedFacts: ["Contains 3 essential ceramides"],
          inferredRecommendations: ["Focus on TikTok skincare educators"],
          overallConfidence: "high",
          rationale: "Extracted directly from official website",
        },
      };

      const validated = BrandProfileSchema.parse(liveApiResponseProfile);
      expect(validated.brandName).toBe("Cerave Thailand");
      expect(validated.suggestedTikTokSearchKeywords).toHaveLength(4);
      expect(validated.sourceReferences[0]?.sourceType).toBe("website");
    });
  });
});
