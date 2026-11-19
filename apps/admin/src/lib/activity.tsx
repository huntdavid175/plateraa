import {
  ArrowLeftRight,
  Ban,
  Banknote,
  BookOpenText,
  Building2,
  CircleCheck,
  CircleSlash,
  CircleX,
  Coins,
  Eye,
  Flag,
  HandCoins,
  History,
  ImageIcon,
  Inbox,
  KeyRound,
  Link2,
  LogOut,
  MapPin,
  Package,
  Percent,
  ReceiptText,
  RotateCcw,
  Settings,
  Store,
  Tablet,
  Trash2,
  Undo2,
  UserCog,
  UserPlus,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { JsonViewer } from '@/components/arc/json-viewer/json-viewer';
import type { TimelineEvent } from '@/components/arc/timeline/timeline';
import {
  changeLines,
  changeSummary,
  groupRuns,
  isRecord,
  lineWords,
  runLines,
  runSubjects,
  type ActivityRow,
  type ChangeLine,
} from './changes';
import { actionWords, clock } from './format';

type Tone = NonNullable<TimelineEvent['tone']>;

/**
 * The icon for each part of a business, the same ones the vendor dashboard's sidebar uses (Menu is
 * the book, Cash the coins), so the team and the vendor see the same pictures.
 */
const AREA_ICONS: Record<string, LucideIcon> = {
  tenant: Building2,
  device: Tablet,
  staff: UserCog,
  item: BookOpenText,
  refund: Undo2,
  order: ReceiptText,
  payment: Banknote,
  payment_link: Link2,
  shift: Coins,
  stock: Package,
  customer: UserRound,
  settings: Settings,
  storefront: Store,
  delivery_zone: MapPin,
  expense: Wallet,
};

/**
 * Where one action needs its own icon or a colour. Colour marks an outcome someone may want to
 * see at a glance: green when a business can go on (approved, paid), amber for something to look
 * at (flagged, refunded, sold out), red when a business is stopped. Everything else stays quiet.
 */
const ACTION_LOOKS: Record<string, { icon?: LucideIcon; tone?: Tone }> = {
  'tenant.created': { icon: Inbox },
  'tenant.approved': { icon: CircleCheck, tone: 'success' },
  'tenant.declined': { icon: CircleX, tone: 'danger' },
  'tenant.suspended': { icon: Ban, tone: 'danger' },
  'tenant.restored': { icon: RotateCcw, tone: 'success' },
  'device.signed_out': { icon: LogOut, tone: 'warning' },
  'staff.created': { icon: UserPlus },
  'staff.pin_reset': { icon: KeyRound },
  'staff.pin_changed': { icon: KeyRound },
  'staff.pin_disabled': { icon: KeyRound },
  'item.photo': { icon: ImageIcon },
  'item.sold_out': { icon: CircleSlash, tone: 'warning' },
  'item.back_in_stock': { icon: CircleCheck, tone: 'success' },
  'item.removed': { icon: Trash2 },
  'refund.recorded': { tone: 'warning' },
  'order.discount_set': { icon: Percent },
  'order.flagged': { icon: Flag, tone: 'warning' },
  'payment.recorded': { tone: 'success' },
  'shift.payout': { icon: HandCoins },
  'shift.cash_movement': { icon: ArrowLeftRight },
  'settings.storefront': { icon: Store },
  'settings.revenue_visibility': { icon: Eye },
  'settings.moolre_account': { icon: Wallet },
  'settings.commissions': { icon: Percent },
  'storefront.cover': { icon: ImageIcon },
  'storefront.logo': { icon: ImageIcon },
  'delivery_zone.removed': { icon: Trash2 },
  'expense.removed': { icon: Trash2 },
  'stock.item_removed': { icon: Trash2 },
};

/** The icon and colour in an action's circle in a feed, so no circle is ever empty. */
export function actionMarker(action: string): Pick<TimelineEvent, 'icon' | 'tone'> {
  const look = ACTION_LOOKS[action];
  const Icon = look?.icon ?? AREA_ICONS[action.split('.')[0] ?? ''] ?? History;
  return { icon: <Icon aria-hidden />, tone: look?.tone ?? 'neutral' };
}

/** Before and after of one change, laid out for the feed's open row. */
function Lines({ lines }: { lines: ChangeLine[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5">
      {lines.map((line) => (
        <div key={line.label} className="contents">
          <dt className="text-muted-foreground">{line.label}</dt>
          <dd className="min-w-0 text-foreground">
            {line.from !== undefined && (
              <>
                <span className="text-muted-foreground">{line.from}</span>
                <span className="px-1.5 text-muted-foreground" aria-label="changed to">
                  →
                </span>
              </>
            )}
            {line.to}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The record as saved, for when someone needs the exact data (an id, a key), folded away. */
function Raw({ data }: { data: unknown }) {
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">
        Show the saved record
      </summary>
      <div className="mt-2">
        <JsonViewer
          data={data}
          rootName="change"
          defaultExpandDepth={2}
          searchable={false}
          showPath={false}
          maxHeight={240}
          label="The saved record"
        />
      </div>
    </details>
  );
}

const hasData = (row: ActivityRow) => row.before !== null || row.after !== null;

function OneChange({ row, lines }: { row: ActivityRow; lines: ChangeLine[] }) {
  return (
    <>
      {lines.length > 0 ? <Lines lines={lines} /> : <p>Nothing a person would see changed.</p>}
      <Raw data={{ before: row.before, after: row.after }} />
    </>
  );
}

function RunOfChanges({ run, overall }: { run: ActivityRow[]; overall: ChangeLine[] | null }) {
  return (
    <div className="flex flex-col gap-4">
      {overall && overall.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">Overall</h4>
          <Lines lines={overall} />
        </section>
      )}
      <section className="flex flex-col gap-1.5">
        <h4 className="text-xs font-medium text-muted-foreground">Each change</h4>
        <ol className="flex flex-col gap-1.5">
          {run.map((row) => {
            const lines = changeLines(row.before, row.after);
            return (
              <li key={row.id} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2">
                <span className="font-mono text-xs leading-5 text-muted-foreground">
                  {clock(row.createdAt)}
                </span>
                <span className="text-foreground">
                  {lines.length > 0
                    ? lines.map(lineWords).join(' · ')
                    : 'Nothing a person would see'}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
      <Raw data={run.map((row) => ({ at: row.createdAt, before: row.before, after: row.after }))} />
    </div>
  );
}

/**
 * Audited rows as a feed's updates: what was done in words, the change itself under it ("Store
 * look: Kente → Classic"), and runs of the same change folded into one ("changed store settings
 * 9 times"). `withBusiness` adds "at Nana's Kitchen" where the feed spans businesses.
 */
export function activityEvents(
  rows: ActivityRow[],
  { withBusiness = true }: { withBusiness?: boolean } = {},
): TimelineEvent[] {
  return groupRuns(rows).map((run) => {
    const newest = run[0]!;
    const oldest = run[run.length - 1]!;
    const where = withBusiness ? ` at ${newest.businessName}` : '';
    const base = { actor: newest.actorName, ...actionMarker(newest.action) };

    if (run.length === 1) {
      const lines = changeLines(newest.before, newest.after);
      return {
        ...base,
        id: newest.id,
        at: newest.createdAt,
        title: `${actionWords(newest.action)}${where}`,
        meta: changeSummary(lines),
        detail: hasData(newest) ? <OneChange row={newest} lines={lines} /> : undefined,
      };
    }

    // The same thing changed again and again (the store's settings): say where it ended up.
    const oneThing =
      run.every((row) => row.entityId === newest.entityId) && isRecord(oldest.before);
    const overall = oneThing ? runLines(run) : null;
    return {
      ...base,
      // The oldest id stays put as newer changes join the run, so the row doesn't jump.
      id: oldest.id,
      at: newest.createdAt,
      title: `${actionWords(newest.action)} ${run.length} times${where}`,
      meta: overall ? (changeSummary(overall) ?? 'Ended as it started') : runSubjects(run),
      detail: <RunOfChanges run={run} overall={overall} />,
    };
  });
}
