'use client';

import { bpsOf, formatCedis, parseCedis, pesewas } from '@brixx/shared';
import { useId, useState } from 'react';

import { ONLINE_FEE_BPS, ONLINE_FEE_WORDS } from '../lib/site';

/** "What would I pay?" Worked in whole pesewas, like everything else that touches money. */
export function FeeCalculator() {
  const id = useId();
  const [typed, setTyped] = useState('5,000');
  const amount = parseCedis(typed);
  const fee = amount === null ? null : bpsOf(amount, ONLINE_FEE_BPS);

  return (
    <div className="rounded-[24px] bg-white p-6 text-ink sm:p-8">
      <label htmlFor={id} className="block text-[16px] font-medium">
        How much do customers pay you online in a month?
      </label>
      <div className="mt-3 flex h-14 items-center rounded-full border border-line bg-cream px-5 focus-within:border-brand-strong">
        <span className="text-[17px] text-muted">GH₵</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="ml-2 w-full bg-transparent text-[20px] tabular-nums outline-none"
          aria-describedby={`${id}-result`}
        />
      </div>
      <div id={`${id}-result`} aria-live="polite" className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-brand-tint p-5">
          <p className="text-[14px] text-muted">Brixx’s {ONLINE_FEE_WORDS}</p>
          <p className="mt-1 text-[28px] font-medium tabular-nums">
            {fee === null ? 'Type an amount' : formatCedis(fee)}
          </p>
        </div>
        <div className="rounded-2xl bg-cream p-5">
          <p className="text-[14px] text-muted">On your cash sales</p>
          <p className="mt-1 text-[28px] font-medium tabular-nums">{formatCedis(pesewas(0))}</p>
        </div>
      </div>
      <p className="mt-4 text-[14px] leading-relaxed text-muted">
        Moolre charges its own fee on each mobile money payment, separate from Brixx’s.
      </p>
    </div>
  );
}
