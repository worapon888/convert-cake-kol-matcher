import { describe, expect, it, vi } from "vitest";
import {
  ApifyConfigurationError,
  ApifyPaidRunGuardError,
  CLOCKWORKS_TIKTOK_SCRAPER_ACTOR_ID,
  fetchApifyDatasetById,
  runClockworksTikTokScraper,
} from "@/lib/apify/tiktok-scraper";
import {
  ApifyTikTokDatasetSchema,
  buildCreatorMetrics,
  calculateAverageEngagementRate,
  calculateDataCompleteness,
  calculateEngagementRateByViews,
  calculateMedianViews,
  calculateSampledVideoCount,
  loadNormalizedTikTokFixture,
  loadRawApifyFixture,
  normalizeApifyDataset,
  normalizeRawApifyFixture,
  normalizeTikTokVideo,
  resolveCreatorIdentity,
} from "@/lib/tiktok";

describe("Step 2 — TikTok Data Normalization and Creator Metrics", () => {
  describe("1. Real Apify Dataset & Fixture Validation", () => {
    it("loads and validates the primary 10-video Apify dataset from clockworks/tiktok-scraper", () => {
      const rawItems = loadRawApifyFixture("primary");
      expect(rawItems).toHaveLength(10);

      const parsed = ApifyTikTokDatasetSchema.safeParse(rawItems);
      expect(parsed.success).toBe(true);
    });

    it("also validates the secondary 10-video Apify dataset batch", () => {
      const rawBatch2 = loadRawApifyFixture("batch2");
      expect(rawBatch2).toHaveLength(10);

      const normalizedBatch2 = normalizeRawApifyFixture("batch2");
      expect(normalizedBatch2.totalVideos).toBe(10);
      expect(normalizedBatch2.totalCreators).toBe(10);
      expect(normalizedBatch2.allCreatorsSingleVideoSample).toBe(true);
    });

    it("normalizes the 10-video dataset into 10 unique creators with 1 video each and matches normalized-tiktok-fixture.json", () => {
      const normalized = normalizeRawApifyFixture("primary");
      const loadedFixture = loadNormalizedTikTokFixture();
      expect(loadedFixture).toEqual(normalized);

      expect(normalized.sourceActor).toBe("clockworks/tiktok-scraper");
      expect(normalized.totalVideos).toBe(10);
      expect(normalized.totalCreators).toBe(10);
      expect(normalized.allCreatorsSingleVideoSample).toBe(true);
      expect(normalized.datasetWarning).toContain(
        "1 sampled video per creator"
      );
    });
  });

  describe("2. Exact Field Mapping (Apify -> Normalized Domain)", () => {
    it("maps every required Apify field to TikTokVideo and TikTokCreator accurately", () => {
      const rawItems = loadRawApifyFixture("primary");
      const firstRaw = rawItems[0];
      const normalized = normalizeApifyDataset([firstRaw]);

      const video = normalized.videos[0];
      const creator = normalized.creators[0];

      // id -> videoId
      expect(video.videoId).toBe("7685725641450442005");
      // text -> caption
      expect(video.caption).toBe(firstRaw.text);
      // webVideoUrl -> videoUrl
      expect(video.videoUrl).toBe(
        "https://www.tiktok.com/@thirisxstore/video/7685725641450442005"
      );
      // authorMeta.id -> creatorId
      expect(video.creatorId).toBe("68605486110");
      expect(creator.creatorId).toBe("68605486110");
      // authorMeta.name -> username
      expect(video.username).toBe("thirisxstore");
      expect(creator.username).toBe("thirisxstore");
      // authorMeta.profileUrl -> profileUrl
      expect(creator.profileUrl).toBe("https://www.tiktok.com/@thirisxstore");
      // authorMeta.fans -> followers
      expect(creator.followers).toBe(82400);
      // authorMeta.avatar -> avatarUrl
      expect(creator.avatarUrl).toBe(firstRaw.authorMeta.avatar);
      // authorMeta.video -> totalProfileVideos
      expect(creator.totalProfileVideos).toBe(1054);
      // videoMeta.coverUrl -> coverUrl
      expect(video.coverUrl).toBe(firstRaw.videoMeta?.coverUrl);
      // playCount -> views
      expect(video.views).toBe(3600000);
      // diggCount -> likes
      expect(video.likes).toBe(24500);
      // commentCount -> comments
      expect(video.comments).toBe(334);
      // shareCount -> shares
      expect(video.shares).toBe(2028);
      // createTimeISO -> publishedAt
      expect(video.publishedAt).toBe("2026-09-15T11:40:53.000Z");
      // hashtags[].name -> hashtags
      expect(video.hashtags).toEqual([
        "careangelacleanser",
        "careangela",
        "แคร์แองเจลล่าโฟมมูสไอศกรีม",
        "icecreamcleanser",
        "โฟมล้างหน้ามะเขือเทศขาว",
      ]);
      // isAd preserved
      expect(video.isAd).toBe(true);
    });
  });

  describe("3. Creator Grouping & Username Fallback", () => {
    it("groups multiple videos under the same creatorId", () => {
      const rawItems = loadRawApifyFixture("primary");
      const first = rawItems[0];
      const secondVideoSameCreator = {
        ...rawItems[1],
        id: "9999999999999999999",
        authorMeta: {
          ...first.authorMeta,
        },
        playCount: 100000,
        diggCount: 5000,
        commentCount: 100,
        shareCount: 400,
      };

      const normalized = normalizeApifyDataset([first, secondVideoSameCreator]);
      expect(normalized.totalVideos).toBe(2);
      expect(normalized.totalCreators).toBe(1);
      expect(normalized.creators[0].videos).toHaveLength(2);
      expect(normalized.creators[0].metrics.sampledVideosCount).toBe(2);
      expect(normalized.creators[0].metrics.isSingleVideoSample).toBe(false);
    });

    it("falls back to username when authorMeta.id is missing, null, or empty", () => {
      const identityWithId = resolveCreatorIdentity({
        id: "12345",
        name: "creator_one",
      });
      expect(identityWithId).toEqual({
        creatorId: "12345",
        username: "creator_one",
        usedUsernameFallbackForId: false,
      });

      const identityWithoutId = resolveCreatorIdentity({
        id: null,
        name: "fallback_creator",
      });
      expect(identityWithoutId).toEqual({
        creatorId: "fallback_creator",
        username: "fallback_creator",
        usedUsernameFallbackForId: true,
      });

      const rawItems = loadRawApifyFixture("primary");
      const itemWithoutCreatorId = {
        ...rawItems[0],
        authorMeta: {
          ...rawItems[0].authorMeta,
          id: "",
          name: "fallback_handle",
        },
      };

      const normalized = normalizeApifyDataset([itemWithoutCreatorId]);
      expect(normalized.creators[0].creatorId).toBe("fallback_handle");
      expect(normalized.creators[0].usedUsernameFallbackForId).toBe(true);
    });
  });

  describe("4. Pure Metric Functions", () => {
    it("calculates engagement rate by views: (likes + comments + shares) / views", () => {
      // (24500 + 334 + 2028) / 3600000 = 26862 / 3600000 = 0.007461666...
      const er = calculateEngagementRateByViews({
        views: 3600000,
        likes: 24500,
        comments: 334,
        shares: 2028,
      });
      expect(er).toBeCloseTo(26862 / 3600000, 10);

      // Returns null when views is 0 or missing
      expect(
        calculateEngagementRateByViews({
          views: 0,
          likes: 10,
          comments: 1,
          shares: 1,
        })
      ).toBeNull();

      expect(
        calculateEngagementRateByViews({
          views: 1000,
          likes: null,
          comments: 5,
          shares: 2,
        })
      ).toBeNull();
    });

    it("calculates median views for odd, even, and null-containing video arrays", () => {
      expect(
        calculateMedianViews([{ views: 100 }, { views: 500 }, { views: 200 }])
      ).toBe(200);

      expect(
        calculateMedianViews([
          { views: 100 },
          { views: 200 },
          { views: 400 },
          { views: 800 },
        ])
      ).toBe(300);

      expect(
        calculateMedianViews([{ views: null }, { views: 450 }, { views: null }])
      ).toBe(450);

      expect(calculateMedianViews([{ views: null }])).toBeNull();
      expect(calculateMedianViews([])).toBeNull();
    });

    it("calculates average engagement rate across sampled videos", () => {
      const avgEr = calculateAverageEngagementRate([
        { views: 1000, likes: 100, comments: 0, shares: 0 }, // 0.10
        { views: 2000, likes: 300, comments: 60, shares: 40 }, // 0.20
        { views: null, likes: 50, comments: 5, shares: 5 }, // ignored (null)
      ]);
      expect(avgEr).toBeCloseTo(0.15, 10);

      expect(
        calculateAverageEngagementRate([
          { views: null, likes: 10, comments: 1, shares: 1 },
        ])
      ).toBeNull();
    });

    it("calculates sampled video count accurately", () => {
      expect(calculateSampledVideoCount([])).toBe(0);
      expect(calculateSampledVideoCount([{}, {}, {}])).toBe(3);
    });

    it("calculates data completeness score and identifies missing fields", () => {
      const fullCompleteness = calculateDataCompleteness(
        {
          creatorId: "68605486110",
          username: "thirisxstore",
          profileUrl: "https://www.tiktok.com/@thirisxstore",
          followers: 82400,
        },
        [
          {
            videoId: "7685725641450442005",
            caption: "Caption text",
            videoUrl: "https://www.tiktok.com/@thirisxstore/video/1",
            views: 1000,
            likes: 100,
            comments: 10,
            shares: 5,
            publishedAt: "2026-09-15T11:40:53.000Z",
            hashtags: ["skincare"],
          },
        ]
      );

      expect(fullCompleteness.score).toBe(1);
      expect(fullCompleteness.presentFieldsCount).toBe(13);
      expect(fullCompleteness.totalFieldsCount).toBe(13);
      expect(fullCompleteness.missingFields).toEqual([]);

      const partialCompleteness = calculateDataCompleteness(
        {
          creatorId: "68605486110",
          username: "thirisxstore",
          profileUrl: null,
          followers: null,
        },
        [
          {
            videoId: "7685725641450442005",
            caption: null,
            videoUrl: "https://www.tiktok.com/@thirisxstore/video/1",
            views: 1000,
            likes: null,
            comments: 10,
            shares: 5,
            publishedAt: "2026-09-15T11:40:53.000Z",
            hashtags: [],
          },
        ]
      );

      expect(partialCompleteness.presentFieldsCount).toBe(8);
      expect(partialCompleteness.totalFieldsCount).toBe(13);
      expect(partialCompleteness.score).toBeCloseTo(8 / 13, 10);
      expect(partialCompleteness.missingFields).toEqual([
        "creator.profileUrl",
        "creator.followers",
        "videos[0].caption",
        "videos[0].likes",
        "videos[0].hashtags",
      ]);
    });
  });

  describe("5. Data-Quality Rules Enforcement", () => {
    it("never presents single-video metrics as representative creator-level performance", () => {
      const normalized = normalizeRawApifyFixture("primary");

      for (const creator of normalized.creators) {
        expect(creator.metrics.sampledVideosCount).toBe(1);
        expect(creator.metrics.isSingleVideoSample).toBe(true);
        expect(creator.metrics.isRepresentativeCreatorPerformance).toBe(false);
        expect(creator.metrics.sampleRepresentativenessNote).toContain(
          "Single-video sample only"
        );
      }
    });

    it("marks creator performance as representative only when >= 3 videos are sampled", () => {
      const rawItems = loadRawApifyFixture("primary");
      const baseVideo = normalizeTikTokVideo(rawItems[0]);

      const threeVideos = [
        baseVideo,
        { ...baseVideo, videoId: "v2", views: 500000 },
        { ...baseVideo, videoId: "v3", views: 900000 },
      ];

      const metrics = buildCreatorMetrics(
        {
          creatorId: baseVideo.creatorId,
          username: baseVideo.username,
          profileUrl: "https://www.tiktok.com/@thirisxstore",
          followers: 82400,
        },
        threeVideos
      );

      expect(metrics.sampledVideosCount).toBe(3);
      expect(metrics.isSingleVideoSample).toBe(false);
      expect(metrics.isRepresentativeCreatorPerformance).toBe(true);
    });

    it("preserves missing metrics as null and never invents audience demographics", () => {
      const rawItemWithMissingMetrics = {
        id: "7000000000000000001",
        text: null,
        createTimeISO: null,
        isAd: null,
        webVideoUrl: null,
        playCount: null,
        diggCount: null,
        commentCount: null,
        shareCount: null,
        hashtags: null,
        authorMeta: {
          id: "90001",
          name: "null_metrics_creator",
          profileUrl: null,
          fans: null,
        },
      };

      const normalized = normalizeApifyDataset([rawItemWithMissingMetrics]);
      const creator = normalized.creators[0];
      const video = normalized.videos[0];

      expect(creator.followers).toBeNull();
      expect(creator.profileUrl).toBeNull();
      expect(creator.audienceDemographics).toBeNull();
      expect(video.caption).toBeNull();
      expect(video.videoUrl).toBeNull();
      expect(video.views).toBeNull();
      expect(video.likes).toBeNull();
      expect(video.comments).toBeNull();
      expect(video.shares).toBeNull();
      expect(video.publishedAt).toBeNull();
      expect(video.isAd).toBeNull();
      expect(video.engagementRateByViews).toBeNull();
      expect(creator.metrics.medianViews).toBeNull();
      expect(creator.metrics.averageEngagementRate).toBeNull();
    });

    it("keeps isAd available and distinguishes brand vs. creator accounts via manual review rather than assuming isAd proves account type", () => {
      const normalized = normalizeRawApifyFixture("primary");

      const adVideos = normalized.videos.filter((v) => v.isAd === true);
      const nonAdVideos = normalized.videos.filter((v) => v.isAd === false);
      expect(adVideos.length).toBe(7);
      expect(nonAdVideos.length).toBe(3);

      // Default status is "unverified" regardless of isAd
      for (const creator of normalized.creators) {
        expect(creator.accountTypeReviewStatus).toBe("unverified");
      }

      // Manual review can classify brand-owned vs creator accounts explicitly
      const reviewed = normalizeRawApifyFixture("primary", {
        manualAccountTypeOverrides: {
          "remo.thailand": "brand",
          zzdaozz: "creator",
        },
      });

      const remo = reviewed.creators.find(
        (c) => c.username === "remo.thailand"
      );
      const dao = reviewed.creators.find((c) => c.username === "zzdaozz");

      expect(remo?.accountTypeReviewStatus).toBe("brand");
      expect(dao?.accountTypeReviewStatus).toBe("creator");
    });
  });

  describe("6. Reusable Apify Integration Module & Safety Guards", () => {
    it("blocks automatic paid Actor runs unless allowPaidActorRun is explicitly true", async () => {
      expect(CLOCKWORKS_TIKTOK_SCRAPER_ACTOR_ID).toBe(
        "clockworks/tiktok-scraper"
      );

      await expect(
        runClockworksTikTokScraper({
          searchQueries: ["รีวิวสกินแคร์"],
          resultsPerPage: 5,
          shouldDownloadVideos: false,
          shouldDownloadCovers: false,
          shouldDownloadSubtitles: false,
          shouldDownloadSlideshowImages: false,
        })
      ).rejects.toThrow(ApifyPaidRunGuardError);
    });

    it("requires a valid APIFY_API_TOKEN when fetching datasets or running opted-in scrapes", async () => {
      await expect(
        fetchApifyDatasetById("dataset_123", { apiToken: "" })
      ).rejects.toThrow(ApifyConfigurationError);
    });

    it("fetches and normalizes an existing Apify dataset using an injected fetch function without running an Actor", async () => {
      const rawFixture = loadRawApifyFixture("primary");
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => rawFixture,
      });

      const result = await fetchApifyDatasetById("test-dataset-id", {
        apiToken: "apify_api_test_token_123",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.totalVideos).toBe(10);
      expect(result.totalCreators).toBe(10);
    });
  });
});
