import type { Capability, Pesewas } from '@plateraa/shared';
import type { Sql } from '../offline/sql';
import { provisionalSql } from '../offline/store';
import { cedis } from '../ui/theme';

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

/** Cash taken out (a drop), put in, or paid out by a manager on the dashboard. */
export interface DrawerMovement {
  id: string;
  type: 'DROP' | 'PAY_IN' | 'PAYOUT';
  amount: Pesewas;
  note: string | null;
  staffName: string | null;
  at: string;
}

export interface OpenDrawer {
  id: string;
  openedByName: string | null;
  openedAt: string;
  float: Pesewas;
  movements: DrawerMovement[];
}

export interface ClosedDrawer {
  id: string;
  closedBy: string | null;
  closedByName: string | null;
  closedAt: string;
  expected: Pesewas;
  counted: Pesewas;
  /** Counted less expected: below zero is short, above is over. */
  variance: Pesewas;
  /** 1 until the server has the close and has checked the figures. */
  provisional: number;
}

export interface DrawerState {
  open: OpenDrawer | null;
  lastClosed: ClosedDrawer | null;
}

/** This tablet's drawer, for the Drawer tab. Expected cash is only worked out at close. */
export async function loadDrawer(db: Sql, deviceId: string): Promise<DrawerState> {
  const open = await db.get<Omit<OpenDrawer, 'movements'>>(
    `SELECT s.id, s.opened_at AS openedAt, s.float_amount AS float, st.display_name AS openedByName
       FROM shifts s LEFT JOIN staff st ON st.id = s.opened_by
      WHERE s.device_id = ? AND s.status = 'OPEN' LIMIT 1`,
    [deviceId],
  );
  const movements = open
    ? await db.all<DrawerMovement>(
        `SELECT m.id, m.type, m.amount, m.note, m.created_at_device AS at,
                st.display_name AS staffName
           FROM cash_movements m LEFT JOIN staff st ON st.id = m.staff_id
          WHERE m.shift_id = ? ORDER BY m.created_at_device`,
        [open.id],
      )
    : [];
  const lastClosed = await db.get<ClosedDrawer>(
    `SELECT s.id, s.closed_by AS closedBy, s.closed_at AS closedAt, s.expected_cash AS expected,
            s.counted_cash AS counted, s.variance, st.display_name AS closedByName,
            ${provisionalSql('shifts', 's.id')} AS provisional
       FROM shifts s LEFT JOIN staff st ON st.id = s.closed_by
      WHERE s.device_id = ? AND s.status = 'CLOSED'
      ORDER BY s.closed_at DESC LIMIT 1`,
    [deviceId],
  );
  return { open: open ? { ...open, movements } : null, lastClosed: lastClosed ?? null };
}

/**
 * A close's figures (expected, counted, difference) are shown to the person who counted, and to
 * anyone allowed to see revenue: expected cash includes the shift's cash sales.
 */
export function seesDrawerResult(
  viewer: { id: string; capabilities: ReadonlySet<Capability> },
  closedBy: string | null,
): boolean {
  return viewer.id === closedBy || viewer.capabilities.has('reports.revenue.view');
}

/** The difference at close, in words: always a word, never only a colour. */
export function varianceWords(variance: Pesewas): {
  words: string;
  tone: 'good' | 'amber' | 'red';
} {
  if (variance === 0) return { words: 'Exactly right', tone: 'good' };
  if (variance < 0) return { words: `Short by ${cedis(-variance)}`, tone: 'red' };
  return { words: `Over by ${cedis(variance)}`, tone: 'amber' };
}
