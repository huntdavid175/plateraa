import { PHOTOS, type Photo } from '../content/photos';
import { ButtonLink, Container, cx, PhotoSlot, SectionHeading } from './ui';

/*
 * The kinds of business shown (user, 15 Oct: cafés and bakeries, juice bars, cloud kitchens,
 * pizzerias, hotels, bars and lounges, quick service). The first tile is wide.
 */
const TYPES: { name: string; line: string; image: Photo }[] = [
  {
    name: 'Quick service',
    line: 'Fast counter orders, combos and pickups',
    image: PHOTOS.typeQuick,
  },
  { name: 'Pizzerias', line: 'Sizes, toppings and deliveries', image: PHOTOS.typePizzeria },
  {
    name: 'Cafés and bakeries',
    line: 'Coffee to order and pastries that sell out',
    image: PHOTOS.typeCafe,
  },
  { name: 'Juice bars', line: 'Sizes, flavours and quick pickups', image: PHOTOS.typeJuice },
  {
    name: 'Bars and lounges',
    line: 'Food and drinks through the night',
    image: PHOTOS.typeBar,
  },
  { name: 'Hotels', line: 'Restaurant and takeaway in one list', image: PHOTOS.typeHotel },
  {
    name: 'Cloud kitchens',
    line: 'Online orders straight to the kitchen',
    image: PHOTOS.typeCloudKitchen,
  },
];

/** The kinds of food business Plateraa is made for, as photo tiles (user request, 15 Oct). */
export function BusinessTypes({
  title = 'Made for every kind of food business',
  intro = 'From a corner café to a busy hotel kitchen, Plateraa fits the way you already serve.',
  more = false,
}: {
  title?: string;
  intro?: string;
  /** Adds a link to the Who it's for page under the tiles. */
  more?: boolean;
}) {
  return (
    <section className="reveal py-16 sm:py-24">
      <Container>
        <SectionHeading title={title} intro={intro} />
        <ul className="mt-12 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {TYPES.map((t, i) => (
            <li key={t.name} className={i === 0 ? 'col-span-2' : undefined}>
              <PhotoSlot
                photo={t.name}
                image={t.image}
                className={cx(
                  'rounded-[24px]',
                  i === 0 ? 'aspect-[16/10] lg:aspect-auto lg:h-full' : 'aspect-[4/5]',
                )}
              >
                <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(21,17,14,0.88)_100%)]" />
                <div className="absolute inset-x-4 bottom-4 sm:inset-x-5 sm:bottom-5">
                  <h3 className="text-[18px] leading-tight tracking-[-0.01em] text-white sm:text-[22px]">
                    {t.name}
                  </h3>
                  <p className="mt-1 hidden text-[14px] leading-snug text-white/85 sm:block">
                    {t.line}
                  </p>
                </div>
              </PhotoSlot>
            </li>
          ))}
        </ul>
        {more && (
          <div className="mt-10">
            <ButtonLink href="/who-its-for" kind="outline">
              See who Plateraa is for
            </ButtonLink>
          </div>
        )}
      </Container>
    </section>
  );
}
