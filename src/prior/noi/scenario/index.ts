// Calibrated-scenario NOISource (methods paper + engine tests).
// Hand-specified NOI streams; no SUGAR, no external data.

import type { NOIQuery, NOIStream, NOISource } from "../types.ts";

export interface ScenarioSpec {
  in_place_noi: number;
 /** Flat per-period growth rate; expanded to a constant growth_path of the needed length. */
  growth: number;
  property_type?: string;
 /** Max horizon the scenario must cover (growth_path length). */
  max_horizon?: number;
}

/**
 * A scenario NOISource backed by a flat growth rate. growth_path is materialised as a
 * constant vector long enough for the requested horizon.
 */
export class ScenarioNOISource implements NOISource {
  readonly kind = "scenario" as const;
  private spec: ScenarioSpec;

  constructor(spec: ScenarioSpec) {
    this.spec = spec;
  }

  noiFor(query: NOIQuery): NOIStream {
    const len = Math.max(query.horizon, this.spec.max_horizon ?? query.horizon);
    const growth_path = new Array<number>(len).fill(this.spec.growth);
    return {
      in_place_noi: this.spec.in_place_noi,
      growth_path,
      property_type: this.spec.property_type ?? "office",
      source_meta: { adapter: "scenario", flat_growth: this.spec.growth },
    };
  }
}
