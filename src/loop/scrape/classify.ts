// Deed-row classification. BUILT DURING BUILD DAY.
//
// Assigns the deed's grader Classification from public fields only. Flags are checked BEFORE
// the arms-length default, so a coop unit or a family disposition is never mislabeled a clean
// purchase. Honest scope: these are heuristics over public fields; v1 flags conservatively and
// the gold-replay surfaces any misfire as the row to fix.

import type { Classification } from "./types.ts";

/** ACRIS coop-unit property-type codes (a coop unit deed conveys shares, not a building price). */
const COOP_PROPERTY_TYPES = new Set(["SP", "MP", "CP", "SA"]);

export function isCoopUnit(propertyType: string): boolean {
  return COOP_PROPERTY_TYPES.has((propertyType ?? "").trim().toUpperCase());
}

/** Family/estate/trust dispositions are not market trades. */
const NON_ARMS_PATTERNS = [/\bFAMILY\b/, /\bESTATE\b/, /LIVING TRUST/, /REVOCABLE/];

export function isNonArmsLength(grantorNames: string[], granteeNames: string[]): boolean {
  const grantors = grantorNames.map((n) => n.toUpperCase());
  const grantees = new Set(granteeNames.map((n) => n.toUpperCase().trim()));
  if (grantors.some((g) => NON_ARMS_PATTERNS.some((re) => re.test(g)))) return true;
  // exact party-name overlap between seller and buyer => related-party transfer
  return grantors.some((g) => grantees.has(g.trim()));
}

/** A deed's classification: coop / non-arms-length flag first, else a clean arms-length purchase. */
export function classifyDeed(args: {
  propertyType: string;
  grantorNames: string[];
  granteeNames: string[];
}): Extract<Classification, "coop_unit_deed" | "non_arms_length" | "arms_length_purchase"> {
  if (isCoopUnit(args.propertyType)) return "coop_unit_deed";
  if (isNonArmsLength(args.grantorNames, args.granteeNames)) return "non_arms_length";
  return "arms_length_purchase";
}
