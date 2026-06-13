// Field normalization rules. BUILT DURING BUILD DAY.
//
// Two DIFFERENT policies, deliberately not shared (GRADER_SPEC §4, §5):
//   - lender  → NORMALIZED CORE-TOKEN (uppercase, strip punctuation, collapse ws,
//               drop corporate-suffix noise, require the core entity token(s)).
//   - channel → LITERAL closed-enum match, NO normalization whatsoever.
// The channel comparison lives in grade.ts and is intentionally a raw `===`; this
// file only provides lender normalization so the two can never be confused.

import { TAKEOUT_CHANNELS, type TakeoutChannel } from "./types.ts";

/**
 * Corporate-suffix / structural noise stripped before comparing lenders. These are
 * the tokens the spec names as noise ("NATIONAL ASSOCIATION", "AS TRUSTEE", "N.A.")
 * plus the obvious entity-form words. NOTE: "BANK", "TRUST", "PRIVATE" are NOT noise —
 * "TRUST" is load-bearing for WILMINGTON TRUST (see AMBIGUOUS_TOKENS below).
 */
const NOISE_TOKENS: ReadonlySet<string> = new Set([
  "NATIONAL", "ASSOCIATION", "NA", "N", "A",
  "AS", "TRUSTEE", "FSB", "LLC", "LP", "INC", "CORP", "CORPORATION", "COMPANY", "CO",
]);

/**
 * Single tokens that COLLIDE with a different real institution and therefore cannot
 * stand alone as a core token. "WILMINGTON" alone collides with Wilmington Savings
 * Fund Society, so WILMINGTON TRUST requires BOTH tokens (GRADER_SPEC §4). When the
 * leading core token is ambiguous, the second significant token is pulled in too.
 */
const AMBIGUOUS_TOKENS: ReadonlySet<string> = new Set(["WILMINGTON"]);

/** uppercase → punctuation to spaces → collapse ws → drop noise tokens. */
export function normalizeLenderTokens(s: string): string[] {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !NOISE_TOKENS.has(t));
}

/**
 * The minimal distinguishing core derived from the GOLD lender. Single leading token
 * normally suffices (WEBSTER, PEAPACK); an ambiguous leading token forces a two-token
 * core (WILMINGTON TRUST).
 */
export function requiredCoreTokens(goldLender: string): string[] {
  const toks = normalizeLenderTokens(goldLender);
  if (toks.length === 0) return [];
  const core = [toks[0]];
  if (AMBIGUOUS_TOKENS.has(toks[0]) && toks.length > 1) core.push(toks[1]);
  return core;
}

/** A prediction lender matches iff it contains every required core token of the gold lender. */
export function lenderMatches(goldLender: string, predLender: string | null | undefined): boolean {
  const core = requiredCoreTokens(goldLender);
  if (core.length === 0) return true; // nothing required
  const predToks = new Set(normalizeLenderTokens(predLender ?? ""));
  return core.every((t) => predToks.has(t));
}

export function isTakeoutChannel(s: string): s is TakeoutChannel {
  return (TAKEOUT_CHANNELS as readonly string[]).includes(s);
}

/**
 * LITERAL channel match — exact `===`, no trim, no case-fold (GRADER_SPEC §5).
 * `regional bank` (no hyphen), a trailing space, etc. must FAIL.
 */
export function channelMatches(goldChannel: string, predChannel: string | null | undefined): boolean {
  return predChannel === goldChannel;
}
