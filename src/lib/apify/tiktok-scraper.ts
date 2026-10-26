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
 */
export const ClockworksTikTokScraperInputSchema = z.object({
  searchQueries: z.array(z.string().min(1)).optional(),
  hashtags: z.array(z.string().min(1)).optional(),
  profiles: z.array(z.string().min(1)).optional(),
  resultsPerPage: z.number().int().min(1).max(100).default(10),
  shouldDownloadVideos: z.boolean().default(false),
  shouldDownloadCovers: z.boolean().default(false),
  shouldDownloadSubtitles: z.boolean().default(false),
  shouldDownloadSlideshowImages: z.boolean().default(false),
});

export type ClockworksTikTokScraperInput = z.infer<
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
export async function runClockworksTikTokScraper(
  input: ClockworksTikTokScraperInput,
  options: ApifyClientOptions = {}
): Promise<{
  rawItems: ApifyTikTokVideoItem[];
  normalized: NormalizedTikTokDataset;
}> {
  if (options.allowPaidActorRun !== true) {
    throw new ApifyPaidRunGuardError(
      `Live execution of Apify Actor "${CLOCKWORKS_TIKTOK_SCRAPER_ACTOR_ID}" is blocked by default to prevent unintended paid Actor runs. Use fixture loaders for offline/assessment workflows, or pass { allowPaidActorRun: true } explicitly when live scraping is intended.`
    );
  }

  const validatedInput = ClockworksTikTokScraperInputSchema.parse(input);
  const token = resolveApifyToken(options.apiToken);
  const baseUrl = (options.baseUrl ?? "https://api.apify.com/v2").replace(
    /\/+$/,
    ""
  );
  const fetchFn = options.fetchFn ?? fetch;

  const url = `${baseUrl}/acts/${CLOCKWORKS_TIKTOK_SCRAPER_API_SLUG}/run-sync-get-dataset-items?clean=true&format=json`;
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
  };
}
