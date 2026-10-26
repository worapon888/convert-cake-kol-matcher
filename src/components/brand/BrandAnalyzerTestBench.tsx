"use client";

import React, { useMemo, useState } from "react";
import { buildControlledBrandAnalysisResult } from "@/lib/brand/fixtures";
import {
  type BrandAnalysisResult,
  type BrandProfile,
  BrandProfileSchema,
} from "@/lib/brand/schemas";
import type {
  KOLMatchingResult,
  MatchingDataSourceMode,
  MatchingExecutionMode,
} from "@/lib/matching/schemas";

function parseLinesToArray(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function arrayToLines(items: string[]): string {
  return items.join("\n");
}

function formatScore(val: number | null): string {
  return val === null ? "null (missing)" : val.toFixed(1);
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

  // Step 4 Matching State
  const [matchingDataSource, setMatchingDataSource] =
    useState<MatchingDataSourceMode>("fixture");
  const [matchingExecutionMode, setMatchingExecutionMode] =
    useState<MatchingExecutionMode>("fixture_mock");
  const [matchingLimit, setMatchingLimit] = useState<number>(10);
  const [isMatchingLoading, setIsMatchingLoading] = useState(false);
  const [matchingError, setMatchingError] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [matchingResult, setMatchingResult] =
    useState<KOLMatchingResult | null>(null);

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

  async function handleRunMatching() {
    if (!editableProfile || !profileValidation?.success) return;
    setIsMatchingLoading(true);
    setMatchingError(null);

    try {
      const response = await fetch("/api/matching/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandProfile: editableProfile,
          dataSource: matchingDataSource,
          executionMode: matchingExecutionMode,
          limit: matchingLimit,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setMatchingError({
          code: payload?.error?.code ?? `HTTP_${response.status}`,
          message:
            payload?.error?.message ?? "Failed to run KOL matching evaluation.",
        });
        return;
      }

      setMatchingResult(payload.data as KOLMatchingResult);
    } catch (err) {
      setMatchingError({
        code: "NETWORK_ERROR",
        message:
          err instanceof Error
            ? err.message
            : "Could not reach /api/matching/evaluate.",
      });
    } finally {
      setIsMatchingLoading(false);
    }
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
    <div className="mx-auto max-w-6xl px-4 py-8 text-slate-900">
      <header className="mb-8 border-b border-slate-200 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="inline-block rounded bg-slate-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
              Step 3 & Step 4 Test Interface
            </span>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              Convert Cake — AI Brand Analyzer & KOL Matching Engine
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Extract or edit a structured Brand Profile, then evaluate and rank
              real TikTok creator fixtures using deterministic qualification and
              scoring.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLoadControlledFixture}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Load Controlled Brand Fixture (Offline Preview)
          </button>
        </div>
      </header>

      <form
        onSubmit={handleAnalyzeSubmit}
        className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-xs"
      >
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          1. Brand Source Inputs (Step 3)
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
            rows={3}
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
            {isLoading
              ? "Analyzing Brand Sources..."
              : "Analyze Brand (Live OpenAI)"}
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
        </section>
      )}

      {editableProfile && (
        <>
          <section className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  3. Editable Brand Profile
                </h2>
                <p className="text-xs text-slate-600">
                  Review and edit any field below; changes are passed directly
                  into the Step 4 KOL Matching Engine.
                </p>
              </div>
              <span
                className={`rounded px-2.5 py-1 text-xs font-medium ${
                  profileValidation?.success
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-red-200 bg-red-50 text-red-800"
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
                  onChange={(e) =>
                    updateScalarField("brandName", e.target.value)
                  }
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
                  onChange={(e) =>
                    updateScalarField("industry", e.target.value)
                  }
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
                  rows={2}
                  value={arrayToLines(editableProfile.brandTone)}
                  onChange={(e) =>
                    updateArrayField("brandTone", e.target.value)
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">
                  Suggested TikTok Search Keywords (One per line)
                </label>
                <textarea
                  rows={2}
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
            </div>
          </section>

          <section className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
            <h2 className="text-base font-semibold text-slate-900">
              4. Step 4 — AI TikTok KOL Matching & Ranking Engine
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Run Creator Qualification, Content Relevance Evaluation, and
              Deterministic Weighted Ranking against the normalized Apify TikTok
              fixtures.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label
                  htmlFor="matchingExecutionMode"
                  className="block text-xs font-semibold uppercase text-slate-600"
                >
                  Evaluation Execution Mode
                </label>
                <select
                  id="matchingExecutionMode"
                  value={matchingExecutionMode}
                  onChange={(e) =>
                    setMatchingExecutionMode(
                      e.target.value as MatchingExecutionMode
                    )
                  }
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="fixture_mock">
                    fixture_mock (Offline Test Evaluations — 0 API Cost)
                  </option>
                  <option value="live_ai">
                    live_ai (Live OpenAI Evaluation — Uses API Credits)
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="matchingDataSource"
                  className="block text-xs font-semibold uppercase text-slate-600"
                >
                  TikTok Dataset Fixture
                </label>
                <select
                  id="matchingDataSource"
                  value={matchingDataSource}
                  onChange={(e) =>
                    setMatchingDataSource(
                      e.target.value as MatchingDataSourceMode
                    )
                  }
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="fixture">
                    Primary Apify Fixture (10 Creators)
                  </option>
                  <option value="fixture_batch2">
                    Batch 2 Apify Fixture (10 Creators)
                  </option>
                  <option value="fixture_combined">
                    Combined Fixtures (20 Creators)
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="matchingLimit"
                  className="block text-xs font-semibold uppercase text-slate-600"
                >
                  Max Ranked Recommendations
                </label>
                <input
                  id="matchingLimit"
                  type="number"
                  min={1}
                  max={20}
                  value={matchingLimit}
                  onChange={(e) =>
                    setMatchingLimit(
                      Math.min(20, Math.max(1, Number(e.target.value) || 10))
                    )
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                disabled={isMatchingLoading || !profileValidation?.success}
                onClick={handleRunMatching}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {isMatchingLoading
                  ? "Evaluating & Ranking Creators..."
                  : "Run Matching"}
              </button>
              <span className="text-xs text-slate-600">
                Weights: Content Fit 50% | Market Fit 20% | Performance Fit 20%
                | Suitability 10%
              </span>
            </div>

            {matchingError && (
              <div
                role="alert"
                className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
              >
                <strong>Matching Error ({matchingError.code}):</strong>{" "}
                {matchingError.message}
              </div>
            )}

            {matchingResult && (
              <div className="mt-6 space-y-6 border-t border-slate-200 pt-5">
                <div className="rounded border border-slate-200 bg-slate-50 p-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-slate-900">
                      Matching Run Summary (Algorithm{" "}
                      <code>{matchingResult.metadata.algorithmVersion}</code>)
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 font-semibold ${
                        matchingResult.metadata.isOfflineDemoOutput
                          ? "bg-amber-100 text-amber-900"
                          : "bg-emerald-100 text-emerald-900"
                      }`}
                    >
                      {matchingResult.metadata.isOfflineDemoOutput
                        ? "Offline Demo / Fixture Evaluation"
                        : `Live AI (${matchingResult.metadata.llmModelUsed})`}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-slate-700">
                    <span>
                      Evaluated:{" "}
                      <strong>
                        {matchingResult.metadata.totalCandidatesEvaluated}
                      </strong>
                    </span>
                    <span>
                      Recommended:{" "}
                      <strong>
                        {matchingResult.metadata.recommendedCount}
                      </strong>
                    </span>
                    <span>
                      Excluded:{" "}
                      <strong>{matchingResult.metadata.excludedCount}</strong>
                    </span>
                    <span>
                      Requires Manual Review:{" "}
                      <strong>
                        {matchingResult.metadata.manualReviewCount}
                      </strong>
                    </span>
                  </div>

                  {matchingResult.metadata.globalWarnings.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-amber-900">
                      {matchingResult.metadata.globalWarnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-900">
                    Ranked Creator Recommendations (
                    {matchingResult.recommendations.length})
                  </h3>

                  <div className="space-y-4">
                    {matchingResult.recommendations.map((rec) => (
                      <div
                        key={rec.creatorId}
                        className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
                                #{rec.rank}
                              </span>
                              <span className="font-semibold text-slate-900">
                                {rec.displayName}
                              </span>
                              <span className="text-xs text-slate-500">
                                (@{rec.username})
                              </span>
                              <span
                                className={`rounded px-2 py-0.5 text-xs font-medium ${
                                  rec.qualificationStatus === "eligible"
                                    ? "bg-emerald-50 text-emerald-800"
                                    : "bg-amber-50 text-amber-800"
                                }`}
                              >
                                {rec.qualificationStatus}
                              </span>
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                                Confidence: {rec.confidenceLevel}
                              </span>
                              {rec.requiresManualReview && (
                                <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                                  Manual Review Required
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-600">
                              <span>
                                Followers:{" "}
                                {rec.followers !== null
                                  ? rec.followers.toLocaleString()
                                  : "null"}
                              </span>
                              <span>
                                Sampled Videos: {rec.sampledVideosCount}
                              </span>
                              <span>
                                Single-Video Views:{" "}
                                {rec.medianViews !== null
                                  ? rec.medianViews.toLocaleString()
                                  : "null"}
                              </span>
                              <span>
                                Single-Video ER:{" "}
                                {rec.averageEngagementRate !== null
                                  ? `${(rec.averageEngagementRate * 100).toFixed(2)}%`
                                  : "null"}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xl font-bold text-slate-900">
                              {rec.matchScore.toFixed(1)}{" "}
                              <span className="text-xs font-normal text-slate-500">
                                / 100
                              </span>
                            </div>
                            <div className="text-xs text-slate-500">
                              Coverage:{" "}
                              {Math.round(
                                rec.scoreBreakdown.observedWeightCoverage * 100
                              )}
                              %
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 rounded bg-slate-50 p-2.5 text-xs md:grid-cols-4">
                          <div>
                            <span className="text-slate-500">
                              Content Fit (50%):
                            </span>{" "}
                            <strong>
                              {formatScore(rec.scoreBreakdown.contentFitScore)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-500">
                              Market Fit (20%):
                            </span>{" "}
                            <strong>
                              {formatScore(rec.scoreBreakdown.marketFitScore)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-500">
                              Performance (20%):
                            </span>{" "}
                            <strong>
                              {formatScore(
                                rec.scoreBreakdown.performanceFitScore
                              )}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-500">
                              Suitability (10%):
                            </span>{" "}
                            <strong>
                              {formatScore(
                                rec.scoreBreakdown.creatorSuitabilityScore
                              )}
                            </strong>
                          </div>
                        </div>

                        <p className="mt-3 text-xs text-slate-700">
                          {rec.contentFitExplanation}
                        </p>

                        <div className="mt-3 grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
                          <div>
                            <div className="font-semibold text-emerald-900">
                              Strengths
                            </div>
                            <ul className="mt-1 list-disc pl-4 text-slate-700">
                              {rec.strengths.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <div className="font-semibold text-amber-900">
                              Concerns & Warnings
                            </div>
                            <ul className="mt-1 list-disc pl-4 text-slate-700">
                              {rec.concerns.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                              {rec.missingDataWarnings.map((mw, i) => (
                                <li key={`mw-${i}`} className="text-amber-800">
                                  {mw}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-2 text-xs">
                          {rec.profileUrl && (
                            <a
                              href={rec.profileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-blue-700 underline hover:text-blue-900"
                            >
                              Open TikTok Profile (@{rec.username})
                            </a>
                          )}
                          {rec.supportingVideoUrls.map((vUrl, idx) => (
                            <a
                              key={idx}
                              href={vUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-blue-700 underline hover:text-blue-900"
                            >
                              Open Sampled Video #{idx + 1}
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {matchingResult.excludedCreators.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">
                      Auditable Excluded Candidates (
                      {matchingResult.excludedCreators.length})
                    </h3>
                    <div className="space-y-2">
                      {matchingResult.excludedCreators.map((ex) => (
                        <div
                          key={ex.creatorId}
                          className="rounded border border-red-200 bg-red-50/50 p-3 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <strong>{ex.displayName}</strong> (@{ex.username})
                              — Account Type:{" "}
                              <code>{ex.qualification.accountType}</code>
                            </div>
                            {ex.profileUrl && (
                              <a
                                href={ex.profileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-700 underline"
                              >
                                View Profile
                              </a>
                            )}
                          </div>
                          <p className="mt-1 text-red-900">
                            {ex.exclusionSummary}
                          </p>
                          <div className="mt-1 text-slate-600">
                            Reason Codes:{" "}
                            <code>
                              {ex.qualification.reasonCodes.join(", ")}
                            </code>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
