'use client';

import { useEffect, useRef, useState } from 'react';

const stats = [
  {
    value: '5–8',
    unit: 'per month',
    label: 'High-value enquiries missed',
    sub: 'Invisalign, veneers, smile makeovers',
    color: 'border-red-200 bg-red-50',
    textColor: 'text-red-600',
  },
  {
    value: '£40k',
    unit: 'per year',
    label: 'Revenue at risk per practice',
    sub: 'Based on £4–5k average treatment value',
    color: 'border-amber-200 bg-amber-50',
    textColor: 'text-amber-600',
  },
  {
    value: '68%',
    unit: '',
    label: 'Of cosmetic enquiries happen after 6pm',
    sub: 'When your reception is closed',
    color: 'border-orange-200 bg-orange-50',
    textColor: 'text-orange-600',
  },
];

function StatCard({
  value,
  unit,
  label,
  sub,
  color,
  textColor,
  delay,
}: (typeof stats)[0] & { delay: number }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.3 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`d-card border ${color} transition-all duration-700`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(24px)',
        transitionDelay: `${delay}ms`,
      }}
    >
      <p className={`text-4xl font-extrabold tracking-tight ${textColor}`}>
        {value}
        {unit && <span className="ml-1.5 text-base font-medium text-textMuted">{unit}</span>}
      </p>
      <p className="mt-2 font-semibold text-textDark">{label}</p>
      <p className="mt-1 text-sm text-textMuted">{sub}</p>
    </div>
  );
}

export function ProblemSection() {
  return (
    <section id="problem" className="d-section bg-surfaceAlt">
      <div className="d-container">
        {/* Heading */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="d-badge">The Problem</span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-textDark sm:text-4xl">
            Every Missed Call Costs You Money
          </h2>
          <p className="mt-4 text-lg text-textMuted">
            Your reception closes at 6pm. Patients research Invisalign at 9pm.
            They call your competitor who answers 24/7.
          </p>
        </div>

        {/* Stat cards */}
        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {stats.map((stat, i) => (
            <StatCard key={stat.label} {...stat} delay={i * 120} />
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-textLight">
          Illustrative figures, modelled on average UK cosmetic treatment values — not guarantees.
        </p>

        {/* Scenario callout */}
        <div className="mt-10 d-card border-l-4 border-l-primary bg-primaryLight/30">
          <div className="flex gap-4">
            <div className="flex-shrink-0 mt-1">
              <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-textDark">A typical Tuesday evening scenario:</p>
              <p className="mt-1 text-textMuted">
                A patient searches &ldquo;Invisalign near me&rdquo; at 9pm and calls your practice. Your
                voicemail picks up. They call the next practice on Google — one that uses Pulse AI.
                That practice books a <span className="font-semibold text-textDark">£4,200 consultation</span> before midnight.
                You find a missed call in the morning.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
