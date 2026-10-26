import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Standard Unit Test Configuration (Strictly Offline & $0 Cost)
 * Only runs offline unit tests in `tests/unit/**`.
 * Paid API calls (OpenAI & Apify) are explicitly blocked.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    env: {
      OPENAI_API_KEY: "mock-offline-key",
      APIFY_API_TOKEN: "mock-offline-token",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
