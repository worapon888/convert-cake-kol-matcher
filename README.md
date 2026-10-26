# Convert Cake KOL Matcher

**AI-powered TikTok KOL discovery, brand analysis, and influencer matching platform for the Thai market.**

> **Assessment Progress Notice (7-Day AI Engineer Assessment — Convert Cake)**
>
> - **Step 1 (Completed):** Project scaffold, Next.js App Router, strict TypeScript, ESLint, Prettier, Husky pre-commit hooks.
> - **Step 2 (Completed — `f7681f6`):** Real Apify (`clockworks/tiktok-scraper`) Zod schemas, data normalization (`TikTokVideo`, `TikTokCreator`, `CreatorMetrics`), pure metric calculation functions, fixture loaders, and guarded Apify client module.
> - **Step 3 (Completed — `530df09`):** AI Brand Analyzer with SSRF-protected website content extraction, best-effort Facebook Page extraction, manual description fallback, OpenAI Responses API + Structured Outputs (`BrandProfileSchema`), and `POST /api/brands/analyze`.
> - **Step 4 (Completed):** AI TikTok KOL Matching & Ranking Engine with deterministic Creator Qualification, OpenAI Content Fit Evaluator with evidence verification, pure TypeScript weighted scoring (`50/20/20/10`), missing-data coverage policy, single-video sample safeguards, `POST /api/matching/evaluate`, human-labeled benchmark cases, and `50/50` passing unit tests.
> - **Pending (`TODO` — Step 5):** Final polished production dashboard, advanced filtering, analytics charts, and CSV export.

---

## Table of Contents

