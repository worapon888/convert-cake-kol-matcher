"use client";

import React, { useMemo, useState } from "react";
import type { BrandProfile } from "@/lib/brand/schemas";
import {
  type RankedKOLRecommendation,
  RankedKOLRecommendationSchema,
  type KOLMatchingResult,
  KOLMatchingResultSchema,
} from "@/lib/matching/schemas";
import { downloadShortlistCsv } from "@/lib/export/csv-exporter";
import { z } from "zod";

export interface CreatorShortlistScreenProps {
  brandProfile: BrandProfile;
  initialShortlist?: RankedKOLRecommendation[];
  onBackToMatching: () => void;
}

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
    return { bg: "bg-[#E0F2FE]", text: "text-[#0284C7]" }; // sky จ/เ
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

export function CreatorShortlistScreen({
  brandProfile,
  initialShortlist,
  onBackToMatching,
}: CreatorShortlistScreenProps) {
  // Load shortlist safely from props or sessionStorage with Zod validation
  const [shortlist, setShortlist] = useState<RankedKOLRecommendation[]>(() => {
    if (initialShortlist && initialShortlist.length > 0) {
      return initialShortlist;
    }
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("holo_shortlisted_creators");
        if (cached) {
          const parsed = JSON.parse(cached);
          const validated = z
            .array(RankedKOLRecommendationSchema)
            .safeParse(parsed);
          if (validated.success && validated.data.length > 0) {
            return validated.data;
          }
        }
        // Fallback: load all recommendations from matching results if user didn't explicitly filter
        const cachedResults = sessionStorage.getItem("holo_matching_results");
        if (cachedResults) {
          const parsedRes = JSON.parse(cachedResults);
          const validatedRes = KOLMatchingResultSchema.safeParse(parsedRes);
          if (
            validatedRes.success &&
            validatedRes.data.recommendations.length > 0
          ) {
            return validatedRes.data.recommendations;
          }
        }
      } catch {
        // Ignore JSON error
      }
    }
    return [];
  });

  // Load full matching result metadata if present
  const matchingMetadata = useMemo<KOLMatchingResult["metadata"] | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("holo_matching_results");
        if (cached) {
          const parsed = JSON.parse(cached);
          const validated = KOLMatchingResultSchema.safeParse(parsed);
          if (validated.success) {
            return validated.data.metadata;
          }
        }
      } catch {
        // Ignore parse error
      }
    }
    return null;
  }, []);

  // Map of creatorId/username -> avatarUrl for fallback
  const creatorsMap = useMemo(() => {
    const map = new Map<string, { avatarUrl?: string | null }>();
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("holo_selected_creators");
        if (cached) {
          const list = JSON.parse(cached);
          if (Array.isArray(list)) {
            for (const c of list) {
              if (c?.creatorId) map.set(c.creatorId, c);
              if (c?.username) map.set(c.username, c);
            }
          }
        }
      } catch {
        // Ignore parse error
      }
    }
    return map;
  }, []);

  const [downloadSuccessNotice, setDownloadSuccessNotice] = useState<
    string | null
  >(null);

  // Remove a creator from the shortlist
  const handleRemoveCreator = (creatorId: string) => {
    setShortlist((prev) => {
      const updated = prev.filter((c) => c.creatorId !== creatorId);
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(
            "holo_shortlisted_creators",
            JSON.stringify(updated)
          );
        } catch {
          // Ignore storage error
        }
      }
      return updated;
    });
  };

  // Trigger real CSV download
  const handleExportCsv = () => {
    if (shortlist.length === 0) return;
    const filename = downloadShortlistCsv(brandProfile, shortlist);
    setDownloadSuccessNotice(`Downloaded ${filename} successfully.`);
    setTimeout(() => {
      setDownloadSuccessNotice(null);
    }, 4500);
  };

  const brandInitial = (brandProfile.brandName || "B").trim().charAt(0);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 pb-16 pt-2">
      {/* Title & Subtitle */}
      <div className="text-center mb-6 sm:mb-7">
        <h1 className="text-2xl sm:text-[32px] font-bold text-[#2B2B36] tracking-tight">
          Your creator shortlist
        </h1>
        <p className="mt-1.5 sm:mt-2 text-xs sm:text-[14px] text-slate-500 font-normal">
          Review the creators and export your matching results.
        </p>
      </div>

      {/* Brand Profile Summary Card */}
      <div className="w-full bg-white rounded-3xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.025)] p-5 sm:p-6 mb-7 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

          {/* Right Status */}
          <div className="self-start sm:self-auto shrink-0">
            <span className="inline-flex items-center text-[11px] sm:text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200/80 px-3 py-1 rounded-full">
              {shortlist.length} creators shortlisted
            </span>
          </div>
        </div>
      </div>

      {/* Download Alert Notice */}
      {downloadSuccessNotice && (
        <div
          role="status"
          className="mb-6 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-medium flex items-center justify-between animate-in fade-in"
        >
          <span>✓ {downloadSuccessNotice}</span>
          <button
            type="button"
            onClick={() => setDownloadSuccessNotice(null)}
            className="text-emerald-600 hover:text-emerald-900 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content Layout: 2 Columns on Desktop */}
      {shortlist.length === 0 ? (
        /* Empty State */
        <div className="w-full bg-white rounded-3xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.025)] p-8 sm:p-12 text-center mb-8">
          <div className="w-12 h-12 mx-auto rounded-full bg-purple-50 text-purple-600 flex items-center justify-center text-xl mb-3">
            📋
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900">
            Your shortlist is empty
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
            No creators have been selected for the shortlist yet. Please go back
            to AI Matching &amp; Ranking to select creators.
          </p>
          <div className="mt-6">
            <button
              type="button"
              onClick={onBackToMatching}
              className="rounded-full bg-gradient-to-r from-[#7462F6] via-[#D565A9] to-[#FF8266] hover:opacity-95 text-white text-xs sm:text-sm font-medium px-6 py-2.5 shadow-xs transition-all cursor-pointer"
            >
              ← Back to matching
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-7 mb-8">
          {/* Left Column: Shortlist Items (8 cols on lg) */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            {/* Header: Count + Add More Button */}
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                  {shortlist.length} creators in this shortlist
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                  Only creators selected from AI matching are shown
                </p>
              </div>

              {/* Add more creators button */}
              <button
                type="button"
                onClick={onBackToMatching}
                className="rounded-full bg-white border border-purple-200/90 hover:bg-purple-50/70 text-[#7C3AED] text-xs font-semibold px-3.5 sm:px-4 py-1.5 shadow-2xs transition-all cursor-pointer flex items-center gap-1"
              >
                <span>+</span>
                <span>Add more creators</span>
              </button>
            </div>

            {/* Shortlist Cards Container */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.025)] p-4 sm:p-6 divide-y divide-slate-100">
              {shortlist.map((item) => {
                const avatarColors = getAvatarColors(item.username);
                const initial = getAvatarInitial(
                  item.displayName || item.username
                );
                const avatarUrl =
                  item.avatarUrl ||
                  creatorsMap.get(item.creatorId)?.avatarUrl ||
                  creatorsMap.get(item.username)?.avatarUrl;

                return (
                  <div
                    key={item.creatorId}
                    className="py-4 sm:py-5 first:pt-1 last:pb-1 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 group"
                  >
                    {/* Left: Avatar + Details + Hashtags */}
                    <div className="flex items-start gap-3 min-w-0 md:max-w-[42%]">
                      {/* Avatar */}
                      <div
                        className={`relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 mt-0.5 overflow-hidden ${avatarColors.bg} ${avatarColors.text} shadow-xs`}
                      >
                        {avatarUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={avatarUrl}
                              alt={item.username}
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

                      {/* Creator Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-slate-900 truncate">
                            @{item.username}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 truncate">
                          {item.displayName}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {formatCompactNumber(item.followers)} followers ·{" "}
                          {formatCompactNumber(item.medianViews)} sample views
                        </p>

                        {/* TikTok Profile Link */}
                        <a
                          href={
                            item.profileUrl ||
                            `https://www.tiktok.com/@${item.username}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-purple-600 hover:text-purple-800 font-medium inline-flex items-center gap-0.5 mt-1 transition-colors"
                        >
                          <span>tiktok.com/@{item.username}</span>
                          <span className="text-xs">↗</span>
                        </a>
                      </div>
                    </div>

                    {/* Middle: Match Score + Content Fit */}
                    <div className="shrink-0 flex md:flex-col items-center md:items-center justify-start gap-2 md:gap-0.5 md:px-3">
                      <div className="text-2xl font-extrabold text-[#7462F6] tracking-tight">
                        {item.matchScore.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Match score
                      </div>
                      {item.scoreBreakdown.contentFitScore !== null && (
                        <div className="text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full mt-1">
                          Content fit{" "}
                          {item.scoreBreakdown.contentFitScore
                            .toFixed(1)
                            .replace(/\.0$/, "")}
                        </div>
                      )}
                    </div>

                    {/* Right: Explanation + Details + Remove button */}
                    <div className="min-w-0 flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="text-xs font-semibold text-slate-800 mb-0.5">
                          Why this creator matches
                        </h4>
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {item.contentFitExplanation ||
                            item.contentEvaluation.explanation}
                        </p>
                        <p className="text-[10.5px] text-slate-400 mt-1">
                          Sample ER: {formatER(item.averageEngagementRate)} ·
                          Market Fit:{" "}
                          {item.scoreBreakdown.marketFitScore !== null
                            ? item.scoreBreakdown.marketFitScore
                            : "N/A"}{" "}
                          · {item.sampledVideosCount} sampled video
                        </p>
                      </div>

                      {/* Remove Button */}
                      <div className="mt-2.5 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveCreator(item.creatorId)}
                          aria-label={`Remove @${item.username}`}
                          className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <span>✕</span>
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: 3 Summary Cards (4 cols on lg) */}
          <div className="lg:col-span-4 flex flex-col gap-5">
            {/* 1. Shortlist Summary Card */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.025)] p-5 sm:p-6">
              <h3 className="text-xs sm:text-sm font-bold text-slate-800 mb-2">
                Shortlist summary
              </h3>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-3xl font-extrabold text-slate-900">
                  {shortlist.length}
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  creators
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Selected from your AI matching results
                {matchingMetadata
                  ? ` (${matchingMetadata.totalCandidatesEvaluated} evaluated)`
                  : ""}
                .
              </p>

              {/* Export CSV Button */}
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={shortlist.length === 0}
                className="w-full rounded-2xl bg-gradient-to-r from-[#7462F6] via-[#D565A9] to-[#FF8266] text-white text-xs sm:text-sm font-semibold py-3 shadow-[0_4px_16px_rgba(213,101,169,0.35)] hover:opacity-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <span>↓</span>
                <span>Export CSV</span>
              </button>

              {/* Caption Box */}
              <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-100/90 mt-3.5 text-[10.5px] text-slate-400 leading-relaxed">
                <strong className="text-slate-600">CSV fields:</strong>{" "}
                username, TikTok URL, followers, match score, content fit,
                market fit, performance fit, suitability and AI explanation.
              </div>
            </div>

            {/* 2. Export Preview Card */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.025)] p-5">
              <h3 className="text-xs sm:text-sm font-bold text-slate-800 mb-2.5">
                Export preview
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 text-[10.5px]">
                      <th className="pb-1.5 font-medium">Rank</th>
                      <th className="pb-1.5 font-medium">Creator</th>
                      <th className="pb-1.5 font-medium text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-slate-700">
                    {shortlist.slice(0, 5).map((item) => (
                      <tr key={item.creatorId}>
                        <td className="py-2 text-[11px] text-slate-400 font-mono">
                          {item.rank}
                        </td>
                        <td className="py-2 text-xs font-semibold truncate max-w-[120px]">
                          @{item.username}
                        </td>
                        <td className="py-2 text-right font-bold text-purple-600">
                          {item.matchScore.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. Data Transparency Card */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.025)] p-5">
              <h3 className="text-xs sm:text-sm font-bold text-slate-800 mb-2">
                Data transparency
              </h3>
              <div className="space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
                <p>
                  Scores: evaluated using OpenAI Structured Outputs for{" "}
                  {brandProfile.brandName || "your brand"}.
                </p>
                <p>Profiles / metrics: collected TikTok scraper data.</p>
                <p>Portraits / video thumbnails: not generated or faked.</p>
                <p>
                  Each metric is based on sampled videos, not an account-wide
                  average.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Action Bar: Back to Matching + Export & Finish */}
      <div className="flex items-center justify-between pt-2">
        {/* Left: ← Back to matching */}
        <button
          type="button"
          onClick={onBackToMatching}
          className="rounded-full bg-white border border-slate-200/90 text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-xs sm:text-[13.5px] font-medium px-6 sm:px-7 py-2.5 sm:py-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <span className="text-sm">←</span>
          <span>Back to matching</span>
        </button>

        {/* Right: Export CSV & Finish → */}
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={shortlist.length === 0}
          className="rounded-full bg-gradient-to-r from-[#7462F6] via-[#D565A9] to-[#FF8266] hover:opacity-95 text-white text-xs sm:text-[13.5px] font-medium px-6 sm:px-8 py-2.5 sm:py-3 shadow-[0_4px_16px_rgba(213,101,169,0.38)] flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>Export CSV &amp; Finish</span>
          <span className="text-sm">→</span>
        </button>
      </div>

      {/* Bottom Footnote */}
      <div className="mt-8 text-[11px] text-slate-400 text-center leading-relaxed">
        <p>
          Design preview — real evaluated test results, no new API run, no
          invented creator photos or matching scores.
        </p>
      </div>
    </div>
  );
}
