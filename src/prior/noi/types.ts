// NOISource interface — the fundamentals seam.
// The engine consumes NOI through this interface and is blind to provenance.

export type NOISourceKind = "scenario" | "public";

export interface NOIStream {
 /** Level NOI at the node (going-in / year 0). */
  in_place_noi: number;
 /** Per-period growth rates applied successively to in_place_noi over the hold. */
  growth_path: number[];
 /** office | multifamily | industrial | retail | … */
  property_type: string;
 /** Optional adapter-specific provenance / quality hints. */
  source_meta?: Record<string, unknown>;
}

export interface NOIQuery {
 /** Horizon in years; the engine needs NOI_1 … NOI_H. */
  horizon: number;
 /** Optional selector the adapter interprets (transaction id, property key, …). */
  key?: string;
}

export interface NOISource {
 /** Yield the NOI stream for one node/property. */
  noiFor(query: NOIQuery): NOIStream;
 /** Tag written into the record's `noi_source` field. */
  readonly kind: NOISourceKind;
}

/**
 * Expand an NOIStream into the explicit NOI vector [NOI_1 … NOI_H].
 * NOI_t = in_place_noi · Π_{s=1..t} (1 + growth_path[s-1]).
 * growth_path must have length ≥ H.
 */
export function expandNOI(stream: NOIStream, horizon: number): number[] {
  if (horizon < 1) throw new Error(`horizon must be ≥ 1, got ${horizon}`);
  if (stream.growth_path.length < horizon) {
    throw new Error(
      `growth_path length ${stream.growth_path.length} < horizon ${horizon}`,
    );
  }
  const noi: number[] = [];
  let level = stream.in_place_noi;
  for (let t = 1; t <= horizon; t++) {
    level = level * (1 + stream.growth_path[t - 1]);
    noi.push(level);
  }
  return noi;
}