1. [Project Overview & Business Problem](#1-project-overview--business-problem)
2. [Features & Implementation Status](#2-features--implementation-status)
3. [System Architecture & Matching Pipeline](#3-system-architecture--matching-pipeline)
4. [Step 4 — KOL Matching & Ranking Engine Specification](#4-step-4--kol-matching--ranking-engine-specification)
5. [Step 3 — AI Brand Analyzer Specification](#5-step-3--ai-brand-analyzer-specification)
6. [Step 2 — TikTok Data Schema, Field Mapping & Metric Formulas](#6-step-2--tiktok-data-schema-field-mapping--metric-formulas)
7. [API Reference (`POST /api/brands/analyze` & `POST /api/matching/evaluate`)](#7-api-reference-post-apibrandsanalyze--post-apimatchingevaluate)
8. [Prerequisites, Installation & Environment Variables](#8-prerequisites-installation--environment-variables)
9. [Testing, Evaluation Benchmark & Controlled Live Execution](#9-testing-evaluation-benchmark--controlled-live-execution)
10. [Known Limitations, Potential Biases & Security Safeguards](#10-known-limitations-potential-biases--security-safeguards)

---

## 1. Project Overview & Business Problem

Marketing teams and agencies in Thailand face three recurring challenges when selecting TikTok Key Opinion Leaders (KOLs):

1. **Unstructured Brand Briefs:** Campaign managers start from a brand URL or product page and need structured positioning criteria and Thai TikTok discovery keywords.
2. **Noisy Candidate Pools:** Search results mix independent creators with official brand storefronts (e.g., `@remo.thailand`, `@etudethailand`), retail curators (`@thedailypal`), creators who do not accept sponsored work (`"ไม่รับงานรีวิว"`), or non-Thai language creators (`textLanguage="my"`).
3. **Single-Video & Vanity Metric Traps:** Raw follower counts and single viral videos can distort rankings if treated as representative creator-level averages.

**Convert Cake KOL Matcher** addresses these challenges by separating **deterministic qualification and quantitative scoring** (in pure TypeScript) from **semantic content fit evaluation** (via OpenAI Structured Outputs with strict evidence verification).

---

## 2. Features & Implementation Status

| Step       | Component                                                                   | Status        | Module / Location                                                                                                            |
| ---------- | --------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Step 1** | Next.js App Router, Strict TS, ESLint, Prettier, Husky                      | `Implemented` | [`package.json`](package.json), [`.husky/pre-commit`](.husky/pre-commit)                                                     |
| **Step 2** | Apify `clockworks/tiktok-scraper` Schemas, Normalizer & Pure Metrics        | `Implemented` | [`src/lib/tiktok/`](src/lib/tiktok/), [`src/lib/apify/tiktok-scraper.ts`](src/lib/apify/tiktok-scraper.ts)                   |
| **Step 3** | SSRF Guard, Website/FB Extractor, OpenAI Brand Analyzer & API               | `Implemented` | [`src/lib/brand/`](src/lib/brand/), [`src/app/api/brands/analyze/route.ts`](src/app/api/brands/analyze/route.ts)             |
| **Step 4** | Creator Qualification, AI Content Fit Evaluator, Deterministic Scorer & API | `Implemented` | [`src/lib/matching/`](src/lib/matching/), [`src/app/api/matching/evaluate/route.ts`](src/app/api/matching/evaluate/route.ts) |
| **Step 4** | Minimal Step 3 + Step 4 Test Interface                                      | `Implemented` | [`src/components/brand/BrandAnalyzerTestBench.tsx`](src/components/brand/BrandAnalyzerTestBench.tsx)                         |
| **Step 5** | Final Production Dashboard, Filters & Export                                | `TODO`        | Planned for Step 5                                                                                                           |

---

## 3. System Architecture & Matching Pipeline

See [`docs/architecture.md`](docs/architecture.md) for the complete system architecture.

```text
BrandProfile (Step 3)  +  Normalized TikTok Dataset (Step 2)
                             |
                             v
            1. Creator Deduplication & Qualification
               (src/lib/matching/qualification.ts)
               -> Separates `excluded` (brand accounts / review refusals)
                  from `eligible` and `needs_review`
                             |
                             v
            2. AI Content Relevance Evaluation
               (src/lib/matching/content-evaluator.ts)
               -> OpenAI Responses API + Structured Outputs (or `fixture_mock`)
               -> Verifies cited videoId / videoUrl against actual input
                             |
                             v
            3. Deterministic Score Calculation
               (src/lib/matching/scoring.ts)
               -> 50% Content Fit | 20% Market Fit | 20% Performance Fit | 10% Suitability
               -> Applies 0.75x single-video provisional cap & missing-data coverage factor
                             |
                             v
            4. Deterministic Ranking + Evidence + Confidence
               (src/lib/matching/engine.ts)
               -> Returns `recommendations` + auditable `excludedCreators`
```

---

## 4. Step 4 — KOL Matching & Ranking Engine Specification

### 4.1 Deterministic Creator Qualification (`src/lib/matching/qualification.ts`)

Evaluates each deduplicated creator before AI scoring and returns `status` (`eligible` | `needs_review` | `excluded`), `accountType` (`individual_creator` | `brand_account` | `unknown`), `collaborationAvailability` (`open_to_collab` | `restricted` | `unknown`), `marketRelevance` (`relevant` | `uncertain` | `not_observed`), `reasonCodes`, `evidence`, and `manualReviewRequired`:

- **Brand-Owned Account Detection (`excluded`):**
  - Never inferred from `isAd` (`@etudethailand` has `isAd=false` yet is an official brand account, while individual creators like `@zzdaozz` have `isAd=true`).
  - Uses explicit profile declarations (`"ช่องบริษัท"`, `"Official TikTok"`, `"OFFICIAL STORE"`, or manual override) to classify `accountType: "brand_account"` and exclude from independent creator rankings while retaining in `excludedCreators`.
  - Ambiguous retail/importer/curator profiles (`@thedailypal`, `@thirisxstore`) are marked `needs_review` with `AMBIGUOUS_STORE_OR_CURATOR_HANDLE`.
- **Collaboration Restrictions (`excluded` vs. `open_to_collab` vs. `unknown`):**
  - Profiles explicitly refusing paid reviews (`"ไม่รับงานรีวิว"`, `"งดรับงาน"`, `"ไม่รับสปอน"`) are classified as `restricted` and `excluded`.
  - Profiles with explicit work contact (`"ติดต่องาน"`, `"For work"`, `"Working ID line"`) are classified as `open_to_collab`.
  - Profiles with empty/null bio (`@lsabella5733`) or no collaboration statement are classified as `unknown` (`needs_review`) — never assumed open to collaboration.
- **Thai Market Relevance:**
  - Evaluates Thai script (`[\u0E00-\u0E7F]`) in captions, hashtags, and bios alongside `textLanguage`.
  - Treats language as a content-level market signal, **never** verified follower geography.
  - Non-Thai or uncertain language profiles (`@honestglowup5` with `textLanguage="my"`, `@nnampunnn` with `textLanguage="un"`) are marked `uncertain` / `not_observed` (`needs_review`), not silently fabricated or auto-excluded.

### 4.2 OpenAI Content Fit Evaluator & Evidence Verification (`src/lib/matching/content-evaluator.ts`)

- Uses `client.responses.parse` + `zodTextFormat(CreatorContentEvaluationSchema, "creator_content_evaluation")`.
- Evaluates 4 rubric dimensions (`categoryRelevanceScore`, `productRelevanceScore`, `contentStyleScore`, `marketFitScore`), plus `strengths`, `concerns`, `explanation`, `supportingEvidence`, `missingEvidence`, and `confidenceLevel`.
- **Anti-Hallucination Evidence Guard (`validateAndSanitizeContentEvaluation`):** Validates every `supportingEvidence` item's `videoId` and `videoUrl` against the creator's actual sampled videos. Any unsupported reference is stripped with an explicit warning.
- **No Vision / Transcript Usage:** Evaluates strictly public profile metadata, bios, captions, and hashtags without `aiVideoDescription`, video downloads, or transcripts.

### 4.3 Deterministic Scoring Formula & Missing-Data Policy (`src/lib/matching/scoring.ts`)

OpenAI evaluates semantic relevance; **pure TypeScript** computes all normalized component scores and the final weighted ranking score.

#### Initial MVP Weights (Configurable)

| Dimension                                    | Default Weight ($w_d$) | Source & Formula                                                                                                     |
| -------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Content Fit ($S\_{\text{content}}$)**      | `50%` (`0.50`)         | $0.40 \cdot \text{CategoryRelevance} + 0.35 \cdot \text{ProductRelevance} + 0.25 \cdot \text{ContentStyle}$          |
| **Market Fit ($S\_{\text{market}}$)**        | `20%` (`0.20`)         | $0.50 \cdot S_{\text{marketSignal}} + 0.50 \cdot S_{\text{aiMarketFit}}$ (`null` if unobserved)                      |
| **Performance Fit ($S\_{\text{perf}}$)**     | `20%` (`0.20`)         | $\alpha_{\text{sample}} \cdot (0.60 \cdot S_{\text{ER}} + 0.40 \cdot S_{\text{views}})$ (`null` if views/ER missing) |
| **Creator Suitability ($S\_{\text{suit}}$)** | `10%` (`0.10`)         | `95` (`open_to_collab` creator), `70` (handle ambiguity), `45` (unconfirmed), `null` (missing bio)                   |

#### Outlier-Resistant Performance Subscores & Single-Video Reliability Cap

1. **Log-Saturating Engagement Score ($S\_{\text{ER}} \in [0, 100]$):**
   $$S_{\text{ER}} = \min\left(100, \max\left(0, \frac{\ln(1 + 100 \cdot \text{ER})}{\ln(1 + 15)} \times 100\right)\right)$$
   Prevents extreme single-post viral engagement (e.g., `21%`) from linearly dwarfing normal strong engagement (`3%–8%`).
2. **Log10 View Reach Score ($S\_{\text{views}} \in [0, 100]$):**
   $$S_{\text{views}} = \min\left(100, \max\left(0, \frac{\log_{10}(\max(\text{medianViews}, 100)) - 2}{\log_{10}(5,000,000) - 2} \times 100\right)\right)$$
   Uses `medianViews` (never raw follower count as a linear factor).
3. **Single-Video Provisional Cap ($\alpha\_{\text{sample}}$):**
   Because every creator in the current 10-video fixture has only `1` sampled video (`sampledVideosCount = 1`), $\alpha_{\text{sample}} = 0.75$ (`isProvisionalSingleVideo = true`, compared to `0.88` for 2 videos and `1.00` for $\ge 3$ videos), and overall `confidenceLevel` is capped at `"medium"`.

#### Missing-Data Policy

- Missing dimensions remain `null` in `scoreBreakdown` and are listed in `missingComponents` (never treated as `0` and never fabricated).
- Let $O = \{ d \mid S_d \neq \text{null} \}$ and $\text{Coverage} = \sum_{d \in O} w_d$:
  $$\text{RawWeightedScore} = \frac{\sum_{d \in O} w_d S_d}{\text{Coverage}}, \quad \text{FinalMatchScore} = \text{RawWeightedScore} \times (0.85 + 0.15 \cdot \text{Coverage})$$
- This ensures a creator with missing metrics is neither penalized as `0` nor ranked with the same certainty as a creator with `100%` data coverage.

#### Deterministic Tie-Breaking Order

1. `matchScore` descending
2. `scoreBreakdown.contentFitScore` descending
3. `scoreBreakdown.observedWeightCoverage` descending
4. `creatorId` lexical ascending

---

## 5. Step 3 — AI Brand Analyzer Specification

Implemented in [`src/lib/brand/`](src/lib/brand/) and `POST /api/brands/analyze`:

- Extracts public website signals (`<title>`, meta description, headings, about/positioning snippets, product/service snippets, and up to 2 relevant same-origin pages) with SSRF protection (`src/lib/brand/ssrf.ts`).
- Performs best-effort OpenGraph extraction on optional Facebook Page URLs and falls back to `manualDescription` when external pages are blocked.
- Uses OpenAI Responses API (`client.responses.parse`) + `zodTextFormat(BrandProfileSchema, "brand_profile")`.

---

## 6. Step 2 — TikTok Data Schema, Field Mapping & Metric Formulas

Implemented in [`src/lib/tiktok/`](src/lib/tiktok/):

- Maps Apify `clockworks/tiktok-scraper` fields (`id` → `videoId`, `text` → `caption`, `webVideoUrl` → `videoUrl`, `authorMeta.id` → `creatorId` with `authorMeta.name` fallback, `authorMeta.fans` → `followers`, `playCount` → `views`, `diggCount` → `likes`, `commentCount` → `comments`, `shareCount` → `shares`, `createTimeISO` → `publishedAt`, `hashtags[].name` → `hashtags`).
- Preserves missing metrics as `null`, retains `isAd`, and never invents audience demographics (`audienceDemographics: null`).

---

## 7. API Reference (`POST /api/brands/analyze` & `POST /api/matching/evaluate`)

### `POST /api/matching/evaluate`

**Request:**

```json
{
  "brandProfile": { "...BrandProfile from Step 3..." },
  "dataSource": "fixture",
  "executionMode": "fixture_mock",
  "limit": 10
}
```

- `executionMode`:
  - `"fixture_mock"` (default): Deterministic offline evaluation using saved test evaluations in [`src/data/fixtures/kol-matching-fixture.json`](src/data/fixtures/kol-matching-fixture.json). Incurs `0` OpenAI API cost and sets `metadata.isOfflineDemoOutput = true`.
  - `"live_ai"`: Calls the server-side OpenAI Responses API evaluator for each qualified creator. Never silently substitutes mock data if OpenAI fails.

**Response (`200 OK` — Actual Excerpt from Primary Fixture):**

```json
{
  "ok": true,
  "data": {
    "metadata": {
      "algorithmVersion": "1.0.0-mvp",
      "weights": {
        "contentFit": 0.5,
        "marketFit": 0.2,
        "performanceFit": 0.2,
        "creatorSuitability": 0.1
      },
      "dataSource": "fixture",
      "executionMode": "fixture_mock",
      "isOfflineDemoOutput": true,
      "totalCandidatesEvaluated": 10,
      "recommendedCount": 9,
      "excludedCount": 1,
      "manualReviewCount": 9
    },
    "recommendations": [
      {
        "creatorId": "6795513398643147778",
        "username": "zzdaozz",
        "displayName": "Dao Simasthien🫶🏻",
        "profileUrl": "https://www.tiktok.com/@zzdaozz",
        "followers": 1600000,
        "matchScore": 83.24,
        "rank": 1,
        "qualificationStatus": "eligible",
        "confidenceLevel": "medium",
        "requiresManualReview": true,
        "sampledVideosCount": 1,
        "supportingVideoUrls": [
          "https://www.tiktok.com/@zzdaozz/video/7688698184318651669"
        ]
      }
    ],
    "excludedCreators": [
      {
        "creatorId": "7011455597325812762",
        "username": "remo.thailand",
        "displayName": "Remo Thailand",
        "exclusionSummary": "Excluded @remo.thailand: Identified as an official brand or company storefront account rather than an independent creator."
      }
    ]
  }
}
```

---

## 8. Prerequisites, Installation & Environment Variables

```bash
pnpm install
cp .env.example .env.local
```

| Variable                   | Required                  | Default       | Description                                                        |
| -------------------------- | ------------------------- | ------------- | ------------------------------------------------------------------ |
| `OPENAI_API_KEY`           | Required for Live AI Mode | —             | Server-side OpenAI API key (`sk-...`)                              |
| `OPENAI_MODEL`             | Optional                  | `gpt-4o-mini` | Structured Outputs model (`gpt-4o-mini`, `gpt-4.1-mini`, `gpt-4o`) |
| `APIFY_API_TOKEN`          | Optional                  | —             | Guarded Apify token for existing dataset fetches                   |
| `NEXT_PUBLIC_USE_FIXTURES` | Optional                  | `true`        | Uses local fixtures by default                                     |

---

## 9. Testing, Evaluation Benchmark & Controlled Live Execution

### Automated Verification Commands (0 API Cost)

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

### Human-Labeled Evaluation Benchmark (`getHumanLabeledEvaluationCases`)

Defined in [`src/lib/matching/fixtures.ts`](src/lib/matching/fixtures.ts) and verified in [`tests/unit/kol-matching-engine.test.ts`](tests/unit/kol-matching-engine.test.ts):

- `EVAL-01-RELEVANT-CREATOR`: `@zzdaozz` (`eligible`, `individual_creator`, `open_to_collab`, `relevant`)
- `EVAL-02A-OFFICIAL-BRAND-ACCOUNT-REMO`: `@remo.thailand` (`excluded`, `brand_account` via `"ช่องบริษัท"`)
- `EVAL-02B-OFFICIAL-BRAND-ACCOUNT-ETUDE`: `@etudethailand` (`excluded`, `brand_account` via `"ETUDE Thailand Official TikTok"`, `isAd=false`)
- `EVAL-03-EXPLICIT-REVIEW-REFUSAL`: Creator with `"ไม่รับงานรีวิว"` bio (`excluded`, `restricted`)
- `EVAL-04-UNCLEAR-THAI-MARKET-RELEVANCE`: `@honestglowup5` with Burmese `textLanguage="my"` (`needs_review`, `not_observed`)
- `EVAL-05-MISSING-PERFORMANCE-METRICS`: Creator with `null` bio and missing view/like metrics (`needs_review`, `performanceFitScore: null`)

> **Benchmark Caveat:** Matching 6 human-labeled reference cases verifies rule logic and schema invariants but does **not** establish statistical model accuracy. See [`docs/evaluation.md`](docs/evaluation.md) for how to expand the evaluation dataset.

### Running One Controlled Live Evaluation

1. Configure a valid `OPENAI_API_KEY` in `.env.local` and run `pnpm dev`.
2. Open `http://localhost:3000`:
   - Click **"Load Controlled Brand Fixture (Offline Preview)"** (or analyze a brand URL).
   - In **Section 4 (Step 4 — AI TikTok KOL Matching & Ranking Engine)**:
     - Keep `fixture_mock` selected to run offline at `0` API cost, **or**
     - Select `live_ai` and set `Max Ranked Recommendations` to a small limit (e.g., `3` or `5`) before clicking **"Run Matching"** to execute a controlled live OpenAI evaluation.

---

## 10. Known Limitations, Potential Biases & Security Safeguards

- **Single-Video Sample Limitation:** All 10 creators in the primary dataset have `1` sampled video. Performance Fit is capped by a `0.75x` provisional factor and `confidenceLevel` cannot exceed `"medium"`.
- **Potential Ranking Biases:**
  - **Caption Verbosity Bias:** Creators who write detailed Thai skincare captions (`@zzdaozz`, `@pchskinmood`) naturally receive higher Content Style scores than creators who post visual demos with 2-word captions (`@pim168889439`, `@nnampunnn`).
  - **Search-Query Selection Bias:** The fixture was collected using the hashtag/query `"รีวิวสกินแคร์"`, favoring creators who explicitly use that tag.
  - **Initial Heuristic Weights:** The `50/20/20/10` weights are transparent MVP defaults, not empirically calibrated on historical campaign ROI/GMV.
- **Security & Cost Safeguards:** SSRF protection, `<untrusted_creator_data>` prompt-injection isolation, strict evidence `videoId`/`videoUrl` validation, `MAX_EVALUATED_CREATORS = 20` cap, and `ApifyPaidRunGuardError` preventing automatic paid Apify runs.
