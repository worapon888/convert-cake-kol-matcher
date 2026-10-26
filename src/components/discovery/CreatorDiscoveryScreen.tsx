"use client";

import React, { useMemo, useState } from "react";
import type { BrandProfile } from "@/lib/brand/schemas";
import type { TikTokCreator } from "@/lib/tiktok/schemas";
import { loadNormalizedTikTokFixture } from "@/lib/tiktok/fixtures";
import { qualifyCreator } from "@/lib/matching/qualification";
import type { CreatorQualification } from "@/lib/matching/schemas";

export interface CreatorDiscoveryScreenProps {
  brandProfile: BrandProfile;
  onBack: () => void;
  onContinueToMatching: (selectedCreators?: TikTokCreator[]) => void;
  initialCreators?: TikTokCreator[];
}

type SortOption =
  "dataset_order" | "followers_desc" | "followers_asc" | "er_desc";

const INITIAL_VISIBLE_COUNT = 6;

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

function getAvatarInitial(creator: TikTokCreator): string {
  const candidate = (creator.nickname || creator.username || "C").trim();
  const firstChar = candidate.charAt(0);
  return firstChar.toUpperCase();
}

function getAvatarColors(creator: TikTokCreator): { bg: string; text: string } {
  const uname = creator.username.toLowerCase();
  if (uname.includes("zzdaozz")) {
    return { bg: "bg-[#EDE9FE]", text: "text-[#7C3AED]" }; // lavender D
  }
  if (uname.includes("pchskinmood")) {
    return { bg: "bg-[#FFE4E6]", text: "text-[#E11D48]" }; // rose P
  }
  if (uname.includes("granviia")) {
    return { bg: "bg-[#E0F2FE]", text: "text-[#0284C7]" }; // sky S
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
  for (let i = 0; i < creator.username.length; i++) {
    hash = creator.username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

export function CreatorDiscoveryScreen({
  brandProfile,
  onBack,
  onContinueToMatching,
  initialCreators,
}: CreatorDiscoveryScreenProps) {
  // Load saved creators dataset as default
  const defaultDataset = useMemo(() => {
    if (initialCreators && initialCreators.length > 0) {
      return initialCreators;
    }
    const fixture = loadNormalizedTikTokFixture();
    return fixture.creators;
  }, [initialCreators]);

  const [creators, setCreators] = useState<TikTokCreator[]>(defaultDataset);
  const [sortOption, setSortOption] = useState<SortOption>("dataset_order");
  const [isExpanded, setIsExpanded] = useState(false);

  // Keywords state initialized from brandProfile
  const [keywords, setKeywords] = useState<string[]>(
    brandProfile.suggestedTikTokSearchKeywords ?? []
  );
  const [selectedSearchKeyword, setSelectedSearchKeyword] = useState<string>(
    (brandProfile.suggestedTikTokSearchKeywords &&
      brandProfile.suggestedTikTokSearchKeywords[0]) ||
      "รีวิวสกินแคร์"
  );

  // Live search modal & state
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSearchingLive, setIsSearchingLive] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchSuccessNotice, setSearchSuccessNotice] = useState<string | null>(
    null
  );
  const [matchingNotice, setMatchingNotice] = useState<string | null>(null);

  // AI Matching confirmation modal state
  const [isConfirmMatchingModalOpen, setIsConfirmMatchingModalOpen] =
    useState(false);

  // Remove a keyword
  const handleRemoveKeyword = (indexToRemove: number) => {
    setKeywords((prev) => {
      const updated = prev.filter((_, idx) => idx !== indexToRemove);
      if (prev[indexToRemove] === selectedSearchKeyword && updated.length > 0) {
        setSelectedSearchKeyword(updated[0]);
      }
      return updated;
    });
  };

  // Deterministic Creator Qualification for all creators in the dataset
  const qualificationsMap = useMemo(() => {
    const map = new Map<string, CreatorQualification>();
    for (const c of creators) {
      const q = qualifyCreator(c, {
        targetMarket: brandProfile.targetMarket ?? "Thailand",
      });
      const key = c.creatorId || c.username;
      map.set(key, q);
    }
    return map;
  }, [creators, brandProfile.targetMarket]);

  // Creators eligible/ready to proceed to matching (excludes brand accounts & restricted review refusal)
  // Accounts requiring review ("needs_review") are preserved and forwarded to Screen 4
  const matchingReadyCreators = useMemo(() => {
    return creators.filter((c) => {
      const q = qualificationsMap.get(c.creatorId || c.username);
      return q && q.status !== "excluded";
    });
  }, [creators, qualificationsMap]);

  // Sort creators across the entire dataset before slicing
  const sortedCreators = useMemo(() => {
    const list = [...creators];

    if (sortOption === "dataset_order") {
      return list;
    }
    if (sortOption === "followers_desc") {
      return list.sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));
    }
    if (sortOption === "followers_asc") {
      return list.sort((a, b) => (a.followers ?? 0) - (b.followers ?? 0));
    }
    if (sortOption === "er_desc") {
      return list.sort((a, b) => {
        const erA = a.videos[0]?.engagementRateByViews ?? 0;
        const erB = b.videos[0]?.engagementRateByViews ?? 0;
        return erB - erA;
      });
    }

    return list;
  }, [creators, sortOption]);

  // Sliced creators: 6 initial items by default (3 cols x 2 rows), or all when expanded
  const displayedCreators = useMemo(() => {
    if (isExpanded) {
      return sortedCreators;
    }
    return sortedCreators.slice(0, INITIAL_VISIBLE_COUNT);
  }, [sortedCreators, isExpanded]);

  // Handle Live Scraping execution
  const handleConfirmLiveSearch = async () => {
    setIsSearchingLive(true);
    setSearchError(null);
    setSearchSuccessNotice(null);

    try {
      const response = await fetch("/api/discovery/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: selectedSearchKeyword,
          confirmPaidRun: true,
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        const errMessage =
          json?.error?.message ||
          "Failed to perform live TikTok discovery. Reverting to saved dataset.";
        setSearchError(errMessage);
        return;
      }

      if (json.data?.creators && Array.isArray(json.data.creators)) {
        setCreators(json.data.creators);
        setSearchSuccessNotice(
          `Discovered ${json.data.creators.length} creators for "${json.data.searchKeyword}". Cost capped at max 10 items (${json.data.cached ? "cached" : "cost limited"}).`
        );
        setIsSearchModalOpen(false);
      }
    } catch {
      setSearchError(
        "Network connection error while contacting search API. Please check your connection."
      );
    } finally {
      setIsSearchingLive(false);
    }
  };

  const handleContinue = () => {
    setIsConfirmMatchingModalOpen(true);
  };

  const handleConfirmMatching = () => {
    setIsConfirmMatchingModalOpen(false);
    setMatchingNotice(
      `Creator list confirmed (${Math.min(matchingReadyCreators.length, 10)} creators ready for matching). Excluded brand accounts will not be evaluated.`
    );
    onContinueToMatching(matchingReadyCreators.slice(0, 10));
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 pb-16 pt-2">
      {/* Page Title & Subtitle */}
      <div className="text-center mb-7 sm:mb-8">
        <h1 className="text-2xl sm:text-[32px] font-bold text-[#2B2B36] tracking-tight">
          Discover TikTok creators
        </h1>
        <p className="mt-1.5 sm:mt-2 text-xs sm:text-[14px] text-slate-500 font-normal">
          Review creators collected from your search keywords.
        </p>
      </div>

      {/* Matching Notice */}
      {matchingNotice && (
        <div
          role="status"
          className="mb-5 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-medium flex items-center justify-between animate-in fade-in"
        >
          <span>{matchingNotice}</span>
          <button
            type="button"
            onClick={() => setMatchingNotice(null)}
            className="text-emerald-600 hover:text-emerald-900 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Card: TikTok Search Keywords */}
      <div className="w-full bg-white rounded-3xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.025)] p-5 sm:p-7 mb-7 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <span className="text-xs sm:text-[13.5px] font-semibold text-slate-800 tracking-tight">
            TikTok Search Keywords
          </span>

          {/* Saved Apify data badge */}
          <span className="self-start sm:self-auto inline-flex items-center text-[11px] sm:text-xs font-medium text-[#7C3AED] bg-[#F6F0FE] border border-[#E9D5FF] px-3 py-0.5 rounded-full">
            Saved Apify data · Skincare sample
          </span>
        </div>

        {/* Keywords Row + Search Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Keywords Chips */}
          <div className="flex flex-wrap items-center gap-2">
            {keywords.length > 0 ? (
              keywords.map((kw, idx) => (
                <span
                  key={`${kw}-${idx}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F3F4F6] text-slate-700 text-xs sm:text-[13px] font-medium border border-slate-200/60"
                >
                  <span>{kw}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveKeyword(idx)}
                    aria-label={`Remove keyword ${kw}`}
                    className="text-slate-400 hover:text-slate-700 text-xs leading-none ml-0.5 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))
            ) : (
              <span className="text-xs text-amber-600 font-medium">
                No keywords remaining. Please go back to Step 2 to add keywords.
              </span>
            )}
          </div>

          {/* Search TikTok creators Button */}
          <button
            type="button"
            onClick={() => {
              setSearchError(null);
              setIsSearchModalOpen(true);
            }}
            className="self-start sm:self-auto rounded-full bg-gradient-to-r from-[#7462F6] via-[#D565A9] to-[#FF8266] hover:opacity-95 text-white text-xs sm:text-[13px] font-medium px-5 py-2.5 shadow-[0_3px_12px_rgba(213,101,169,0.35)] flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
          >
            <span className="text-sm">✨</span>
            <span>Search TikTok creators</span>
            <span className="text-sm">→</span>
          </button>
        </div>

        {/* Disclaimer Bullet */}
        <div className="mt-4 pt-3 border-t border-slate-50 flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
          <span>
            Offline preview from saved Apify response — not a live search for{" "}
            <strong className="font-medium text-slate-600">
              {brandProfile.brandName || "your brand"}
            </strong>
          </span>
        </div>
      </div>

      {/* Creator Discovery Preview Section Header */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#2B2B36] tracking-tight">
            Creator discovery preview
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Found {displayedCreators.length} creators
          </p>
        </div>

        {/* Sorting Dropdown */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="relative">
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              aria-label="Sort creators"
              className="appearance-none bg-white border border-slate-200/90 text-slate-700 text-xs sm:text-[12.5px] font-medium rounded-full pl-3.5 pr-8 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:bg-slate-50 focus:outline-none focus:border-purple-300 cursor-pointer"
            >
              <option value="dataset_order">Dataset order</option>
              <option value="followers_desc">Followers: High to Low</option>
              <option value="followers_asc">Followers: Low to High</option>
              <option value="er_desc">Sample ER: High to Low</option>
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
              ▾
            </span>
          </div>
        </div>
      </div>

      {/* Creator Cards Grid (3 columns on desktop, 6 items initial) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 mb-6">
        {displayedCreators.map((creator) => {
          const video = creator.videos[0];
          const initial = getAvatarInitial(creator);
          const colors = getAvatarColors(creator);
          const sampleViews = video?.views ?? null;
          const sampleER = video?.engagementRateByViews ?? null;
          const hashtags = video?.hashtags?.slice(0, 2) ?? [];

          return (
            <div
              key={creator.creatorId || creator.username}
              className="bg-white rounded-3xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.025)] p-5 flex flex-col justify-between hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)] transition-all"
            >
              <div>
                {/* Header: Avatar + Username & Nickname + 1 sampled video pill */}
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Circle Avatar with Letter Fallback */}
                    <div
                      className={`relative w-11 h-11 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center font-bold text-base shrink-0 overflow-hidden shadow-xs`}
                    >
                      {creator.avatarUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={creator.avatarUrl}
                            alt={creator.username}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                          <span
                            aria-hidden="true"
                            className="absolute inset-0 flex items-center justify-center"
                          >
                            {initial}
                          </span>
                        </>
                      ) : (
                        <span>{initial}</span>
                      )}
                    </div>

                    {/* Username & Nickname */}
                    <div className="min-w-0">
                      <div className="font-bold text-xs sm:text-[13.5px] text-slate-900 truncate">
                        @{creator.username}
                      </div>
                      <div className="text-[11.5px] text-slate-500 truncate">
                        {creator.nickname || creator.username}
                      </div>
                    </div>
                  </div>

                  <span className="shrink-0 text-[10.5px] text-slate-500 bg-slate-50 border border-slate-200/70 px-2.5 py-0.5 rounded-full font-medium">
                    1 sampled video
                  </span>
                </div>

                {/* Metrics 3-Column Box */}
                <div className="grid grid-cols-3 divide-x divide-slate-100 py-2.5 bg-slate-50/50 rounded-2xl border border-slate-100/70 text-center">
                  <div>
                    <div className="font-bold text-sm sm:text-base text-slate-900 tracking-tight">
                      {formatCompactNumber(creator.followers)}
                    </div>
                    <div className="text-[10.5px] text-slate-400 font-medium">
                      Followers
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-sm sm:text-base text-slate-900 tracking-tight">
                      {formatCompactNumber(sampleViews)}
                    </div>
                    <div className="text-[10.5px] text-slate-400 font-medium">
                      Sample views
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-sm sm:text-base text-slate-900 tracking-tight">
                      {formatER(sampleER)}
                    </div>
                    <div className="text-[10.5px] text-slate-400 font-medium">
                      Sample ER
                    </div>
                  </div>
                </div>

                {/* Total profile videos bullet */}
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                  <span>
                    {(creator.totalProfileVideos ?? 0).toLocaleString()} total
                    profile videos · 1 video analyzed
                  </span>
                </div>

                {/* Hashtag pills */}
                {hashtags.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {hashtags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-block text-[11px] font-medium text-purple-600 bg-purple-50/70 border border-purple-100 px-2.5 py-0.5 rounded-full"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Video Caption snippet */}
                {video?.caption && (
                  <p className="mt-2.5 text-xs text-slate-600 italic line-clamp-2 leading-relaxed">
                    &ldquo;{video.caption.trim()}&rdquo;
                  </p>
                )}
              </div>

              {/* Bottom Row: TikTok Profile Link */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <a
                  href={
                    creator.profileUrl ||
                    `https://www.tiktok.com/@${creator.username}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center justify-between group transition-colors"
                >
                  <span className="truncate">
                    tiktok.com/@{creator.username}
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

      {/* Show all / Show less toggle button */}
      {creators.length > INITIAL_VISIBLE_COUNT && (
        <div className="flex justify-center mb-8">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="rounded-full bg-white border border-slate-200/90 text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-xs sm:text-[13px] font-medium px-5 py-2 shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span>
              {isExpanded ? "Show less" : `Show all (${creators.length})`}
            </span>
            <span className="text-xs">{isExpanded ? "▲" : "▼"}</span>
          </button>
        </div>
      )}

      {/* Bottom Action Buttons: Back + Continue */}
      <div className="flex items-center justify-between pt-2">
        {/* Left: ← Back */}
        <button
          type="button"
          onClick={onBack}
          className="rounded-full bg-white border border-slate-200/90 text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-xs sm:text-[13.5px] font-medium px-6 sm:px-7 py-2.5 sm:py-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <span className="text-sm">←</span>
          <span>Back</span>
        </button>

        {/* Right: Continue to matching → */}
        <button
          type="button"
          onClick={handleContinue}
          className="rounded-full bg-gradient-to-r from-[#7462F6] via-[#D565A9] to-[#FF8266] hover:opacity-95 text-white text-xs sm:text-[13.5px] font-medium px-6 sm:px-8 py-2.5 sm:py-3 shadow-[0_4px_16px_rgba(213,101,169,0.38)] flex items-center gap-2 transition-all cursor-pointer"
        >
          <span>Continue to matching</span>
          <span className="text-sm">→</span>
        </button>
      </div>

      {/* Footnote Formula Disclaimer */}
      <p className="mt-5 text-[11px] text-slate-400 text-center leading-relaxed">
        Numbers are from saved Apify fixture (October 2026). Sample ER = (likes
        + comments + shares) ÷ views on one video, not an account-wide average.
      </p>

      {/* Search Confirmation Modal */}
      {isSearchModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in"
        >
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-6">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Live TikTok Creator Search
            </h3>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              This action will invoke the live Apify Clockworks TikTok Scraper
              using your search keywords. Live scraping consumes Apify credits.
            </p>

            {searchError && (
              <div
                role="alert"
                className="mb-3 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium"
              >
                {searchError}
              </div>
            )}

            {searchSuccessNotice && (
              <div
                role="status"
                className="mb-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium"
              >
                {searchSuccessNotice}
              </div>
            )}

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 mb-4 text-xs text-slate-600">
              <div className="font-semibold text-slate-800 mb-1.5 flex items-center justify-between">
                <span>Select Keyword (1 per search):</span>
                <span className="text-[10.5px] text-purple-600 font-medium">
                  Max 5 results
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelectedSearchKeyword(k)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer border ${
                      k === selectedSearchKeyword
                        ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[10.5px] text-slate-400">
                Cost limit: capped at $0.25 USD and 5 items. Paid media add-ons
                disabled.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsSearchModalOpen(false);
                  setSearchError(null);
                }}
                disabled={isSearchingLive}
                className="px-4 py-2 rounded-full text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLiveSearch}
                disabled={isSearchingLive}
                className="px-5 py-2 rounded-full bg-gradient-to-r from-[#7462F6] via-[#D565A9] to-[#FF8266] text-white text-xs font-medium shadow-sm hover:opacity-95 transition-all disabled:opacity-60 flex items-center gap-1.5 cursor-pointer"
              >
                {isSearchingLive ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                    <span>Scraping TikTok...</span>
                  </>
                ) : (
                  <span>Confirm Live Search</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Matching Confirmation Modal */}
      {isConfirmMatchingModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in"
        >
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-6">
            <div className="w-10 h-10 rounded-2xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center text-lg mb-3">
              ✨
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Confirm AI Matching &amp; Ranking
            </h3>
            <p className="text-xs text-slate-500 mb-3.5 leading-relaxed">
              Holo AI will evaluate creator content fit, category alignment, and
              brand tone for {brandProfile.brandName || "your brand"} using live
              OpenAI Structured Outputs.
            </p>

            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 mb-4 text-xs text-slate-700 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Target Brand:</span>
                <span className="font-semibold text-slate-900 truncate max-w-[200px]">
                  {brandProfile.brandName || "Active Brand"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Creators to Evaluate:</span>
                <span className="font-semibold text-[#7C3AED]">
                  {Math.min(matchingReadyCreators.length, 10)} creators (max 10)
                </span>
              </div>
              {creators.length > matchingReadyCreators.length && (
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>Excluded Brand Accounts:</span>
                  <span>
                    {creators.length - matchingReadyCreators.length} accounts
                  </span>
                </div>
              )}
              <div className="pt-1.5 border-t border-slate-200/60 text-[10.5px] text-slate-400">
                Cost limit: capped at 10 creators. Calls live OpenAI API.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmMatchingModalOpen(false)}
                className="px-4 py-2 rounded-full text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMatching}
                className="px-5 py-2 rounded-full bg-gradient-to-r from-[#7462F6] via-[#D565A9] to-[#FF8266] text-white text-xs font-medium shadow-sm hover:opacity-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>Confirm &amp; Run AI Matching →</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
