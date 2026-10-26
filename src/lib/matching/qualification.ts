import type { BrandProfile } from "@/lib/brand/schemas";
import { buildCreatorMetrics } from "@/lib/tiktok/metrics";
import type { TikTokCreator, TikTokVideo } from "@/lib/tiktok/schemas";
import type {
  CollaborationAvailability,
  CreatorAccountType,
  CreatorQualification,
  MarketRelevanceStatus,
  QualificationReasonCode,
  QualificationStatus,
} from "./schemas";

const THAI_SCRIPT_REGEX = /[\u0E00-\u0E7F]/;

const EXPLICIT_BRAND_BIO_REGEX =
  /(ช่องบริษัท|เพจบริษัท|แบรนด์หลัก|official\s+tiktok|official\s+store|official\s+account|official\s+shop)/i;

const EXPLICIT_NO_COLLAB_REGEX =
  /(ไม่รับงานรีวิว|ไม่รับงาน|งดรับงาน|ไม่รับสปอน|no\s+paid\s+review|no\s+sponsor|not\s+accepting\s+collab|do\s+not\s+contact\s+for\s+work)/i;

const EXPLICIT_OPEN_COLLAB_REGEX =
  /(ติดต่องาน|รับงานรีวิว|ติดต่อรีวิว|for\s+work|working\s+id|pr\s*&\s*collab|work\s*:\s*@|workwith)/i;

const AMBIGUOUS_STORE_OR_CURATOR_REGEX =
  /(tested\s+by\s+us,\s*selected\s+for\s+you|สกินแคร์\/เมคอัพนำเข้า|ร้านค้า|ตัวแทนจำหน่าย|official|store|shop)/i;

/**
 * Pure function: Deduplicates an array of `TikTokCreator` records using `creatorId`
 * (with normalized `username` fallback), merging unique videos by `videoId` and
 * recomputing `CreatorMetrics` without duplicating logic.
 */
export function deduplicateCreators(
  creators: readonly TikTokCreator[]
): TikTokCreator[] {
  const map = new Map<string, TikTokCreator>();

  for (const creator of creators) {
    const key =
      creator.creatorId.trim().length > 0
        ? creator.creatorId.trim()
        : creator.username.trim().toLowerCase();

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...creator,
        videos: [...creator.videos],
      });
      continue;
    }

    // Merge unique videos by videoId
    const seenVideoIds = new Set(existing.videos.map((v) => v.videoId));
    const mergedVideos: TikTokVideo[] = [...existing.videos];
    for (const video of creator.videos) {
      if (!seenVideoIds.has(video.videoId)) {
        seenVideoIds.add(video.videoId);
        mergedVideos.push(video);
      }
    }

    const updatedFollowers = existing.followers ?? creator.followers;
    const updatedProfileUrl = existing.profileUrl ?? creator.profileUrl;
    const updatedBio = existing.bio ?? creator.bio;
    const updatedNickname = existing.nickname ?? creator.nickname;

    const updatedMetrics = buildCreatorMetrics(
      {
        creatorId: existing.creatorId,
        username: existing.username,
        profileUrl: updatedProfileUrl,
        followers: updatedFollowers,
      },
      mergedVideos
    );

    map.set(key, {
      ...existing,
      nickname: updatedNickname,
      profileUrl: updatedProfileUrl,
      followers: updatedFollowers,
      bio: updatedBio,
      videos: mergedVideos,
      metrics: updatedMetrics,
    });
  }

  return Array.from(map.values());
}

/**
 * Pure function: Evaluates a normalized `TikTokCreator` against deterministic qualification rules
 * (account type, collaboration restrictions, market relevance, and metric completeness).
 *
 * Key Guarantees:
 * - Never infers `brand_account` from `isAd`.
 * - Never assumes collaboration availability when bio has no explicit work contact.
 * - Treats language as a content-level market signal, never verified follower geography.
 * - Applies hard exclusion (`excluded`) only on clear evidence (official brand account, explicit review refusal, or 0 videos).
 */
