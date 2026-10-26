# Test Suite (`tests/`)

> **Status:** `Scaffold Only (TODO)`  
> Automated unit, integration, and evaluation test suites have not been implemented yet.

## Planned Test Structure

```text
tests/
├── unit/
│   ├── scoring.test.ts         # [TODO] Quantitative ER, consistency, and composite score tests
│   └── normalizer.test.ts      # [TODO] TikTok profile & video metric normalization tests
├── integration/
│   ├── fixture-mode.test.ts    # [TODO] End-to-end matching flow using local Thai KOL fixtures
│   └── schema-parser.test.ts   # [TODO] LLM structured output validation & fallback handling
└── evaluation/
    └── benchmark.test.ts       # [TODO] Ranking concordance against reference Thai brand briefs
```

## Running Validation Today

Currently implemented static validation checks:

```bash
pnpm lint
pnpm typecheck
pnpm format:check
```
