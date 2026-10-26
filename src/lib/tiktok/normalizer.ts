import { buildCreatorMetrics, calculateEngagementRateByViews } from "./metrics";
import {
  type AccountTypeReviewStatus,
  type ApifyAuthorMeta,
  ApifyTikTokDatasetSchema,
  type ApifyTikTokVideoItem,
  ApifyTikTokVideoItemSchema,
  type NormalizedTikTokDataset,
  NormalizedTikTokDatasetSchema,
  type TikTokCreator,
  type TikTokVideo,
} from "./schemas";

export interface NormalizeDatasetOptions {
  /**
   * Optional manual review overrides for distinguishing brand-owned vs. creator accounts.
   * Keyed by `creatorId` or `username`.
   * Defaults to `"unverified"` for all accounts because `isAd` does not prove account type.
   */
  manualAccountTypeOverrides?: Record<string, AccountTypeReviewStatus>;
}

export interface ResolvedCreatorIdentity {
  creatorId: string;
  username: string;
  usedUsernameFallbackForId: boolean;
}

function normalizeNullableString(
  value: string | null | undefined
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? value : null;
}

function normalizeNullableNumber(
  value: number | null | undefined
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function normalizeNullableBoolean(
  value: boolean | null | undefined
): boolean | null {
  if (typeof value !== "boolean") {
    return null;
  }
  return value;
}

/**
 * Pure function: Resolves a stable `creatorId` from `authorMeta.id`, falling back to
 * `authorMeta.name` (`username`) when a stable ID is missing, null, or empty.
 */
export function resolveCreatorIdentity(
  authorMeta: Pick<ApifyAuthorMeta, "id" | "name">
): ResolvedCreatorIdentity {
  const username = authorMeta.name.trim();
  const rawId =
    authorMeta.id !== null && authorMeta.id !== undefined
      ? String(authorMeta.id).trim()
      : "";

  if (rawId.length > 0) {
    return {
      creatorId: rawId,
      username,
      usedUsernameFallbackForId: false,
    };
  }

  return {
    creatorId: username,
    username,
    usedUsernameFallbackForId: true,
  };
}

/**
 * Pure function: Extracts non-empty hashtag names from `hashtags[].name`.
 */
export function extractHashtagNames(
  hashtags: ApifyTikTokVideoItem["hashtags"]
): string[] {
  if (!Array.isArray(hashtags)) {
    return [];
  }

  return hashtags
    .map((tag) => (typeof tag?.name === "string" ? tag.name.trim() : ""))
    .filter((name): name is string => name.length > 0);
}

/**
 * Pure function: Normalizes a single raw Apify `clockworks/tiktok-scraper` item into `TikTokVideo`.
 *
 * Field Mappings:
 * - `id` -> `videoId`
 * - `text` -> `caption`
 * - `webVideoUrl` -> `videoUrl`
 * - `authorMeta.id` -> `creatorId` (with `authorMeta.name` fallback)
 * - `authorMeta.name` -> `username`
 * - `playCount` -> `views`
 * - `diggCount` -> `likes`
 * - `commentCount` -> `comments`
 * - `shareCount` -> `shares`
 * - `createTimeISO` -> `publishedAt`
 * - `hashtags[].name` -> `hashtags`
 */
export function normalizeTikTokVideo(rawItem: unknown): TikTokVideo {
  const parsed = ApifyTikTokVideoItemSchema.parse(rawItem);
  const { creatorId, username } = resolveCreatorIdentity(parsed.authorMeta);

  const views = normalizeNullableNumber(parsed.playCount);
  const likes = normalizeNullableNumber(parsed.diggCount);
  const comments = normalizeNullableNumber(parsed.commentCount);
  const shares = normalizeNullableNumber(parsed.shareCount);

  const engagementRateByViews = calculateEngagementRateByViews({
    views,
    likes,
    comments,
    shares,
  });

  return {
    videoId: String(parsed.id).trim(),
    creatorId,
    username,
    caption: normalizeNullableString(parsed.text),
    videoUrl: normalizeNullableString(parsed.webVideoUrl),
    views,
    likes,
    comments,
    shares,
    publishedAt: normalizeNullableString(parsed.createTimeISO),
    hashtags: extractHashtagNames(parsed.hashtags),
    isAd: normalizeNullableBoolean(parsed.isAd),
    isSponsored: normalizeNullableBoolean(parsed.isSponsored),
    textLanguage: normalizeNullableString(parsed.textLanguage),
    engagementRateByViews,
  };
}

/**
 * Pure function: Groups normalized `TikTokVideo` items by `creatorId`
 * (which already uses `username` as a fallback when a stable ID is unavailable).
 */
export function groupVideosByCreatorId(
  videos: readonly TikTokVideo[]
): Map<string, TikTokVideo[]> {
  const grouped = new Map<string, TikTokVideo[]>();

  for (const video of videos) {
    const key =
      video.creatorId.trim().length > 0
        ? video.creatorId.trim()
        : video.username.trim();
    const existing = grouped.get(key);
    if (existing) {
      existing.push(video);
    } else {
      grouped.set(key, [video]);
    }
  }

  return grouped;
}

/**
 * Pure function: Normalizes an array of raw Apify `clockworks/tiktok-scraper` items
 * into `TikTokVideo[]`, `TikTokCreator[]`, and dataset-level metadata.
 */
export function normalizeApifyDataset(
  rawInput: unknown,
  options: NormalizeDatasetOptions = {}
): NormalizedTikTokDataset {
  const parsedItems = ApifyTikTokDatasetSchema.parse(rawInput);
  const manualOverrides = options.manualAccountTypeOverrides ?? {};

  const videos: TikTokVideo[] = [];
  const creatorGroupMap = new Map<
    string,
    {
      authorMeta: ApifyAuthorMeta;
      usedUsernameFallbackForId: boolean;
      videos: TikTokVideo[];
    }
  >();

  for (const item of parsedItems) {
    const video = normalizeTikTokVideo(item);
    videos.push(video);

    const identity = resolveCreatorIdentity(item.authorMeta);
    const existing = creatorGroupMap.get(identity.creatorId);

    if (existing) {
      existing.videos.push(video);
      // Fill in missing authorMeta fields if a subsequent video has richer metadata
      if (
        existing.authorMeta.fans === null ||
        existing.authorMeta.fans === undefined
      ) {
        existing.authorMeta = {
          ...existing.authorMeta,
          fans: item.authorMeta.fans,
        };
      }
      if (!existing.authorMeta.profileUrl && item.authorMeta.profileUrl) {
        existing.authorMeta = {
          ...existing.authorMeta,
          profileUrl: item.authorMeta.profileUrl,
        };
      }
    } else {
      creatorGroupMap.set(identity.creatorId, {
        authorMeta: item.authorMeta,
        usedUsernameFallbackForId: identity.usedUsernameFallbackForId,
        videos: [video],
      });
    }
  }

  const creators: TikTokCreator[] = [];

  for (const [creatorId, group] of creatorGroupMap.entries()) {
    const username = group.authorMeta.name.trim();
    const profileUrl = normalizeNullableString(group.authorMeta.profileUrl);
    const followers = normalizeNullableNumber(group.authorMeta.fans);
    const nickname = normalizeNullableString(group.authorMeta.nickName);
    const bio = normalizeNullableString(group.authorMeta.signature);
    const verified = normalizeNullableBoolean(group.authorMeta.verified);

    // Do NOT infer account type from `isAd`. Default to "unverified" unless manually reviewed.
    const accountTypeReviewStatus: AccountTypeReviewStatus =
      manualOverrides[creatorId] ?? manualOverrides[username] ?? "unverified";

    const metrics = buildCreatorMetrics(
      {
        creatorId,
        username,
        profileUrl,
        followers,
      },
      group.videos
    );

    creators.push({
      creatorId,
      usedUsernameFallbackForId: group.usedUsernameFallbackForId,
      username,
      nickname,
      profileUrl,
      followers,
      bio,
      verified,
      accountTypeReviewStatus,
      audienceDemographics: null,
      videos: group.videos,
      metrics,
    });
  }

  const allCreatorsSingleVideoSample =
    creators.length > 0 &&
    creators.every((creator) => creator.metrics.isSingleVideoSample);

  const datasetWarning = allCreatorsSingleVideoSample
    ? `Current dataset contains ${videos.length} videos across ${creators.length} unique creators (1 sampled video per creator). Single-video metrics must not be presented as representative creator-level performance.`
    : null;

  return NormalizedTikTokDatasetSchema.parse({
    sourceActor: "clockworks/tiktok-scraper",
    totalVideos: videos.length,
    totalCreators: creators.length,
    allCreatorsSingleVideoSample,
    datasetWarning,
    videos,
    creators,
  });
}
