# Evaluation & Testing Strategy — Convert Cake KOL Matcher

> **Implementation Status:** `Documentation & Planning Only`  
> The evaluation harness, benchmark fixtures, automated tests, and scoring validation scripts described in this document are **not yet implemented (`TODO`)**.

---

## 1. Evaluation Objectives

Because an AI-powered KOL matcher combines deterministic metrics with LLM judgment, the evaluation framework is designed to verify four properties before production readiness:

1. **Scoring Determinism & Calibration:** Quantitative sub-scores (`Engagement Quality`, `Consistency & Momentum`) must be 100% deterministic, bounded within `[0, 100]`, and resistant to single-viral-video skew.
2. **Ranking Quality (Human-Benchmark Alignment):** Top-ranked KOLs for representative Thai brand briefs should align with domain-expert rankings across diverse verticals (e.g., Thai beauty/skincare, streetwear, specialty coffee/F&B, tech accessories).
3. **LLM Output Reliability & Faithfulness:** Claude-generated brand analyses and KOL match rationales must conform strictly to expected schemas and cite actual metrics/captions from the candidate profile rather than hallucinated facts.
4. **Operational Latency & Cost:** End-to-end matching latency and token consumption must stay within interactive web application budgets.

---

## 2. Planned Benchmark Scenarios (`TODO`)

We will evaluate the pipeline against a curated benchmark suite (`TODO: src/data/fixtures/benchmarks.json`) representing realistic Thai market campaigns:

| Scenario ID    | Brand Vertical                   | Campaign Goal                    | Target Follower Tier     | Expected Top KOL Characteristics                                                          | Status |
| -------------- | -------------------------------- | -------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- | ------ |
| `TH-BEAUTY-01` | Thai Tinted Sunscreen / Skincare | TikTok Shop Conversion           | Micro (`10K–100K`)       | High comment intent ("ใช้ดีไหม", "พิกัด"), GRWM/review format, Thai skincare hashtags     | `TODO` |
| `TH-FNB-02`    | Bangkok Specialty Matcha Cafe    | Local Foot Traffic & Awareness   | Nano–Micro (`5K–80K`)    | Bangkok cafe-hopping niche, strong share-to-view ratio, aesthetic food/drink storytelling | `TODO` |
| `TH-GADGET-03` | Wireless Desk Accessories        | Product Launch & Affiliate Sales | Micro–Macro (`50K–300K`) | Desk-setup/tech review creators, consistent median views, clear product demonstrations    | `TODO` |

---

## 3. Scoring Algorithm Validation Rules (`TODO`)

Unit and property tests (`TODO: tests/scoring/`) will verify the following edge cases:

1. **Viral Outlier Resistance:** A creator with one `2M` view video and nine `1,500` view videos must not outscore a creator with ten consistent `80,000` view videos on the `Consistency & Momentum` dimension (use median and interquartile range alongside mean).
2. **Zero / Missing Metric Handling:** Profiles with `0` videos, hidden likes, or `0` followers must return a safe, non-`NaN` score without throwing runtime division-by-zero errors.
3. **Tier Mismatch Penalty:** If a brand requests Nano/Micro creators for a tight seeding budget, Mega creators (`1M+` followers) should receive a budget-tier penalty even if their raw engagement is strong.
4. **Score Normalization:** Every individual sub-score and the final weighted composite score must be strictly clamped to `[0, 100]`.

---

## 4. LLM Evaluation Criteria (`TODO`)

| Metric                                      | Target Threshold | Evaluation Method                                                                      | Status |
| ------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------- | ------ |
| **Schema Validity Rate**                    | `100%`           | Validate Claude JSON responses against TypeScript/Zod schemas                          | `TODO` |
| **Groundedness / Zero Hallucination**       | `100%`           | Verify cited engagement rates, follower counts, and hashtags match input KOL data      | `TODO` |
| **Ranking Concordance (NDCG@5 / Spearman)** | `>= 0.80`        | Compare system top-5 ranking against reference gold labels on fixture briefs           | `TODO` |
| **Bilingual Clarity (TH/EN)**               | Pass rubric      | Verify Thai hashtags, slang, and transliterated brand terms are interpreted accurately | `TODO` |

---

## 5. Verification & Quality Gates

### Currently Active Checks (`[IMPLEMENTED]`)

These checks are configured and working today:

```bash
# Run ESLint static analysis
pnpm lint

# Run TypeScript strict compiler verification
pnpm typecheck

# Check code formatting with Prettier
pnpm format:check
```

### Planned Evaluation & Test Commands (`[TODO]`)

The following commands are planned for upcoming milestones and are **not yet implemented**:

```bash
# [TODO] Run unit & integration tests (scoring engine, data normalizer, fixture loader)
# pnpm test

# [TODO] Run offline benchmark evaluation against Thai KOL fixtures
# pnpm eval:benchmark
```
