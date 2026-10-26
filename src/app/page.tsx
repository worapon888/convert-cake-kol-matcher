"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import { ProgressBar } from "@/components/onboarding/ProgressBar";
import { BrandProfileReviewForm } from "@/components/onboarding/BrandProfileReviewForm";
import { CreatorDiscoveryScreen } from "@/components/discovery/CreatorDiscoveryScreen";
import { AIMatchingScreen } from "@/components/matching/AIMatchingScreen";
import { CreatorShortlistScreen } from "@/components/shortlist/CreatorShortlistScreen";
import type { BrandProfile } from "@/lib/brand/schemas";

const DEFAULT_INITIAL_PROFILE: BrandProfile = {
  brandName: "",
  brandDescription: null,
  industry: "Skincare & Beauty",
  productCategories: [],
  keyProductsOrServices: [],
  targetAudienceDescription: "",
  targetMarket: "Thailand",
  brandTone: [],
  contentThemes: [],
  idealCreatorCharacteristics: [],
  excludedCreatorCharacteristics: [],
  suggestedTikTokSearchKeywords: [],
  sourceReferences: [],
  missingInformation: [],
  confidenceNotes: {
    observedFacts: [],
    inferredRecommendations: [],
    overallConfidence: "medium",
    rationale: "Live AI analysis completed or direct entry.",
  },
};

const emptySubscribe = () => () => {};

