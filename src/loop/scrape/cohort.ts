// Rate-vintage cohort tagging. BUILT DURING BUILD DAY.
// User-locked, calendar-year cuts spanning the 2016->2026 rate environment.

import type { RateCohort } from "./types.ts";

export const COHORTS: readonly RateCohort[] = [
  "pre-2020", // 2016-2019 — the long ZIRP plateau before COVID
  "ZIRP-COVID", // 2020-2021 — emergency-low rates; debt force near-invisible
  "hiking", // 2022-2023 — the fastest hiking cycle in decades
  "higher-for-longer", // 2024-2026 — debt force dominant
] as const;

/** Cohort from an ISO recording datetime (e.g. "2025-12-12T00:00:00.000"). */
export function cohortOf(recordedDatetime: string): RateCohort {
  const year = Number(recordedDatetime.slice(0, 4));
  if (!Number.isFinite(year)) throw new Error(`cohortOf: unparseable date ${JSON.stringify(recordedDatetime)}`);
  if (year <= 2019) return "pre-2020";
  if (year <= 2021) return "ZIRP-COVID";
  if (year <= 2023) return "hiking";
  return "higher-for-longer";
}
