'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ulid } from 'ulid';
import { ArrowLeft, DarkToggle } from '../../../components/ui';
import type { Store } from '../../../lib/api';
import { priceCart, type CartLine } from '../../../lib/cart';
import type { ChatMessage, Placed } from '../../../lib/chat';
import { ghs } from '../../../lib/money';
import { chat } from '../../actions';

/** The chat, with the order it has built so far pinned underneath. */
export function Chat({ store }: { store: Store }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `Hi! Welcome to ${store.name}. What would you like to order today?`,
    },
  ]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [orderId, setOrderId] = useState(() => ulid());
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy, placed]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const history: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setDraft('');
    setBusy(true);
    setProblem(null);
    const result = await chat(store.slug, history, cart, orderId);
    setBusy(false);
    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    setCart(result.cart);
    if (result.reply) setMessages([...history, { role: 'assistant', content: result.reply }]);
    if (result.placed) {
      setPlaced(result.placed);
      setCart([]);
      setOrderId(ulid());
    }
  };

  const priced = priceCart(store, cart);
  const total = priced.reduce((sum, line) => sum + line.lineTotal, 0);

  return (
    <div className="mx-auto flex h-dvh max-w-[430px] flex-col lg:max-w-2xl">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link href={`/${store.slug}`} aria-label="Back to the menu" className="text-ink">
          <ArrowLeft />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{store.name}</p>
          <p className="text-xs text-muted">Order by chat · test</p>
        </div>
        <DarkToggle />
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <ul className="flex flex-col gap-2">
          {messages.map((message, index) => (
            <li
              key={index}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] whitespace-pre-wrap ${
                message.role === 'user'
                  ? 'self-end bg-brand text-on-brand'
                  : 'self-start bg-tile text-ink'
              }`}
            >
              {message.content}
            </li>
          ))}
          {busy && (
            <li className="self-start rounded-2xl bg-tile px-3.5 py-2 text-[15px] text-muted">…</li>
          )}
        </ul>

        {placed && (
          <div className="mt-4 border-t border-border pt-4 text-sm">
            <p className="font-semibold text-ink">Order {placed.number} placed</p>
            {placed.payProblem && <p className="mt-1 text-red">{placed.payProblem}</p>}
            <div className="mt-3 flex gap-2">
              {placed.payUrl && (
                <a
                  href={placed.payUrl}
                  className="rounded-full bg-brand px-4 py-2 font-semibold text-on-brand"
                >
                  Pay now
                </a>
              )}
              <Link
                href={`/${store.slug}/o/${placed.token}`}
                className="rounded-full border border-border px-4 py-2 font-semibold text-ink"
              >
                Track order
              </Link>
            </div>
          </div>
        )}
        {problem && <p className="mt-3 text-sm text-red">{problem}</p>}
        <div ref={end} />
      </div>

      {priced.length > 0 && (
        <div className="border-t border-border px-4 py-2 text-sm">
          {priced.map((line) => (
            <div key={line.uid} className="flex justify-between gap-3 text-muted">
              <span className="truncate">
                {line.quantity} × {line.name}
                {line.variantName ? ` (${line.variantName})` : ''}
                {line.extras.length ? ` · ${line.extras.join(', ')}` : ''}
              </span>
              <span className="font-mono">{ghs(line.lineTotal)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between font-semibold text-ink">
            <span>Items</span>
            <span className="font-mono">{ghs(total)}</span>
          </div>
        </div>
      )}

      <form
        className="flex gap-2 border-t border-border px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type your order…"
          aria-label="Message"
          className="min-w-0 flex-1 rounded-full border border-border bg-page px-4 py-2.5 text-[15px] text-ink outline-none placeholder:text-muted focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="rounded-full bg-brand px-5 font-semibold text-on-brand disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
