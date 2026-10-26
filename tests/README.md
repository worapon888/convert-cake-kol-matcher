# Test Suite (`tests/`)

## Implemented Unit Tests (`Step 2`)

- [`tests/unit/tiktok-normalizer-metrics.test.ts`](unit/tiktok-normalizer-metrics.test.ts) — `18` unit tests covering:
  1. Real Apify `clockworks/tiktok-scraper` 10-video dataset validation (`apify-tiktok-raw.json` & `apify-tiktok-raw-batch2.json`) and synchronization with `normalized-tiktok-fixture.json`.
  2. Exact field mapping (`id` → `videoId`, `text` → `caption`, `webVideoUrl` → `videoUrl`, `authorMeta.id` → `creatorId`, `authorMeta.name` → `username`, `authorMeta.profileUrl` → `profileUrl`, `authorMeta.fans` → `followers`, `playCount` → `views`, `diggCount` → `likes`, `commentCount` → `comments`, `shareCount` → `shares`, `createTimeISO` → `publishedAt`, `hashtags[].name` → `hashtags`).
  3. Grouping videos by `creatorId` with fallback to `username` when a stable ID is missing/empty.
  4. Pure metric calculation functions (`calculateEngagementRateByViews`, `calculateMedianViews`, `calculateAverageEngagementRate`, `calculateSampledVideoCount`, `calculateDataCompleteness`).
  5. Data-quality rules (single-video sample representativeness guard, `null` preservation for missing metrics, `audienceDemographics: null`, `isAd` retention, and `accountTypeReviewStatus` manual review separation).
  6. Guarded Apify client (`ApifyPaidRunGuardError` preventing automatic paid Actor runs, `ApifyConfigurationError`, and mocked dataset fetching).

## Planned Tests (`TODO`)

- `TODO`: AI brand analysis and structured output validation tests (Step 3)
- `TODO`: End-to-end KOL matching and ranking evaluation tests (Step 3/4)

## Running Tests

```bash
pnpm test
pnpm lint
pnpm typecheck
```
