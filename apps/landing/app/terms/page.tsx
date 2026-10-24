import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage } from '../../components/legal';
import { ONLINE_FEE_WORDS } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The basics of using Brixx: your account, your money, our fee and your data.',
  alternates: { canonical: '/terms' },
};

/*
 * A plain-language summary of how Brixx works for a vendor (15 Oct 2026). Founder task: the
 * binding terms come from the lawyer; this page must be replaced or approved before launch.
 */
export default function TermsPage() {
  return (
    <LegalPage label="Legal" title="Terms" updated="15 October 2026">
      <p>
        These are the basics of using Brixx, in plain words. Our full terms of service are being
        prepared with our lawyer and will replace this summary.
      </p>

      <h2>Your account</h2>
      <p>
        You’re responsible for your account, the staff you add and the PINs they use. Keep your
        password and PINs to yourselves, and tell us straight away if you think someone else has
        access.
      </p>

      <h2>Your money</h2>
      <p>
        Mobile money from your customers goes into your own Moolre merchant account, under Moolre’s
        own terms. Brixx doesn’t hold your money. Cash you take at the counter is recorded on Brixx
        but never passes through us.
      </p>

      <h2>Our fee</h2>
      <p>
        Brixx is free to start and has no monthly fee. Our share is {ONLINE_FEE_WORDS} of each
        payment a customer makes to you online through Brixx, by payment link or through your online
        store. Cash sales are free. Moolre charges its own fee on mobile money payments.
      </p>

      <h2>Your data</h2>
      <p>
        Your menu, orders, records and customers belong to you. See our{' '}
        <Link href="/privacy" className="text-brand-strong underline underline-offset-4">
          privacy page
        </Link>{' '}
        for what we collect and how we look after it.
      </p>

      <h2>Fair use</h2>
      <p>
        Use Brixx for your own food business and within the law. We may suspend an account that’s
        used for fraud or that puts other vendors or customers at risk.
      </p>
    </LegalPage>
  );
}
