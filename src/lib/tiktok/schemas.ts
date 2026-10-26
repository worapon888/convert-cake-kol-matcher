import { z } from "zod";

/**
 * Raw hashtag object returned by Apify `clockworks/tiktok-scraper`.
 */
export const ApifyHashtagSchema = z
  .object({
    id: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    cover: z.string().nullable().optional(),
  })
  .passthrough();

export type ApifyHashtag = z.infer<typeof ApifyHashtagSchema>;

/**
 * Raw author metadata object (`authorMeta`) returned by Apify `clockworks/tiktok-scraper`.
 */
export const ApifyAuthorMetaSchema = z
  .object({
    id: z.union([z.string(), z.number()]).nullable().optional(),
    name: z.string().min(1, "authorMeta.name (username) is required"),
    profileUrl: z.string().nullable().optional(),
    nickName: z.string().nullable().optional(),
    verified: z.boolean().nullable().optional(),
    signature: z.string().nullable().optional(),
    bioLink: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    privateAccount: z.boolean().nullable().optional(),
    createTime: z.number().nullable().optional(),
    hasActiveStory: z.boolean().nullable().optional(),
    following: z.number().nullable().optional(),
    friends: z.number().nullable().optional(),
    fans: z.number().nullable().optional(),
    heart: z.number().nullable().optional(),
    video: z.number().nullable().optional(),
    digg: z.number().nullable().optional(),
    followDatasetUrl: z.string().nullable().optional(),
    originalAvatarUrl: z.string().nullable().optional(),
  })
  .passthrough();

export type ApifyAuthorMeta = z.infer<typeof ApifyAuthorMetaSchema>;

/**
 * Raw music metadata (`musicMeta`) returned by Apify `clockworks/tiktok-scraper`.
 */
export const ApifyMusicMetaSchema = z
  .object({
    musicId: z.string().nullable().optional(),
    musicName: z.string().nullable().optional(),
    musicAuthor: z.string().nullable().optional(),
    musicOriginal: z.boolean().nullable().optional(),
    playUrl: z.string().nullable().optional(),
    coverMediumUrl: z.string().nullable().optional(),
    originalCoverMediumUrl: z.string().nullable().optional(),
  })
  .passthrough();

/**
 * Raw video metadata (`videoMeta`) returned by Apify `clockworks/tiktok-scraper`.
 */
export const ApifyVideoMetaSchema = z
  .object({
    height: z.number().nullable().optional(),
    width: z.number().nullable().optional(),
    duration: z.number().nullable().optional(),
    coverUrl: z.string().nullable().optional(),
    originalCoverUrl: z.string().nullable().optional(),
    definition: z.string().nullable().optional(),
    format: z.string().nullable().optional(),
  })
  .passthrough();

/**
 * Raw item schema for a single video entry from Apify Actor `clockworks/tiktok-scraper`.
 * Missing or uncollected metrics are preserved as nullable/optional so they normalize to `null`.
 */
export const ApifyTikTokVideoItemSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform((val) => String(val)),
    text: z.string().nullable().optional(),
    textLanguage: z.string().nullable().optional(),
    createTime: z.number().nullable().optional(),
    createTimeISO: z.string().nullable().optional(),
    isAd: z.boolean().nullable().optional(),
    isSponsored: z.boolean().nullable().optional(),
    authorMeta: ApifyAuthorMetaSchema,
    musicMeta: ApifyMusicMetaSchema.nullable().optional(),
    webVideoUrl: z.string().nullable().optional(),
    videoMeta: ApifyVideoMetaSchema.nullable().optional(),
    diggCount: z.number().nullable().optional(),
    shareCount: z.number().nullable().optional(),
    playCount: z.number().nullable().optional(),
    collectCount: z.number().nullable().optional(),
    commentCount: z.number().nullable().optional(),
    repostCount: z.number().nullable().optional(),
    mentions: z.array(z.string()).nullable().optional(),
    detailedMentions: z.array(z.unknown()).nullable().optional(),
    hashtags: z.array(ApifyHashtagSchema).nullable().optional(),
    effectStickers: z.array(z.unknown()).nullable().optional(),
    isSlideshow: z.boolean().nullable().optional(),
    isPinned: z.boolean().nullable().optional(),
    shortDramaSeriesInfo: z.unknown().nullable().optional(),
    mediaUrls: z.array(z.string()).nullable().optional(),
    isStory: z.boolean().nullable().optional(),
    searchQuery: z.string().nullable().optional(),
    commentsDatasetUrl: z.string().nullable().optional(),
  })
  .passthrough();

export type ApifyTikTokVideoItem = z.infer<typeof ApifyTikTokVideoItemSchema>;

