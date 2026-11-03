/**
 * The colour each menu category is known by on the tablet (3 Nov, user request, following the
 * CosyPOS counter): its chip and every one of its tiles share one soft pastel, so Fresh juice
 * and Snacks are told apart at a glance before anyone reads a name. As with the people colours,
 * the ink is always dark on its own soft ground, so one palette serves both looks.
 */
export interface CategoryColour {
  /** The soft ground: the tile, and the chip while it isn't chosen. */
  tint: string;
  /** The tile under the finger. */
  pressed: string;
  /** The name, the count and the chosen chip. Dark, so it reads in either look. */
  ink: string;
  /** The price and other second lines on the tint. */
  soft: string;
}

export const CATEGORY_COLOURS: readonly CategoryColour[] = [
  { tint: '#C6EBD6', pressed: '#BAE3CC', ink: '#14532D', soft: '#2E6B49' }, // mint
  { tint: '#E3D2F4', pressed: '#D8C5EC', ink: '#4B2775', soft: '#64478C' }, // lilac
  { tint: '#C5E0F0', pressed: '#B7D6E8', ink: '#123F5E', soft: '#2F5C78' }, // sky
  { tint: '#F8C8DE', pressed: '#F0BAD3', ink: '#7A1C49', soft: '#86335A' }, // pink
  { tint: '#CFCFF7', pressed: '#C2C2EF', ink: '#2D2D78', soft: '#4A4A90' }, // periwinkle
  { tint: '#F4E6B0', pressed: '#ECDC9F', ink: '#56450A', soft: '#6B5A20' }, // butter
  { tint: '#C2E9E4', pressed: '#B3DFD9', ink: '#0E4F49', soft: '#2B6660' }, // aqua
  { tint: '#EED6D6', pressed: '#E5C8C8', ink: '#6E2B2B', soft: '#844646' }, // blush
];

/**
 * Categories take the colours in the order the menu lists them (the dashboard's order), so the
 * counter and the Stock tab agree, and nothing is stored. Moving a category on the dashboard
 * recolours it; a ninth category starts the colours again.
 */
export function categoryColours(
  categories: readonly { id: string | null }[],
): ReadonlyMap<string, CategoryColour> {
  return new Map(
    categories.map((category, place) => [
      category.id ?? 'other',
      CATEGORY_COLOURS[place % CATEGORY_COLOURS.length]!,
    ]),
  );
}

/** An item's colour, from its category; the first colour if the category isn't on the menu. */
export const colourOf = (
  colours: ReadonlyMap<string, CategoryColour>,
  categoryId: string | null,
): CategoryColour => colours.get(categoryId ?? 'other') ?? CATEGORY_COLOURS[0]!;
