'use client';

import { Message } from '../components/ui';

/** No connection to the store, or something unexpected. */
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <Message icon="⚡" title="Something went wrong">
        <p className="mt-2 text-sm text-muted">No connection, or something unexpected.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-xl bg-[#e8701a] px-6 py-2.5 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </Message>
    </main>
  );
}
