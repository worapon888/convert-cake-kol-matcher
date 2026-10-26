# Evaluation & Testing Strategy — Convert Cake KOL Matcher

> **Implementation Status:** `Step 2, Step 3 & Step 4 Automated Tests & Human-Labeled Benchmark Implemented (50 Passing Tests)`

---

## 1. Evaluation Architecture

Because the KOL Matching Engine combines **deterministic TypeScript qualification and scoring** with **OpenAI Structured Outputs semantic evaluation**, our evaluation strategy separates:

1. **Deterministic Invariant Testing:** Unit tests verifying metric math, logarithmic normalization, missing-data `null` preservation, tie-breaking, and anti-hallucination evidence stripping.
2. **Human-Labeled Qualification & Missing-Data Benchmark:** Comparing system classification outputs against 6 manually reviewed reference cases derived from real Apify creator records (`src/lib/matching/fixtures.ts`).
3. **Mocked vs. Controlled Live AI Testing:** All automated tests (`pnpm test`) mock OpenAI and network calls (`0` API cost), while `live_ai` mode is available on-demand via `POST /api/matching/evaluate`.

---

## 2. Manually Labeled Benchmark Cases (`getHumanLabeledEvaluationCases`)

Implemented in [`src/lib/matching/fixtures.ts`](../src/lib/matching/fixtures.ts) and executed in [`tests/unit/kol-matching-engine.test.ts`](../tests/unit/kol-matching-engine.test.ts):

| Case ID                                 | Creator Handle                            | Scenario Tested                                                                    | Human Reference Labels (`status` / `accountType` / `collab` / `market`) | Verified System Behavior                                                     |
| --------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `EVAL-01-RELEVANT-CREATOR`              | `@zzdaozz`                                | Relevant Thai skincare creator with `#ผิวแพ้ง่าย` and work LINE ID                 | `eligible` / `individual_creator` / `open_to_collab` / `relevant`       | Ranked `#1` (`83.24`), `confidenceLevel: "medium"` (capped due to 1 video)   |
| `EVAL-02A-OFFICIAL-BRAND-ACCOUNT-REMO`  | `@remo.thailand`                          | Official company account declaring `"ช่องบริษัท"` in bio (`isAd=true`)             | `excluded` / `brand_account` / `unknown` / `relevant`                   | Hard-excluded from recommendations and retained in `excludedCreators`        |
| `EVAL-02B-OFFICIAL-BRAND-ACCOUNT-ETUDE` | `@etudethailand`                          | Official brand account declaring `"ETUDE Thailand Official TikTok"` (`isAd=false`) | `excluded` / `brand_account` / `unknown` / `relevant`                   | Proves brand detection relies on profile evidence, not `isAd`                |
| `EVAL-03-EXPLICIT-REVIEW-REFUSAL`       | `@thai_skincare_diary_no_ads`             | Bio explicitly states `"ไม่รับงานรีวิว ไม่รับสปอนเซอร์ทุกชนิด"`                    | `excluded` / `unknown` / `restricted` / `relevant`                      | Hard-excluded with `EXPLICIT_NO_REVIEW_RESTRICTION`                          |
| `EVAL-04-UNCLEAR-THAI-MARKET-RELEVANCE` | `@honestglowup5`                          | Skincare review in Burmese (`textLanguage="my"`) with no Thai script               | `needs_review` / `unknown` / `unknown` / `not_observed`                 | Not auto-excluded; flagged `needs_review` with `UNCERTAIN_MARKET_RELEVANCE`  |
| `EVAL-05-MISSING-PERFORMANCE-METRICS`   | `@lsabella5733` (missing metrics variant) | `bio: null` and `views: null, likes: null`                                         | `needs_review` / `unknown` / `unknown` / `relevant`                     | `performanceFitScore: null`, `creatorSuitabilityScore: null`, coverage `70%` |

---

## 3. Sample Size Caveat & How to Expand This Evaluation

- **No Statistical Accuracy Claim:** Passing 6 human-labeled cases validates deterministic qualification rules and missing-data invariants, but a 10–20 creator sample with 1 video per creator is **too small** to claim statistically significant precision/recall or NDCG@10.
- **Roadmap for Production Evaluation Expansion:**
  1. **Multi-Video Creator Sampling:** Collect 10–20 recent videos per candidate creator (`sampledVideosCount >= 10`) to evaluate true median view stability and posting cadence.
  2. **Expanded Gold-Standard Dataset:** Label 100+ Thai TikTok accounts across 5 verticals (Skincare, Makeup, Food & Cafe, Fashion, Gadgets) with dual human annotators (measuring Cohen's $\kappa$).
  3. **Offline Rank Correlation (NDCG@10 & Spearman's $\rho$):** Compare `finalMatchScore` rankings against campaign manager shortlist decisions and actual TikTok Shop affiliate conversion outcomes.
