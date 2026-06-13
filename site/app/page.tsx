export default function Page() {
  return (
    <main>
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

      <footer>
        Basis · built at Anthropic Build Day on Opus 4.8 · public records only ·{" "}
        <a href="https://github.com/lsarta/basis">github.com/lsarta/basis</a>
      </footer>
    </main>
  );
}
