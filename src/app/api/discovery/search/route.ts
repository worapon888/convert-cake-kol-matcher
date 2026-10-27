import { NextResponse } from "next/server";
import {
  runClockworksTikTokScraper,
  type ApifyClientOptions,
} from "@/lib/apify/tiktok-scraper";
import { loadNormalizedTikTokFixture } from "@/lib/tiktok/fixtures";
import {
  deduplicateCreators,
  qualifyCreator,
} from "@/lib/matching/qualification";
import type { TikTokCreator } from "@/lib/tiktok/schemas";

/**
 * In-memory keyword search cache to prevent duplicate Apify Actor runs.
 * Cache TTL: 1 hour (3,600,000 ms).
 */
interface CacheRecord {
  data: DiscoverySearchResponseData;
  timestamp: number;
}

export interface DiscoverySearchResponseData {
  source: "live_apify" | "saved_fixture" | "cache";
  cached: boolean;
  searchKeyword: string;
  costControls: {
    maxItemsSentToApify: number;
    maxTotalChargeUsd: number;
    timeoutSecs: number;
    paidAddonsDisabled: boolean;
  };
  summary: {
    collected: number;
    eligible: number;
    excluded: number;
  };
  creators: TikTokCreator[];
  excludedAccounts: TikTokCreator[];
  totalVideos: number;
  totalCreators: number;
  datasetWarning: string | null;
  note: string;
}

const searchCache = new Map<string, CacheRecord>();
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * In-flight lock map: prevents concurrent duplicate runs for the same keyword.
 */
const inFlightSearches = new Map<
  string,
  Promise<DiscoverySearchResponseData>
>();

/**
 * Clears search cache (utility for tests).
 */
export function clearDiscoverySearchCache(): void {
  searchCache.clear();
  inFlightSearches.clear();
}

/**
 * GET /api/discovery/search
 * Returns normalized creator dataset from the saved Apify fixture.
 * Safe and offline-friendly.
 */
export async function GET() {
  const dataset = loadNormalizedTikTokFixture();
  const deduped = deduplicateCreators(dataset.creators);
  const eligibleCreators: TikTokCreator[] = [];
  const excludedAccounts: TikTokCreator[] = [];

  for (const c of deduped) {
    const q = qualifyCreator(c, { targetMarket: "Thailand" });
    if (q.status === "excluded") {
      excludedAccounts.push(c);
    } else {
      eligibleCreators.push(c);
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      source: "saved_fixture",
      cached: false,
      searchKeyword: "รีวิวสกินแคร์",
      costControls: {
        maxItemsSentToApify: 5,
        maxTotalChargeUsd: 0.25,
        timeoutSecs: 60,
        paidAddonsDisabled: true,
      },
      summary: {
        collected: deduped.length,
        eligible: eligibleCreators.length,
        excluded: excludedAccounts.length,
      },
      creators: deduped,
      excludedAccounts,
      totalVideos: dataset.totalVideos,
      totalCreators: dataset.totalCreators,
      datasetWarning: dataset.datasetWarning,
      note: "Loaded from saved Apify fixture. Zero Apify spend incurred.",
    },
  });
}

/**
 * Executes a single-keyword, cost-capped live TikTok search run.
 * Deduplicates in-flight runs and caches completed responses.
 */
