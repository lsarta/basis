// Layer 3 — the node chain.
//
// Entry node → (optional interim owners) → last node, where EACH node's price is solved by
// the same forward solve under THAT node's own financing vector (the exit is re-originated,
// not capitalised by a typed-in cap), and the recursion TERMINATES on the Layer-2 anchor
// (the steady-state fixed point).
//
// A chain produces REALIZED ownership-sequence prices (e.g. the entry owner's purchase, which
// is depressed because it embeds the forced exit). These are a DISTINCT construct from the
// decomposition's re-origination fair values Π(vintage) (see decomposition/):
// `chain_price_exit` coincides with Π(exit) by construction (the last node is re-originated to
// the anchor), but `chain_price_entry` diverges from Π(entry). Realized chain prices are NEVER
// the decomposition basis; to put them on a record, attach them to `record.chain` (the clearly
// labelled, separate field).

import { type FinancingVector } from "./types.ts";
import { solveClosedForm, equityCashflows, irr, leveredNPV } from "./solve.ts";
import { terminalPrice } from "../anchor/index.ts";
import { type NOISource, expandNOI } from "../noi/types.ts";

export interface ChainNodeSpec {
 /** financing vector Φ for this owner/node */
  financing: FinancingVector;
 /** hold length in years */
  hold_years: number;
}

export interface ChainSpec {
  transaction_id?: string;
 /** fundamentals source (scenario / public) */
  noiSource: NOISource;
 /** ordered owners: [entry, …interim…, last]. Length ≥ 2 (entry + exit). */
  nodes: ChainNodeSpec[];
 /** terminal anchor inputs */
  terminal: { g: number; neutral: FinancingVector };
}

export interface NodeDetail {
  index: number;
  price: number;
  hold_noi: number[];
  going_in_noi: number;
  pExit: number;
  hurdle: number;
  irr: number;
  residual: number;
}

export interface ChainResult {
 /** Realized ownership-sequence prices — the entry owner's purchase and its resale (the
 * exit transaction). A SEPARATE construct from the decomposition's Π(vintage) values. */
  chainPrices: { chain_price_entry: number; chain_price_exit: number };
  detail: {
    nodePrices: number[];
    pTerminal: number;
    fullNOI: number[];
    nodes: NodeDetail[];
  };
}

export function priceChain(spec: ChainSpec): ChainResult {
  const N = spec.nodes.length;
  if (N < 2) throw new Error(`a chain needs ≥ 2 nodes (entry + exit), got ${N}`);

  const g = spec.terminal.g;
  const T = spec.nodes.reduce((s, n) => s + n.hold_years, 0);

 // Fundamentals: one trajectory from the source, sliced per node.
  const stream = spec.noiSource.noiFor({ horizon: T });
  const fullNOI = expandNOI(stream, T); // [NOI_1 … NOI_T]

  const goingIn: number[] = [];
  const holdNOI: number[][] = [];
  let cursor = 0;
  let prevGoingIn = stream.in_place_noi; // entry node's going-in (year-0) NOI
  for (const node of spec.nodes) {
    goingIn.push(prevGoingIn);
    holdNOI.push(fullNOI.slice(cursor, cursor + node.hold_years));
    cursor += node.hold_years;
    prevGoingIn = fullNOI[cursor - 1]; // NOI at end of this hold = next node's going-in
  }
  const noiN = fullNOI[T - 1]; // terminal going-in NOI

 // Terminate on the anchor.
  const pTerminal = terminalPrice(noiN, g, spec.terminal.neutral);

 // Backward recursion: last node's resale = anchor; each prior node's resale = next node's price.
  const nodePrices = new Array<number>(N).fill(0);
  for (let k = N - 1; k >= 0; k--) {
    const pExit = k === N - 1 ? pTerminal : nodePrices[k + 1];
    nodePrices[k] = solveClosedForm(holdNOI[k], spec.nodes[k].financing, pExit);
  }

 // Per-node detail: confirm each node was solved to ITS hurdle.
  const nodes: NodeDetail[] = [];
  for (let k = 0; k < N; k++) {
    const pExit = k === N - 1 ? pTerminal : nodePrices[k + 1];
    const fin = spec.nodes[k].financing;
    const cf = equityCashflows(nodePrices[k], holdNOI[k], fin, pExit);
    nodes.push({
      index: k,
      price: nodePrices[k],
      hold_noi: holdNOI[k],
      going_in_noi: goingIn[k],
      pExit,
      hurdle: fin.hurdle,
      irr: irr(cf),
      residual: leveredNPV(nodePrices[k], holdNOI[k], fin, pExit),
    });
  }

 // The observable trades: entry owner buys at node 0, sells at node 1 (the exit transaction).
  return {
    chainPrices: { chain_price_entry: nodePrices[0], chain_price_exit: nodePrices[1] },
    detail: { nodePrices, pTerminal, fullNOI, nodes },
  };
}
