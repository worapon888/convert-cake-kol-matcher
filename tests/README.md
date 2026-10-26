# Test Suite (`tests/`)

## Implemented Unit & Benchmark Tests (`50` Tests Passing)

1. [`tests/unit/tiktok-normalizer-metrics.test.ts`](unit/tiktok-normalizer-metrics.test.ts) (`18` tests — Step 2):
   - Real Apify `clockworks/tiktok-scraper` 10-video dataset validation and normalization.
   - Exact field mappings, creator grouping with `username` fallback, pure metric formulas, single-video sample guard, `null` metric preservation, and guarded Apify client.

2. [`tests/unit/brand-analyzer.test.ts`](unit/brand-analyzer.test.ts) (`17` tests — Step 3):
   - Brand input validation, URL normalization, SSRF & DNS rebinding protection, website/Facebook extraction error handling, `BrandProfileSchema` validation, mocked OpenAI Responses API (`client.responses.parse` + `zodTextFormat`), and `POST /api/brands/analyze`.

3. [`tests/unit/kol-matching-engine.test.ts`](unit/kol-matching-engine.test.ts) (`15` tests — Step 4):
   - Creator deduplication (`deduplicateCreators`).
   - Deterministic qualification (`qualifyCreator`): eligible creators, official brand account exclusion (`@remo.thailand`, `@etudethailand` with `isAd=false`), explicit review refusal exclusion (`"ไม่รับงานรีวิว"`), unknown account types (`@lsabella5733`, `@thedailypal`), and uncertain Thai-market signals (`@nnampunnn`, `@honestglowup5`).
   - OpenAI `CreatorContentEvaluationSchema` validation and hallucinated `videoId` / `videoUrl` evidence stripping (`validateAndSanitizeContentEvaluation`).
   - Pure TypeScript scoring (`50/20/20/10` weights), logarithmic view/engagement normalization, `0.75x` single-video provisional reliability factor, missing score component `null` handling and coverage discounting, and deterministic tie-breaking.
   - End-to-end `runKOLMatchingPipeline`, `POST /api/matching/evaluate`, `live_ai` failure handling (no silent mock substitution), and verification against the 6 human-labeled benchmark evaluation cases (`getHumanLabeledEvaluationCases`).

## Running All Tests

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```
