"use client";

import React, { useMemo, useState } from "react";
import {
  type BrandAnalysisResult,
  type BrandProfile,
  BrandProfileSchema,
  buildControlledBrandAnalysisResult,
} from "@/lib/brand";

function parseLinesToArray(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function arrayToLines(items: string[]): string {
  return items.join("\n");
}

export function BrandAnalyzerTestBench() {
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [facebookPageUrl, setFacebookPageUrl] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [targetMarket, setTargetMarket] = useState("Thailand");

  const [isLoading, setIsLoading] = useState(false);
  const [errorState, setErrorState] = useState<{
    code: string;
    message: string;
    warnings?: string[];
  } | null>(null);

  const [analysisMeta, setAnalysisMeta] = useState<Omit<
    BrandAnalysisResult,
    "brandProfile"
  > | null>(null);
  const [editableProfile, setEditableProfile] = useState<BrandProfile | null>(
    null
  );

  const profileValidation = useMemo(() => {
    if (!editableProfile) return null;
    return BrandProfileSchema.safeParse(editableProfile);
  }, [editableProfile]);

  async function handleAnalyzeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setErrorState(null);

    try {
      const response = await fetch("/api/brands/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          websiteUrl: websiteUrl.trim() || null,
          facebookPageUrl: facebookPageUrl.trim() || null,
          manualDescription: manualDescription.trim() || null,
          targetMarket: targetMarket.trim() || "Thailand",
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setErrorState({
          code: payload?.error?.code ?? `HTTP_${response.status}`,
          message:
            payload?.error?.message ??
            "Failed to analyze brand sources. Check your input or server configuration.",
          warnings: payload?.error?.warnings,
        });
        return;
      }

      const result = payload.data as BrandAnalysisResult;
      setEditableProfile(result.brandProfile);
      setAnalysisMeta({
        extractionStatus: result.extractionStatus,
        warnings: result.warnings,
        missingInformation: result.missingInformation,
        modelUsed: result.modelUsed,
        analyzedAt: result.analyzedAt,
      });
    } catch (err) {
      setErrorState({
        code: "NETWORK_ERROR",
        message:
          err instanceof Error
            ? err.message
            : "Could not reach /api/brands/analyze.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleLoadControlledFixture() {
    const controlled = buildControlledBrandAnalysisResult();
    setWebsiteUrl("https://lumina-skincare-th.example.com");
    setFacebookPageUrl("https://www.facebook.com/luminaskincareth");
    setTargetMarket("Thailand");
    setErrorState(null);
    setEditableProfile(controlled.brandProfile);
    setAnalysisMeta({
      extractionStatus: controlled.extractionStatus,
      warnings: controlled.warnings,
      missingInformation: controlled.missingInformation,
      modelUsed: controlled.modelUsed,
      analyzedAt: controlled.analyzedAt,
    });
  }

  function updateScalarField<
    K extends
      | "brandName"
      | "brandDescription"
      | "industry"
      | "targetAudienceDescription"
      | "targetMarket",
  >(field: K, value: string) {
    if (!editableProfile) return;
    setEditableProfile({
      ...editableProfile,
      [field]: value.trim().length > 0 ? value : null,
    });
  }

  function updateArrayField<
    K extends
      | "productCategories"
      | "keyProductsOrServices"
      | "brandTone"
      | "contentThemes"
      | "idealCreatorCharacteristics"
      | "excludedCreatorCharacteristics"
      | "suggestedTikTokSearchKeywords",
  >(field: K, rawText: string) {
    if (!editableProfile) return;
    setEditableProfile({
      ...editableProfile,
      [field]: parseLinesToArray(rawText),
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 text-slate-900">
      <header className="mb-8 border-b border-slate-200 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="inline-block rounded bg-slate-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
              Step 3 Test Interface
            </span>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              Convert Cake — AI Brand Analyzer
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Extract public brand data from a website (and optional Facebook
              Page or manual fallback) and generate an editable structured Brand
              Profile via OpenAI Structured Outputs.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLoadControlledFixture}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Load Controlled Fixture (Offline Preview)
          </button>
        </div>
      </header>

      <form
        onSubmit={handleAnalyzeSubmit}
        className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-xs"
      >
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          1. Brand Source Inputs
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="websiteUrl"
              className="block text-sm font-medium text-slate-700"
            >
              Brand Website URL (Primary Source)
            </label>
            <input
              id="websiteUrl"
              type="text"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example-brand.co.th"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="facebookPageUrl"
              className="block text-sm font-medium text-slate-700"
            >
              Facebook Page URL (Optional, Best-Effort)
            </label>
            <input
              id="facebookPageUrl"
              type="text"
              value={facebookPageUrl}
              onChange={(e) => setFacebookPageUrl(e.target.value)}
              placeholder="https://www.facebook.com/brandpage"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-4">
          <label
            htmlFor="targetMarket"
            className="block text-sm font-medium text-slate-700"
          >
            Target Market
          </label>
          <input
            id="targetMarket"
            type="text"
            value={targetMarket}
            onChange={(e) => setTargetMarket(e.target.value)}
            placeholder="Thailand"
            className="mt-1 w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-600 focus:outline-none"
          />
        </div>

        <div className="mt-4">
          <label
            htmlFor="manualDescription"
            className="block text-sm font-medium text-slate-700"
          >
            Manual Brand Description (Optional / Fallback if Website is
            Inaccessible)
          </label>
          <textarea
            id="manualDescription"
            rows={4}
            value={manualDescription}
            onChange={(e) => setManualDescription(e.target.value)}
            placeholder="Provide product details, brand positioning, or campaign context if the website cannot be accessed..."
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-600 focus:outline-none"
          />
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isLoading ? "Analyzing Brand Sources..." : "Analyze Brand"}
          </button>
          {isLoading && (
            <span className="text-xs text-slate-600">
              Extracting public webpage signals and generating structured Brand
              Profile...
            </span>
          )}
        </div>
      </form>

      {errorState && (
        <div
          role="alert"
          className="mb-8 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          <div className="font-semibold">
            Analysis Error ({errorState.code})
          </div>
          <p className="mt-1">{errorState.message}</p>
          {errorState.warnings && errorState.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-red-800">
              {errorState.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {analysisMeta && (
        <section className="mb-8 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">
              2. Extraction & Source Status
            </h2>
            <span className="text-xs text-slate-600">
              Model: <code>{analysisMeta.modelUsed}</code>
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase text-slate-500">
                Website Source
              </div>
              <div className="mt-1 font-medium">
                Status: {analysisMeta.extractionStatus.website.status}
              </div>
              {analysisMeta.extractionStatus.website.extractedTitle && (
                <div className="mt-1 truncate text-xs text-slate-600">
                  Title: {analysisMeta.extractionStatus.website.extractedTitle}
                </div>
              )}
            </div>

            <div className="rounded border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase text-slate-500">
                Facebook Source
              </div>
              <div className="mt-1 font-medium">
                Status: {analysisMeta.extractionStatus.facebook.status}
              </div>
            </div>

            <div className="rounded border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase text-slate-500">
                Manual Fallback
              </div>
              <div className="mt-1 font-medium">
                {analysisMeta.extractionStatus.manualDescriptionProvided
                  ? "Provided"
                  : "Not Provided"}
              </div>
            </div>
          </div>

          {analysisMeta.warnings.length > 0 && (
            <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="font-semibold">Source Extraction Warnings:</div>
              <ul className="mt-1 list-disc pl-5">
                {analysisMeta.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {editableProfile && editableProfile.missingInformation.length > 0 && (
            <div className="mt-3 rounded border border-slate-300 bg-white p-3 text-xs text-slate-700">
              <div className="font-semibold">
                Missing Information Indicators:
              </div>
              <ul className="mt-1 list-disc pl-5">
                {editableProfile.missingInformation.map((m, idx) => (
                  <li key={idx}>{m}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {editableProfile && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                3. Editable Brand Profile (Ready for KOL Matching Pipeline)
              </h2>
              <p className="text-xs text-slate-600">
                Review and edit any field or suggested Thai TikTok search
                keyword below before proceeding to creator discovery.
              </p>
            </div>
            <span
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                profileValidation?.success
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {profileValidation?.success
                ? "Zod Schema Valid"
                : "Schema Validation Error"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Brand Name
              </label>
              <input
                type="text"
                value={editableProfile.brandName ?? ""}
                onChange={(e) => updateScalarField("brandName", e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Industry
              </label>
              <input
                type="text"
                value={editableProfile.industry ?? ""}
                onChange={(e) => updateScalarField("industry", e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Target Market
              </label>
              <input
                type="text"
                value={editableProfile.targetMarket ?? ""}
                onChange={(e) =>
                  updateScalarField("targetMarket", e.target.value)
                }
                className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold uppercase text-slate-600">
              Brand Description
            </label>
            <textarea
              rows={2}
              value={editableProfile.brandDescription ?? ""}
              onChange={(e) =>
                updateScalarField("brandDescription", e.target.value)
              }
              className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold uppercase text-slate-600">
              Target Audience Description (Observed Facts vs. Inferred)
            </label>
            <textarea
              rows={2}
              value={editableProfile.targetAudienceDescription ?? ""}
              onChange={(e) =>
                updateScalarField("targetAudienceDescription", e.target.value)
              }
              className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Product Categories (One per line)
              </label>
              <textarea
                rows={3}
                value={arrayToLines(editableProfile.productCategories)}
                onChange={(e) =>
                  updateArrayField("productCategories", e.target.value)
                }
                className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Key Products or Services (One per line)
              </label>
              <textarea
                rows={3}
                value={arrayToLines(editableProfile.keyProductsOrServices)}
                onChange={(e) =>
                  updateArrayField("keyProductsOrServices", e.target.value)
                }
                className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Brand Tone (One per line)
              </label>
              <textarea
                rows={3}
                value={arrayToLines(editableProfile.brandTone)}
                onChange={(e) => updateArrayField("brandTone", e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Content Themes (One per line)
              </label>
              <textarea
                rows={3}
                value={arrayToLines(editableProfile.contentThemes)}
                onChange={(e) =>
                  updateArrayField("contentThemes", e.target.value)
                }
                className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Ideal Creator Characteristics (One per line)
              </label>
              <textarea
                rows={3}
                value={arrayToLines(
                  editableProfile.idealCreatorCharacteristics
                )}
                onChange={(e) =>
                  updateArrayField(
                    "idealCreatorCharacteristics",
                    e.target.value
                  )
                }
                className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Excluded Creator Characteristics (One per line)
              </label>
              <textarea
                rows={3}
                value={arrayToLines(
                  editableProfile.excludedCreatorCharacteristics
                )}
                onChange={(e) =>
                  updateArrayField(
                    "excludedCreatorCharacteristics",
                    e.target.value
                  )
                }
                className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold uppercase text-slate-600">
              Suggested TikTok Search Keywords (Editable, One per line)
            </label>
            <textarea
              rows={4}
              value={arrayToLines(
                editableProfile.suggestedTikTokSearchKeywords
              )}
              onChange={(e) =>
                updateArrayField(
                  "suggestedTikTokSearchKeywords",
                  e.target.value
                )
              }
              className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 font-mono text-sm"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 text-xs md:grid-cols-2">
            <div className="rounded bg-slate-50 p-3">
              <div className="font-semibold text-slate-800">
                Observed Source Facts (Confidence:{" "}
                {editableProfile.confidenceNotes.overallConfidence})
              </div>
              <ul className="mt-1 list-disc pl-4 text-slate-700">
                {editableProfile.confidenceNotes.observedFacts.map((f, idx) => (
                  <li key={idx}>{f}</li>
                ))}
              </ul>
              <div className="mt-2 font-semibold text-slate-800">
                Inferred Recommendations
              </div>
              <ul className="mt-1 list-disc pl-4 text-slate-700">
                {editableProfile.confidenceNotes.inferredRecommendations.map(
                  (rec, idx) => (
                    <li key={idx}>{rec}</li>
                  )
                )}
              </ul>
              <p className="mt-2 text-slate-600">
                <strong>Rationale:</strong>{" "}
                {editableProfile.confidenceNotes.rationale}
              </p>
            </div>

            <div className="rounded bg-slate-50 p-3">
              <div className="font-semibold text-slate-800">
                Source References
              </div>
              <ul className="mt-1 space-y-2 text-slate-700">
                {editableProfile.sourceReferences.map((ref, idx) => (
                  <li key={idx} className="border-b border-slate-200 pb-1.5">
                    <div>
                      <span className="font-medium uppercase">
                        [{ref.sourceType}]
                      </span>{" "}
                      {ref.url}
                    </div>
                    <div className="text-slate-600">
                      {ref.extractedFactsSummary}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-900">
              View Structured Brand Profile JSON (Current Edited State)
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
              {JSON.stringify(editableProfile, null, 2)}
            </pre>
          </details>
        </section>
      )}
    </div>
  );
}
