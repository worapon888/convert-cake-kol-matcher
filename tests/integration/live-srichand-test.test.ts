import { describe, expect, it } from "vitest";
import { analyzeBrandSources } from "@/lib/brand/analyzer";
import { runKOLMatchingPipeline } from "@/lib/matching/engine";
import { loadNormalizedTikTokFixture } from "@/lib/tiktok/fixtures";
import type { BrandProfile } from "@/lib/brand/schemas";

const isLiveAllowed = process.env.ALLOW_LIVE_OPENAI === "true";

describe.skipIf(!isLiveAllowed)(
  "Live API Verification: Srichand Website & KOL Matching (Gated by ALLOW_LIVE_OPENAI=true)",
  () => {
    let srichandProfile: BrandProfile | null = null;

    it("1. Analyzes real website https://www.srichand.co.th via OpenAI gpt-4o-mini", async () => {
      console.log(
        "\n[TEST 1] Analyzing https://www.srichand.co.th with live OpenAI API..."
      );
      const result = await analyzeBrandSources({
        websiteUrl: "https://www.srichand.co.th",
        targetMarket: "Thailand",
      });

      expect(result).toBeDefined();
      expect(result.brandProfile).toBeDefined();
      srichandProfile = result.brandProfile;

      console.log("=== LIVE BRAND ANALYSIS RESULT ===");
      console.log("Model used:", result.modelUsed);
      console.log("Brand Name:", srichandProfile.brandName);
      console.log("Industry:", srichandProfile.industry);
      console.log("Key Products:", srichandProfile.keyProductsOrServices);
      console.log(
        "Target Audience:",
        srichandProfile.targetAudienceDescription
      );
      console.log("Brand Tone:", srichandProfile.brandTone);
      console.log(
        "TikTok Search Keywords:",
        srichandProfile.suggestedTikTokSearchKeywords
      );

      // Verify critical requirements
      expect(srichandProfile.brandName).toBeTruthy();
      expect(
        srichandProfile.suggestedTikTokSearchKeywords.length
      ).toBeGreaterThanOrEqual(3);
      expect(srichandProfile.brandTone.length).toBeGreaterThanOrEqual(1);
    }, 45000);

    it("2. Evaluates 3 real TikTok Creators in live_ai mode using the extracted Srichand profile", async () => {
      expect(srichandProfile).toBeDefined();

      const fixture = loadNormalizedTikTokFixture();
      const candidateCreators = fixture.creators.slice(0, 3);
      expect(candidateCreators.length).toBe(3);

      console.log(
        "\n[TEST 2] Evaluating 3 creators in live_ai mode against Srichand..."
      );
      candidateCreators.forEach((c) =>
        console.log(`- Candidate: @${c.username} (${c.creatorId})`)
      );

      const matchingResult = await runKOLMatchingPipeline(
        {
          brandProfile: srichandProfile!,
          dataSource: "fixture",
          executionMode: "live_ai",
          limit: 3,
        },
        {
          creators: candidateCreators,
        }
      );

      console.log("=== LIVE MATCHING EVALUATION RESULT ===");
      console.log("Scored candidates:", matchingResult.recommendations.length);
      console.log(
        "Excluded candidates:",
        matchingResult.excludedCreators.length
      );

      matchingResult.recommendations.forEach((rec, idx) => {
        console.log(`\nRank #${idx + 1}: @${rec.username}`);
        console.log(`- Final Match Score: ${rec.matchScore}`);
        console.log(
          `- Content Fit Score: ${rec.scoreBreakdown.contentFitScore}`
        );
        console.log(
          `- Content Style Score: ${rec.contentEvaluation.contentStyleScore}`
        );
        console.log(
          `- Product Relevance Score: ${rec.contentEvaluation.productRelevanceScore}`
        );
        console.log(
          `- Category Relevance Score: ${rec.contentEvaluation.categoryRelevanceScore}`
        );
        console.log(`- Market Fit Score: ${rec.scoreBreakdown.marketFitScore}`);
        console.log(
          `- Performance Fit Score: ${rec.scoreBreakdown.performanceFitScore}`
        );
        console.log(`- Explanation: ${rec.contentEvaluation.explanation}`);
        console.log(`- Strengths:`, rec.contentEvaluation.strengths);
        console.log(`- Concerns:`, rec.contentEvaluation.concerns);
        console.log(
          `- Supporting Evidence Count:`,
          rec.contentEvaluation.supportingEvidence.length
        );
        rec.contentEvaluation.supportingEvidence.forEach((ev) => {
          console.log(
            `  * [${ev.sourceField}] "${ev.quotedText}" -> ${ev.relevanceNote}`
          );
        });
      });

      expect(
        matchingResult.recommendations.length +
          matchingResult.excludedCreators.length
      ).toBe(3);
    }, 60000);

    it("3. Verifies State mutation when editing Brand Tone & Keywords and feeding into Matching Engine", async () => {
      expect(srichandProfile).toBeDefined();

      // User edits Brand Tone and Keywords on Screen 2
      const editedProfile: BrandProfile = {
        ...srichandProfile!,
        brandTone: ["วัยรุ่นสดใส", "เน้นรีวิวเนื้อแป้ง", "โปร่งใส"],
        suggestedTikTokSearchKeywords: [
          "แป้งศรีจันทร์คุมมัน",
          "รีวิวแป้งโปร่งแสงศรีจันทร์",
          "ศรีจันทร์ตลับม่วง",
        ],
      };

      console.log(
        "\n[TEST 3] Testing edited Brand Tone & Keywords with Matching Engine..."
      );
      console.log("Edited Tone:", editedProfile.brandTone);
      console.log(
        "Edited Keywords:",
        editedProfile.suggestedTikTokSearchKeywords
      );

      const fixture = loadNormalizedTikTokFixture();
      // Test with the top creator @zzdaozz
      const singleCandidate = [
        fixture.creators.find((c) => c.username === "zzdaozz")!,
      ];

      const resultWithEdit = await runKOLMatchingPipeline(
        {
          brandProfile: editedProfile,
          dataSource: "fixture",
          executionMode: "live_ai",
          limit: 1,
        },
        {
          creators: singleCandidate,
        }
      );

      expect(resultWithEdit.recommendations.length).toBe(1);
      const topRec = resultWithEdit.recommendations[0];
      console.log("\nEvaluation with Edited Profile for @zzdaozz:");
      console.log("- Match Score:", topRec.matchScore);
      console.log(
        "- Content Style Score:",
        topRec.contentEvaluation.contentStyleScore
      );
      console.log("- Explanation:", topRec.contentEvaluation.explanation);
      expect(topRec.matchScore).toBeGreaterThan(0);
    }, 45000);
  }
);
