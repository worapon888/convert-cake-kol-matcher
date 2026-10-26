import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Dedicated Live Integration Test Configuration
 * Only executed explicitly via `pnpm test:live`.
 * Loads credentials from `.env.local` and sets `ALLOW_LIVE_OPENAI=true`.
 */
const envLocalPath = path.resolve(import.meta.dirname, "./.env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 30000,
    env: {
      ALLOW_LIVE_OPENAI: "true",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
