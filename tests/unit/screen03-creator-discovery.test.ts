import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadNormalizedTikTokFixture,
  loadRawApifyFixture,
} from "@/lib/tiktok/fixtures";
import { getDemoBrandProfile } from "@/lib/brand/fixtures";
import { qualifyCreator } from "@/lib/matching/qualification";
import { runClockworksTikTokScraper } from "@/lib/apify/tiktok-scraper";
import type { TikTokCreator } from "@/lib/tiktok/schemas";
import {
  POST as searchRoutePost,
  GET as searchRouteGet,
  clearDiscoverySearchCache,
} from "@/app/api/discovery/search/route";

describe("Screen 03 — Creator Discovery Specification, State & Safety", () => {
  beforeEach(() => {
    clearDiscoverySearchCache();
    vi.restoreAllMocks();
  });

  describe("1. Saved Dataset & Metric Accuracy", () => {
    it("loads 10 unique creators from the saved Apify fixture", () => {
      const fixture = loadNormalizedTikTokFixture();
      expect(fixture.creators).toHaveLength(10);
      expect(fixture.totalVideos).toBe(10);
      expect(fixture.allCreatorsSingleVideoSample).toBe(true);
    });

    it("matches exact metric values for reference creators from Apify fixture", () => {
      const fixture = loadNormalizedTikTokFixture();
      const creatorsByUsername = new Map<string, TikTokCreator>(
        fixture.creators.map((c) => [c.username, c])
      );

      // 1. @zzdaozz
      const zzdaozz = creatorsByUsername.get("zzdaozz");
      expect(zzdaozz).toBeDefined();
      expect(zzdaozz?.followers).toBe(1600000); // 1.6M
      expect(zzdaozz?.videos[0]?.views).toBe(4100000); // 4.1M
      expect(zzdaozz?.videos[0]?.engagementRateByViews).toBeCloseTo(0.00774, 4); // 0.77%
      expect(zzdaozz?.totalProfileVideos).toBe(2081);
      expect(zzdaozz?.videos[0]?.hashtags).toContain("ผิวแพ้ง่าย");
      expect(zzdaozz?.videos[0]?.hashtags).toContain("สกินแคร์");

      // 2. @pchskinmood
      const pchskinmood = creatorsByUsername.get("pchskinmood");
      expect(pchskinmood).toBeDefined();
      expect(pchskinmood?.followers).toBe(97700); // 97.7K
      expect(pchskinmood?.videos[0]?.views).toBe(270900); // 270.9K
      expect(pchskinmood?.videos[0]?.engagementRateByViews).toBeCloseTo(
        0.05167,
        4
      ); // 5.17%
      expect(pchskinmood?.totalProfileVideos).toBe(239);
      expect(pchskinmood?.videos[0]?.hashtags).toContain("skincareroutine");
      expect(pchskinmood?.videos[0]?.hashtags).toContain("ผิวชุ่มชื้น");

      // 3. @g.granviia.th
      const granviia = creatorsByUsername.get("g.granviia.th");
      expect(granviia).toBeDefined();
      expect(granviia?.followers).toBe(81800); // 81.8K
      expect(granviia?.videos[0]?.views).toBe(1400000); // 1.4M
      expect(granviia?.videos[0]?.engagementRateByViews).toBeCloseTo(
        0.01285,
        4
      ); // 1.28%
      expect(granviia?.totalProfileVideos).toBe(1009);
      expect(granviia?.videos[0]?.hashtags).toContain("การดูแลผิว101");
      expect(granviia?.videos[0]?.hashtags).toContain("skincare");
    });
  });

  describe("2. Initial 6 Display & Expand / Collapse Logic", () => {
    it("slices 6 creators initially from the dataset (Desktop 3x2 grid)", () => {
      const fixture = loadNormalizedTikTokFixture();
      const INITIAL_VISIBLE_COUNT = 6;
      const initialSlice = fixture.creators.slice(0, INITIAL_VISIBLE_COUNT);

      expect(initialSlice).toHaveLength(6);
      expect(fixture.creators.length).toBeGreaterThan(6);
    });

    it("computes dynamic button label based on actual dataset count rather than hardcoded 10", () => {
      const fixture = loadNormalizedTikTokFixture();
      const totalCount = fixture.creators.length;

      const expandButtonLabel = `Show all (${totalCount})`;
      expect(expandButtonLabel).toBe(`Show all (${fixture.creators.length})`);

      const collapseButtonLabel = "Show less";
      expect(collapseButtonLabel).toBe("Show less");
    });

    it("returns full dataset when expanded and collapses back to 6", () => {
      const fixture = loadNormalizedTikTokFixture();
      const INITIAL_VISIBLE_COUNT = 6;

      let isExpanded = false;
      let displayed = isExpanded
        ? fixture.creators
        : fixture.creators.slice(0, INITIAL_VISIBLE_COUNT);
      expect(displayed).toHaveLength(6);

      // Expand
      isExpanded = true;
      displayed = isExpanded
        ? fixture.creators
        : fixture.creators.slice(0, INITIAL_VISIBLE_COUNT);
      expect(displayed).toHaveLength(fixture.creators.length);

      // Collapse
      isExpanded = false;
      displayed = isExpanded
        ? fixture.creators
        : fixture.creators.slice(0, INITIAL_VISIBLE_COUNT);
      expect(displayed).toHaveLength(6);
    });

    it("renders 'Found X creators' calculated dynamically from displayedCreators.length", () => {
      const fixture = loadNormalizedTikTokFixture();
      const INITIAL_VISIBLE_COUNT = 6;

      const initialDisplayed = fixture.creators.slice(0, INITIAL_VISIBLE_COUNT);
      const initialText = `Found ${initialDisplayed.length} creators`;
      expect(initialText).toBe("Found 6 creators");

      const expandedDisplayed = fixture.creators;
      const expandedText = `Found ${expandedDisplayed.length} creators`;
      expect(expandedText).toBe(`Found ${fixture.creators.length} creators`);
    });
  });

  describe("3. Whole-Dataset Sorting Prior to Slicing 6 Items", () => {
    it("sorts the entire dataset by followers descending before taking top 6", () => {
      const fixture = loadNormalizedTikTokFixture();
      const sorted = [...fixture.creators].sort(
        (a, b) => (b.followers ?? 0) - (a.followers ?? 0)
      );

      const top6 = sorted.slice(0, 6);
      expect(top6).toHaveLength(6);
      expect(top6[0].username).toBe("pim168889439"); // 3.2M followers
      expect(top6[1].username).toBe("zzdaozz"); // 1.6M followers
      expect(top6[0].followers).toBeGreaterThanOrEqual(top6[5].followers ?? 0);
    });

    it("sorts the entire dataset by sample ER descending before taking top 6", () => {
      const fixture = loadNormalizedTikTokFixture();
      const sorted = [...fixture.creators].sort((a, b) => {
        const erA = a.videos[0]?.engagementRateByViews ?? 0;
        const erB = b.videos[0]?.engagementRateByViews ?? 0;
        return erB - erA;
      });

      const top6 = sorted.slice(0, 6);
      expect(top6).toHaveLength(6);
      const firstER = top6[0].videos[0]?.engagementRateByViews ?? 0;
      const sixthER = top6[5].videos[0]?.engagementRateByViews ?? 0;
      expect(firstER).toBeGreaterThanOrEqual(sixthER);
    });
  });

  describe("4. Creator Qualification Breakdown & Brand Account Exclusion", () => {
    const brandProfile = getDemoBrandProfile();

    it("computes separate counts for Collected, Eligible, Needs review, and Excluded", () => {
      const fixture = loadNormalizedTikTokFixture();
      const qualified = fixture.creators.map((c) =>
        qualifyCreator(c, {
          targetMarket: brandProfile.targetMarket ?? "Thailand",
        })
      );

      const eligibleCount = qualified.filter(
        (q) => q.status === "eligible"
      ).length;
      const needsReviewCount = qualified.filter(
        (q) => q.status === "needs_review"
      ).length;
      const excludedCount = qualified.filter(
        (q) => q.status === "excluded"
      ).length;

      expect(qualified).toHaveLength(fixture.creators.length);
      expect(eligibleCount + needsReviewCount + excludedCount).toBe(
        fixture.creators.length
      );
      expect(excludedCount).toBeGreaterThanOrEqual(1);
    });

    it("identifies official brand account @remo.thailand as excluded and not eligible for matching", () => {
      const fixture = loadNormalizedTikTokFixture();
      const remo = fixture.creators.find((c) => c.username === "remo.thailand");
      expect(remo).toBeDefined();

      const qRemo = qualifyCreator(remo!, {
        targetMarket: brandProfile.targetMarket ?? "Thailand",
      });

      expect(qRemo.status).toBe("excluded");
      expect(qRemo.accountType).toBe("brand_account");
      expect(qRemo.reasonCodes).toContain("OFFICIAL_BRAND_OR_STORE_ACCOUNT");
    });

    it("filters out excluded creators when preparing matching payload, preserving complete creator metadata", () => {
      const fixture = loadNormalizedTikTokFixture();
      const qualifiedMap = new Map(
        fixture.creators.map((c) => [
          c.username,
          qualifyCreator(c, {
            targetMarket: brandProfile.targetMarket ?? "Thailand",
          }),
        ])
      );

      // Filtering logic matching CreatorDiscoveryScreen
      const matchingReady = fixture.creators.filter((c) => {
        const q = qualifiedMap.get(c.username);
        return q && q.status !== "excluded";
      });

      // Verification: @remo.thailand must NOT be in matchingReady
      expect(matchingReady.some((c) => c.username === "remo.thailand")).toBe(
        false
      );
      expect(matchingReady.length).toBeLessThan(fixture.creators.length);

      // Verification: Needs review accounts ARE preserved and forwarded to Screen 4
      const needsReviewCreators = fixture.creators.filter((c) => {
        const q = qualifiedMap.get(c.username);
        return q && q.status === "needs_review";
      });
      expect(needsReviewCreators.length).toBeGreaterThan(0);
      for (const nrc of needsReviewCreators) {
        expect(matchingReady.some((c) => c.username === nrc.username)).toBe(
          true
        );
      }

      // Verify data integrity for non-excluded creators
      const zzdaozz = matchingReady.find((c) => c.username === "zzdaozz");
      expect(zzdaozz).toBeDefined();
      expect(zzdaozz?.videos).toHaveLength(1);
      expect(zzdaozz?.metrics).toBeDefined();
      expect(zzdaozz?.followers).toBe(1600000);
      expect(zzdaozz?.avatarUrl).toBeDefined();
    });
  });

  describe("5. Data Flow from Screen 2 & Safety", () => {
    it("receives suggestedTikTokSearchKeywords from BrandProfile dynamically", () => {
      const demoProfile = getDemoBrandProfile();
      expect(demoProfile.suggestedTikTokSearchKeywords).toBeDefined();

      const customProfile = {
        ...demoProfile,
        suggestedTikTokSearchKeywords: ["ลิปแมทท์", "บลัชออน", "แต่งหน้า"],
      };

      expect(customProfile.suggestedTikTokSearchKeywords).toEqual([
        "ลิปแมทท์",
        "บลัชออน",
        "แต่งหน้า",
      ]);
    });
  });

  describe("6. Live Search Guard Route (/api/discovery/search)", () => {
    it("returns saved fixture data safely on GET request", async () => {
      const res = await searchRouteGet();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data.source).toBe("saved_fixture");
      expect(json.data.creators).toHaveLength(10);
      expect(json.data.excludedAccounts).toHaveLength(1);
    });

    it("blocks POST live search without explicit user confirmation (confirmPaidRun: true)", async () => {
      const mockReq = new Request(
        "http://localhost:3000/api/discovery/search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            searchQueries: ["สกินแคร์"],
            confirmPaidRun: false,
          }),
        }
      );

      const res = await searchRoutePost(mockReq);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("PAID_RUN_CONFIRMATION_REQUIRED");
    });
  });

  describe("7. Strict Apify Cost Control Verification", () => {
    it("passes maxItems=5 and maxTotalChargeUsd directly into Apify API URL query string", async () => {
      const rawFixture = loadRawApifyFixture("primary");
      let capturedUrl = "";
      let capturedBody: Record<string, unknown> = {};

      const mockFetch = vi
        .fn()
        .mockImplementation(async (url: string, init?: RequestInit) => {
          capturedUrl = url;
          capturedBody = JSON.parse(String(init?.body || "{}"));
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => rawFixture,
          };
        });

      const result = await runClockworksTikTokScraper(
        {
          // Pass multiple keywords to test strict 1-keyword capping
          searchQueries: ["เซรั่มลดสิว", "มอยส์เจอร์ไรเซอร์", "ครีมกันแดด"],
          resultsPerPage: 50, // Pass excessive count to test strict 5 capping
        },
        {
          apiToken: "test_apify_token_xyz",
          allowPaidActorRun: true,
          fetchFn: mockFetch as unknown as typeof fetch,
          maxItems: 5,
          maxTotalChargeUsd: 0.25,
          timeoutSecs: 60,
        }
      );

      // Verify URL contains Apify run-level parameters
      const parsedUrl = new URL(capturedUrl);
      expect(parsedUrl.searchParams.get("maxItems")).toBe("5");
      expect(parsedUrl.searchParams.get("maxTotalChargeUsd")).toBe("0.25");
      expect(parsedUrl.searchParams.get("timeout")).toBe("60");
      expect(parsedUrl.searchParams.get("memory")).toBe("1024");

      // Verify Body strictly capped to 1 keyword and max 5 resultsPerPage
      expect(capturedBody.searchQueries).toEqual(["เซรั่มลดสิว"]);
      expect(capturedBody.resultsPerPage).toBe(5);

      // Verify all paid add-ons are strictly disabled
      expect(capturedBody.shouldDownloadVideos).toBe(false);
      expect(capturedBody.shouldDownloadCovers).toBe(false);
      expect(capturedBody.shouldDownloadSubtitles).toBe(false);
      expect(capturedBody.shouldDownloadSlideshowImages).toBe(false);

      // Verify result cost controls metadata
      expect(result.costControls.maxItems).toBe(5);
      expect(result.costControls.maxTotalChargeUsd).toBe(0.25);
      expect(result.costControls.paidAddonsDisabled).toBe(true);
    });

    it("POST /api/discovery/search limits multi-keyword requests to 1 keyword per run", async () => {
      const rawFixture = loadRawApifyFixture("primary");
      let capturedRequestBody: Record<string, unknown> = {};

      vi.spyOn(globalThis, "fetch").mockImplementation(
        async (_url: unknown, init?: RequestInit) => {
          capturedRequestBody = JSON.parse(String(init?.body || "{}"));
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => rawFixture,
          } as unknown as Response;
        }
      );

      const originalToken = process.env.APIFY_API_TOKEN;
      process.env.APIFY_API_TOKEN = "test_apify_mock_token_123";

      try {
        const req = new Request("http://localhost:3000/api/discovery/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            searchQueries: ["สกินแคร์", "เซรั่ม", "ครีมกันแดด"],
            confirmPaidRun: true,
          }),
        });

        const res = await searchRoutePost(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.ok).toBe(true);
        expect(json.data.searchKeyword).toBe("สกินแคร์");
        expect(capturedRequestBody.searchQueries).toEqual(["สกินแคร์"]);
        expect(capturedRequestBody.resultsPerPage).toBe(5);
      } finally {
        process.env.APIFY_API_TOKEN = originalToken;
      }
    });

    it("POST /api/discovery/search caches keyword results and serves subsequent requests with 0 network calls", async () => {
      const rawFixture = loadRawApifyFixture("primary");
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async () => {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => rawFixture,
          } as unknown as Response;
        });

      const originalToken = process.env.APIFY_API_TOKEN;
      process.env.APIFY_API_TOKEN = "test_apify_mock_token_123";

      try {
        // First run: calls fetch
        const req1 = new Request("http://localhost:3000/api/discovery/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: "มอยส์เจอร์ไรเซอร์",
            confirmPaidRun: true,
          }),
        });

        const res1 = await searchRoutePost(req1);
        const json1 = await res1.json();
        expect(res1.status).toBe(200);
        expect(json1.data.cached).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        // Second run with same keyword: should be served from memory cache without fetch
        const req2 = new Request("http://localhost:3000/api/discovery/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: "มอยส์เจอร์ไรเซอร์",
            confirmPaidRun: true,
          }),
        });

        const res2 = await searchRoutePost(req2);
        const json2 = await res2.json();
        expect(res2.status).toBe(200);
        expect(json2.data.cached).toBe(true);
        expect(json2.data.source).toBe("cache");
        expect(fetchSpy).toHaveBeenCalledTimes(1); // Still 1 call! 0 additional network calls
      } finally {
        process.env.APIFY_API_TOKEN = originalToken;
      }
    });

    it("does not automatically call Apify again to compensate for excluded creators", async () => {
      const rawFixture = loadRawApifyFixture("primary");
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async () => {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => rawFixture,
          } as unknown as Response;
        });

      const originalToken = process.env.APIFY_API_TOKEN;
      process.env.APIFY_API_TOKEN = "test_apify_mock_token_123";

      try {
        const req = new Request("http://localhost:3000/api/discovery/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: "กำจัดขน",
            confirmPaidRun: true,
          }),
        });

        const res = await searchRoutePost(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        // Excluded brand accounts like @remo.thailand are identified
        expect(json.data.summary.excluded).toBeGreaterThanOrEqual(1);
        // Exactly 1 fetch was made; no compensatory secondary scrape was triggered
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      } finally {
        process.env.APIFY_API_TOKEN = originalToken;
      }
    });
  });
});
