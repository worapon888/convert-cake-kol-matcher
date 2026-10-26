import { z } from "zod";
import { normalizeApifyDataset } from "../tiktok/normalizer";
import {
  ApifyTikTokDatasetSchema,
  type ApifyTikTokVideoItem,
  type NormalizedTikTokDataset,
} from "../tiktok/schemas";

export const CLOCKWORKS_TIKTOK_SCRAPER_ACTOR_ID =
  "clockworks/tiktok-scraper" as const;

export const CLOCKWORKS_TIKTOK_SCRAPER_API_SLUG =
  "clockworks~tiktok-scraper" as const;

/**
 * Input configuration schema for Apify Actor `clockworks/tiktok-scraper`.
 *
 * Strict Cost Control Constraints:
 * - Maximum 1 search keyword per scrape run to prevent exponential charges.
 * - Results per page capped at 10 items.
 * - All paid media download add-ons (videos, covers, subtitles, slideshows) are strictly disabled.
 */
export const ClockworksTikTokScraperInputSchema = z.object({
  searchQueries: z
    .array(z.string().min(1))
    .max(1, "Strict cost limit: maximum 1 keyword per search run")
    .optional(),
  hashtags: z.array(z.string().min(1)).optional(),
  profiles: z.array(z.string().min(1)).optional(),
  resultsPerPage: z
    .number()
    .int()
    .min(1)
    .max(10, "Strict cost limit: maximum 10 items per run")
    .default(10),
  shouldDownloadVideos: z.boolean().default(false),
  shouldDownloadCovers: z.boolean().default(false),
  shouldDownloadSubtitles: z.boolean().default(false),
  shouldDownloadSlideshowImages: z.boolean().default(false),
});

export type ClockworksTikTokScraperInput = z.input<
  typeof ClockworksTikTokScraperInputSchema
>;

export interface ApifyClientOptions {
  /** Apify API token. Defaults to `process.env.APIFY_API_TOKEN` on the server. */
  apiToken?: string;
  /** Base URL for Apify v2 REST API. */
  baseUrl?: string;
  /** Custom `fetch` implementation for dependency injection / testing. */
  fetchFn?: typeof fetch;
  /**
   * Explicit safety guard to prevent accidental paid Apify Actor executions.
   * Must be explicitly set to `true` when invoking `runClockworksTikTokScraper`.
   */
  allowPaidActorRun?: boolean;
  /**
   * Hard run-level limit on the number of items output by the Apify run.
   * Passed directly to Apify via query param `maxItems`. Capped at 10.
   */
  maxItems?: number;
  /**
   * Maximum run duration in seconds before Apify kills the run.
   * Passed directly to Apify via query param `timeout`. Capped at 120s.
   */
  timeoutSecs?: number;
  /**
   * Apify Billing Cap: Maximum total dollar charge allowed for this actor run.
   * Passed directly to Apify via query param `maxTotalChargeUsd`. Default $0.50 USD.
   */
  maxTotalChargeUsd?: number;
  /**
   * Memory allocated to the actor in megabytes.
   * Passed directly to Apify via query param `memory`. Default 1024 MB.
   */
  memoryMbytes?: number;
}

export class ApifyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApifyConfigurationError";
  }
}

export class ApifyPaidRunGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApifyPaidRunGuardError";
  }
}

function resolveApifyToken(explicitToken?: string): string {
  const token = explicitToken ?? process.env.APIFY_API_TOKEN ?? "";
  const trimmed = token.trim();
  if (trimmed.length === 0 || trimmed === "your_apify_api_token_here") {
    throw new ApifyConfigurationError(
      "Missing valid APIFY_API_TOKEN. Configure APIFY_API_TOKEN in .env.local or use fixture loading functions instead."
    );
  }
  return trimmed;
}

/**
 * Fetches an already-collected Apify dataset by `datasetId` without triggering a new paid Actor run.
 * Validates the response against `ApifyTikTokDatasetSchema` and returns normalized dataset records.
 */
