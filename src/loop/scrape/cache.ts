// Idempotent on-disk cache for raw SODA responses. BUILT DURING BUILD DAY.
//
// Cache key = sha256(dataset + canonical(query)). Self-describing files under
// data/raw/acris/ (gitignored). This is what makes the scrape resumable and lets
// scrape:replay run OFFLINE after the fixtures are fetched once.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const CACHE_DIR = join(repoRoot, "data", "raw", "acris");

/** Stable JSON: object keys sorted, so equivalent queries hit the same cache file. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return "{" + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}

export function cacheKey(dataset: string, query: Record<string, string | number>): string {
  const h = createHash("sha256").update(dataset + "\n" + canonical(query)).digest("hex").slice(0, 16);
  return `${dataset}__${h}`;
}

interface CacheEnvelope {
  dataset: string;
  query: Record<string, string | number>;
  fetchedAt: string;
  rows: SodaCacheRows;
}
type SodaCacheRows = Record<string, string>[];

export function readCache(dataset: string, query: Record<string, string | number>): SodaCacheRows | null {
  const path = join(CACHE_DIR, cacheKey(dataset, query) + ".json");
  if (!existsSync(path)) return null;
  try {
    return (JSON.parse(readFileSync(path, "utf8")) as CacheEnvelope).rows;
  } catch {
    return null; // a corrupt cache file is a miss, not a crash
  }
}

export function writeCache(
  dataset: string,
  query: Record<string, string | number>,
  rows: SodaCacheRows,
  fetchedAt: string,
): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  const path = join(CACHE_DIR, cacheKey(dataset, query) + ".json");
  const env: CacheEnvelope = { dataset, query, fetchedAt, rows };
  writeFileSync(path, JSON.stringify(env));
}
