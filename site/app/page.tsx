import { Reveal } from "./reveal";
import { HERO, CEMA, GATE, COHORTS, usdM } from "./data";

const pct = (n: number, d = 0) => (n * 100).toFixed(d) + "%";

export default function Page() {
  return (
    <main>
      {/* ─────────────── 1 · HOOK ─────────────── */}
      <section className="scroll">
        <div className="scroll-inner">
          <p className="eyebrow">
            <span>Basis</span>
            <span className="rule" />
            <span className="num">CRE valuation · NYC public records</span>
          </p>
          <h1 className="display reveal">
            When a building&rsquo;s price moves, everyone says the cap rate moved.
            <br />
            A cap rate is <span className="accent">three forces</span> wearing one number.
          </h1>
          <p className="lede reveal">
            Debt cost. Income. Required return. Basis reads NYC&rsquo;s public deed and
            mortgage record and splits each price move into the three — exactly, to the
            dollar.
          </p>
        </div>
      </section>

      {/* ─────────────── 2 · HERO — exact calibrated decomposition ─────────────── */}
      <HeroScroll />

      {/* ─────────────── 3 · THE HARD READ — CEMA recovery ─────────────── */}
      <CemaScroll />

      {/* ─────────────── 4 · THE SELF-GRADING LOOP ─────────────── */}
      <LoopScroll />

      {/* ─────────────── 5 · THE SIGNAL + EXPANSION ─────────────── */}
      <SignalScroll />

      <footer>
        Basis · built at Claude Build Day, hosted by Anthropic &amp; Cerebral Valley, on
        Claude Opus 4.8 · public records only ·{" "}
        <a href="https://github.com/lsarta/basis">github.com/lsarta/basis</a>
        <br />
        The decomposition engine is reused prior work (disclosed in <code>src/prior</code>).
        The ACRIS scrape, CEMA recovery, gold-set grader, and loop were built on the day.
      </footer>
    </main>
  );
}

