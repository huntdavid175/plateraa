import { CircleMinus, CirclePlus } from 'lucide-react';

import { JsonLd } from './json-ld';
import { Container } from './ui';

export interface Question {
  q: string;
  a: string;
}

/**
 * Toast's FAQ: cream rows, the open one turns dark. Plain <details>, so it works by keyboard and
 * without script, and the same questions go to search engines as FAQPage data.
 */
export function Faq({
  questions,
  title = 'Questions vendors ask',
}: {
  questions: Question[];
  title?: string;
}) {
  return (
    <section className="reveal py-20 sm:py-28">
      <Container className="grid gap-10 lg:grid-cols-[1fr_2fr]">
        <h2 className="text-[34px] leading-[1.08] tracking-[-0.02em] sm:text-[44px]">{title}</h2>
        <div className="space-y-3">
          {questions.map((item, i) => (
            <details key={item.q} className="group" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-full bg-cream px-6 py-4 text-[16px] text-ink transition-colors group-open:bg-ink group-open:text-white [&::-webkit-details-marker]:hidden">
                {item.q}
                <CirclePlus
                  size={22}
                  strokeWidth={1.5}
                  className="shrink-0 group-open:hidden"
                  aria-hidden
                />
                <CircleMinus
                  size={22}
                  strokeWidth={1.5}
                  className="hidden shrink-0 group-open:block"
                  aria-hidden
                />
              </summary>
              <p className="px-6 pt-4 pb-3 text-[16px] leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </Container>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: questions.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        }}
      />
    </section>
  );
}
