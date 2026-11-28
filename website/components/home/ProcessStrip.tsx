export function ProcessStrip() {
  const steps = [
    {
      num: "01",
      title: "Design Together",
      desc: "We discuss your interior palette, botanical flowers, dimensions, and custom text over WhatsApp or studio visit.",
      time: "Day 1",
    },
    {
      num: "02",
      title: "Pour & Cure",
      desc: "Cast in multiple pigment layers over seasoned teak wood. Each wave requires 24 hours of chemical curing.",
      time: "Days 2–5",
    },
    {
      num: "03",
      title: "Finish & Polish",
      desc: "Hand-sanded to 3000-grit glass clarity and coated with UV-resistant scratch-safe artist grade seal.",
      time: "Day 6",
    },
    {
      num: "04",
      title: "Pack & Ship",
      desc: "Wrapped in protective custom honeycomb casing and shipped via DTDC / Delhivery insured courier.",
      time: "Day 7",
    },
  ];

  return (
    <section className="relative bg-[var(--surface-muted)] py-24 md:py-32 overflow-hidden border-y border-[var(--border)]">
      <div className="mx-auto w-full max-w-[1920px] px-6 sm:px-10 lg:px-16 2xl:px-24">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Our Studio Method
          </span>
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl mt-2">
            Patience in every layer.
          </h2>
          <p className="mt-3 text-sm text-[var(--text-muted)] leading-relaxed">
            Resin cannot be rushed. Creating true depth takes days of methodical curing, botanical dehydration, and fine hand polishing.
          </p>
        </div>

        {/* 4-Step Process Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((st, i) => (
            <div
              key={st.num}
              className="relative flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 transition-all hover:border-[var(--primary)] group"
            >
              <div>
                <div className="flex items-center justify-between mb-6">
                  <span className="font-serif text-2xl font-bold text-[var(--primary)]">
                    {st.num}
                  </span>
                  <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
                    {st.time}
                  </span>
                </div>
                <h3 className="font-serif text-xl font-semibold text-[var(--text)] mb-2">
                  {st.title}
                </h3>
                <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
                  {st.desc}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-[var(--border)] flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">
                  Studio Step {i + 1}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