/**
 * Full dataset array returned by Apify `clockworks/tiktok-scraper`.
 */
export const ApifyTikTokDatasetSchema = z.array(ApifyTikTokVideoItemSchema);

/**
 * Account classification status for distinguishing creator accounts vs. brand-owned accounts
 * through manual review. `isAd` does NOT prove whether an account is a brand or creator.
 */
export const AccountTypeReviewStatusSchema = z.enum([
  "unverified",
  "creator",
  "brand",
]);

export type AccountTypeReviewStatus = z.infer<
  typeof AccountTypeReviewStatusSchema
>;

/**
 * Normalized TikTok video model mapped from Apify `clockworks/tiktok-scraper`.
 *
 * Field Mappings:
 * - `id` -> `videoId`
 * - `text` -> `caption`
 * - `webVideoUrl` -> `videoUrl`
 * - `authorMeta.id` -> `creatorId` (fallback to `authorMeta.name` if unavailable)
 * - `authorMeta.name` -> `username`
 * - `playCount` -> `views`
 * - `diggCount` -> `likes`
 * - `commentCount` -> `comments`
 * - `shareCount` -> `shares`
 * - `createTimeISO` -> `publishedAt`
 * - `hashtags[].name` -> `hashtags`
 */
export const TikTokVideoSchema = z.object({
  videoId: z.string().min(1),
  creatorId: z.string().min(1),
  username: z.string().min(1),
  caption: z.string().nullable(),
  videoUrl: z.string().nullable(),
  views: z.number().nullable(),
  likes: z.number().nullable(),
  comments: z.number().nullable(),
  shares: z.number().nullable(),
  publishedAt: z.string().nullable(),
  hashtags: z.array(z.string()),
  isAd: z.boolean().nullable(),
  isSponsored: z.boolean().nullable(),
  textLanguage: z.string().nullable(),
  engagementRateByViews: z.number().nullable(),
});

export type TikTokVideo = z.infer<typeof TikTokVideoSchema>;

/**
 * Computed creator metrics across sampled videos.
 *
 * Data Quality Rule:
 * When `sampledVideosCount === 1`, `isSingleVideoSample` is `true` and
 * `isRepresentativeCreatorPerformance` is `false`. Single-video metrics must never be
 * presented as representative creator-level performance.
 */
export const CreatorMetricsSchema = z.object({
  sampledVideosCount: z.number().int().nonnegative(),
  medianViews: z.number().nullable(),
  averageEngagementRate: z.number().nullable(),
  engagementRatesByVideo: z.array(z.number().nullable()),
  dataCompleteness: z.number().min(0).max(1),
  missingFields: z.array(z.string()),
  isSingleVideoSample: z.boolean(),
  isRepresentativeCreatorPerformance: z.boolean(),
  sampleRepresentativenessNote: z.string(),
  adVideosCount: z.number().int().nonnegative(),
});

export type CreatorMetrics = z.infer<typeof CreatorMetricsSchema>;

/**
 * Normalized TikTok creator profile with grouped sampled videos and metrics.
 *
 * Data Quality Rules:
 * - Audience demographics are never invented (`audienceDemographics: null`).
 * - Missing metrics are preserved as `null`.
 * - Brand-owned accounts and creator accounts remain distinguishable via `accountTypeReviewStatus`
 *   for future manual review (`isAd` does not prove account type).
 */
export const TikTokCreatorSchema = z.object({
  creatorId: z.string().min(1),
  usedUsernameFallbackForId: z.boolean(),
  username: z.string().min(1),
  nickname: z.string().nullable(),
  profileUrl: z.string().nullable(),
  followers: z.number().nullable(),
  bio: z.string().nullable(),
  verified: z.boolean().nullable(),
  accountTypeReviewStatus: AccountTypeReviewStatusSchema,
  audienceDemographics: z.null(),
  videos: z.array(TikTokVideoSchema),
  metrics: CreatorMetricsSchema,
});

export type TikTokCreator = z.infer<typeof TikTokCreatorSchema>;

/**
 * Complete normalized dataset container.
 */
export const NormalizedTikTokDatasetSchema = z.object({
  sourceActor: z.literal("clockworks/tiktok-scraper"),
  totalVideos: z.number().int().nonnegative(),
  totalCreators: z.number().int().nonnegative(),
  allCreatorsSingleVideoSample: z.boolean(),
  datasetWarning: z.string().nullable(),
  videos: z.array(TikTokVideoSchema),
  creators: z.array(TikTokCreatorSchema),
});

export type NormalizedTikTokDataset = z.infer<
  typeof NormalizedTikTokDatasetSchema
>;
