import type { Capability } from '@plateraa/shared';
import { useState, type ComponentType } from 'react';
import { Link, Navigate, NavLink, Outlet, useOutletContext } from 'react-router';
import { ApiError } from '../lib/api';
import { signOutAndForget, useBusinesses, useContextQuery, type Me } from '../lib/query';
import { session, useSession } from '../lib/session';
import { setDark, useDark } from '../lib/theme';
import { ROLE_WORDS, VENDOR_TYPE_WORDS } from '../lib/words';
import { Button, ErrorNote, Spinner, Toggle, cx } from '../ui/controls';
import {
  BoxIcon,
  HomeIcon,
  MenuIcon,
  MoreIcon,
  OrdersIcon,
  RefundIcon,
  SettingsIcon,
  SetupIcon,
  SignOutIcon,
  StaffIcon,
  WalletIcon,
} from '../ui/icons';
import { Centered } from '../ui/Page';

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<{ size?: number }>;
  /** Hidden from people without this permission (the server refuses them anyway). */
  needs?: Capability;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Today', Icon: HomeIcon },
  { to: '/orders', label: 'Orders', Icon: OrdersIcon },
  { to: '/menu', label: 'Menu', Icon: MenuIcon, needs: 'catalog.manage' },
  { to: '/staff', label: 'Staff', Icon: StaffIcon, needs: 'staff.manage' },
  { to: '/refunds', label: 'Refunds', Icon: RefundIcon, needs: 'refunds.record' },
  { to: '/expenses', label: 'Expenses', Icon: WalletIcon, needs: 'expenses.manage' },
  { to: '/stock', label: 'Stock', Icon: BoxIcon, needs: 'catalog.manage' },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
  { to: '/setup', label: 'Setup guide', Icon: SetupIcon, needs: 'settings.manage' },
];

/** The phone's bottom bar fits five; the rest go under "More". */
const BOTTOM_BAR_SIZE = 5;

/** The signed-in person, for any screen inside the shell. */
export function useMe(): Me {
  return useOutletContext<Me>();
}

export function Shell() {
  const { token, tenantId } = useSession();
  const context = useContextQuery();

  if (!token) return <Navigate to="/sign-in" replace />;
  if (!tenantId) return <Navigate to="/businesses" replace />;

  if (context.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (context.isError) {
    const refused = context.error instanceof ApiError && context.error.status === 403;
    return (
      <Centered title={refused ? 'No access to this business' : 'Couldn’t load the dashboard'}>
        <div className="space-y-3">
          <ErrorNote>{context.error.message}</ErrorNote>
          {!refused && (
            <Button full onClick={() => context.refetch()}>
              Try again
            </Button>
          )}
          <Button variant="secondary" full onClick={() => session.chooseBusiness(null)}>
            Choose another business
          </Button>
        </div>
      </Centered>
    );
  }

  const me = context.data;
  const nav = NAV.filter((item) => !item.needs || me.capabilities.includes(item.needs));

  return (
    <div className="flex h-full">
      <Sidebar me={me} nav={nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <PhoneHeader me={me} overflow={nav.slice(BOTTOM_BAR_SIZE)} />
        <main className="scroll-area flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet context={me} />
        </main>
      </div>
      <BottomBar nav={nav.slice(0, BOTTOM_BAR_SIZE)} />
    </div>
  );
}

function Sidebar({ me, nav }: { me: Me; nav: NavItem[] }) {
  const dark = useDark();
  return (
    <aside className="sticky top-0 hidden h-full w-56 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="border-b border-border px-5 py-5">
        <BusinessBlock me={me} />
      </div>

      <nav className="scroll-area flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {nav.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cx(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-subtle text-brand'
                  : 'text-muted hover:bg-tile hover:text-text',
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <div className="mb-1 flex items-center justify-between rounded-xl bg-tile px-3 py-2.5">
          <span className="text-sm font-medium">{dark ? '🌙 Dark' : '☀️ Light'}</span>
          <Toggle on={dark} onChange={setDark} label="Dark mode" />
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Avatar name={me.displayName} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{me.displayName}</div>
            <div className="text-xs text-muted">{ROLE_WORDS[me.role]}</div>
          </div>
          <button
            type="button"
            onClick={signOutAndForget}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-tile hover:text-text"
          >
            <SignOutIcon size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function BusinessBlock({ me }: { me: Me }) {
  const businesses = useBusinesses();
  const canSwitch = (businesses.data?.length ?? 0) > 1;
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
          P
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{me.businessName}</div>
          <div className="text-xs text-muted">{VENDOR_TYPE_WORDS[me.vendorType]}</div>
        </div>
      </div>
      {canSwitch && (
        <Link to="/businesses" className="mt-3 inline-block text-xs font-medium text-brand">
          Switch business
        </Link>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tile text-xs font-bold text-muted">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  );
}

/** Phones: the business name, and "More" for everything that isn't in the bottom bar. */
function PhoneHeader({ me, overflow }: { me: Me; overflow: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const dark = useDark();
  return (
    <>
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-xs font-bold text-white">
            P
          </div>
          <span className="truncate text-sm font-semibold">{me.businessName}</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="More"
          className="rounded-lg p-2 text-muted hover:bg-tile"
        >
          <MoreIcon size={20} />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-surface px-4 pt-5 pb-8">
            <div className="mb-4 px-1">
              <BusinessBlock me={me} />
            </div>
            {overflow.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-tile"
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
            <div className="my-2 flex items-center justify-between rounded-xl bg-tile px-3 py-3">
              <span className="text-sm font-medium">Dark mode</span>
              <Toggle on={dark} onChange={setDark} label="Dark mode" />
            </div>
            <div className="flex items-center gap-3 px-3 py-3">
              <Avatar name={me.displayName} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{me.displayName}</div>
                <div className="text-xs text-muted">{ROLE_WORDS[me.role]}</div>
              </div>
              <Button variant="ghost" small onClick={signOutAndForget}>
                Sign out
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BottomBar({ nav }: { nav: NavItem[] }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {nav.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cx(
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium',
              isActive ? 'text-brand' : 'text-muted',
            )
          }
        >
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
