'use client';

import { siteConfig } from '@/data/config';

export function FinalCTA() {
  return (
    <section id="book" className="d-section bg-textDark">
      <div className="d-container text-center">
        <span className="inline-flex items-center rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-primaryLight">
          Take Action
        </span>

        <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
          Stop Losing £40k/Year to Voicemail
        </h2>

        <p className="mt-5 mx-auto max-w-xl text-lg text-gray-400">
          Every week without Pulse AI is another 1–2 high-value enquiries going to a competitor.
          Book a 15-minute demo — we&rsquo;ll show you exactly how many leads you&rsquo;re missing.
        </p>

        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href={siteConfig.calendlyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-8 py-4 text-base font-semibold text-white shadow-cta transition-all hover:bg-primaryDark hover:shadow-ctaHover"
          >
            Book 15-Min Demo
            <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>

          <a
            href="#demo"
            className="inline-flex items-center justify-center rounded-xl border border-white/20 px-8 py-4 text-base font-semibold text-white transition-colors hover:border-white/40 hover:bg-white/5"
          >
            Watch Demo Video
          </a>
        </div>

        <p className="mt-5 text-sm text-gray-500">
          No obligation · 15 minutes · Results-focused conversation
        </p>

        {/* Contact */}
        <div className="mt-10 border-t border-white/10 pt-8">
          <p className="text-sm text-gray-400">
            Prefer to email?{' '}
            <a
              href={`mailto:${siteConfig.email}`}
              className="font-semibold text-primaryLight hover:text-white transition-colors"
            >
              {siteConfig.email}
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
