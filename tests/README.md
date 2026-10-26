# Test Suite (`tests/`)

## Implemented Unit Tests (`35` Tests Passing)

### 1. Step 2 — TikTok Data Normalization & Creator Metrics

- [`tests/unit/tiktok-normalizer-metrics.test.ts`](unit/tiktok-normalizer-metrics.test.ts) (`18` tests):
  - Real Apify `clockworks/tiktok-scraper` 10-video dataset validation (`apify-tiktok-raw.json` & `apify-tiktok-raw-batch2.json`) and synchronization with `normalized-tiktok-fixture.json`.
  - Exact field mappings (`id` → `videoId`, `text` → `caption`, `webVideoUrl` → `videoUrl`, `authorMeta.id` → `creatorId`, `authorMeta.name` → `username`, `authorMeta.profileUrl` → `profileUrl`, `authorMeta.fans` → `followers`, `playCount` → `views`, `diggCount` → `likes`, `commentCount` → `comments`, `shareCount` → `shares`, `createTimeISO` → `publishedAt`, `hashtags[].name` → `hashtags`).
  - Grouping videos by `creatorId` with fallback to `username` when a stable ID is missing/empty.
  - Pure metric calculation functions (`calculateEngagementRateByViews`, `calculateMedianViews`, `calculateAverageEngagementRate`, `calculateSampledVideoCount`, `calculateDataCompleteness`).
  - Data-quality rules (single-video sample representativeness guard, `null` preservation for missing metrics, `audienceDemographics: null`, `isAd` retention, and `accountTypeReviewStatus` manual review separation).
  - Guarded Apify client (`ApifyPaidRunGuardError` preventing automatic paid Actor runs, `ApifyConfigurationError`, and mocked dataset fetching).

### 2. Step 3 — AI Brand Analyzer (OpenAI Responses API + Structured Outputs)

- [`tests/unit/brand-analyzer.test.ts`](unit/brand-analyzer.test.ts) (`17` tests):
  - Brand input validation (`BrandAnalysisRequestSchema`), default `"Thailand"` target market, and manual description fallback.
  - URL normalization and SSRF protection (`validateAndNormalizePublicUrl`, `assertHostnameResolvesToPublicIp`, blocking `localhost`, private IPs, `169.254.169.254` metadata endpoints, non-HTTP schemes, embedded credentials, and unsafe redirects).
  - Website HTML signal extraction (`parseHtmlBrandSignals`) and error handling for inaccessible websites and restricted Facebook login walls.
  - `BrandProfileSchema` Zod validation, `null` / `[]` handling for unsupported fields, and `InsufficientBrandSourcesError` when all sources fail without manual fallback.
  - Mocked OpenAI Responses API (`client.responses.parse` + `zodTextFormat`) structured output parsing, model capability verification (`doesModelSupportStructuredOutputs`), and refusal/error handling without making paid API calls.
  - Controlled end-to-end local fixture analysis (`analyzeBrandSources`) and `POST /api/brands/analyze` route validation.

## Planned Tests (`TODO`)

- `TODO`: KOL matching, scoring, and ranking evaluation tests (Step 4)

## Running Tests

```bash
pnpm test
pnpm lint
pnpm typecheck
```
