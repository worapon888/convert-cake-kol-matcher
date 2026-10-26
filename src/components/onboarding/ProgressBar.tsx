"use client";

import React from "react";

interface ProgressBarProps {
  currentStep: number;
  totalSteps?: number;
  showStepCount?: boolean;
  onBack?: () => void;
  canGoBack?: boolean;
  maxWidthClass?: string;
}

export function ProgressBar({
  currentStep,
  totalSteps = 5,
  onBack,
  canGoBack = false,
  maxWidthClass = "max-w-[620px]",
}: ProgressBarProps) {
  return (
    <div
      className={`w-full ${maxWidthClass} mx-auto flex items-center justify-center gap-3 sm:gap-3.5`}
    >
      {/* Back Arrow Button */}
      <button
        type="button"
        onClick={canGoBack ? onBack : undefined}
        disabled={!canGoBack}
        aria-label="Back"
        className={`text-slate-800 hover:text-slate-500 transition-colors p-1 shrink-0 ${
          canGoBack ? "cursor-pointer opacity-100" : "cursor-default opacity-80"
        }`}
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
        aria-valuenow={currentStep}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        className="flex-1 min-w-0 h-[11px] sm:h-[13px] rounded-full bg-[#FDE7EC] relative flex items-center"
      >
        {/* Active Segment with glowing effect */}
        <div
          className={`relative h-full transition-[width] duration-700 ease-out ${
            currentStep === 1
              ? "w-[24%] animate-progress-fill"
              : currentStep === 2
                ? "w-[40%]"
                : currentStep === 3
                  ? "w-[60%]"
                  : currentStep === 4
                    ? "w-[80%]"
                    : "w-[100%]"
          }`}
        >
          {/* Soft bright blurred glow that bleeds around the active segment with gentle breathing */}
          <div
            className="absolute -inset-[5px] rounded-full bg-gradient-to-r from-[#6898FF] via-[#B378FF] via-[#FF66A6] to-[#FF8B6B] blur-[7px] pointer-events-none animate-glow-breathe animate-gradient-drift"
            aria-hidden="true"
          />
          {/* Main bright gradient pill with subtle color drift, synchronized glow pulse and silky shimmer wave */}
          <div className="relative h-full w-full rounded-full overflow-hidden bg-gradient-to-r from-[#5B8CFF] via-[#A668FF] via-[#FF5499] to-[#FF7B59] shadow-[0_0_12px_rgba(255,84,153,0.55)] animate-gradient-drift animate-pill-pulse">
            {/* Subtle light shimmer sweep */}
            <div
              className="absolute inset-y-0 w-3/5 bg-gradient-to-r from-transparent via-white/45 to-transparent pointer-events-none animate-shimmer-sweep"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