export async function fetchApifyDatasetById(
  datasetId: string,
  options: Omit<ApifyClientOptions, "allowPaidActorRun"> = {}
): Promise<NormalizedTikTokDataset> {
  const trimmedId = datasetId.trim();
  if (!trimmedId) {
    throw new ApifyConfigurationError(
      "A non-empty Apify datasetId is required."
    );
  }

  const token = resolveApifyToken(options.apiToken);
  const baseUrl = (options.baseUrl ?? "https://api.apify.com/v2").replace(
    /\/+$/,
    ""
  );
  const fetchFn = options.fetchFn ?? fetch;

  const url = `${baseUrl}/datasets/${encodeURIComponent(trimmedId)}/items?clean=true&format=json`;
  const response = await fetchFn(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Apify dataset "${trimmedId}": HTTP ${response.status} ${response.statusText}`
    );
  }

  const rawJson: unknown = await response.json();
  return normalizeApifyDataset(rawJson);
}

/**
 * Prepared module for triggering a live `clockworks/tiktok-scraper` Actor run and returning normalized items.
 *
 * IMPORTANT SAFETY GUARD:
 * Paid Actor runs are disabled by default (`allowPaidActorRun: false`).
 * Calling this function without `{ allowPaidActorRun: true }` throws `ApifyPaidRunGuardError`
 * so paid runs are never triggered automatically during development, builds, or tests.
 */
export interface ApifyRunCostControls {
  maxItems: number;
  timeoutSecs: number;
  maxTotalChargeUsd: number;
  memoryMbytes: number;
  paidAddonsDisabled: boolean;
}

export async function runClockworksTikTokScraper(
  input: ClockworksTikTokScraperInput,
  options: ApifyClientOptions = {}
): Promise<{
  rawItems: ApifyTikTokVideoItem[];
  normalized: NormalizedTikTokDataset;
  costControls: ApifyRunCostControls;
}> {
  if (options.allowPaidActorRun !== true) {
    throw new ApifyPaidRunGuardError(
      `Live execution of Apify Actor "${CLOCKWORKS_TIKTOK_SCRAPER_ACTOR_ID}" is blocked by default to prevent unintended paid Actor runs. Use fixture loaders for offline/assessment workflows, or pass { allowPaidActorRun: true } explicitly when live scraping is intended.`
    );
  }

  // Enforce strict limits: 1 keyword max, resultsPerPage <= 10, paid add-ons disabled
  const queryList =
    input.searchQueries && input.searchQueries.length > 0
      ? [input.searchQueries[0].trim()]
      : undefined;

  const sanitizedInput: ClockworksTikTokScraperInput = {
    ...input,
    searchQueries: queryList,
    resultsPerPage: Math.min(input.resultsPerPage ?? 10, 10),
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
  };

  const validatedInput =
    ClockworksTikTokScraperInputSchema.parse(sanitizedInput);
  const token = resolveApifyToken(options.apiToken);
  const baseUrl = (options.baseUrl ?? "https://api.apify.com/v2").replace(
    /\/+$/,
    ""
  );
  const fetchFn = options.fetchFn ?? fetch;

  // Run-level cost caps passed directly to Apify REST API
  const maxItems = Math.min(options.maxItems ?? 10, 10);
  const timeoutSecs = Math.min(options.timeoutSecs ?? 60, 120);
  const maxTotalChargeUsd = Math.min(options.maxTotalChargeUsd ?? 0.5, 1.0);
  const memoryMbytes = options.memoryMbytes ?? 1024;

  const queryParams = new URLSearchParams({
    clean: "true",
    format: "json",
    maxItems: String(maxItems),
    timeout: String(timeoutSecs),
    maxTotalChargeUsd: maxTotalChargeUsd.toFixed(2),
    memory: String(memoryMbytes),
  });

  const url = `${baseUrl}/acts/${CLOCKWORKS_TIKTOK_SCRAPER_API_SLUG}/run-sync-get-dataset-items?${queryParams.toString()}`;
  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(validatedInput),
  });

  if (!response.ok) {
    throw new Error(
      `Apify Actor "${CLOCKWORKS_TIKTOK_SCRAPER_ACTOR_ID}" run failed: HTTP ${response.status} ${response.statusText}`
    );
  }

  const rawJson: unknown = await response.json();
  const rawItems = ApifyTikTokDatasetSchema.parse(rawJson);
  const normalized = normalizeApifyDataset(rawItems);

  return {
    rawItems,
    normalized,
    costControls: {
      maxItems,
      timeoutSecs,
      maxTotalChargeUsd,
      memoryMbytes,
      paidAddonsDisabled: true,
    },
  };
}
