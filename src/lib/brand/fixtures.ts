import brandFixtureJson from "@/data/fixtures/brand-analyzer-fixture.json";
import {
  type BrandAnalysisResult,
  BrandAnalysisResultSchema,
  type BrandProfile,
  BrandProfileSchema,
} from "./schemas";

export interface BrandAnalyzerControlledFixture {
  sampleWebsiteUrl: string;
  sampleFacebookPageUrl: string;
  sampleWebsiteHtml: string;
  sampleFacebookBlockedHtml: string;
  expectedBrandProfile: BrandProfile;
}

/**
 * Loads the controlled local Brand Analyzer fixture used for unit tests and offline UI demos.
 */
export function loadBrandAnalyzerFixture(): BrandAnalyzerControlledFixture {
  const expectedBrandProfile = BrandProfileSchema.parse(
    brandFixtureJson.expectedBrandProfile
  );

  return {
    sampleWebsiteUrl: brandFixtureJson.sampleWebsiteUrl,
    sampleFacebookPageUrl: brandFixtureJson.sampleFacebookPageUrl,
    sampleWebsiteHtml: brandFixtureJson.sampleWebsiteHtml,
    sampleFacebookBlockedHtml: brandFixtureJson.sampleFacebookBlockedHtml,
    expectedBrandProfile,
  };
}

/**
 * Builds a complete `BrandAnalysisResult` from the controlled local fixture without making paid API calls.
 */
export function buildControlledBrandAnalysisResult(): BrandAnalysisResult {
  const fixture = loadBrandAnalyzerFixture();

  return BrandAnalysisResultSchema.parse({
    brandProfile: fixture.expectedBrandProfile,
    extractionStatus: {
      website: {
        sourceType: "website",
        requestedUrl: fixture.sampleWebsiteUrl,
        normalizedUrl: `${fixture.sampleWebsiteUrl}/`,
        status: "success",
        extractedTitle:
          "Lumina Skin Thailand | เวชสำอางเพื่อผิวแพ้ง่ายและเป็นสิวง่าย",
        visitedUrls: [`${fixture.sampleWebsiteUrl}/`],
        warning: null,
      },
      facebook: {
        sourceType: "facebook",
        requestedUrl: fixture.sampleFacebookPageUrl,
        normalizedUrl: fixture.sampleFacebookPageUrl,
        status: "restricted",
        extractedTitle: null,
        visitedUrls: [fixture.sampleFacebookPageUrl],
        warning:
          "Facebook Page public content is restricted by login/authentication walls. Continuing analysis using website or manual brand description.",
      },
      manualDescriptionProvided: false,
    },
    warnings: [
      "Facebook Page public content is restricted by login/authentication walls. Continuing analysis using website or manual brand description.",
    ],
    missingInformation: fixture.expectedBrandProfile.missingInformation,
    modelUsed: "fixture:controlled-local-demo",
    analyzedAt: "2026-10-26T13:50:00.000Z",
  });
}

/**
 * Returns a controlled BrandProfile matching the Screen 02 reference UI for Lumina Skin Thailand.
 * Conforms strictly to BrandProfileSchema and preserves all backend fields.
 */
export function getDemoBrandProfile(): BrandProfile {
  const baseFixture = loadBrandAnalyzerFixture().expectedBrandProfile;

  return BrandProfileSchema.parse({
    ...baseFixture,
    brandName: "Lumina Skin Thailand",
    industry: "Skincare & Beauty",
    keyProductsOrServices: [
      "สกินแคร์ดูแลผิวหน้า เช่น เซรั่ม ครีมกันแดด มอยส์เจอร์ไรเซอร์ และผลิตภัณฑ์บำรุงผิว",
    ],
    targetAudienceDescription:
      "ผู้หญิงไทย อายุ 18–35 ปี สนใจดูแลผิว สุขภาพผิว และไลฟ์สไตล์ความงาม",
    brandTone: ["Friendly"],
    suggestedTikTokSearchKeywords: [
      "สกินแคร์",
      "รีวิวเซรั่ม",
      "ดูแลผิว",
      "ครีมกันแดด",
      "ผิวใส",
    ],
  });
}
