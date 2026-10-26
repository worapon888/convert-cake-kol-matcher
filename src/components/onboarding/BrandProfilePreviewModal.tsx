"use client";

import React from "react";
import Link from "next/link";
import type { BrandProfile } from "@/lib/brand/schemas";

interface BrandProfilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  brandProfile: BrandProfile | null;
  sourceUrl: string;
}

export function BrandProfilePreviewModal({
  isOpen,
  onClose,
  brandProfile,
  sourceUrl,
}: BrandProfilePreviewModalProps) {
  if (!isOpen || !brandProfile) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-purple-100/80 flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-purple-50 via-pink-50/50 to-white border-b border-slate-100 flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold uppercase tracking-wider mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Offline Demo Preview — $0 API Cost
            </div>
            <h2
              id="preview-modal-title"
              className="text-xl font-bold text-slate-900 tracking-tight"
            >
              Brand DNA Preview
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Loaded from local fixture:{" "}
              <span className="font-mono text-purple-600 font-medium">
                {sourceUrl || "Lumina Skin Thailand"}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/80 hover:bg-slate-100 border border-slate-200/80 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close preview"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Safeguard Notice Banner */}
          <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100/90 text-xs text-purple-900 flex items-start gap-3">
            <svg
              className="w-5 h-5 text-purple-600 shrink-0 mt-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <div>
              <p className="font-semibold text-purple-800">
                Screen 01 Completed — Controlled Demo Output
              </p>
              <p className="mt-0.5 text-purple-700/90 leading-relaxed">
                Paid OpenAI APIs and live TikTok scrapers were not invoked. This
                preview demonstrates the exact Brand Profile schema that will
                feed into Screen 02 in the next step.
              </p>
            </div>
          </div>

          {/* Extracted Brand Profile Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Brand Name
              </span>
              <p className="font-semibold text-slate-800 text-base">
                {brandProfile.brandName ?? "Unknown Brand"}
              </p>
            </div>

            <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Target Market & Industry
              </span>
              <p className="font-semibold text-slate-800">
                {brandProfile.targetMarket ?? "Thailand"} ·{" "}
                {brandProfile.industry ?? "General"}
              </p>
            </div>
          </div>

          {/* Description */}
          <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
              Brand Description & Positioning
            </span>
            <p className="text-slate-700 leading-relaxed text-xs sm:text-sm">
              {brandProfile.brandDescription ?? "No description available."}
            </p>
          </div>

          {/* Tone Chips */}
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Brand Tone & Values
            </span>
            <div className="flex flex-wrap gap-1.5">
              {brandProfile.brandTone.map((tone) => (
                <span
                  key={tone}
                  className="px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-medium border border-purple-200/50"
                >
                  {tone}
                </span>
              ))}
            </div>
          </div>

          {/* Key Products */}
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Key Products / Categories
            </span>
            <div className="flex flex-wrap gap-1.5">
              {brandProfile.keyProductsOrServices.map((prod) => (
                <span
                  key={prod}
                  className="px-3 py-1 rounded-full bg-pink-50 text-pink-700 text-xs font-medium border border-pink-200/50"
                >
                  {prod}
                </span>
              ))}
            </div>
          </div>

          {/* Suggested TikTok Keywords */}
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Suggested TikTok Search Keywords (Thai Market)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {brandProfile.suggestedTikTokSearchKeywords.map((kw) => (
                <span
                  key={kw}
                  className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200/60 font-mono"
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>

          {/* Audience Notes */}
          {brandProfile.targetAudienceDescription && (
            <div className="bg-amber-50/40 p-3.5 rounded-2xl border border-amber-200/50 text-xs text-amber-900">
              <span className="font-semibold block mb-0.5 text-amber-800">
                Audience Demographics Rationale:
              </span>
              <p className="text-amber-800/90 leading-relaxed">
                {brandProfile.targetAudienceDescription}
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            Next: Screen 02 will provide full Brand DNA editing.
          </span>
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <Link
              href="/dev"
              className="px-4 py-2 text-xs font-medium text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100/80 border border-purple-200/60 rounded-full transition-colors text-center"
            >
              Open Dev Bench (Step 3 & 4)
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-full transition-colors cursor-pointer"
            >
              Done & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
