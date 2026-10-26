# Convert Cake KOL Matcher

AI-powered TikTok KOL discovery, brand analysis, and influencer matching platform for the Thai market.

## Overview

`convert-cake-kol-matcher` helps brands in the Thai market analyze their brand positioning, discover relevant TikTok Key Opinion Leaders (KOLs), and match with high-performing influencers using AI-driven insights.

## Technology Stack

- **Framework:** [Next.js](https://nextjs.org/) (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/) (Strict Mode)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Linting & Formatting:** [ESLint](https://eslint.org/) + [Prettier](https://prettier.io/)
- **Git Hooks:** [Husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged)
- **Package Manager:** [pnpm](https://pnpm.io/)

## Prerequisites

- **Node.js:** `>= 20.x`
- **pnpm:** `>= 10.x`
- **Git:** `>= 2.x`

## Installation

1. Clone the repository:

```bash
git clone https://github.com/worapon888/convert-cake-kol-matcher.git
cd convert-cake-kol-matcher
```

2. Install dependencies using `pnpm`:

```bash
pnpm install
```

> **Note:** Running `pnpm install` automatically triggers the `prepare` script to configure Husky Git hooks.

## Environment Setup

1. Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

2. Populate `.env.local` with your credentials:

| Variable            | Description                                                               |
| ------------------- | ------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Anthropic API key used for AI brand analysis and KOL matching             |
| `APIFY_API_TOKEN`   | Apify API token used for TikTok KOL discovery and profile data collection |

> **Security:** Never commit `.env.local` or real API keys to version control.

## Development Commands

| Command             | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| `pnpm dev`          | Start the Next.js development server at `http://localhost:3000` |
| `pnpm build`        | Build the production application                                |
| `pnpm start`        | Start the production server                                     |
| `pnpm lint`         | Run ESLint across the codebase                                  |
| `pnpm lint:fix`     | Run ESLint and automatically fix issues                         |
| `pnpm format`       | Format all project files with Prettier                          |
| `pnpm format:check` | Check formatting across the codebase with Prettier              |
| `pnpm typecheck`    | Run TypeScript compiler validation (`tsc --noEmit`)             |

## Git Hooks

This repository uses **Husky** and **lint-staged** to enforce code quality before commits:

- **`pre-commit`**: Automatically runs `eslint --fix` and `prettier --write` on staged files via `pnpm exec lint-staged`.
