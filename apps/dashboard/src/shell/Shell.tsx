import type { Capability } from '@plateraa/shared';
import {
  ChartColumn,
  Ellipsis,
  House,
  Package,
  ReceiptText,
  Settings,
  Store,
  Undo2,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useMatch,
  useNavigate,
  useOutletContext,
} from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { BottomSheet } from '@/components/arc/bottom-sheet/bottom-sheet';
import { Button } from '@/components/arc/button/button';
import { UserMenu, type UserMenuItem } from '@/components/arc/user-menu/user-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { ApiError } from '../lib/api';
import { signOutAndForget, useBusinesses, useContextQuery, type Me } from '../lib/query';
import { session, useSession } from '../lib/session';
import { setTheme, useThemeChoice } from '../lib/theme';
import { ROLE_WORDS, VENDOR_TYPE_WORDS } from '../lib/words';
import { Spinner } from '../ui/controls';
import { Centered } from '../ui/Page';

interface NavItem {
  to: string;
  label: string;
  /** A shorter label for the phone's bottom bar, where five share the width. */
  short?: string;
  Icon: LucideIcon;
  /** Hidden from people without this permission (the server refuses them anyway). */
  needs?: Capability;
}

/** The sidebar, in groups: the day, the food, the money, the team. */
const NAV: NavItem[][] = [
  [
    { to: '/', label: 'Home', Icon: House },
    { to: '/orders', label: 'Orders', Icon: ReceiptText },
    { to: '/customers', label: 'Customers', Icon: Users },
  ],
  [
    { to: '/menu', label: 'Menu', Icon: UtensilsCrossed, needs: 'catalog.manage' },
    { to: '/stock', label: 'Stock', Icon: Package, needs: 'catalog.manage' },
    {
      to: '/store',
      label: 'Online store',
      short: 'Store',
      Icon: Store,
      needs: 'storefront.manage',
    },
  ],
  [
    { to: '/expenses', label: 'Expenses', Icon: Wallet, needs: 'expenses.manage' },
    { to: '/refunds', label: 'Refunds', Icon: Undo2, needs: 'refunds.record' },
    { to: '/reports', label: 'Reports', Icon: ChartColumn, needs: 'reports.revenue.view' },
  ],
  [
    { to: '/staff', label: 'Staff', Icon: UserCog, needs: 'staff.manage' },
    { to: '/settings', label: 'Settings', Icon: Settings },
  ],
];

/** The phone's bottom bar holds four places and More; the rest open from More. */
const BOTTOM_BAR_SIZE = 4;

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;

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
        <div className="flex flex-col gap-3">
          <Alert
            tone="danger"
            title={refused ? 'This login can’t open it' : 'Something went wrong'}
          >
            {context.error.message}
          </Alert>
          {!refused && (
            <Button size="lg" className="w-full" onClick={() => context.refetch()}>
              Try again
            </Button>
          )}
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => session.chooseBusiness(null)}
          >
            Choose another business
          </Button>
        </div>
      </Centered>
    );
  }

  const me = context.data;
  const groups = NAV.map((group) =>
    group.filter((item) => !item.needs || me.capabilities.includes(item.needs)),
  ).filter((group) => group.length > 0);
  const flat = groups.flat();

  return (
    // The sidebar remembers being folded (shadcn keeps it in a cookie).
    <SidebarProvider defaultOpen={!document.cookie.includes('sidebar_state=false')}>
      <AppSidebar me={me} groups={groups} />
      <SidebarInset className="min-w-0 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <PhoneHeader me={me} />
        <Outlet context={me} />
      </SidebarInset>
      <BottomBar bar={flat.slice(0, BOTTOM_BAR_SIZE)} more={flat.slice(BOTTOM_BAR_SIZE)} />
    </SidebarProvider>
  );
}

/** Laptops and tablets: the business at the top, the pages in groups, the account at the foot. */
function AppSidebar({ me, groups }: { me: Me; groups: NavItem[][] }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={me.businessName}>
              <Link to="/">
                <img src="/logo.png" alt="" className="size-8 shrink-0 rounded-lg" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{me.businessName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {VENDOR_TYPE_WORDS[me.vendorType]}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group, index) => (
          <div key={group[0]!.to} className="contents">
            {index > 0 && <SidebarSeparator className="mx-0" />}
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.map((item) => (
                    <SidebarNavItem key={item.to} item={item} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <Account me={me} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function SidebarNavItem({ item: { to, label, Icon } }: { item: NavItem }) {
  // Orders stays lit on an order's own page; Home only on itself.
  const active = useMatch({ path: to, end: to === '/' }) !== null;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={label}>
        <Link to={to}>
          <Icon {...ICON} />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** The person signed in: light or dark, switching business, signing out. */
function Account({ me, compact }: { me: Me; compact?: boolean }) {
  const navigate = useNavigate();
  const theme = useThemeChoice();
  const businesses = useBusinesses();
  const sidebar = useSidebar();
  const items: UserMenuItem[] =
    (businesses.data?.length ?? 0) > 1
      ? [{ label: 'Switch business', onSelect: () => navigate('/businesses') }]
      : [];
  return (
    <UserMenu
      user={{ name: me.displayName, email: ROLE_WORDS[me.role] }}
      items={items}
      theme={theme}
      onThemeChange={setTheme}
      onSignOut={signOutAndForget}
      showName={!compact && sidebar.state === 'expanded'}
      align={compact ? 'end' : 'start'}
    />
  );
}

/** Phones: the business, and the account behind its avatar. */
function PhoneHeader({ me }: { me: Me }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-surface px-4 md:hidden">
      <Link to="/" className="flex min-w-0 items-center gap-2.5">
        <img src="/logo.png" alt="" className="size-7 shrink-0 rounded-md" />
        <span className="truncate text-sm font-medium">{me.businessName}</span>
      </Link>
      <Account me={me} compact />
    </header>
  );
}

/** Phones: four places at the bottom, and More for the rest. */
function BottomBar({ bar, more }: { bar: NavItem[]; more: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const tab = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs';
  return (
    <nav
      aria-label="Pages"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {bar.map(({ to, label, short, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cn(tab, isActive ? 'font-medium text-accent-strong' : 'text-muted-foreground')
          }
        >
          <Icon {...ICON} size={20} />
          {short ?? label}
        </NavLink>
      ))}
      {more.length > 0 && (
        <BottomSheet
          open={open}
          onOpenChange={setOpen}
          title="More"
          detents={[0.6]}
          trigger={
            <button type="button" className={cn(tab, 'text-muted-foreground')}>
              <Ellipsis {...ICON} size={20} />
              More
            </button>
          }
        >
          <ul className="flex flex-col">
            {more.map(({ to, label, Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-12 items-center gap-3 rounded-lg px-3 text-base',
                      isActive ? 'bg-accent-subtle font-medium text-accent-strong' : '',
                    )
                  }
                >
                  <Icon {...ICON} size={20} />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </BottomSheet>
      )}
    </nav>
  );
}
