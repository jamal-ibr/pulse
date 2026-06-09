'use client';

import { siteConfig } from '@/data/config';

export function DemoVideo() {
  return (
    <section id="demo" className="d-section bg-white">
      <div className="d-container">
        <div className="mx-auto max-w-3xl text-center">
          <span className="d-badge">See It In Action</span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-textDark sm:text-4xl">
            Hear Pulse AI Handle an Invisalign Enquiry
          </h2>
          <p className="mt-4 text-lg text-textMuted">
            See exactly what your patients experience when they call after hours.
          </p>
        </div>

        {/* Video embed */}
        <div className="mt-10 mx-auto max-w-3xl">
          <div className="relative overflow-hidden rounded-2xl border border-border shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
            {/* Placeholder panel — swap for the Loom/YouTube embed when the video is ready */}
            <div className="aspect-video bg-gray-900 flex flex-col items-center justify-center gap-5">
              <div className="text-center">
                <p className="text-white font-semibold">Pulse AI — Invisalign Enquiry Demo</p>
                <p className="mt-1 text-gray-400 text-sm">From first ring to booked consultation</p>
              </div>

              {/* Decorative waveform (deterministic heights to keep SSR/client markup identical) */}
              <div className="flex items-center gap-0.5 opacity-40">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1 rounded-full bg-primary"
                    style={{
                      height: `${12 + Math.sin(i * 0.7) * 8 + Math.sin(i * 2.3) * 4}px`,
                      animationDelay: `${i * 50}ms`,
                    }}
                  />
                ))}
              </div>

              <a
                href={siteConfig.calendlyUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/25 px-5 py-2 text-sm font-medium text-white transition-colors hover:border-white/50 hover:bg-white/10"
              >
                Demo video coming soon — book a live demo instead
              </a>
            </div>
          </div>
        </div>

        {/* CTA below video */}
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href={siteConfig.calendlyUrl}
            target="_blank"
            rel="noreferrer"
            className="d-btn-primary text-base py-4 px-8"
          >
            Ready to try this? Book your demo →
          </a>
        </div>

        {/* Social proof micro-copy */}
        <p className="mt-4 text-center text-sm text-textMuted">
          15-minute call. No obligation. See exactly what Pulse AI can do for your practice.
        </p>
      </div>
    </section>
  );
}
