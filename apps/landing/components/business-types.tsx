import { PHOTOS, type Photo } from '../content/photos';
import { ButtonLink, Container, PhotoSlot, SectionHeading } from './ui';

const TYPES: { name: string; line: string; image: Photo }[] = [
  { name: 'Chop bars', line: 'Fufu, banku and soups by the portion', image: PHOTOS.typeChopBar },
  {
    name: 'Rice and waakye spots',
    line: 'Busy mornings, extras on every plate',
    image: PHOTOS.typeRice,
  },
  { name: 'Fast food', line: 'Fried rice, chicken and combos', image: PHOTOS.typeFastFood },
  { name: 'Grills', line: 'Tilapia, chicken and kebabs to order', image: PHOTOS.typeGrill },
  {
    name: 'Street food stalls',
    line: 'One tablet, wherever you set up',
    image: PHOTOS.typeStreetFood,
  },
  { name: 'Cafés and bakeries', line: 'Pastries, bread and coffee', image: PHOTOS.typeCafe },
  { name: 'Juice bars', line: 'Sizes, flavours and quick pickups', image: PHOTOS.typeJuice },
  {
    name: 'Cloud kitchens',
    line: 'Online orders straight to the kitchen',
    image: PHOTOS.typeCloudKitchen,
  },
];

/** The kinds of food business Plateraa is made for, as photo tiles (user request, 15 Oct). */
export function BusinessTypes({
  title = 'Made for every kind of food business',
  intro = 'From a single waakye pot to a busy chop bar with a team, Plateraa fits the way you already serve.',
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
          {TYPES.map((t) => (
            <li key={t.name}>
              <PhotoSlot photo={t.name} image={t.image} className="aspect-[4/5] rounded-[24px]">
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
