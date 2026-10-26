"use client";

import React, { useState } from "react";
import type { BrandProfile } from "@/lib/brand/schemas";

interface BrandProfileReviewFormProps {
  initialProfile: BrandProfile;
  onBack: () => void;
  onSave?: (updatedProfile: BrandProfile) => void;
  onSubmitSuccess?: (updatedProfile: BrandProfile) => void;
}

interface ToneOption {
  id: string;
  label: string;
  activeBg: string;
  activeText: string;
  inactiveBg: string;
  inactiveText: string;
}

const DEFAULT_TONES: ToneOption[] = [
  {
    id: "Friendly",
    label: "Friendly",
    activeBg: "bg-[#FF598B] shadow-sm shadow-pink-200/50",
    activeText: "text-white",
    inactiveBg: "bg-[#FFE8EF]",
    inactiveText: "text-[#E11D48]",
  },
  {
    id: "Trustworthy",
    label: "Trustworthy",
    activeBg: "bg-[#7C3AED] shadow-sm shadow-purple-200/50",
    activeText: "text-white",
    inactiveBg: "bg-[#EDE9FE]",
    inactiveText: "text-[#7C3AED]",
  },
  {
    id: "Educational",
    label: "Educational",
    activeBg: "bg-[#0284C7] shadow-sm shadow-sky-200/50",
    activeText: "text-white",
    inactiveBg: "bg-[#E0F2FE]",
    inactiveText: "text-[#0284C7]",
  },
  {
    id: "Lifestyle",
    label: "Lifestyle",
    activeBg: "bg-[#16A34A] shadow-sm shadow-emerald-200/50",
    activeText: "text-white",
    inactiveBg: "bg-[#DCFCE7]",
    inactiveText: "text-[#16A34A]",
  },
  {
    id: "Trendy",
    label: "Trendy",
    activeBg: "bg-[#D97706] shadow-sm shadow-amber-200/50",
    activeText: "text-white",
    inactiveBg: "bg-[#FEF3C7]",
    inactiveText: "text-[#D97706]",
  },
];

const BUSINESS_CATEGORIES = [
  "Skincare & Beauty",
  "Cosmetics & Makeup",
  "Health & Wellness",
  "Fashion & Apparel",
  "Food & Beverage",
  "Mom & Baby",
  "Electronics & Tech",
  "Home & Living",
  "Other",
];

