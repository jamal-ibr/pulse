import type { Metadata } from 'next';
import Link from 'next/link';
import { siteConfig } from '@/data/config';

export const metadata: Metadata = {
  title: 'Privacy Policy — Pulse AI',
  description: 'How Pulse AI collects, uses, and protects your personal data.',
  alternates: { canonical: `${siteConfig.siteUrl}/privacy` },
};

const sections = [
  {
    heading: 'Who we are',
    body: `Pulse AI ("we", "us") provides AI voice automation services for dental and healthcare practices in the UK. We are the data controller for personal data collected through this website, and a data processor for call data handled on behalf of our practice clients. Contact: ${siteConfig.email}.`,
  },
  {
    heading: 'What we collect',
    body: 'Through this website: your name, email address, phone number, and practice details when you book a demo or contact us. Through our service (on behalf of practice clients): caller name, contact details, treatment interest, and appointment preferences captured during calls handled by the AI receptionist.',
  },
  {
    heading: 'Why we process it',
    body: 'We process website enquiry data on the lawful basis of legitimate interest (responding to your enquiry) or in preparation for a contract. Call data is processed under contract with the practice you called, which remains the data controller for its patient relationships.',
  },
  {
    heading: 'Where it goes',
    body: 'We use trusted sub-processors to deliver the service, including telephony, speech, and AI model providers, and scheduling tools such as Calendly for demo bookings. We do not sell personal data. Data is stored within the UK/EEA where possible; where transfers occur, appropriate safeguards (such as UK IDTA or EU SCCs) are in place.',
  },
  {
    heading: 'How long we keep it',
    body: 'Website enquiry data is retained for up to 24 months after our last contact. Call recordings and transcripts are retained according to the controlling practice’s instructions and deleted on request.',
  },
  {
    heading: 'Your rights',
    body: `Under UK GDPR you have the right to access, rectify, erase, restrict, and object to processing of your personal data, and to data portability. To exercise any of these rights, email ${siteConfig.email}. You also have the right to complain to the ICO (ico.org.uk).`,
  },
];

export default function PrivacyPage() {
  return (
    <main className="bg-surface min-h-screen">
      <div className="d-container max-w-3xl py-16 lg:py-24">
        <Link href="/" className="text-sm font-medium text-primary hover:underline">
          ← Back to home
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-textDark sm:text-4xl">
          Privacy Policy
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
          Questions about this policy? Email{' '}
          <a href={`mailto:${siteConfig.email}`} className="text-primary hover:underline">
            {siteConfig.email}
          </a>
          .
        </p>
      </div>
    </main>
  );
}
