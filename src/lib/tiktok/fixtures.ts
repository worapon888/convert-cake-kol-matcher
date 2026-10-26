import rawPrimaryJson from "@/data/fixtures/apify-tiktok-raw.json";
import rawBatch2Json from "@/data/fixtures/apify-tiktok-raw-batch2.json";
import normalizedFixtureJson from "@/data/fixtures/normalized-tiktok-fixture.json";
import {
  normalizeApifyDataset,
  type NormalizeDatasetOptions,
} from "./normalizer";
import {
  ApifyTikTokDatasetSchema,
  type ApifyTikTokVideoItem,
  type NormalizedTikTokDataset,
  NormalizedTikTokDatasetSchema,
} from "./schemas";

export type FixtureBatch = "primary" | "batch2";

/**
 * Loads and validates the raw Apify `clockworks/tiktok-scraper` dataset fixture.
 *
 * - `"primary"`: 10 videos from 10 unique creators (`apify-tiktok-raw.json`)
 * - `"batch2"`: 10 videos from 10 unique creators (`apify-tiktok-raw-batch2.json`)
 */
export function loadRawApifyFixture(
  batch: FixtureBatch = "primary"
): ApifyTikTokVideoItem[] {
  const source = batch === "batch2" ? rawBatch2Json : rawPrimaryJson;
  return ApifyTikTokDatasetSchema.parse(source);
}

/**
 * Loads the raw Apify fixture and normalizes it into `TikTokVideo[]`, `TikTokCreator[]`,
 * and `CreatorMetrics` using the runtime normalization pipeline.
 */
export function normalizeRawApifyFixture(
  batch: FixtureBatch = "primary",
  options: NormalizeDatasetOptions = {}
): NormalizedTikTokDataset {
  const rawItems = loadRawApifyFixture(batch);
  return normalizeApifyDataset(rawItems, options);
}

/**
 * Loads and validates the pre-normalized TikTok dataset fixture (`normalized-tiktok-fixture.json`).
 */
export function loadNormalizedTikTokFixture(): NormalizedTikTokDataset {
  return NormalizedTikTokDatasetSchema.parse(normalizedFixtureJson);
}