export default function OnboardingPage() {
  // Safe hydration check via useSyncExternalStore (prevents SSR/client HTML mismatches)
  const isHydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const stepParam = params.get("step");
      if (stepParam === "5") return 5;
      if (stepParam === "4") return 4;
      if (stepParam === "3") return 3;
      if (stepParam === "2") return 2;
    }
    return 1;
  });

  const [websiteUrl, setWebsiteUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualDescription, setManualDescription] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);

  const [brandProfile, setBrandProfile] = useState<BrandProfile>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("holo_brand_profile");
        if (cached) {
          return JSON.parse(cached);
        }
      } catch {
        // Ignore JSON parse errors
      }
    }
    return DEFAULT_INITIAL_PROFILE;
  });

  const updateBrandProfile = (profile: BrandProfile) => {
    setBrandProfile(profile);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("holo_brand_profile", JSON.stringify(profile));
      } catch {
        // Ignore storage errors
      }
    }
  };

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const stepParam = params.get("step");
      if (stepParam === "5") setCurrentStep(5);
      else if (stepParam === "4") setCurrentStep(4);
      else if (stepParam === "3") setCurrentStep(3);
      else if (stepParam === "2") setCurrentStep(2);
      else setCurrentStep(1);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleStepChange = (step: 1 | 2 | 3 | 4 | 5) => {
    setCurrentStep(step);
    if (typeof window !== "undefined") {
      const url =
        step === 5
          ? "/?step=5"
          : step === 4
            ? "/?step=4"
            : step === 3
              ? "/?step=3"
              : step === 2
                ? "/?step=2"
                : "/";
      window.history.pushState(null, "", url);
    }
  };

  // Real API Call: Analyze website via POST /api/brands/analyze
  const handleAnalyzeWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    const trimmedUrl = websiteUrl.trim();
    if (!trimmedUrl) {
      setApiError("Please enter your website URL.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/brands/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          websiteUrl: trimmedUrl,
          targetMarket: "Thailand",
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        const message =
          json?.error?.message ||
          "Failed to analyze website. Please verify the URL and try again.";
        setApiError(message);
        return;
      }

      const analyzedProfile: BrandProfile = json.data.brandProfile;
      updateBrandProfile(analyzedProfile);
      handleStepChange(2);
    } catch {
      setApiError(
        "Network connection error while contacting analysis API. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Real API Call: Analyze manual brand description via POST /api/brands/analyze
  const handleAnalyzeManualNotes = async () => {
    setModalError(null);
    setApiError(null);

    const trimmedNotes = manualDescription.trim();
    if (!trimmedNotes) {
      setModalError("Please enter your brand notes or description.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/brands/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          manualDescription: trimmedNotes,
          targetMarket: "Thailand",
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        const message =
          json?.error?.message ||
          "Failed to analyze brand notes. Please check the text and try again.";
        setModalError(message);
        return;
      }

      const analyzedProfile: BrandProfile = json.data.brandProfile;
      updateBrandProfile(analyzedProfile);
      setIsManualModalOpen(false);
      handleStepChange(2);
    } catch {
      setModalError(
        "Network error occurred while analyzing brand notes. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Prevent SSR hydration mismatch: render identical matching shell before mount
  if (!isHydrated) {
    return (
      <div
        className="relative min-h-screen w-full flex flex-col justify-between text-slate-900 overflow-x-hidden font-sans"
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
        <div className="w-full pt-8 sm:pt-10 px-4 sm:px-6">
          <ProgressBar
            currentStep={1}
            totalSteps={5}
            maxWidthClass="max-w-[620px]"
          />
        </div>
        <main className="flex-1" />
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen w-full flex flex-col justify-between text-slate-900 overflow-x-hidden font-sans"
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
      {/* Top Bar: Back Arrow + Glowing Progress Bar */}
      <div className="w-full pt-8 sm:pt-10 px-4 sm:px-6">
        {currentStep === 1 ? (
          <ProgressBar
            currentStep={1}
            totalSteps={5}
            maxWidthClass="max-w-[620px]"
          />
        ) : currentStep === 2 ? (
          <ProgressBar
            currentStep={2}
            totalSteps={5}
            canGoBack={true}
            onBack={() => handleStepChange(1)}
            maxWidthClass="max-w-[620px]"
          />
        ) : currentStep === 3 ? (
          <ProgressBar
            currentStep={3}
            totalSteps={5}
            canGoBack={true}
            onBack={() => handleStepChange(2)}
            maxWidthClass="max-w-[620px]"
          />
        ) : currentStep === 4 ? (
          <ProgressBar
            currentStep={4}
            totalSteps={5}
            canGoBack={true}
            onBack={() => handleStepChange(3)}
            maxWidthClass="max-w-[620px]"
          />
        ) : (
          <ProgressBar
            currentStep={5}
            totalSteps={5}
            canGoBack={true}
            onBack={() => handleStepChange(4)}
            maxWidthClass="max-w-[620px]"
          />
        )}
      </div>

      {/* Screen 1: Brand Input */}
      {currentStep === 1 && (
        <>
          <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12 -mt-4 sm:-mt-8">
            <div className="w-full max-w-xl mx-auto text-center">
              {/* Heading */}
              <h1 className="text-xl sm:text-[29px] md:text-[31px] font-semibold text-[#2B2B36] tracking-tight max-w-[330px] sm:max-w-none mx-auto leading-tight sm:leading-normal">
                First, let&apos;s understand your brand
              </h1>

              {/* Subheading */}
              <p className="mt-2.5 sm:mt-3 text-xs sm:text-[13.5px] text-[#6F7384] leading-relaxed max-w-[340px] sm:max-w-[430px] mx-auto">
                Enter your website URL and Holo will capture your brand&apos;s
                DNA in
                <br className="hidden sm:inline" /> under 2 minutes. Your data
                stays private.
              </p>

              {/* API Error Alert */}
              {apiError && (
                <div
                  role="alert"
                  className="mt-4 mb-2 p-3 rounded-2xl bg-rose-50 border border-rose-200/90 text-rose-700 text-xs sm:text-[13px] font-medium flex items-center justify-between max-w-[440px] mx-auto text-left animate-in fade-in"
                >
                  <span>{apiError}</span>
                  <button
                    type="button"
                    onClick={() => setApiError(null)}
                    className="text-rose-500 hover:text-rose-800 font-bold ml-2 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Input Form */}
              <form
                onSubmit={handleAnalyzeWebsite}
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
                    onChange={(e) => {
                      setWebsiteUrl(e.target.value);
                      if (apiError) setApiError(null);
                    }}
                    placeholder="https://yourcompany.com"
                    className="w-full min-w-0 text-xs sm:text-[13.5px] text-slate-800 placeholder:text-slate-400 bg-transparent focus:outline-none"
                  />
                </div>

                {/* Buttons Row */}
                <div className="mt-5 flex items-center justify-center gap-2 sm:gap-3">
                  {/* Secondary Button: Don't have a website */}
                  <button
                    type="button"
                    onClick={() => {
                      setModalError(null);
                      setIsManualModalOpen(true);
                    }}
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
                      <span className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                        <span>Analyzing with AI...</span>
                      </span>
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
          <div
            className="h-10 sm:h-16 pointer-events-none"
            aria-hidden="true"
          />
        </>
      )}

      {/* Screen 2: Brand Profile Review */}
      {currentStep === 2 && (
        <main className="flex-1 flex flex-col items-center justify-start py-4 sm:py-6">
          <BrandProfileReviewForm
            initialProfile={brandProfile}
            onBack={() => handleStepChange(1)}
            onSave={(updated) => updateBrandProfile(updated)}
            onSubmitSuccess={(updated) => {
              updateBrandProfile(updated);
              handleStepChange(3);
            }}
          />
        </main>
      )}

      {/* Screen 3: Creator Discovery */}
      {currentStep === 3 && (
        <main className="flex-1 flex flex-col items-center justify-start py-4 sm:py-6">
          <CreatorDiscoveryScreen
            brandProfile={brandProfile}
            onBack={() => handleStepChange(2)}
            onContinueToMatching={(selectedCreators) => {
              if (typeof window !== "undefined" && selectedCreators) {
                try {
                  sessionStorage.setItem(
                    "holo_selected_creators",
                    JSON.stringify(selectedCreators)
                  );
                } catch {
                  // Ignore storage error
                }
              }
              handleStepChange(4);
            }}
          />
        </main>
      )}

      {/* Screen 4: AI Matching & Ranking */}
      {currentStep === 4 && (
        <main className="flex-1 flex flex-col items-center justify-start py-4 sm:py-6">
          <AIMatchingScreen
            brandProfile={brandProfile}
            onBack={() => handleStepChange(3)}
            onContinueToShortlist={(shortlisted) => {
              if (typeof window !== "undefined" && shortlisted) {
                try {
                  sessionStorage.setItem(
                    "holo_shortlisted_creators",
                    JSON.stringify(shortlisted)
                  );
                } catch {
                  // Ignore storage error
                }
              }
              handleStepChange(5);
            }}
          />
        </main>
      )}

      {/* Screen 5: Your Creator Shortlist */}
      {currentStep === 5 && (
        <main className="flex-1 flex flex-col items-center justify-start py-4 sm:py-6">
          <CreatorShortlistScreen
            brandProfile={brandProfile}
            onBackToMatching={() => handleStepChange(4)}
          />
        </main>
      )}

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
            <p className="text-xs text-slate-500 mb-3">
              Enter your brand notes, core products, or target audience for live
              AI analysis.
            </p>

            {modalError && (
              <div
                role="alert"
                className="mb-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium"
              >
                {modalError}
              </div>
            )}

            <textarea
              rows={4}
              value={manualDescription}
              onChange={(e) => {
                setManualDescription(e.target.value);
                if (modalError) setModalError(null);
              }}
              placeholder="e.g. Lumina Skin is a Thai dermo-cosmetic skincare brand for sensitive skin..."
              className="w-full p-3 rounded-2xl border border-slate-200 text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-purple-300"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsManualModalOpen(false);
                  setModalError(null);
                }}
                disabled={isLoading}
                className="px-4 py-2 rounded-full text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAnalyzeManualNotes}
                disabled={isLoading}
                className="px-5 py-2 rounded-full bg-gradient-to-r from-[#B9A3E3] via-[#DC9BBF] to-[#F1A293] text-white text-xs font-medium shadow-sm transition-all disabled:opacity-60 flex items-center gap-1.5"
              >
                {isLoading ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <span>Analyze brand notes →</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
