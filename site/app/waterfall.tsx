"use client";

import { useState } from "react";
import { HERO, usdM2, usdK } from "./data";

const pct1 = (n: number) => (n * 100).toFixed(1) + "%";

// Connected financial waterfall: each force is a cumulative step off a shared zero baseline,
// so the running total visibly builds from 0 → +$3.59M → +$4.49M → −$1.65M (the price move).
// A distinct summary bar lands at the same point the steps arrive at. Hover reveals the gloss.
export function Waterfall() {
  const [hover, setHover] = useState<number | null>(null);

  let cum = 0;
  const steps = HERO.forces.map((f) => {
    const start = cum;
    cum += f.value;
    return { label: f.label, sub: f.sub, value: f.value, start, end: cum, positive: f.value >= 0 };
  });
  const net = cum; // = HERO.deltaP, the price move

  // domain across every running-total point, padded so labels/connectors have air
  const pts = [0, ...steps.map((s) => s.end)];
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const pad = (hi - lo) * 0.07;
  const dMin = lo - pad;
  const dMax = hi + pad;
  const X = (v: number) => ((v - dMin) / (dMax - dMin)) * 100;
  const zero = X(0);

  const glosses = [
    `NOI grew ${usdK(HERO.entry.noi)} → ${usdK(HERO.exit.noi)} over the ${HERO.holdYears}yr hold (proxied) — income pushed price up ${usdM2(steps[0].value)}.`,
    `LTV fell ${pct1(HERO.entry.ltv)} → ${pct1(HERO.exit.ltv)} even as base rates rose ${pct1(HERO.entry.baseRate)} → ${pct1(HERO.exit.baseRate)}; net debt effect +${usdM2(steps[1].value)} — the deleveraging outweighed the rate rise.`,
    `What equity demanded — the residual that reconciles to the real price; pulled price down ${usdM2(Math.abs(steps[2].value))}. Proxy-strained on this high-LTV deal: the verified result is the exact footing, not the precise required-return level.`,
  ];

  const tipLeft = (s: { start: number; end: number }) =>
    Math.min(Math.max((X(s.start) + X(s.end)) / 2, 28), 72);

  return (
    <div className="wf2">
      {steps.map((s, i) => {
        const left = Math.min(X(s.start), X(s.end));
        const width = Math.abs(X(s.end) - X(s.start));
        return (
          <div
            className="wf2-row"
            key={s.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            tabIndex={0}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            <div className="wf2-label">
              {s.label}
              <small>{s.sub}</small>
            </div>
            <div className="wf2-plot">
              <span className="wf2-zero" style={{ left: `${zero}%` }} />
              <span className="wf2-conn" style={{ left: `${X(s.end)}%` }} />
              <span
                className={`wf2-bar ${s.positive ? "pos" : "neg"} ${hover === i ? "hot" : ""}`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
              {hover === i && (
                <span className="wf2-tip" style={{ left: `${tipLeft(s)}%` }}>
                  <b>
                    {s.label} · {usdM2(s.value)}
                  </b>
                  {glosses[i]}
                </span>
              )}
            </div>
            <div className={`wf2-val ${s.positive ? "pos" : "neg"}`}>{usdM2(s.value)}</div>
          </div>
        );
      })}

      <div className="wf2-row summary">
        <div className="wf2-label">
          Net price move
          <small>three forces summed</small>
        </div>
        <div className="wf2-plot">
          <span className="wf2-zero" style={{ left: `${zero}%` }} />
          <span
            className="wf2-bar net"
            style={{ left: `${Math.min(X(0), X(net))}%`, width: `${Math.abs(X(net) - X(0))}%` }}
          />
        </div>
        <div className="wf2-val neg strong">{usdM2(net)}</div>
      </div>
    </div>
  );
}
