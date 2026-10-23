import { clock, shortDate, todayHere } from './money';
import type { Tablet } from './team';

/** Something the owner should know about a tablet (see apps/api/src/sync/tablet-health.ts). */
export type TabletAlert = Tablet['alerts'][number];

const changes = (count: number) => (count === 1 ? '1 change' : `${count} changes`);

/** "since 13:05" today, or "since Sat 12 Sep, 21:40" for an earlier day. */
function since(iso: string): string {
  const day = new Date(iso).toLocaleDateString('en-CA');
  return day === todayHere() ? `since ${clock(iso)}` : `since ${shortDate(day)}, ${clock(iso)}`;
}

/** The alert as one sentence about `name`. */
export function tabletAlertWords(name: string, alert: TabletAlert): string {
  switch (alert.kind) {
    case 'OUT_OF_TOUCH':
      return alert.since
        ? `${name} hasn’t been in touch ${since(alert.since)}, though its drawer is open. Sales taken on it meanwhile aren’t in these figures yet.`
        : `${name} has its drawer open but hasn’t been in touch yet.`;
    case 'STUCK':
      return `${name} is online, but ${changes(alert.count)} on it aren’t going through${alert.since ? ` (last full sync ${since(alert.since).replace('since ', '')})` : ''}. Brixx has been alerted.`;
    case 'WAITING':
      return `${name} has ${changes(alert.count)} waiting to upload${alert.since ? ` ${since(alert.since)}` : ''}. Check its internet connection.`;
    case 'REFUSED':
      return `${changes(alert.count)} from ${name} ${alert.count === 1 ? 'was' : 'were'} refused in the last day. See “Needs attention” on the tablet.`;
  }
}

/** Red for what needs someone now; amber for what's probably the connection. */
export const alertTone = (alert: TabletAlert): 'red' | 'amber' =>
  alert.kind === 'STUCK' || alert.kind === 'REFUSED' ? 'red' : 'amber';
