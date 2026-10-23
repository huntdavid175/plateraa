import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage } from '../../components/legal';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What Brixx collects, why, where it’s kept and how to ask us about it.',
  alternates: { canonical: '/privacy' },
};

/*
 * A plain-language account of what Brixx does with data today, written from the code
 * (15 Oct 2026). Founder task: have the lawyer review it before the site goes live.
 */
export default function PrivacyPage() {
  return (
    <LegalPage label="Legal" title="Privacy" updated="15 October 2026">
      <p>
        This page explains, in plain words, what Brixx collects, why we need it and how we look
        after it. Our full privacy policy is being reviewed by our lawyer and will replace this
        summary.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>About you: your name, email address and phone number when you create an account.</li>
        <li>
          About your business: its name, menu, prices, photos you upload, opening hours, delivery
          areas, staff names and roles.
        </li>
        <li>
          Your business records: orders, payments, refunds, expenses, cash drawer counts and stock,
          so your figures add up.
        </li>
        <li>
          Your customers’ details, when they give them: a name and phone number for a delivery, a
          payment link or an online order.
        </li>
      </ul>

      <h2>What we use it for</h2>
      <p>
        To run Brixx for you: taking and keeping your orders, showing your reports, sending payment
        links and order texts, and helping when something goes wrong. We don’t sell your data or
        your customers’ data.
      </p>

      <h2>Payments</h2>
      <p>
        Mobile money payments are handled by Moolre and go into your own Moolre merchant account.
        Brixx records that a payment was made and confirmed. We never see or keep a customer’s
        mobile money PIN.
      </p>

      <h2>Where it’s kept</h2>
      <p>
        Your data is stored with the cloud providers we use to run Brixx, on servers in the European
        Union, and your photos are kept in cloud storage. When something breaks, an error report is
        sent to our monitoring service without personal details. Your tablet keeps the records it
        needs to work offline until they’re sent up.
      </p>

      <h2>Cookies</h2>
      <p>
        This website doesn’t use advertising or tracking cookies. The Brixx dashboard uses a cookie
        to keep you signed in.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask us what we hold about you, ask us to correct it, or ask us to delete your
        account and your business’s data.{' '}
        <Link href="/contact" className="text-brand-strong underline underline-offset-4">
          Contact us
        </Link>{' '}
        and we’ll help.
      </p>
    </LegalPage>
  );
}
