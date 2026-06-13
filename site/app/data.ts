// Baked-in, precomputed results. The deployed site renders ONLY this — no live SODA calls.
// Every number here is reproduced by the repo:
//   HERO  → `npm run engine:demo-pair`  (the exact calibrated decomposition, foots to the dollar)
//   CEMA  → `npm run scrape:replay`     (300 W 44th senior recovered from the M&CON)
//   LOOP  → `npm run engine:headline`   (survival waterfall + model-implied relative force mix)
// Captured 2026-06-13 on the cached corpus (151/194 same-BBL pairs; SODA was 503-throttled).

// Use a true minus sign (−, U+2212) for negatives — reads cleaner than a hyphen in financials.
const sign = (n: number) => (n < 0 ? "−$" : "$");

// Round half-up on the magnitude using exact integer scaling — toFixed() rounds the wrong
// way on binary-inexact values (e.g. 14.45 → "14.4"), which would break the hero reconciliation.
// $X.XM — one decimal, for price magnitudes (entry/exit, deed, recovered senior).
export const usdM1 = (n: number) => sign(n) + (Math.round(Math.abs(n) / 1e5) / 10).toFixed(1) + "M";

// $X.XXM — two decimals, for the reconciling force legs + the equation strip (must foot).
export const usdM2 = (n: number) => sign(n) + (Math.round(Math.abs(n) / 1e4) / 100).toFixed(2) + "M";

// $XXXK / $X,XXXK — thousands, comma-grouped (NOI and other sub-million figures).
export const usdK = (n: number) =>
  sign(n) + Math.round(Math.abs(n) / 1000).toLocaleString("en-US") + "K";

// ── HERO: 118 2 Avenue — the exact calibrated decomposition (foots to the dollar) ──
export const HERO = {
  address: "118 2nd Avenue",
  bbl: "1004490001",
  cohorts: "pre-2020 → higher-for-longer",
  holdYears: 7.6,
  entry: {
    date: "2016-06-30",
    price: 16_100_000,
    ltv: 0.8323,
    noi: 805_000,
    noiNote: "proxy: price × 5.00%",
    baseRate: 0.018,
    debtCost: 0.0876,
    rho: 0.0047,
  },
  exit: {
    date: "2024-01-23",
    price: 14_450_000,
    ltv: 0.6298,
    noi: 1_006_716,
    noiNote: "grown 3.00%/yr over hold",
    baseRate: 0.042,
    debtCost: 0.079,
    rho: 0.1575,
  },
  deltaP: -1_650_000,
  forces: [
    { label: "Fundamentals", sub: "income / NOI", value: 3_593_545 },
    { label: "Debt cost", sub: "financing", value: 896_668 },
    { label: "Required return", sub: "what equity demanded", value: -6_140_213 },
  ],
  footError: "0.000e+0",
  entryErr: "−1.2e-7",
  exitErr: "1.5e-6",
};

// ── CEMA: 300 W 44th — the hard read (naive all-cash → recovered $190M senior) ──
export const CEMA = {
  address: "300 West 44th Street",
  bbl: "1010340037",
  deedPrice: 218_600_000,
  naiveLabel: "all-cash",
  naiveNote: "the standalone recorded mortgage is a small gap note",
  staleAmount: 104_000_000,
  staleNote: "a stale 2007 consolidation still sits on the parcel",
  recovered: 190_000_000,
  recoveredVia: "M&CON · doc 2025121200273005",
  recoveredNote: "the most-recent instrument in the active consolidation chain",
  impliedLtv: 190_000_000 / 218_600_000,
  source: "the SODA document_amt field — metadata, not OCR",
};

// ── THE LOOP: gold-set gate + survival waterfall per rate-vintage exit cohort ──
export const GATE = {
  graderSelfTest: "17 / 17",
  replayAttempted: 12,
  replayDeferred: 5,
};

export type Cohort = {
  key: string;
  label: string;
  range: string;
  highlight?: boolean;
  // attrition waterfall
  census: number;
  extracted: number;
  structural: number;
  saneLtv: number;
  allCash: number;
  leveraged: number;
  badLtvExcluded: number;
  calibrated: string;
  dataN: number;
  // model-implied relative force mix — 3-force rollup, mean per pair (signed $)
  rollup: { debt: number; noi: number; reqResidual: number };
  shares: { debt: number; noi: number; reqResidual: number };
  // the clean proxy-free leg: rate-force magnitude share on the leveraged subset
  rateForceShare: number;
  leveragedN: number;
};

export const COHORTS: Cohort[] = [
  {
    key: "pre2020",
    label: "Pre-2020",
    range: "2016–2019",
    census: 40,
    extracted: 40,
    structural: 37,
    saneLtv: 27,
    allCash: 12,
    leveraged: 15,
    badLtvExcluded: 10,
    calibrated: "23 / 27",
    dataN: 27,
    rollup: { debt: 217_000, noi: 270_000, reqResidual: 249_000 },
    shares: { debt: 0.12, noi: 0.12, reqResidual: 0.53 },
    rateForceShare: 0.05,
    leveragedN: 15,
  },
  {
    key: "zirp",
    label: "ZIRP-COVID",
    range: "2020–2021",
    census: 22,
    extracted: 18,
    structural: 16,
    saneLtv: 14,
    allCash: 7,
    leveraged: 7,
    badLtvExcluded: 2,
    calibrated: "13 / 14",
    dataN: 14,
    rollup: { debt: 971_000, noi: 1_122_000, reqResidual: -4_281_000 },
    shares: { debt: 0.09, noi: 0.25, reqResidual: 0.59 },
    rateForceShare: 0.04,
    leveragedN: 7,
  },
  {
    key: "hiking",
    label: "Hiking",
    range: "2022–2023",
    census: 61,
    extracted: 48,
    structural: 43,
    saneLtv: 28,
    allCash: 12,
    leveraged: 16,
    badLtvExcluded: 15,
    calibrated: "21 / 28",
    dataN: 28,
    rollup: { debt: -616_000, noi: 1_582_000, reqResidual: -263_000 },
    shares: { debt: 0.07, noi: 0.31, reqResidual: 0.61 },
    rateForceShare: 0.06,
    leveragedN: 16,
  },
  {
    key: "hfl",
    label: "Higher-for-longer",
    range: "2024–2026",
    highlight: true,
    census: 71,
    extracted: 45,
    structural: 43,
    saneLtv: 34,
    allCash: 20,
    leveraged: 14,
    badLtvExcluded: 9,
    calibrated: "29 / 34",
    dataN: 34,
    rollup: { debt: -593_000, noi: 2_246_000, reqResidual: -3_983_000 },
    shares: { debt: 0.06, noi: 0.46, reqResidual: 0.48 },
    rateForceShare: 0.11,
    leveragedN: 14,
  },
];
