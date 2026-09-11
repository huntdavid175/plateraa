/**
 * The drawer is opened at the start of the day, not in the middle of the first sale: the counter
 * asks for the float as soon as someone who runs the drawer unlocks and none is open. "Not now"
 * holds for the rest of the trading day; the first cash sale then asks instead.
 */
export function asksForDrawer(input: {
  runsDrawer: boolean;
  /** Whether this tablet has an open drawer; null while that's still being read. */
  drawerOpen: boolean | null;
  skippedOn: string | null;
  today: string;
}): boolean {
  return input.runsDrawer && input.drawerOpen === false && input.skippedOn !== input.today;
}
