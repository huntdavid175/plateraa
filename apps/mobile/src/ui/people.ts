/**
 * The colour each person is known by on the tablet: a soft block behind their initial, and the
 * whole row in that colour once they're picked (16 Sep, user request, following the CosyPOS
 * lock screen). The same eight colours work on the light and the dark look, since the ink is
 * always dark on its own soft ground.
 */
export interface PersonColour {
  /** The soft ground: the avatar, and the row behind whoever is picked. */
  tint: string;
  /** The initial, and the name on that ground. Dark, so it reads in either look. */
  ink: string;
}

export const PERSON_COLOURS: readonly PersonColour[] = [
  { tint: '#DDD6FE', ink: '#4A3A8C' }, // lavender
  { tint: '#C7EFDC', ink: '#155E45' }, // mint
  { tint: '#FBD5E0', ink: '#8A2C50' }, // pink
  { tint: '#CFE4FB', ink: '#1C4A80' }, // sky
  { tint: '#FCDFC7', ink: '#844515' }, // peach
  { tint: '#F4E7AE', ink: '#67500F' }, // lemon
  { tint: '#DDE7C7', ink: '#475A24' }, // sage
  { tint: '#EFD6CC', ink: '#754133' }, // clay
];

/**
 * Always the same colour for the same person, on every tablet, without storing anything: the
 * staff id decides it. Order in the list doesn't, so a new colleague can't recolour the others.
 */
export function personColour(id: string): PersonColour {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 100_000_007;
  }
  return PERSON_COLOURS[hash % PERSON_COLOURS.length]!;
}

/** The letter in the circle: the first of their name, or "·" for a name we can't read. */
export function initialOf(name: string): string {
  const first = name.trim()[0];
  return first ? first.toUpperCase() : '·';
}
