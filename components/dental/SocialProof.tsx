const metrics = [
  { value: '24/7', label: 'Call coverage', sub: 'Every call answered, including after hours' },
  { value: '<60s', label: 'Lead handoff time', sub: 'From call end to your inbox' },
  { value: '97%+', label: 'Triage accuracy', sub: 'Urgency classification in demo testing' },
];

export function SocialProof() {
  return (
    <section className="d-section bg-white">
      <div className="d-container">
        {/* Product performance */}
        <div className="grid gap-5 sm:grid-cols-3 max-w-3xl mx-auto mb-4">
          {metrics.map((m) => (
            <div key={m.label} className="text-center">
              <p className="text-4xl font-extrabold text-primary">{m.value}</p>
              <p className="mt-1 font-semibold text-textDark text-sm">{m.label}</p>
              <p className="mt-0.5 text-xs text-textMuted">{m.sub}</p>
            </div>
          ))}
        </div>
        <p className="mb-12 text-center text-xs text-textLight">
          Figures from internal demo testing across emergency, high-value, urgent, and routine call scenarios.
        </p>

        {/* Early access — honest placeholder until real results exist */}
        <div className="mx-auto max-w-2xl">
          <div className="d-card border-dashed border-borderStrong text-center">
            <blockquote className="text-lg font-medium text-textDark">
              Early access results coming soon
            </blockquote>
            <p className="mt-3 text-sm text-textMuted">
              We&rsquo;re onboarding our first cohort of cosmetic dental practices.
              Real case studies and testimonials will be published here — nothing
              simulated, nothing borrowed.
            </p>

            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-surfaceAlt px-4 py-2 text-sm font-medium text-textBody">
              <span className="h-2 w-2 rounded-full bg-green-400" />
              Now onboarding early access practices
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
