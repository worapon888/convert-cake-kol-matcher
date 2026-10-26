import type { BrandProfile } from "@/lib/brand/schemas";
import type { RankedKOLRecommendation } from "@/lib/matching/schemas";

/**
 * Escapes a cell value for safe CSV output:
 * 1. Converts null/undefined to empty string.
 * 2. Neutralizes CSV Formula Injection (=, +, -, @, \t, \r).
 * 3. Encloses in double quotes if it contains commas, double quotes, or newlines.
 * 4. Doubles internal double quotes (" -> "").
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  let str = String(value);

  // Prevent CSV formula injection in spreadsheet software like Excel
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // If cell contains commas, quotes, or newlines, quote the entire field
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates RFC 4180 compliant CSV string with UTF-8 BOM for Excel compatibility with Thai text.
 */
export function generateShortlistCsv(
  brandProfile: BrandProfile,
  shortlist: readonly RankedKOLRecommendation[]
): string {
  const headers = [
    "Rank",
    "Brand Name",
    "Creator Username",
    "Display Name",
    "TikTok Profile URL",
    "Followers",
    "Match Score",
    "Content Fit Score",
    "Market Fit Score",
    "Performance Fit Score",
    "Creator Suitability Score",
    "Matching Explanation",
    "Strengths",
    "Concerns",
    "Confidence Level",
    "Qualification Status",
    "Supporting Video URLs",
    "Sampled Videos Count",
  ];

  const rows = shortlist.map((item) => [
    item.rank,
    brandProfile.brandName || "Brand",
    `@${item.username}`,
    item.displayName,
    item.profileUrl || `https://www.tiktok.com/@${item.username}`,
    item.followers ?? "",
    item.matchScore.toFixed(2),
    item.scoreBreakdown.contentFitScore !== null
      ? item.scoreBreakdown.contentFitScore.toFixed(1)
      : "",
    item.scoreBreakdown.marketFitScore !== null
      ? item.scoreBreakdown.marketFitScore.toFixed(1)
      : "",
    item.scoreBreakdown.performanceFitScore !== null
      ? item.scoreBreakdown.performanceFitScore.toFixed(1)
      : "",
    item.scoreBreakdown.creatorSuitabilityScore !== null
      ? item.scoreBreakdown.creatorSuitabilityScore.toFixed(1)
      : "",
    item.contentFitExplanation || item.contentEvaluation.explanation,
    item.strengths.join("; "),
    item.concerns.join("; "),
    item.confidenceLevel,
    item.qualificationStatus,
    item.supportingVideoUrls.join("; "),
    item.sampledVideosCount,
  ]);

  const csvContent = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\r\n");

  // Prepend UTF-8 BOM (\uFEFF) so Microsoft Excel opens Thai script cleanly
  return `\uFEFF${csvContent}`;
}

/**
 * Triggers a browser file download of the generated CSV.
 */
export function downloadShortlistCsv(
  brandProfile: BrandProfile,
  shortlist: readonly RankedKOLRecommendation[]
): string {
  const csvData = generateShortlistCsv(brandProfile, shortlist);
  const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const rawBrand = brandProfile.brandName || "brand";
  const sanitizedBrand = rawBrand
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\u0E00-\u0E7F]/gi, "_")
    .replace(/_+/g, "_");

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `${sanitizedBrand || "kol"}_creator_shortlist_${dateStr}.csv`;

  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return filename;
}
