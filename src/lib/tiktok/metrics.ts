import type { CreatorMetrics, TikTokVideo } from "./schemas";

export interface VideoEngagementInput {
  views: number | null | undefined;
  likes: number | null | undefined;
  comments: number | null | undefined;
  shares: number | null | undefined;
}

export interface CreatorCompletenessInput {
  creatorId: string | null | undefined;
  username: string | null | undefined;
  profileUrl: string | null | undefined;
  followers: number | null | undefined;
}

export type VideoCompletenessInput = Pick<
  TikTokVideo,
  | "videoId"
  | "caption"
  | "videoUrl"
  | "views"
  | "likes"
  | "comments"
  | "shares"
  | "publishedAt"
  | "hashtags"
>;

export interface DataCompletenessResult {
  /** Normalized completeness ratio in [0, 1] */
  score: number;
  /** Number of non-null / populated required fields */
  presentFieldsCount: number;
  /** Total number of evaluated fields across creator and sampled videos */
  totalFieldsCount: number;
  /** Explicit identifiers of missing or null fields */
  missingFields: string[];
}

/** Minimum sampled videos required before metrics can be considered representative of creator-level performance */
export const MIN_VIDEOS_FOR_REPRESENTATIVE_PERFORMANCE = 3;

function isValidNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Pure function: Calculates engagement rate by views for a single video.
 *
 * Formula: `(likes + comments + shares) / views`
 *
 * Rules:
 * - Preserves missing metrics as `null`.
 * - Returns `null` if `views`, `likes`, `comments`, or `shares` is `null`/`undefined`/negative,
 *   or if `views <= 0` (prevents division by zero).
 */
export function calculateEngagementRateByViews(
  input: VideoEngagementInput
): number | null {
  const { views, likes, comments, shares } = input;

  if (
    !isValidNonNegativeNumber(views) ||
    views <= 0 ||
    !isValidNonNegativeNumber(likes) ||
    !isValidNonNegativeNumber(comments) ||
    !isValidNonNegativeNumber(shares)
  ) {
    return null;
  }

  return (likes + comments + shares) / views;
}

/**
 * Pure function: Calculates median views across a creator's sampled videos.
 *
 * Rules:
 * - Ignores videos where `views` is `null` or invalid.
 * - Returns `null` when no sampled videos have valid views.
 * - For odd count `n`: returns middle sorted value.
 * - For even count `n`: returns arithmetic mean of the two middle sorted values.
 */
export function calculateMedianViews(
  videos: readonly Pick<TikTokVideo, "views">[]
): number | null {
  const validViews = videos
    .map((v) => v.views)
    .filter((views): views is number => isValidNonNegativeNumber(views))
    .sort((a, b) => a - b);

  if (validViews.length === 0) {
    return null;
  }

  const middleIndex = Math.floor(validViews.length / 2);
  if (validViews.length % 2 === 1) {
    return validViews[middleIndex];
  }

  return (validViews[middleIndex - 1] + validViews[middleIndex]) / 2;
}

/**
 * Pure function: Calculates the arithmetic mean of engagement rates across a creator's sampled videos.
 *
 * Rules:
 * - Computes `calculateEngagementRateByViews` for each video.
 * - Excludes videos with `null` engagement rate.
 * - Returns `null` if no sampled videos have a valid engagement rate.
 */
export function calculateAverageEngagementRate(
  videos: readonly VideoEngagementInput[]
): number | null {
  const validRates = videos
    .map((video) => calculateEngagementRateByViews(video))
    .filter(
      (rate): rate is number =>
        typeof rate === "number" && Number.isFinite(rate)
    );

  if (validRates.length === 0) {
    return null;
  }

  const sum = validRates.reduce((acc, rate) => acc + rate, 0);
  return sum / validRates.length;
}

/**
 * Pure function: Returns the number of sampled videos for a creator.
 */
export function calculateSampledVideoCount(videos: readonly unknown[]): number {
  return videos.length;
}

/**
 * Pure function: Evaluates data completeness across the 13 core mapped fields:
 * - Creator fields (4): `creatorId`, `username`, `profileUrl`, `followers`
 * - Video fields per sampled video (9): `videoId`, `caption`, `videoUrl`, `views`, `likes`, `comments`, `shares`, `publishedAt`, `hashtags`
 *
 * If a creator has 0 sampled videos, all 9 video fields are counted as missing.
 */
