import type { Metadata } from 'next';
import Link from 'next/link';
import { siteConfig } from '@/data/config';

export const metadata: Metadata = {
  title: 'Terms of Service — Pulse AI',
  description: 'Terms governing use of the Pulse AI website and voice automation service.',
  alternates: { canonical: `${siteConfig.siteUrl}/terms` },
};

const sections = [
  {
    heading: 'The service',
    body: 'Pulse AI provides AI-powered call answering, lead qualification, and appointment-booking support for dental and healthcare practices. Service scope, setup fees, and monthly fees are agreed in a separate order or service agreement with each practice.',
  },
  {
    heading: 'Not clinical advice',
    body: 'The AI receptionist does not provide clinical advice, diagnose conditions, or quote final treatment pricing. Any pricing ranges mentioned on calls are indicative only. All clinical decisions and patient care remain the responsibility of licensed dental professionals at the practice.',
  },
  {
    heading: 'Acceptable use',
    body: 'You agree not to misuse the website or service, attempt to disrupt its operation, or use it to transmit unlawful content. We may suspend service for misuse or non-payment.',
  },
  {
    heading: 'Performance figures',
    body: 'Revenue, lead-volume, and ROI figures shown on this website are modelled estimates based on average UK cosmetic treatment values. They are illustrations, not guarantees. Actual results depend on call volume, treatment mix, and how quickly your team follows up on captured leads.',
  },
  {
    heading: 'Liability',
    body: 'To the maximum extent permitted by law, our total liability arising from the website or service is limited to the fees paid by you in the twelve months preceding the claim. Nothing in these terms limits liability for fraud or for death or personal injury caused by negligence.',
  },
  {
    heading: 'Data protection',
    body: 'Personal data is handled as described in our Privacy Policy. Where we process call data on behalf of a practice, a data processing agreement forms part of the service agreement.',
  },
  {
    heading: 'Changes and governing law',
    body: 'We may update these terms from time to time; the latest version applies from the date shown below. These terms are governed by the laws of England and Wales, and the courts of England and Wales have exclusive jurisdiction.',
  },
];

export default function TermsPage() {
  return (
    <main className="bg-surface min-h-screen">
      <div className="d-container max-w-3xl py-16 lg:py-24">
        <Link href="/" className="text-sm font-medium text-primary hover:underline">
          ← Back to home
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-textDark sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-textLight">Last updated: June 2026</p>

        <div className="mt-10 space-y-8">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-lg font-bold text-textDark">{s.heading}</h2>
              <p className="mt-2 leading-relaxed text-textMuted">{s.body}</p>
            </section>
          ))}
        </div>

        <p className="mt-12 border-t border-border pt-6 text-sm text-textLight">
          Questions about these terms? Email{' '}
          <a href={`mailto:${siteConfig.email}`} className="text-primary hover:underline">
            {siteConfig.email}
          </a>
          .
        </p>
      </div>
    </main>
  );
}