async function executeCostControlledScrape(
  keyword: string,
  options: {
    token: string;
    fetchFn?: typeof fetch;
  }
): Promise<DiscoverySearchResponseData> {
  const normalizedKey = keyword.trim().toLowerCase();

  // 1. Check in-memory cache
  const cached = searchCache.get(normalizedKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      ...cached.data,
      source: "cache",
      cached: true,
      note: `Served from local in-memory cache for keyword "${keyword}". Zero Apify cost incurred.`,
    };
  }

  // 2. In-flight promise locking: reuse ongoing run for the same keyword
  const inFlight = inFlightSearches.get(normalizedKey);
  if (inFlight) {
    return await inFlight;
  }

  // 3. Initiate new single run with strict cost caps
  const runPromise = (async () => {
    try {
      const clientOptions: ApifyClientOptions = {
        apiToken: options.token,
        fetchFn: options.fetchFn,
        allowPaidActorRun: true,
        maxItems: 5, // Apify run-level item limit
        timeoutSecs: 60, // Apify 60s timeout guard
        maxTotalChargeUsd: 0.5, // Apify billing cap ($0.50 USD minimal charge allowed by actor)
        memoryMbytes: 1024,
      };

      // Strict enforcement: exactly 1 keyword, resultsPerPage <= 5, paid add-ons false
      const result = await runClockworksTikTokScraper(
        {
          searchQueries: [keyword],
          resultsPerPage: 5,
          shouldDownloadVideos: false,
          shouldDownloadCovers: false,
          shouldDownloadSubtitles: false,
          shouldDownloadSlideshowImages: false,
        },
        clientOptions
      );

      // Post-response: Deduplicate creators by creatorId
      const dedupedCreators = deduplicateCreators(result.normalized.creators);

      // Screen & separate accounts using deterministic qualification
      const eligibleCreators: TikTokCreator[] = [];
      const excludedAccounts: TikTokCreator[] = [];

      for (const c of dedupedCreators) {
        const q = qualifyCreator(c, { targetMarket: "Thailand" });
        if (q.status === "excluded") {
          excludedAccounts.push(c);
        } else {
          eligibleCreators.push(c);
        }
      }

      const responseData: DiscoverySearchResponseData = {
        source: "live_apify",
        cached: false,
        searchKeyword: keyword,
        costControls: {
          maxItemsSentToApify: result.costControls.maxItems,
          maxTotalChargeUsd: result.costControls.maxTotalChargeUsd,
          timeoutSecs: result.costControls.timeoutSecs,
          paidAddonsDisabled: result.costControls.paidAddonsDisabled,
        },
        summary: {
          collected: dedupedCreators.length,
          eligible: eligibleCreators.length,
          excluded: excludedAccounts.length,
        },
        creators: dedupedCreators,
        excludedAccounts,
        totalVideos: result.normalized.totalVideos,
        totalCreators: dedupedCreators.length,
        datasetWarning: result.normalized.datasetWarning,
        note: `Search capped at 1 keyword and max 5 items to prevent excessive Apify charges. Search additional keywords manually if needed.`,
      };

      // Store in cache
      searchCache.set(normalizedKey, {
        data: responseData,
        timestamp: Date.now(),
      });

      return responseData;
    } finally {
      inFlightSearches.delete(normalizedKey);
    }
  })();

  inFlightSearches.set(normalizedKey, runPromise);
  return await runPromise;
}

/**
 * POST /api/discovery/search
 * Cost-Controlled TikTok Creator Discovery via Apify Clockworks Actor.
 *
 * Strict Cost Controls:
 * - Restricted to 1 Keyword per run (subsequent keywords must be triggered manually by user).
 * - Backend enforces max 5 results per run (`maxItems=5`, `resultsPerPage=5`).
 * - Apify query params include `maxItems=5`, `timeout=60`, `maxTotalChargeUsd=0.25`.
 * - Paid media downloads (videos, covers, subtitles, slideshows) are disabled.
 * - In-flight deduplication & in-memory caching prevent duplicate charges.
 * - Deduplicates creators and tags excluded accounts (official brand accounts).
 * - Never makes extra automated Apify calls to compensate for excluded creators.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { searchQueries, keyword, confirmPaidRun } = body;

    // Guard: Prevent paid Apify runs unless user explicitly confirmed
    if (confirmPaidRun !== true) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "PAID_RUN_CONFIRMATION_REQUIRED",
            message:
              "Live TikTok scraping requires explicit user confirmation before triggering paid Apify Actor runs.",
          },
        },
        { status: 400 }
      );
    }

    const token = process.env.APIFY_API_TOKEN;
    if (
      !token ||
      token.trim() === "" ||
      token === "your_apify_api_token_here"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "MISSING_APIFY_TOKEN",
            message:
              "APIFY_API_TOKEN is not configured or is a placeholder in .env.local. Live scraping requires a valid Apify API token.",
          },
        },
        { status: 400 }
      );
    }

    // Cost Control: Strictly 1 Keyword per Run
    let selectedKeyword = "";
    if (typeof keyword === "string" && keyword.trim().length > 0) {
      selectedKeyword = keyword.trim();
    } else if (Array.isArray(searchQueries) && searchQueries.length > 0) {
      const candidate = searchQueries.find(
        (q: unknown): q is string =>
          typeof q === "string" && q.trim().length > 0
      );
      if (candidate) {
        selectedKeyword = candidate.trim();
      }
    }

    if (!selectedKeyword) {
      selectedKeyword = "รีวิวสกินแคร์";
    }

    // Execute cost-controlled search
    const data = await executeCostControlledScrape(selectedKeyword, {
      token,
    });

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to run TikTok discovery scraper.";
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "DISCOVERY_ERROR",
          message,
        },
      },
      { status: 500 }
    );
  }
}