function HeroScroll() {
  const maxAbs = Math.max(...HERO.forces.map((f) => Math.abs(f.value)));
  const e = HERO.entry;
  const x = HERO.exit;
  return (
    <section className="scroll deep">
      <div className="scroll-inner">
        <p className="eyebrow">
          <span className="num">01</span>
          <span>The hero — exact calibrated decomposition</span>
          <span className="rule" />
        </p>
        <Reveal as="h2" className="h2">
          One real trade, <span className="accent">decomposed to the dollar.</span>
        </Reveal>
        <Reveal>
          <p className="lede">
            {HERO.address} sold in {e.date.slice(0, 4)}, then again {x.date.slice(0, 4)} —
            a {usdM(HERO.deltaP)} move over {HERO.holdYears} years. The engine prices each
            deed by the buyer&rsquo;s own return logic, with the real CEMA-recovered loan,
            then attributes the move across the three forces. They sum back to the price
            move exactly.
          </p>
        </Reveal>

        <Reveal>
          <div className="grid-2" style={{ marginTop: "2.6rem" }}>
            <StateCard tag="Entry" date={e.date} price={e.price} ltv={e.ltv} noi={e.noi}
              noiNote={e.noiNote} rate={e.baseRate} debt={e.debtCost} rho={e.rho} />
            <StateCard tag="Exit" date={x.date} price={x.price} ltv={x.ltv} noi={x.noi}
              noiNote={x.noiNote} rate={x.baseRate} debt={x.debtCost} rho={x.rho} />
          </div>
        </Reveal>

        <Reveal>
          <div className="forces">
            {HERO.forces.map((f) => {
              const w = (Math.abs(f.value) / maxAbs) * 50;
              const pos = f.value >= 0;
              return (
                <div className="force" key={f.label}>
                  <div className="flabel">
                    {f.label}
                    <small>{f.sub}</small>
                  </div>
                  <div className="bar-wrap">
                    <span className="bar-axis" />
                    <span className={`bar ${pos ? "pos" : "neg"}`} style={{ width: `${w}%` }} />
                  </div>
                  <div className={`fval ${pos ? "pos" : "neg"}`}>{usdM(f.value)}</div>
                </div>
              );
            })}
          </div>
        </Reveal>

        <Reveal>
          <div className="equation">
            <span className="num">{usdM(HERO.forces[0].value)}</span>
            <span className="op">+</span>
            <span className="num">{usdM(HERO.forces[1].value)}</span>
            <span className="op">−</span>
            <span className="num">{usdM(Math.abs(HERO.forces[2].value))}</span>
            <span className="op">=</span>
            <span className="sum num">{usdM(HERO.deltaP)}</span>
            <span className="foot">foots to the dollar · err {HERO.footError}</span>
          </div>
        </Reveal>
        <Reveal>
          <p className="kicker" style={{ marginTop: "1.2rem" }}>
            The cap rate would show one number. The decomposition shows fundamentals
            actually <em>pushed price up</em> {usdM(HERO.forces[0].value)}, and a collapse in
            what equity would pay — required return — pulled it down {usdM(Math.abs(HERO.forces[2].value))}.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function StateCard({ tag, date, price, ltv, noi, noiNote, rate, debt, rho }: {
  tag: string; date: string; price: number; ltv: number; noi: number;
  noiNote: string; rate: number; debt: number; rho: number;
}) {
  return (
    <div className="card">
      <div className="state-h">
        <span className="tag">{tag}</span>
        <span className="date">{date}</span>
      </div>
      <div className="price">{usdM(price)}</div>
      <dl>
        <dt>LTV</dt>
        <dd>{pct(ltv, 1)} <small>CEMA-recovered</small></dd>
        <dt>NOI</dt>
        <dd>{(noi / 1000).toFixed(0)}k <small>{noiNote}</small></dd>
        <dt>Base rate</dt>
        <dd>{pct(rate, 2)} <small>10y UST</small></dd>
        <dt>Debt cost</dt>
        <dd>{pct(debt, 2)}</dd>
        <dt>Required return ρ</dt>
        <dd>{pct(rho, 2)}</dd>
      </dl>
    </div>
  );
}

function CemaScroll() {
  return (
    <section className="scroll dark">
      <div className="scroll-inner">
        <p className="eyebrow">
          <span className="num">02</span>
          <span>The hard read — CEMA recovery</span>
          <span className="rule" />
        </p>
        <Reveal as="h2" className="h2">
          The loan isn&rsquo;t where the record says it is.
        </Reveal>
        <Reveal>
          <p className="lede">
            To dodge NYC&rsquo;s mortgage-recording tax, most large loans are CEMAs: the
            recorded &ldquo;mortgage&rdquo; is a tiny gap note, and the real consolidated
            balance hides in a separate agreement — sometimes beside a stale older one.
            A naive read of {CEMA.address} sees no real debt at all.
          </p>
        </Reveal>

        <Reveal>
          <div className="cema">
            <div className="read naive">
              <div className="lbl">Naive read</div>
              <div className="big">{CEMA.naiveLabel}</div>
              <div className="note" style={{ color: "#9a978e" }}>{CEMA.naiveNote}</div>
            </div>
            <div className="arrow">→</div>
            <div className="read found">
              <div className="lbl">Engine recovers</div>
              <div className="big">{usdM(CEMA.recovered)}</div>
              <div className="note" style={{ color: "#c9c6bd" }}>
                {CEMA.recoveredVia} — {CEMA.recoveredNote}
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <p className="cema-mult">
            On the {usdM(CEMA.deedPrice)} purchase, that&rsquo;s a real{" "}
            <b>{pct(CEMA.impliedLtv)} LTV</b> senior — not all-cash. The parcel also carries a
            stale 2007 <b>{usdM(CEMA.staleAmount)}</b> consolidation; the engine selects the{" "}
            most-recent <em>active-chain</em> instrument, {usdM(CEMA.recovered)}, and reads it
            from {CEMA.source}.
          </p>
        </Reveal>
        <Reveal>
          <div className="callout">
            Get this wrong and a leveraged trade looks all-cash — the debt force vanishes
            and every downstream decomposition is poisoned. <strong>This is the read the
            model has to get exactly right before anything else runs.</strong>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function LoopScroll() {
  return (
    <section className="scroll">
      <div className="scroll-inner">
        <p className="eyebrow">
          <span className="num">03</span>
          <span>The self-grading loop</span>
          <span className="rule" />
        </p>
        <Reveal as="h2" className="h2">
          It grades its own data <span className="accent">before the model sees it.</span>
        </Reveal>
        <Reveal>
          <p className="lede">
            A gold set of verified extractions gates every scrape: amounts exact to the
            dollar, blanket agreements forced to refuse. The grader self-tests{" "}
            <strong>{GATE.graderSelfTest}</strong>; the v1 scrape replays{" "}
            {GATE.replayAttempted} attempted + {GATE.replayDeferred} deferred. Bad data
            never reaches the engine — and the loop refuses to scale on it.
          </p>
        </Reveal>

        <Reveal>
          <p className="kicker" style={{ marginTop: "2rem" }}>
            Same-BBL deed pairs surviving the gate, by rate-vintage exit cohort — every
            row of attrition shown, nothing hidden:
          </p>
        </Reveal>

        <Reveal>
          <div className="cohorts">
            {COHORTS.map((c) => (
              <div className={`coh ${c.highlight ? "hl" : ""}`} key={c.key}>
                <div className="ch">{c.label}</div>
                <div className="cr">{c.range}</div>
                <div className="wf">
                  <div className="step"><span>census pairs</span><span className="v">{c.census}</span></div>
                  <div className="step"><span>extracted</span><span className="v">{c.extracted}</span></div>
                  <div className="step"><span>structural pass</span><span className="v">{c.structural}</span></div>
                  <div className="step"><span>sane LTV</span><span className="v">{c.saneLtv}</span></div>
                  <div className="step dim"><span>· leveraged / all-cash</span><span className="v">{c.leveraged} / {c.allCash}</span></div>
                  <div className="step dim"><span>· bad-LTV excluded</span><span className="v">−{c.badLtvExcluded}</span></div>
                  <div className="step dim"><span>calibrated (diag.)</span><span className="v">{c.calibrated}</span></div>
                </div>
                <div className="nfinal">
                  <span className="k">Data n</span>
                  <span className="n">{c.dataN}</span>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal>
          <p className="kicker" style={{ marginTop: "1.4rem" }}>
            Four populated cohorts, every bucket ≥ 14 survivors. The waterfall is the
            honesty artifact — the model only decomposes what survived the gate.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function SignalScroll() {
  const maxShare = 0.12;
  return (
    <section className="scroll dark">
      <div className="scroll-inner">
        <p className="eyebrow">
          <span className="num">04</span>
          <span>The signal — and where it goes</span>
          <span className="rule" />
        </p>
        <Reveal as="h2" className="h2">
          The rate force grows into the <span className="accent">high-rate regime.</span>
        </Reveal>
        <Reveal>
          <p className="lede">
            The rate force — real dated Treasury rates against the real recovered LTV, the
            one proxy-free leg — takes a larger share of higher-for-longer exit moves than
            of pre-2020 ones. The thesis direction, read straight off the public record.
          </p>
        </Reveal>

        <Reveal>
          <div className="bars">
            {COHORTS.map((c) => (
              <div className={`rbar ${c.highlight ? "hl" : ""}`} key={c.key}>
                <div className="rl">
                  {c.label}
                  <small>leveraged n={c.leveragedN}</small>
                </div>
                <div className="track">
                  <div className="fill" style={{ width: `${(c.rateForceShare / maxShare) * 100}%` }} />
                </div>
                <div className="rv-val">{pct(c.rateForceShare)}</div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal>
          <div className="callout">
            Stated honestly: the rate force is <strong>directionally regime-ordered</strong>{" "}
            (11% for higher-for-longer vs 5% pre-2020) but a <strong>minority leg</strong> in
            thin data — the required-return residual and a hold-length NOI proxy carry the
            magnitude. The exact, foots-to-the-dollar result is the single calibrated
            decomposition above; this cohort signal is directional, not the headline.
          </div>
        </Reveal>

        <Reveal>
          <p className="expand">
            Today: NYC multifamily. The same loop — scrape, gate, recover, decompose —
            runs on <span className="accent">any county&rsquo;s records, any asset class.</span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
