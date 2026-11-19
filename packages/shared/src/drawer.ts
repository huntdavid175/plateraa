/**
 * How a drawer close came out. Counting coins at the end of a long day is rarely perfect, so a
 * difference of GH₵1 or less either way counts as exact (user decision, 19 Nov): the red only
 * shows when it matters. `variance` is counted − expected, in pesewas.
 */
export const DRAWER_TOLERANCE = 100;

export type DrawerResult = 'EXACT' | 'SHORT' | 'OVER';

export function drawerResult(variance: number): DrawerResult {
  if (Math.abs(variance) <= DRAWER_TOLERANCE) return 'EXACT';
  return variance < 0 ? 'SHORT' : 'OVER';
}
