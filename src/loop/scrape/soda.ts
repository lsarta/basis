// NYC Open Data SODA client. BUILT DURING BUILD DAY.
//
// Cache-first: every read consults the disk cache before the network, so re-runs don't
// re-hit the API (idempotent + resumable). Rate-limit aware: honors 429 / Retry-After,
// retries 5xx with linear backoff, fails fast on other 4xx (a bad SoQL query is not retried).
// Paging: sodaAll() walks $offset to exhaustion, caching each page so paging itself resumes.

import { readCache, writeCache } from "./cache.ts";
import type { SodaRow } from "./types.ts";

const BASE = "https://data.cityofnewyork.us/resource";
const PAGE = 1000;
const TIMEOUT_MS = 120_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Query = Record<string, string | number>;

function url(dataset: string, query: Query): string {
  const u = new URL(`${BASE}/${dataset}.json`);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, String(v));
  return u.toString();
}

/** One SODA page. Cache-first; on miss, fetch with backoff and cache the result. */
export async function sodaPage(dataset: string, query: Query): Promise<SodaRow[]> {
  const cached = readCache(dataset, query);
  if (cached) return cached;

  const token = process.env.NYC_APP_TOKEN;
  const headers: Record<string, string> = { "User-Agent": "basis-scrape (build-day)" };
  if (token) headers["X-App-Token"] = token;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(url(dataset, query), { headers, signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1500 * (attempt + 1));
        lastErr = new Error(`SODA ${res.status} on ${dataset}`);
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`SODA ${res.status} on ${dataset}: ${body.slice(0, 200)}`); // 4xx: fail fast
      }
      const rows = (await res.json()) as SodaRow[];
      writeCache(dataset, query, rows, new Date().toISOString());
      return rows;
    } catch (e) {
      lastErr = e;
      if ((e as Error).name === "AbortError" || attempt === 4) break;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error(`SODA fetch failed for ${dataset} after retries: ${(lastErr as Error)?.message ?? lastErr}`);
}

/**
 * Pure paging loop: pull pages until a short one is returned (exhaustion). Injectable
 * `fetchPage` so the page-boundary behavior is unit-testable offline. A single SODA page
 * must NEVER be trusted for blanket detection — a consolidation's parcels can span pages.
 */
export async function paginateAll<T>(pageSize: number, fetchPage: (offset: number) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset);
    out.push(...page);
    if (page.length < pageSize) break; // short page => exhausted
  }
  return out;
}

/**
 * Page a SODA query to exhaustion. `baseQuery` must NOT contain $limit/$offset; we add them
 * per page. Each page is cached individually, so paging itself resumes after an interruption.
 */
export async function sodaAll(dataset: string, baseQuery: Query, pageSize = PAGE): Promise<SodaRow[]> {
  return paginateAll(pageSize, (offset) => sodaPage(dataset, { ...baseQuery, $limit: pageSize, $offset: offset }));
}

/**
 * KEYSET pagination — page by `keyField > lastSeen` instead of $offset. Avoids Socrata's slow/
 * timeout-prone deep-$offset scans on large filtered pulls (e.g. all AP Legals). The keyField must
 * be sortable and (near-)unique; ordering by it lets each page use the index. Rows whose duplicate
 * keys straddle a page boundary are dropped, so use only when callers dedup by key (e.g. into a Set).
 */
export async function sodaKeyset(
  dataset: string,
  opts: { where: string; select: string; keyField?: string; pageSize?: number; label?: string },
): Promise<SodaRow[]> {
  const keyField = opts.keyField ?? "document_id";
  const pageSize = opts.pageSize ?? 5000;
  const out: SodaRow[] = [];
  let last = "";
  for (let page = 0; ; page++) {
    const where = last ? `(${opts.where}) AND ${keyField} > '${last.replace(/'/g, "''")}'` : opts.where;
    const rows = await sodaPage(dataset, { $select: opts.select, $where: where, $order: keyField, $limit: pageSize });
    out.push(...rows);
    if (opts.label) process.stderr.write(`\r  ${opts.label}: ${out.length.toLocaleString()} rows…   `);
    if (rows.length < pageSize) break;
    last = rows[rows.length - 1][keyField];
  }
  if (opts.label) process.stderr.write("\n");
  return out;
}