export function qualifyCreator(
  creator: TikTokCreator,
  brandProfile: Pick<BrandProfile, "targetMarket">
): CreatorQualification {
  const reasonCodes: QualificationReasonCode[] = [];
  const evidence: string[] = [];

  const bioText = (creator.bio ?? "").trim();
  const nicknameText = (creator.nickname ?? "").trim();
  const usernameText = creator.username.trim();

  // 1. Check sampled videos count
  if (creator.videos.length === 0) {
    reasonCodes.push("NO_SAMPLED_VIDEOS");
    evidence.push(
      `Creator @${usernameText} has 0 sampled videos in the dataset.`
    );
  }

  // 2. Evaluate Collaboration Restrictions vs. Explicit Openness
  let collaborationAvailability: CollaborationAvailability = "unknown";
  if (bioText.length > 0 && EXPLICIT_NO_COLLAB_REGEX.test(bioText)) {
    collaborationAvailability = "restricted";
    reasonCodes.push("EXPLICIT_NO_REVIEW_RESTRICTION");
    evidence.push(
      `Creator bio explicitly restricts sponsored reviews/collaborations: "${bioText.replace(/\s+/g, " ")}"`
    );
  } else if (bioText.length > 0 && EXPLICIT_OPEN_COLLAB_REGEX.test(bioText)) {
    collaborationAvailability = "open_to_collab";
    reasonCodes.push("EXPLICIT_WORK_CONTACT_OBSERVED");
    evidence.push(
      `Creator bio contains explicit work/collaboration contact details: "${bioText.replace(/\s+/g, " ")}"`
    );
  } else {
    collaborationAvailability = "unknown";
    reasonCodes.push("COLLABORATION_AVAILABILITY_UNSPECIFIED");
    if (bioText.length === 0) {
      reasonCodes.push("MISSING_CREATOR_BIO");
      evidence.push(
        `Creator @${usernameText} has an empty/null bio; collaboration availability cannot be confirmed without manual outreach.`
      );
    } else {
      evidence.push(
        `Creator bio does not state explicit collaboration terms or work contact ("${bioText.replace(/\s+/g, " ")}").`
      );
    }
  }

  // 3. Evaluate Account Type (individual_creator | brand_account | unknown)
  // Rule: Never use `isAd` to infer whether an account is a brand account.
  let accountType: CreatorAccountType = "unknown";
  let hasAmbiguousStoreSignal = false;

  if (creator.accountTypeReviewStatus === "brand") {
    accountType = "brand_account";
    reasonCodes.push("MANUAL_BRAND_ACCOUNT_OVERRIDE");
    evidence.push(
      `Account @${usernameText} was manually classified as a brand-owned account.`
    );
  } else if (creator.accountTypeReviewStatus === "creator") {
    accountType = "individual_creator";
    evidence.push(
      `Account @${usernameText} was manually verified as an individual creator.`
    );
  } else if (bioText.length > 0 && EXPLICIT_BRAND_BIO_REGEX.test(bioText)) {
    accountType = "brand_account";
    reasonCodes.push("OFFICIAL_BRAND_OR_STORE_ACCOUNT");
    evidence.push(
      `Bio contains explicit official brand/company store declaration: "${bioText.replace(/\s+/g, " ")}"`
    );
  } else {
    const storeInHandle = /(store|official|shop)/i.test(usernameText);
    const storeInBio =
      bioText.length > 0 && AMBIGUOUS_STORE_OR_CURATOR_REGEX.test(bioText);

    if (storeInHandle || storeInBio) {
      hasAmbiguousStoreSignal = true;
      reasonCodes.push("AMBIGUOUS_STORE_OR_CURATOR_HANDLE");
      evidence.push(
        `Profile handle (@${usernameText}) or bio ("${bioText.replace(/\s+/g, " ")}") contains retail/store/curator signals requiring human review to distinguish from an individual creator.`
      );
    }

    if (collaborationAvailability === "open_to_collab" && !storeInBio) {
      accountType = "individual_creator";
    } else {
      accountType = "unknown";
    }
  }

  // 4. Evaluate Target Market Relevance (e.g., Thailand)
  const targetMarket = (brandProfile.targetMarket ?? "Thailand").trim();
  const isThailandTarget = /(thai|thailand|ไทย)/i.test(targetMarket);

  let marketRelevance: MarketRelevanceStatus = "uncertain";

  if (isThailandTarget) {
    const captionsWithThai = creator.videos.filter(
      (v) => v.caption && THAI_SCRIPT_REGEX.test(v.caption)
    );
    const hashtagsWithThai = creator.videos.filter((v) =>
      v.hashtags.some((h) => THAI_SCRIPT_REGEX.test(h))
    );
    const videosWithThLangCode = creator.videos.filter(
      (v) => v.textLanguage?.toLowerCase() === "th"
    );
    const videosWithNonThLangCode = creator.videos.filter(
      (v) =>
        v.textLanguage &&
        v.textLanguage.toLowerCase() !== "th" &&
        v.textLanguage.toLowerCase() !== "un"
    );
    const bioOrNickHasThai =
      THAI_SCRIPT_REGEX.test(bioText) || THAI_SCRIPT_REGEX.test(nicknameText);

    if (
      captionsWithThai.length > 0 &&
      videosWithThLangCode.length > 0 &&
      videosWithNonThLangCode.length === 0
    ) {
      marketRelevance = "relevant";
      reasonCodes.push("THAI_MARKET_SIGNAL_OBSERVED");
      evidence.push(
        `Observed Thai-language video caption(s) (${captionsWithThai.length}/${creator.videos.length}) and textLanguage="th" (Note: language is a content signal, not verified audience geography).`
      );
    } else if (
      captionsWithThai.length > 0 ||
      hashtagsWithThai.length > 0 ||
      bioOrNickHasThai
    ) {
      marketRelevance = "uncertain";
      reasonCodes.push("UNCERTAIN_MARKET_RELEVANCE");
      const langCodes = creator.videos
        .map((v) => v.textLanguage ?? "null")
        .join(", ");
      evidence.push(
        `Partial or mixed Thai-market signals observed (video textLanguage=[${langCodes}], Thai hashtags=${hashtagsWithThai.length > 0}, Thai bio/nickname=${bioOrNickHasThai}). Marked uncertain for manual verification.`
      );
    } else {
      marketRelevance = "not_observed";
      reasonCodes.push("UNCERTAIN_MARKET_RELEVANCE");
      const langCodes = creator.videos
        .map((v) => v.textLanguage ?? "null")
        .join(", ");
      evidence.push(
        `No Thai script observed in captions, hashtags, or bio (video textLanguage=[${langCodes}]). Market relevance to Thailand is unconfirmed.`
      );
    }
  } else {
    marketRelevance = "relevant";
  }

  // 5. Sample Size & Metric Completeness Warnings
  if (creator.metrics.isSingleVideoSample) {
    reasonCodes.push("SINGLE_VIDEO_SAMPLE_LIMITATION");
    evidence.push(
      "Only 1 sampled video is available for this creator; metrics are not representative of overall creator performance."
    );
  }

  if (
    creator.metrics.medianViews === null ||
    creator.metrics.averageEngagementRate === null
  ) {
    reasonCodes.push("INCOMPLETE_PERFORMANCE_METRICS");
    evidence.push(
      `Missing core performance metrics (medianViews=${String(creator.metrics.medianViews)}, averageEngagementRate=${String(creator.metrics.averageEngagementRate)}).`
    );
  }

  // 6. Determine Final Qualification Status & Manual Review Requirement
  let status: QualificationStatus;
  if (
    accountType === "brand_account" ||
    collaborationAvailability === "restricted" ||
    creator.videos.length === 0
  ) {
    status = "excluded";
  } else if (
    accountType === "unknown" ||
    collaborationAvailability === "unknown" ||
    hasAmbiguousStoreSignal ||
    marketRelevance !== "relevant"
  ) {
    status = "needs_review";
  } else {
    status = "eligible";
  }

  const manualReviewRequired =
    status !== "eligible" ||
    hasAmbiguousStoreSignal ||
    creator.metrics.isSingleVideoSample ||
    creator.metrics.dataCompleteness < 1;

  return {
    creatorId: creator.creatorId,
    username: creator.username,
    status,
    accountType,
    collaborationAvailability,
    marketRelevance,
    reasonCodes,
    evidence,
    manualReviewRequired,
  };
}
