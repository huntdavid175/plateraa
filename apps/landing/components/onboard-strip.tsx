import { VENDORS } from '../content/vendors';
import { Container } from './ui';

/**
 * A slow looping strip of the food businesses already on Brixx. Hidden until there are real,
 * approved names in `content/vendors.ts`.
 */
export function OnboardStrip() {
  if (VENDORS.length === 0) return null;
  // A short list repeats so the strip is wider than the screen before it loops.
  const copies = Math.max(1, Math.ceil(8 / VENDORS.length));
  const once = Array.from({ length: copies }, () => VENDORS).flat();
  const row = [...once, ...once];

  return (
    <section className="py-12 sm:py-16" aria-labelledby="onboard">
      <Container>
        <h2 id="onboard" className="text-center text-[15px] text-muted">
          Food businesses already taking orders with Brixx
        </h2>
      </Container>
      <div className="mt-6 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
        <ul className="marquee flex w-max items-center gap-3">
          {row.map((v, i) => (
            <li
              key={i}
              aria-hidden={i >= once.length}
              className="flex h-16 shrink-0 items-center gap-3 rounded-full bg-cream px-6"
            >
              {v.logo && <img src={v.logo} alt="" className="h-9 w-9 rounded-full object-cover" />}
              <span className="text-[20px] whitespace-nowrap text-ink sm:text-[22px]">
                {v.name}
              </span>
              {v.area && <span className="text-[14px] text-muted">{v.area}</span>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
