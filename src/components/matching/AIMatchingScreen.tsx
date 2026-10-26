"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { BrandProfile } from "@/lib/brand/schemas";
import type { TikTokCreator } from "@/lib/tiktok/schemas";
import { loadNormalizedTikTokFixture } from "@/lib/tiktok/fixtures";
import {
  type KOLMatchingResult,
  KOLMatchingResultSchema,
  type RankedKOLRecommendation,
} from "@/lib/matching/schemas";

export interface AIMatchingScreenProps {
  brandProfile: BrandProfile;
  initialCreators?: TikTokCreator[];
  onBack: () => void;
  onContinueToShortlist?: (shortlisted: RankedKOLRecommendation[]) => void;
}

type SortOption =
  "match_score_desc" | "match_score_asc" | "followers_desc" | "er_desc";

function formatCompactNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return "-";
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return num.toLocaleString();
}

function formatER(er: number | null | undefined): string {
  if (er === null || er === undefined) return "-";
  return (er * 100).toFixed(2) + "%";
}

function getAvatarInitial(name: string): string {
  const candidate = (name || "C").trim();
  return candidate.charAt(0).toUpperCase();
}

function getAvatarColors(username: string): { bg: string; text: string } {
  const uname = username.toLowerCase();
  if (uname.includes("zzdaozz")) {
    return { bg: "bg-[#EDE9FE]", text: "text-[#7C3AED]" }; // lavender D
  }
  if (uname.includes("pchskinmood") || uname.includes("thirisxstore")) {
    return { bg: "bg-[#FFE4E6]", text: "text-[#E11D48]" }; // rose ธ
  }
  if (uname.includes("granviia") || uname.includes("praephilaiphangpo0")) {
    return { bg: "bg-[#E0F2FE]", text: "text-[#0284C7]" }; // sky เ
  }

  const palette = [
    { bg: "bg-[#EDE9FE]", text: "text-[#7C3AED]" },
    { bg: "bg-[#FFE4E6]", text: "text-[#E11D48]" },
    { bg: "bg-[#E0F2FE]", text: "text-[#0284C7]" },
    { bg: "bg-[#FEF3C7]", text: "text-[#D97706]" },
    { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]" },
    { bg: "bg-[#FCE7F3]", text: "text-[#DB2777]" },
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function getCreatorTagline(item: RankedKOLRecommendation): string {
  if (item.qualificationStatus === "needs_review") {
    if (
      item.qualification.reasonCodes.includes(
        "AMBIGUOUS_STORE_OR_CURATOR_HANDLE"
      )
    ) {
      return "Needs review · affiliate/store signals";
    }
    return "Needs review · manual check recommended";
  }
  if (item.qualification.collaborationAvailability === "open_to_collab") {
    if (
      item.qualification.reasonCodes.includes("EXPLICIT_WORK_CONTACT_OBSERVED")
    ) {
      return "Creator · work contact in bio";
    }
    return "Creator · collaboration contact in bio";
  }
  return "Creator · verified public profile";
}

function computeMatchingSignature(
  brand: BrandProfile,
  creators: TikTokCreator[]
): string {
  const brandKey = `${brand.brandName}|${brand.industry}|${(
    brand.keyProductsOrServices || []
  ).join(",")}`;
  const creatorKey = creators
    .slice(0, 10)
    .map((c) => c.creatorId || c.username)
    .sort()
    .join(",");
  return `${brandKey}::${creatorKey}`;
}

export function AIMatchingScreen({
  brandProfile,
  initialCreators,
  onBack,
  onContinueToShortlist,
}: AIMatchingScreenProps) {
  // Load candidate creators from props, sessionStorage, or fixture
  const candidateCreators = useMemo<TikTokCreator[]>(() => {
    if (initialCreators && initialCreators.length > 0) {
      return initialCreators;
    }
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("holo_selected_creators");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {
        // Ignore JSON error
      }
    }
    const fixture = loadNormalizedTikTokFixture();
    return fixture.creators;
  }, [initialCreators]);

  // Maximum 10 candidates evaluated in MVP to bound API costs
  const candidatesToEvaluate = useMemo(() => {
    return candidateCreators.slice(0, 10);
  }, [candidateCreators]);

  // Map of creatorId -> TikTokCreator for quick lookup
  const creatorsMap = useMemo(() => {
    const map = new Map<string, TikTokCreator>();
    for (const c of candidateCreators) {
      map.set(c.creatorId, c);
      map.set(c.username, c);
    }
    return map;
  }, [candidateCreators]);

  // Unique dataset signature to prevent re-calling OpenAI when inputs haven't changed
  const currentSignature = useMemo(() => {
    return computeMatchingSignature(brandProfile, candidatesToEvaluate);
  }, [brandProfile, candidatesToEvaluate]);

  // Read cached matching result if matching signature matches
  const cachedMatchingData = useMemo<{
    result: KOLMatchingResult | null;
    isValid: boolean;
  }>(() => {
    if (typeof window === "undefined") {
      return { result: null, isValid: false };
    }
    try {
      const savedSig = sessionStorage.getItem("holo_matching_signature");
      const savedResults = sessionStorage.getItem("holo_matching_results");
      if (savedSig && savedResults && savedSig === currentSignature) {
        const parsed = JSON.parse(savedResults);
        const validated = KOLMatchingResultSchema.safeParse(parsed);
        if (validated.success) {
          return { result: validated.data, isValid: true };
        }
      }
    } catch {
      // Ignore parse errors
    }
    return { result: null, isValid: false };
  }, [currentSignature]);

  const [matchingResult, setMatchingResult] =
    useState<KOLMatchingResult | null>(cachedMatchingData.result);
  const [isLoading, setIsLoading] = useState<boolean>(
    !cachedMatchingData.isValid
  );
  const [apiError, setApiError] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("match_score_desc");

  // Selection state for creators carried forward to shortlist
  const [selectedCreatorIds, setSelectedCreatorIds] = useState<Set<string>>(
    () => {
      if (
        cachedMatchingData.result &&
        cachedMatchingData.result.recommendations.length > 0
      ) {
        return new Set(
          cachedMatchingData.result.recommendations.map((r) => r.creatorId)
        );
      }
      return new Set();
    }
  );

  // Modal confirmation for Retry
  const [isRetryModalOpen, setIsRetryModalOpen] = useState(false);

  // Refs to prevent duplicate calls from React StrictMode and re-renders
  const inFlightRef = useRef(false);
  const hasRunSignatureRef = useRef<string | null>(
    cachedMatchingData.isValid ? currentSignature : null
  );

  // Core Evaluation runner
  const executeEvaluation = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    hasRunSignatureRef.current = currentSignature;
    setIsLoading(true);
    setApiError(null);

    try {
      const response = await fetch("/api/matching/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandProfile,
          creators: candidatesToEvaluate,
          executionMode: "live_ai",
          limit: 10,
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        const message =
          json?.error?.message ||
          "Failed to evaluate AI matches. Please check the network and try again.";
        setApiError(message);
        setIsLoading(false);
        return;
      }

      const validated = KOLMatchingResultSchema.safeParse(json.data);
      if (!validated.success) {
        setApiError(
          "Matching engine returned unexpected data format. Please check the logs."
        );
        setIsLoading(false);
        return;
      }

      setMatchingResult(validated.data);
      setSelectedCreatorIds(
        new Set(validated.data.recommendations.map((r) => r.creatorId))
      );

      // Cache results with signature in sessionStorage
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(
            "holo_matching_results",
            JSON.stringify(validated.data)
          );
          sessionStorage.setItem("holo_matching_signature", currentSignature);
        } catch {
          // Ignore storage error
        }
      }
    } catch {
      setApiError(
        "Network error occurred while evaluating KOL matches. Please try again."
      );
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

  // Trigger evaluation immediately when entering Screen 4 if no valid cached result exists
  useEffect(() => {
    if (cachedMatchingData.isValid && matchingResult) {
      return;
    }
    if (hasRunSignatureRef.current === currentSignature) {
      return;
    }
    executeEvaluation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSignature]);

  // Handle Retry Confirmation
  const handleConfirmRetry = () => {
    setIsRetryModalOpen(false);
    hasRunSignatureRef.current = null;
    executeEvaluation();
  };

  // Toggle selection for a creator card
  const toggleCreatorSelection = (creatorId: string) => {
    setSelectedCreatorIds((prev) => {
      const next = new Set(prev);
      if (next.has(creatorId)) {
        next.delete(creatorId);
      } else {
        next.add(creatorId);
      }
      return next;
    });
  };

  // Sorted recommendations
  const sortedRecommendations = useMemo(() => {
    if (!matchingResult) return [];
    const list = [...matchingResult.recommendations];

    if (sortOption === "match_score_desc") {
      return list.sort((a, b) => b.matchScore - a.matchScore);
    }
    if (sortOption === "match_score_asc") {
      return list.sort((a, b) => a.matchScore - b.matchScore);
    }
    if (sortOption === "followers_desc") {
      return list.sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));
    }
    if (sortOption === "er_desc") {
      return list.sort(
        (a, b) =>
          (b.averageEngagementRate ?? 0) - (a.averageEngagementRate ?? 0)
      );
    }
    return list;
  }, [matchingResult, sortOption]);

  // Selected recommendations for shortlist
  const selectedRecommendations = useMemo(() => {
    return sortedRecommendations.filter((r) =>
      selectedCreatorIds.has(r.creatorId)
    );
  }, [sortedRecommendations, selectedCreatorIds]);

  // Handle Continue to Shortlist
  const handleContinueToShortlist = () => {
    if (selectedRecommendations.length === 0) return;

    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(
          "holo_shortlisted_creators",
          JSON.stringify(selectedRecommendations)
        );
      } catch {
        // Ignore storage error
      }
    }

    if (onContinueToShortlist) {
      onContinueToShortlist(selectedRecommendations);
    }
  };

  // Brand Name initial for avatar
  const brandInitial = (brandProfile.brandName || "B").trim().charAt(0);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 pb-16 pt-2">
      {/* Title & Subtitle */}
      <div className="text-center mb-6 sm:mb-7">
        <h1 className="text-2xl sm:text-[32px] font-bold text-[#2B2B36] tracking-tight">
          AI Matching &amp; Ranking
        </h1>
        <p className="mt-1.5 sm:mt-2 text-xs sm:text-[14px] text-slate-500 font-normal">
          Review AI match results based on your brand profile and collected
          TikTok creator data.
        </p>
      </div>

      {/* Brand Profile Summary Card */}
      <div className="w-full bg-white rounded-3xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.025)] p-5 sm:p-6 mb-7 sm:mb-8">
        <div className="flex items-center gap-3.5">
          {/* Brand Logo/Initial Badge */}
          <div className="w-12 h-12 rounded-2xl bg-[#F5F0FF] border border-[#EDE9FE] flex items-center justify-center text-[#7C3AED] font-bold text-lg shrink-0 shadow-xs">
            <span>{brandInitial}</span>
          </div>

          {/* Brand Details */}
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
              {brandProfile.brandName || "Brand Profile"}
            </h2>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {[
                brandProfile.industry,
                ...(brandProfile.keyProductsOrServices || []).slice(0, 3),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {brandProfile.confidenceNotes?.rationale ||
                "ผลวิเคราะห์แบรนด์จากการทดสอบ Live OpenAI"}
            </p>
          </div>
        </div>
      </div>

      {/* API Error Alert */}
      {apiError && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-3xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in"
        >
          <div>
            <div className="font-bold flex items-center gap-1.5 mb-0.5">
              <span>⚠️ Evaluation Error</span>
            </div>
            <p className="text-rose-600 text-xs">{apiError}</p>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={onBack}
              className="px-3.5 py-1.5 rounded-full bg-white border border-rose-200 text-rose-700 hover:bg-rose-100/50 text-xs font-medium transition-colors cursor-pointer"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setIsRetryModalOpen(true)}
              className="px-4 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer"
            >
              Retry AI Matching
            </button>
          </div>
        </div>
      )}

      {/* Loading State: Status Card + Pastel Glow Card Skeletons */}
      {isLoading && (
        <div className="mb-8 animate-in fade-in duration-200">
          {/* Status Indicator Banner */}
          <div className="w-full bg-white/90 backdrop-blur-xs rounded-3xl border border-purple-100 shadow-[0_2px_12px_rgba(124,58,237,0.04)] p-4 sm:p-5 mb-6 flex items-center gap-3.5">
            <div className="relative w-7 h-7 shrink-0">
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#6898FF] via-[#B378FF] to-[#FF66A6] blur-[4px] opacity-75 animate-pulse" />
              <div className="relative w-7 h-7 rounded-full border-2 border-purple-200 border-t-purple-600 animate-spin" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-slate-800">
                Analyzing creator compatibility...
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                Evaluating content fit, category relevance, and brand tone with
                OpenAI Structured Outputs.
              </p>
            </div>
          </div>

          {/* 3-Column Creator Card Skeletons */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-100/90 shadow-[0_2px_12px_rgba(0,0,0,0.02)] relative overflow-hidden flex flex-col justify-between"
              >
                {/* Glowing shimmer overlay */}
                <div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent pointer-events-none animate-shimmer-sweep"
                  aria-hidden="true"
                />

                <div>
                  {/* Top Row Skeleton */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-7 h-7 rounded-full bg-slate-100 animate-pulse shrink-0" />
                    <div className="w-9 h-9 rounded-full bg-purple-100/70 animate-pulse shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="h-4 w-24 bg-slate-200/80 rounded-full animate-pulse mb-1.5" />
                      <div className="h-3 w-32 bg-slate-100 rounded-full animate-pulse mb-1" />
                      <div className="h-2.5 w-20 bg-slate-100/70 rounded-full animate-pulse" />
                    </div>
                  </div>

                  {/* 3-Pack Metrics Skeleton */}
                  <div className="bg-slate-50/80 border border-slate-100 rounded-2xl p-2.5 my-3 grid grid-cols-3 gap-2">
                    <div className="flex flex-col items-center">
                      <div className="h-4 w-12 bg-slate-200/70 rounded-full animate-pulse" />
                      <div className="h-2 w-10 bg-slate-100 rounded-full mt-1.5" />
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="h-4 w-12 bg-slate-200/70 rounded-full animate-pulse" />
                      <div className="h-2 w-10 bg-slate-100 rounded-full mt-1.5" />
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="h-4 w-12 bg-slate-200/70 rounded-full animate-pulse" />
                      <div className="h-2 w-10 bg-slate-100 rounded-full mt-1.5" />
                    </div>
                  </div>

                  {/* Match Score Box Skeleton */}
                  <div className="bg-gradient-to-br from-[#FAF5FF] to-[#FFF1F5] border border-purple-100/60 rounded-2xl p-4 my-2.5">
                    <div className="flex items-baseline mb-3">
                      <div className="h-7 w-20 bg-purple-200/60 rounded-xl animate-pulse" />
                      <div className="h-3 w-24 bg-purple-100/50 rounded-full ml-2 animate-pulse" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-purple-100/50">
                      <div className="h-3 w-full bg-purple-100/40 rounded-full animate-pulse" />
                      <div className="h-3 w-full bg-purple-100/40 rounded-full animate-pulse" />
                      <div className="h-3 w-full bg-purple-100/40 rounded-full animate-pulse" />
                      <div className="h-3 w-full bg-purple-100/40 rounded-full animate-pulse" />
                    </div>
                  </div>

                  {/* Explanation Skeleton Lines */}
                  <div className="space-y-1.5 mt-3">
                    <div className="h-3 w-full bg-slate-100 rounded-full animate-pulse" />
                    <div className="h-3 w-4/5 bg-slate-100 rounded-full animate-pulse" />
                    <div className="h-3 w-2/3 bg-slate-100 rounded-full animate-pulse" />
                  </div>
                </div>

                {/* Profile Link Skeleton */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="h-3 w-32 bg-slate-100 rounded-full animate-pulse" />
                  <div className="h-3 w-3 bg-slate-100 rounded-full animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results State: Evaluated Results + Sort Dropdown + Creator Cards */}
      {!isLoading && matchingResult && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                {matchingResult.recommendations.length} creators evaluated with
                AI
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                Results from live AI evaluation · ranked by Match Score · 1
                sample video per account
              </p>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <label
                htmlFor="sort-select"
                className="text-xs text-slate-500 font-medium shrink-0"
              >
                Sort:
              </label>
              <select
                id="sort-select"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-full px-3 py-1.5 focus:outline-none focus:border-purple-300 shadow-2xs cursor-pointer"
              >
                <option value="match_score_desc">
                  Match Score (High → Low)
                </option>
                <option value="match_score_asc">
                  Match Score (Low → High)
                </option>
                <option value="followers_desc">Followers (High → Low)</option>
                <option value="er_desc">Sample ER (High → Low)</option>
              </select>
            </div>
          </div>

          {/* Creator Cards Grid (3 columns on Desktop) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-8">
            {sortedRecommendations.map((item) => {
              const creator =
                creatorsMap.get(item.creatorId) ||
                creatorsMap.get(item.username);
              const isSelected = selectedCreatorIds.has(item.creatorId);
              const rankStr = String(item.rank).padStart(2, "0");
              const avatarColors = getAvatarColors(item.username);
              const initial = getAvatarInitial(
                item.displayName || item.username
              );
              const avatarUrl = item.avatarUrl || creator?.avatarUrl;
              const statusLine = getCreatorTagline(item);

              // Sample video details
              const video = creator?.videos[0];
              const sampleViews =
                item.medianViews ??
                video?.views ??
                creator?.metrics.medianViews;
              const sampleER =
                item.averageEngagementRate ??
                video?.engagementRateByViews ??
                creator?.metrics.averageEngagementRate;

              // Hashtags from video or evidence
              const hashtags =
                video?.hashtags && video.hashtags.length > 0
                  ? video.hashtags.slice(0, 3)
                  : [];

              // Supporting quote text
              const quotedCaption =
                item.contentEvaluation.supportingEvidence[0]?.quotedText ||
                video?.caption ||
                null;

              return (
                <div
                  key={item.creatorId}
                  onClick={() => toggleCreatorSelection(item.creatorId)}
                  className={`bg-white rounded-3xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between transition-all cursor-pointer border ${
                    isSelected
                      ? "border-[#F472B6] shadow-[0_4px_20px_rgba(244,114,182,0.18)] ring-1 ring-[#F472B6]/40"
                      : "border-slate-100 hover:border-slate-200 hover:shadow-md"
                  }`}
                >
                  <div>
                    {/* Top Row: Rank + Avatar + Name + Subtitle */}
                    <div className="flex items-start gap-3">
                      {/* Rank Badge */}
                      <span
                        className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                          item.rank === 1
                            ? "bg-[#FEF3C7] text-[#D97706]"
                            : "bg-[#F1F5F9] text-[#64748B]"
                        }`}
                      >
                        {rankStr}
                      </span>

                      {/* Avatar */}
                      <div
                        className={`relative w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden mt-0.5 ${avatarColors.bg} ${avatarColors.text} shadow-xs`}
                      >
                        {avatarUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={avatarUrl}
                              alt={item.displayName}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                            <span
                              aria-hidden="true"
                              className="absolute inset-0 flex items-center justify-center -z-10"
                            >
                              {initial}
                            </span>
                          </>
                        ) : (
                          <span>{initial}</span>
                        )}
                      </div>

                      {/* Username & Nickname */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-bold text-slate-900 truncate">
                            @{item.username}
                          </span>
                          {/* Selection Checkbox */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // Controlled via card click
                            aria-label={`Select @${item.username}`}
                            className="w-4 h-4 rounded text-purple-600 focus:ring-purple-400 accent-[#7462F6] cursor-pointer shrink-0"
                          />
                        </div>
                        <p className="text-xs text-slate-600 truncate mt-0.5">
                          {item.displayName}
                        </p>
                        <p
                          className={`text-[10.5px] truncate mt-0.5 ${
                            item.qualificationStatus === "needs_review"
                              ? "text-amber-600 font-medium"
                              : "text-slate-400"
                          }`}
                        >
                          {statusLine}
                        </p>
                      </div>
                    </div>

                    {/* Metrics 3-Pack: Followers, Sample views, Sample ER */}
                    <div className="bg-slate-50/80 border border-slate-100 rounded-2xl p-2.5 my-3 grid grid-cols-3 text-center">
                      <div>
                        <div className="text-xs sm:text-sm font-bold text-slate-900">
                          {formatCompactNumber(item.followers)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Followers
                        </div>
                      </div>
                      <div>
                        <div className="text-xs sm:text-sm font-bold text-slate-900">
                          {formatCompactNumber(sampleViews)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Sample views
                        </div>
                      </div>
                      <div>
                        <div className="text-xs sm:text-sm font-bold text-slate-900">
                          {formatER(sampleER)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Sample ER
                        </div>
                      </div>
                    </div>

                    {/* Match Score Box */}
                    <div className="bg-gradient-to-br from-[#FAF5FF] to-[#FFF1F5] border border-purple-100/70 rounded-2xl p-4 my-2.5">
                      <div className="flex items-baseline">
                        <span className="text-2xl sm:text-[28px] font-extrabold text-[#7462F6] tracking-tight">
                          {item.matchScore.toFixed(2)}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium ml-2">
                          Match Score / 100
                        </span>
                      </div>

                      {/* 4 Score Dimensions Grid from Backend Schema */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3 pt-3 border-t border-purple-100/60 text-[11px]">
                        <div className="flex items-center justify-between text-slate-600">
                          <span>Content Fit</span>
                          <span className="font-bold text-slate-800">
                            {item.scoreBreakdown.contentFitScore !== null
                              ? item.scoreBreakdown.contentFitScore
                                  .toFixed(1)
                                  .replace(/\.0$/, "")
                              : "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-600">
                          <span>Market Fit</span>
                          <span className="font-bold text-slate-800">
                            {item.scoreBreakdown.marketFitScore !== null
                              ? item.scoreBreakdown.marketFitScore
                                  .toFixed(1)
                                  .replace(/\.0$/, "")
                              : "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-600">
                          <span>Performance Fit</span>
                          <span className="font-bold text-slate-800">
                            {item.scoreBreakdown.performanceFitScore !== null
                              ? item.scoreBreakdown.performanceFitScore
                                  .toFixed(1)
                                  .replace(/\.0$/, "")
                              : "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-600">
                          <span>Creator Suitability</span>
                          <span className="font-bold text-slate-800">
                            {item.scoreBreakdown.creatorSuitabilityScore !==
                            null
                              ? item.scoreBreakdown.creatorSuitabilityScore
                                  .toFixed(1)
                                  .replace(/\.0$/, "")
                              : "N/A"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Section: Why this creator matches */}
                    <div className="mt-3">
                      <h4 className="text-xs font-semibold text-slate-800 mb-1">
                        Why this creator matches
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                        {item.contentFitExplanation ||
                          item.contentEvaluation.explanation}
                      </p>
                    </div>

                    {/* Hashtags */}
                    {hashtags.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {hashtags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-block text-[10.5px] font-medium text-purple-600 bg-purple-50/70 border border-purple-100 px-2.5 py-0.5 rounded-full"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Supporting Quote Snippet */}
                    {quotedCaption && (
                      <div className="mt-2.5 border-l-2 border-purple-300 pl-2.5 py-0.5 text-xs text-slate-600 italic line-clamp-2 leading-relaxed">
                        &ldquo;{quotedCaption.trim()}&rdquo;
                      </div>
                    )}

                    {/* Needs Review or Single Video Warning */}
                    {item.qualificationStatus === "needs_review" && (
                      <div className="mt-2.5 text-[10.5px] text-amber-700 bg-amber-50/80 border border-amber-200/80 rounded-xl px-2.5 py-1 flex items-center gap-1.5">
                        <span>
                          ⚠️ Needs review: Check affiliate/store links
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Row: TikTok Profile Link */}
                  <div
                    className="mt-4 pt-3 border-t border-slate-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <a
                      href={
                        item.profileUrl ||
                        `https://www.tiktok.com/@${item.username}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center justify-between group transition-colors"
                    >
                      <span className="truncate">
                        tiktok.com/@{item.username}
                      </span>
                      <span className="text-sm font-semibold transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                        ↗
                      </span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Action Bar: Back + Continue to shortlist */}
          <div className="flex items-center justify-between pt-2">
            {/* Left: ← Back to discovery */}
            <button
              type="button"
              onClick={onBack}
              className="rounded-full bg-white border border-slate-200/90 text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-xs sm:text-[13.5px] font-medium px-6 sm:px-7 py-2.5 sm:py-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span className="text-sm">←</span>
              <span>Back to discovery</span>
            </button>

            {/* Right: Continue to shortlist → */}
            <button
              type="button"
              onClick={handleContinueToShortlist}
              disabled={selectedCreatorIds.size === 0}
              className="rounded-full bg-gradient-to-r from-[#7462F6] via-[#D565A9] to-[#FF8266] hover:opacity-95 text-white text-xs sm:text-[13.5px] font-medium px-6 sm:px-8 py-2.5 sm:py-3 shadow-[0_4px_16px_rgba(213,101,169,0.38)] flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>
                Continue to shortlist ({selectedCreatorIds.size} creators)
              </span>
              <span className="text-sm">→</span>
            </button>
          </div>
        </>
      )}

      {/* Footnote Disclaimers */}
      <div className="mt-8 text-[11px] text-slate-400 text-center leading-relaxed space-y-1">
        <p>
          Accounts, follower counts and sample metrics: saved Apify fixture
          (October 2026). Match scores and explanations: live AI test.
        </p>
        <p>
          Sample ER is calculated from a single collected video, not an
          account-wide average. Letter avatars are placeholders, not creator
          portraits.
        </p>
      </div>

      {/* Retry Confirmation Modal */}
      {isRetryModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in"
        >
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-6">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-lg mb-3">
              🔄
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Confirm Retry AI Matching
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Are you sure you want to re-run AI evaluation for{" "}
              <strong className="text-slate-800">
                {candidatesToEvaluate.length} creators
              </strong>{" "}
              using live OpenAI analysis?
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRetryModalOpen(false)}
                className="px-4 py-2 rounded-full text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRetry}
                className="px-5 py-2 rounded-full bg-gradient-to-r from-[#7462F6] via-[#D565A9] to-[#FF8266] text-white text-xs font-medium shadow-sm hover:opacity-95 transition-all cursor-pointer"
              >
                <span>Confirm &amp; Retry</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