export function BrandProfileReviewForm({
  initialProfile,
  onBack,
  onSave,
  onSubmitSuccess,
}: BrandProfileReviewFormProps) {
  // Form State initialized from live BrandProfile
  const [brandName, setBrandName] = useState(initialProfile.brandName ?? "");
  const [businessCategory, setBusinessCategory] = useState(
    initialProfile.industry ?? "Skincare & Beauty"
  );
  const [productsServices, setProductsServices] = useState(
    initialProfile.keyProductsOrServices &&
      initialProfile.keyProductsOrServices.length > 0
      ? initialProfile.keyProductsOrServices.join(", ")
      : ""
  );
  const [targetAudience, setTargetAudience] = useState(
    initialProfile.targetAudienceDescription ?? ""
  );
  const [selectedTones, setSelectedTones] = useState<string[]>(
    initialProfile.brandTone ?? []
  );
  const [keywords, setKeywords] = useState<string[]>(
    initialProfile.suggestedTikTokSearchKeywords ?? []
  );

  // New Keyword input state
  const [isAddingKeyword, setIsAddingKeyword] = useState(false);
  const [newKeywordInput, setNewKeywordInput] = useState("");
  const [keywordError, setKeywordError] = useState<string | null>(null);

  // Submission / Status state
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Handle tone toggle
  const handleToggleTone = (toneId: string) => {
    setSelectedTones((prev) => {
      if (prev.includes(toneId)) {
        return prev.filter((t) => t !== toneId);
      } else {
        return [...prev, toneId];
      }
    });
  };

  // Handle keyword deletion
  const handleRemoveKeyword = (indexToRemove: number) => {
    setKeywords((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    setKeywordError(null);
  };

  // Handle keyword addition
  const handleAddKeyword = () => {
    const trimmed = newKeywordInput.trim();
    if (!trimmed) {
      setIsAddingKeyword(false);
      setKeywordError(null);
      return;
    }

    // Duplicate check (case-insensitive)
    const isDuplicate = keywords.some(
      (k) => k.toLowerCase() === trimmed.toLowerCase()
    );

    if (isDuplicate) {
      setKeywordError(`"${trimmed}" is already added.`);
      return;
    }

    setKeywords((prev) => [...prev, trimmed]);
    setNewKeywordInput("");
    setIsAddingKeyword(false);
    setKeywordError(null);
  };

  // Build updated BrandProfile preserving all non-UI backend fields
  const getUpdatedProfile = (): BrandProfile => {
    return {
      ...initialProfile,
      brandName: brandName.trim() || null,
      industry: businessCategory.trim() || null,
      keyProductsOrServices: productsServices.trim()
        ? productsServices
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      targetAudienceDescription: targetAudience.trim() || null,
      brandTone: selectedTones,
      suggestedTikTokSearchKeywords: keywords,
      // Preserved backend fields:
      // brandDescription, productCategories, targetMarket, contentThemes,
      // idealCreatorCharacteristics, excludedCreatorCharacteristics,
      // sourceReferences, missingInformation, confidenceNotes
    };
  };

  // Handle submit (Find matching creators →)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Validation
    if (!brandName.trim()) {
      setValidationError("Brand name is required.");
      return;
    }

    if (keywords.length === 0) {
      setValidationError("At least one TikTok search keyword is required.");
      return;
    }

    const updated = getUpdatedProfile();
    if (onSave) {
      onSave(updated);
    }

    if (onSubmitSuccess) {
      onSubmitSuccess(updated);
    } else {
      setStatusNotice(
        "Brand profile saved! Screen 3 (Creator Matching) is scheduled for Step 5A.3. Your profile is ready for creator discovery."
      );
    }
  };

  return (
    <div className="w-full max-w-[680px] mx-auto px-4 pb-12 pt-2">
      {/* Headings */}
      <div className="text-center mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-[28px] md:text-[30px] font-bold text-[#1E202C] tracking-tight">
          Here&apos;s your brand profile
        </h1>
        <p className="mt-2 text-xs sm:text-[13.5px] text-[#6F7384] max-w-[460px] mx-auto leading-relaxed">
          Review and edit the details before we find matching creators.
        </p>
      </div>

      {/* Validation / Status Banners */}
      {validationError && (
        <div
          role="alert"
          className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs sm:text-sm font-medium flex items-center justify-between animate-in fade-in"
        >
          <span>{validationError}</span>
          <button
            type="button"
            onClick={() => setValidationError(null)}
            className="text-rose-500 hover:text-rose-800 text-xs font-semibold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {statusNotice && (
        <div
          role="status"
          className="mb-5 p-3.5 rounded-2xl bg-emerald-50/90 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-medium flex items-start gap-2.5 animate-in fade-in"
        >
          <span className="text-emerald-600 font-bold shrink-0 mt-0.5">✓</span>
          <div className="flex-1">
            <p>{statusNotice}</p>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-emerald-600 hover:text-emerald-900 text-xs font-semibold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Card */}
      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-[24px] sm:rounded-[28px] border border-slate-100/90 shadow-[0_4px_30px_rgba(0,0,0,0.03)] p-5 sm:p-7 md:p-8 space-y-4 sm:space-y-5">
          {/* Row 1 — Two columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {/* Brand name */}
            <div>
              <label
                htmlFor="brand-name-input"
                className="block text-xs sm:text-[13px] font-medium text-[#5E6478] mb-1.5"
              >
                Brand name
              </label>
              <input
                id="brand-name-input"
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="Enter brand name"
                className="w-full h-[44px] px-4 rounded-xl border border-slate-200/90 text-xs sm:text-sm text-slate-800 bg-white placeholder:text-slate-400 focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100/50 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
              />
            </div>

            {/* Business category */}
            <div>
              <label
                htmlFor="business-category-select"
                className="block text-xs sm:text-[13px] font-medium text-[#5E6478] mb-1.5"
              >
                Business category
              </label>
              <div className="relative">
                <select
                  id="business-category-select"
                  value={businessCategory}
                  onChange={(e) => setBusinessCategory(e.target.value)}
                  className="w-full h-[44px] appearance-none px-4 pr-10 rounded-xl border border-slate-200/90 text-xs sm:text-sm text-slate-800 bg-white focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100/50 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer"
                >
                  {/* Keep current category if custom */}
                  {businessCategory &&
                    !BUSINESS_CATEGORIES.includes(businessCategory) && (
                      <option value={businessCategory}>
                        {businessCategory}
                      </option>
                    )}
                  {BUSINESS_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <div
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
                  aria-hidden="true"
                >
                  <svg
                    className="w-4 h-4 stroke-[2]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2 — Products / Services */}
          <div>
            <label
              htmlFor="products-services-input"
              className="block text-xs sm:text-[13px] font-medium text-[#5E6478] mb-1.5"
            >
              Products / Services
            </label>
            <textarea
              id="products-services-input"
              rows={2}
              value={productsServices}
              onChange={(e) => setProductsServices(e.target.value)}
              placeholder="e.g. Products, key hero SKUs, or services offered"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200/90 text-xs sm:text-sm text-slate-800 bg-white placeholder:text-slate-400 focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100/50 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] resize-none leading-relaxed"
            />
          </div>

          {/* Row 3 — Target Audience */}
          <div>
            <label
              htmlFor="target-audience-input"
              className="block text-xs sm:text-[13px] font-medium text-[#5E6478] mb-1.5"
            >
              Target Audience
            </label>
            <textarea
              id="target-audience-input"
              rows={2}
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="e.g. Target customer demographics, interests, and pain points"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200/90 text-xs sm:text-sm text-slate-800 bg-white placeholder:text-slate-400 focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100/50 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] resize-none leading-relaxed"
            />
          </div>

          {/* Row 4 — Brand Tone / Content Style */}
          <div>
            <span className="block text-xs sm:text-[13px] font-medium text-[#5E6478] mb-2">
              Brand Tone / Content Style
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {DEFAULT_TONES.map((tone) => {
                const isSelected = selectedTones.includes(tone.id);
                return (
                  <button
                    key={tone.id}
                    type="button"
                    onClick={() => handleToggleTone(tone.id)}
                    aria-pressed={isSelected}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs sm:text-[13px] font-medium transition-all cursor-pointer ${
                      isSelected
                        ? `${tone.activeBg} ${tone.activeText}`
                        : `${tone.inactiveBg} ${tone.inactiveText} hover:opacity-90`
                    }`}
                  >
                    {isSelected && (
                      <span className="w-3.5 h-3.5 rounded-full bg-white/30 flex items-center justify-center text-[10px] text-white font-bold leading-none shrink-0">
                        ✓
                      </span>
                    )}
                    <span>{tone.label}</span>
                  </button>
                );
              })}

              {/* Show any extra extracted or custom tones not in DEFAULT_TONES */}
              {selectedTones
                .filter((t) => !DEFAULT_TONES.some((preset) => preset.id === t))
                .map((customTone) => (
                  <button
                    key={customTone}
                    type="button"
                    onClick={() => handleToggleTone(customTone)}
                    aria-pressed={true}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs sm:text-[13px] font-medium bg-purple-600 text-white shadow-sm transition-all cursor-pointer"
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-white/30 flex items-center justify-center text-[10px] text-white font-bold leading-none shrink-0">
                      ✓
                    </span>
                    <span>{customTone}</span>
                  </button>
                ))}
            </div>
          </div>

          {/* Row 5 — TikTok Search Keywords */}
          <div>
            <span className="block text-xs sm:text-[13px] font-medium text-[#5E6478] mb-2">
              TikTok Search Keywords
            </span>

            <div className="flex flex-wrap items-center gap-2">
              {keywords.map((kw, idx) => (
                <span
                  key={`${kw}-${idx}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F3F4F6] text-slate-700 text-xs sm:text-[13px] font-medium border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                >
                  <span>{kw}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveKeyword(idx)}
                    aria-label={`Remove keyword ${kw}`}
                    className="text-slate-400 hover:text-slate-700 transition-colors text-xs leading-none p-0.5 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}

              {/* Add Keyword Button or Inline Input */}
              {isAddingKeyword ? (
                <div className="inline-flex items-center gap-1.5 bg-white border border-purple-300 rounded-full pl-3 pr-1.5 py-1 shadow-sm">
                  <input
                    type="text"
                    value={newKeywordInput}
                    onChange={(e) => {
                      setNewKeywordInput(e.target.value);
                      if (keywordError) setKeywordError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddKeyword();
                      } else if (e.key === "Escape") {
                        setIsAddingKeyword(false);
                        setKeywordError(null);
                      }
                    }}
                    placeholder="Enter keyword..."
                    autoFocus
                    className="text-xs sm:text-[13px] text-slate-800 placeholder:text-slate-400 bg-transparent focus:outline-none min-w-[120px]"
                  />
                  <button
                    type="button"
                    onClick={handleAddKeyword}
                    className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold rounded-full transition-colors cursor-pointer"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingKeyword(false);
                      setKeywordError(null);
                    }}
                    className="text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingKeyword(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 text-xs sm:text-[13px] font-medium transition-colors cursor-pointer"
                >
                  <span className="text-sm font-semibold leading-none">+</span>
                  <span>Add keyword</span>
                </button>
              )}
            </div>

            {keywordError && (
              <p className="mt-1.5 text-[11px] text-rose-500 font-medium">
                {keywordError}
              </p>
            )}
          </div>
        </div>

        {/* Bottom Action Buttons */}
        <div className="mt-6 flex items-center justify-between px-1">
          {/* Left: ← Back */}
          <button
            type="button"
            onClick={onBack}
            className="rounded-full bg-white border border-slate-200/90 text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-xs sm:text-[13.5px] font-medium px-5 sm:px-7 py-2.5 sm:py-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span className="text-sm">←</span>
            <span>Back</span>
          </button>

          {/* Right: Find matching creators → */}
          <button
            type="submit"
            className="rounded-full bg-gradient-to-r from-[#7462F6] via-[#D565A9] to-[#FF8266] hover:opacity-95 text-white text-xs sm:text-[13.5px] font-medium px-5 sm:px-8 py-2.5 sm:py-3 shadow-[0_4px_16px_rgba(213,101,169,0.38)] flex items-center gap-2 transition-all cursor-pointer"
          >
            <span>Find matching creators</span>
            <span className="text-sm">→</span>
          </button>
        </div>
      </form>
    </div>
  );
}