export function calculateDataCompleteness(
  creator: CreatorCompletenessInput,
  videos: readonly VideoCompletenessInput[]
): DataCompletenessResult {
  const missingFields: string[] = [];
  let totalFieldsCount = 4;

  if (!isNonEmptyString(creator.creatorId)) {
    missingFields.push("creator.creatorId");
  }
  if (!isNonEmptyString(creator.username)) {
    missingFields.push("creator.username");
  }
  if (!isNonEmptyString(creator.profileUrl)) {
    missingFields.push("creator.profileUrl");
  }
  if (!isValidNonNegativeNumber(creator.followers)) {
    missingFields.push("creator.followers");
  }

  if (videos.length === 0) {
    totalFieldsCount += 9;
    missingFields.push(
      "videos[0].videoId",
      "videos[0].caption",
      "videos[0].videoUrl",
      "videos[0].views",
      "videos[0].likes",
      "videos[0].comments",
      "videos[0].shares",
      "videos[0].publishedAt",
      "videos[0].hashtags"
    );
  } else {
    videos.forEach((video, index) => {
      totalFieldsCount += 9;
      const prefix = `videos[${index}]`;

      if (!isNonEmptyString(video.videoId)) {
        missingFields.push(`${prefix}.videoId`);
      }
      if (!isNonEmptyString(video.caption)) {
        missingFields.push(`${prefix}.caption`);
      }
      if (!isNonEmptyString(video.videoUrl)) {
        missingFields.push(`${prefix}.videoUrl`);
      }
      if (!isValidNonNegativeNumber(video.views)) {
        missingFields.push(`${prefix}.views`);
      }
      if (!isValidNonNegativeNumber(video.likes)) {
        missingFields.push(`${prefix}.likes`);
      }
      if (!isValidNonNegativeNumber(video.comments)) {
        missingFields.push(`${prefix}.comments`);
      }
      if (!isValidNonNegativeNumber(video.shares)) {
        missingFields.push(`${prefix}.shares`);
      }
      if (!isNonEmptyString(video.publishedAt)) {
        missingFields.push(`${prefix}.publishedAt`);
      }
      if (!Array.isArray(video.hashtags) || video.hashtags.length === 0) {
        missingFields.push(`${prefix}.hashtags`);
      }
    });
  }

  const presentFieldsCount = Math.max(
    0,
    totalFieldsCount - missingFields.length
  );
  const score =
    totalFieldsCount > 0 ? presentFieldsCount / totalFieldsCount : 0;

  return {
    score,
    presentFieldsCount,
    totalFieldsCount,
    missingFields,
  };
}

/**
 * Pure function: Builds the complete `CreatorMetrics` object for a creator and their sampled videos.
 *
 * Enforces the data-quality rule:
 * Single-video metrics (`sampledVideosCount === 1`) are explicitly flagged with
 * `isSingleVideoSample: true` and `isRepresentativeCreatorPerformance: false` so they are never
 * presented as representative creator-level performance.
 */
export function buildCreatorMetrics(
  creator: CreatorCompletenessInput,
  videos: readonly TikTokVideo[]
): CreatorMetrics {
  const sampledVideosCount = calculateSampledVideoCount(videos);
  const medianViews = calculateMedianViews(videos);
  const averageEngagementRate = calculateAverageEngagementRate(videos);
  const engagementRatesByVideo = videos.map((video) =>
    calculateEngagementRateByViews(video)
  );
  const completeness = calculateDataCompleteness(creator, videos);

  const isSingleVideoSample = sampledVideosCount === 1;
  const isRepresentativeCreatorPerformance =
    sampledVideosCount >= MIN_VIDEOS_FOR_REPRESENTATIVE_PERFORMANCE;

  let sampleRepresentativenessNote: string;
  if (sampledVideosCount === 0) {
    sampleRepresentativenessNote =
      "No sampled videos available; creator-level performance cannot be evaluated.";
  } else if (isSingleVideoSample) {
    sampleRepresentativenessNote =
      "Single-video sample only (1 video): metrics reflect a single post and must not be presented as representative creator-level performance.";
  } else if (!isRepresentativeCreatorPerformance) {
    sampleRepresentativenessNote = `Limited video sample (${sampledVideosCount} videos): below the ${MIN_VIDEOS_FOR_REPRESENTATIVE_PERFORMANCE}-video threshold for representative creator-level performance.`;
  } else {
    sampleRepresentativenessNote = `Multi-video sample (${sampledVideosCount} videos): meets minimum sample size for creator-level aggregation.`;
  }

  const adVideosCount = videos.filter((video) => video.isAd === true).length;

  return {
    sampledVideosCount,
    medianViews,
    averageEngagementRate,
    engagementRatesByVideo,
    dataCompleteness: completeness.score,
    missingFields: completeness.missingFields,
    isSingleVideoSample,
    isRepresentativeCreatorPerformance,
    sampleRepresentativenessNote,
    adVideosCount,
  };
}
