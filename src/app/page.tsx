"use client";

import React, { useState } from "react";
import { BrandProfilePreviewModal } from "@/components/onboarding/BrandProfilePreviewModal";
import { loadBrandAnalyzerFixture } from "@/lib/brand/fixtures";
import type { BrandProfile } from "@/lib/brand/schemas";

export default function Screen01BrandInputPage() {
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewProfile, setPreviewProfile] = useState<BrandProfile | null>(
    null
  );
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualDescription, setManualDescription] = useState("");

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Simulate analysis delay
      await new Promise((resolve) => setTimeout(resolve, 600));
      // Load controlled local fixture safely (no paid API calls)
      const fixture = loadBrandAnalyzerFixture();
      setPreviewProfile(fixture.expectedBrandProfile);
      setIsPreviewOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen w-full flex flex-col justify-between text-slate-900 overflow-hidden font-sans"
      style={{
        backgroundColor: "#ffffff",
        backgroundImage: `
          radial-gradient(circle at 0% 100%, rgba(186, 214, 255, 0.75) 0%, rgba(205, 228, 255, 0.45) 25%, transparent 55%),
          radial-gradient(circle at 100% 55%, rgba(255, 195, 220, 0.8) 0%, rgba(255, 215, 232, 0.45) 30%, transparent 60%),
          radial-gradient(circle at 0% 25%, rgba(245, 215, 255, 0.65) 0%, rgba(250, 230, 255, 0.35) 25%, transparent 50%),
          radial-gradient(circle at 95% 10%, rgba(255, 225, 235, 0.55) 0%, transparent 40%)
        `,
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Top Bar: Back Arrow + Large Glowing Progress Bar */}
      <div className="w-full pt-8 sm:pt-10 px-4 sm:px-6">
        <div className="w-full max-w-[620px] mx-auto flex items-center justify-center gap-3 sm:gap-3.5">
          {/* Back Arrow Button */}
          <button
            type="button"
            aria-label="Back"
            className="text-slate-800 hover:text-slate-500 transition-colors p-1 cursor-pointer shrink-0"
          >
            <svg
              className="w-4 h-4 stroke-[2.4]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>

          {/* Progress Bar Track */}
          <div
            role="progressbar"
            aria-valuenow={1}
            aria-valuemin={1}
            aria-valuemax={5}
            className="flex-1 min-w-0 h-[11px] sm:h-[13px] rounded-full bg-[#FDE7EC] relative flex items-center"
          >
            {/* Active Segment (~24% width) with bright pastel gradient & luminous diffused aura */}
            <div className="relative h-full w-[24%]">
              {/* Soft bright blurred glow that bleeds around the active segment */}
              <div
                className="absolute -inset-[5px] rounded-full bg-gradient-to-r from-[#6898FF] via-[#B378FF] via-[#FF66A6] to-[#FF8B6B] blur-[7px] opacity-90 pointer-events-none"
                aria-hidden="true"
              />
              {/* Main bright gradient pill */}
              <div className="relative h-full w-full rounded-full bg-gradient-to-r from-[#5B8CFF] via-[#A668FF] via-[#FF5499] to-[#FF7B59] shadow-[0_0_12px_rgba(255,84,153,0.55)]" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area: Centered Hero + Input + Buttons */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12 -mt-4 sm:-mt-8">
        <div className="w-full max-w-xl mx-auto text-center">
          {/* Heading */}
          <h1 className="text-xl sm:text-[29px] md:text-[31px] font-bold text-[#18181B] tracking-tight max-w-[330px] sm:max-w-none mx-auto leading-tight sm:leading-normal">
            First, let&apos;s understand your brand
          </h1>

          {/* Subheading */}
          <p className="mt-2.5 sm:mt-3 text-xs sm:text-[13.5px] text-[#6F7384] leading-relaxed max-w-[340px] sm:max-w-[430px] mx-auto">
            Enter your website URL and Holo will capture your brand&apos;s DNA
            in
            <br className="hidden sm:inline" /> under 2 minutes. Your data stays
            private.
          </p>

          {/* Input Form */}
          <form
            onSubmit={handleAnalyze}
            className="mt-6 sm:mt-7 w-full max-w-[440px] mx-auto"
          >
            {/* URL Input */}
            <div className="relative flex items-center w-full h-[46px] bg-white rounded-full border border-slate-200/90 shadow-[0_1px_4px_rgba(0,0,0,0.03)] px-3.5 sm:px-4 focus-within:border-slate-300 focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all">
              {/* Search Glass Icon */}
              <svg
                className="w-4 h-4 text-slate-400 shrink-0 mr-2 sm:mr-2.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>

              <input
                type="url"
                inputMode="url"
                autoComplete="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://yourcompany.com"
                className="w-full min-w-0 text-xs sm:text-[13.5px] text-slate-800 placeholder:text-slate-400 bg-transparent focus:outline-none"
              />
            </div>

            {/* Buttons Row */}
            <div className="mt-5 flex items-center justify-center gap-2 sm:gap-3">
              {/* Secondary Button: Don't have a website */}
              <button
                type="button"
                onClick={() => setIsManualModalOpen(true)}
                className="rounded-full bg-white border border-slate-200/80 hover:bg-slate-50/90 text-slate-600 text-xs sm:text-[13px] font-medium px-3.5 sm:px-5 py-2 sm:py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors cursor-pointer shrink-0"
              >
                Don&apos;t have a website
              </button>

              {/* Primary Button: Analyze website → */}
              <button
                type="submit"
                disabled={isLoading}
                className="rounded-full bg-gradient-to-r from-[#B9A3E3] via-[#DC9BBF] to-[#F1A293] hover:opacity-95 text-white text-xs sm:text-[13px] font-medium px-4 sm:px-6 py-2 sm:py-2.5 shadow-[0_3px_12px_rgba(220,155,191,0.4)] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 shrink-0"
              >
                {isLoading ? (
                  <span>Analyzing...</span>
                ) : (
                  <>
                    <span>Analyze website</span>
                    <span className="text-sm">→</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Empty bottom spacer to keep hero perfectly centered */}
      <div className="h-10 sm:h-16 pointer-events-none" aria-hidden="true" />

      {/* Controlled Offline Preview Modal */}
      <BrandProfilePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        brandProfile={previewProfile}
        sourceUrl={websiteUrl || "Lumina Skin Thailand (Demo)"}
      />

      {/* Manual Brand Description Modal (for "Don't have a website") */}
      {isManualModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-6">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              Describe your brand
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Enter your brand notes, core products, or target audience.
            </p>
            <textarea
              rows={4}
              value={manualDescription}
              onChange={(e) => setManualDescription(e.target.value)}
              placeholder="e.g. Lumina Skin is a Thai dermo-cosmetic skincare brand for sensitive skin..."
              className="w-full p-3 rounded-2xl border border-slate-200 text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-purple-300"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="px-4 py-2 rounded-full text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsManualModalOpen(false);
                  setIsLoading(true);
                  try {
                    await new Promise((r) => setTimeout(r, 600));
                    const fixture = loadBrandAnalyzerFixture();
                    setPreviewProfile(fixture.expectedBrandProfile);
                    setIsPreviewOpen(true);
                  } finally {
                    setIsLoading(false);
                  }
                }}
                className="px-5 py-2 rounded-full bg-gradient-to-r from-[#B9A3E3] via-[#DC9BBF] to-[#F1A293] text-white text-xs font-medium shadow-sm transition-all"
              >
                Analyze brand notes →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
