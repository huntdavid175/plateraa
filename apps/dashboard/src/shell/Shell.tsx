import type { Capability } from '@brixx/shared';
import {
  ChartColumn,
  ChevronRight,
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
import { motion, useReducedMotion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useMatch,
  useNavigate,
  useOutletContext,
} from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { BottomSheet } from '@/components/arc/bottom-sheet/bottom-sheet';
import { Button } from '@/components/arc/button/button';
import { motionTokens } from '@/components/arc/lib/motion-tokens';
import { UserMenu, type UserMenuItem } from '@/components/arc/user-menu/user-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { ApiError } from '../lib/api';
import { signOutAndForget, useBusinesses, useContextQuery, type Me } from '../lib/query';
import { session, useSession } from '../lib/session';
import { settingsTabs } from '../lib/settings';
import { setTheme, useThemeChoice } from '../lib/theme';
import { ROLE_WORDS, VENDOR_TYPE_WORDS } from '../lib/words';
import { ScreenLoading } from '@/components/app/loading';
import { Centered } from '../ui/Page';

/** A page's own sections, shown under it in the sidebar (Settings' tabs). */
interface SubItem {
  to: string;
  label: string;
}

interface NavItem {
  to: string;
  label: string;
  /** A shorter label for the phone's bottom bar, where five share the width. */
  short?: string;
  Icon: LucideIcon;
  /** Hidden from people without this permission (the server refuses them anyway). */
  needs?: Capability;
  /** The page's sections this person may open, as a sub-menu under it. */
  sections?: (capabilities: readonly Capability[]) => SubItem[];
}

interface NavGroup {
  /** What the pages in it are about, named above them (user request, 24 Oct). */
  label: string;
  items: NavItem[];
}

/** The sidebar, in named groups: the day, selling, the food, the money, the business. */
const NAV: NavGroup[] = [
  { label: 'Overview', items: [{ to: '/', label: 'Home', Icon: House }] },
  {
    label: 'Sales',
    items: [
      { to: '/orders', label: 'Orders', Icon: ReceiptText },
      { to: '/customers', label: 'Customers', Icon: Users },
      {
        to: '/store',
        label: 'Online store',
        short: 'Store',
        Icon: Store,
        needs: 'storefront.manage',
      },
    ],
  },
  {
    label: 'Menu & stock',
    items: [
      { to: '/menu', label: 'Menu', Icon: UtensilsCrossed, needs: 'catalog.manage' },
      { to: '/stock', label: 'Stock', Icon: Package, needs: 'catalog.manage' },
    ],
  },
  {
    label: 'Money',
    items: [
      { to: '/expenses', label: 'Expenses', Icon: Wallet, needs: 'expenses.manage' },
      { to: '/refunds', label: 'Refunds', Icon: Undo2, needs: 'refunds.record' },
      { to: '/reports', label: 'Reports', Icon: ChartColumn, needs: 'reports.revenue.view' },
    ],
  },
  {
    label: 'Business',
    items: [
      { to: '/staff', label: 'Staff', Icon: UserCog, needs: 'staff.manage' },
      {
        to: '/settings',
        label: 'Settings',
        Icon: Settings,
        sections: (capabilities) =>
          settingsTabs(capabilities).map((tab) => ({
            to: tab.value === 'business' ? '/settings' : `/settings?tab=${tab.value}`,
            label: tab.label,
          })),
      },
    ],
  },
];

/**
 * The phone's bottom bar holds four places and More; the rest open from More, under the same
 * group names. These four come first when the person may open them, as before the groups moved.
 */
const BOTTOM_BAR = ['/', '/orders', '/customers', '/menu'];
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
    return <ScreenLoading />;
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

  return (
    <ShellFrame me={me}>
      <Outlet context={me} />
    </ShellFrame>
  );
}

/** The signed-in frame around a screen: sidebar, phone header and bottom bar. */
export function ShellFrame({ me, children }: { me: Me; children: ReactNode }) {
  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.needs || me.capabilities.includes(item.needs)),
  })).filter((group) => group.items.length > 0);
  const flat = groups.flatMap((group) => group.items);
  const bar = [
    ...flat.filter((item) => BOTTOM_BAR.includes(item.to)),
    ...flat.filter((item) => !BOTTOM_BAR.includes(item.to)),
  ].slice(0, BOTTOM_BAR_SIZE);
  const more = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !bar.includes(item)) }))
    .filter((group) => group.items.length > 0);
  return (
    // The sidebar remembers being folded (shadcn keeps it in a cookie).
    <SidebarProvider defaultOpen={!document.cookie.includes('sidebar_state=false')}>
      <AppSidebar me={me} groups={groups} />
      <SidebarInset className="min-w-0 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <PhoneHeader me={me} />
        {children}
      </SidebarInset>
      <BottomBar bar={bar} more={more} />
    </SidebarProvider>
  );
}

/**
 * Laptops and tablets: the business at the top, the pages in named groups, the account at the
 * foot. Folded to icons, the names give way to a hairline between groups.
 */
function AppSidebar({ me, groups }: { me: Me; groups: NavGroup[] }) {
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
          <div key={group.label} className="contents">
            {index > 0 && (
              <SidebarSeparator className="mx-0 hidden group-data-[collapsible=icon]:block" />
            )}
            <SidebarGroup>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarNavItem key={item.to} item={item} me={me} />
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

function SidebarNavItem({ item: { to, label, Icon, sections }, me }: { item: NavItem; me: Me }) {
  // Orders stays lit on an order's own page; Home only on itself.
  const active = useMatch({ path: to, end: to === '/' }) !== null;
  const reduce = useReducedMotion();
  const subs = sections?.(me.capabilities) ?? [];
  // A sub-menu opens when its page does; its chevron opens or closes it from anywhere.
  const [open, setOpen] = useState(active);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setOpen(true);
  }
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={label}
        // Arc's own selected row: a quiet grey fill in ink, not orange, that glides to the page
        // just opened.
        className="relative isolate data-active:bg-transparent data-active:text-sidebar-accent-foreground"
      >
        <Link to={to}>
          {active && (
            <motion.span
              layoutId="sidebar-selected"
              className="absolute inset-0 -z-10 rounded-md bg-sidebar-accent"
              transition={reduce ? { duration: 0 } : motionTokens.spring.morph}
              aria-hidden="true"
            />
          )}
          <Icon {...ICON} />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
      {subs.length > 0 && (
        <>
          <SidebarMenuAction
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-label={open ? `Hide ${label} sections` : `Show ${label} sections`}
          >
            <ChevronRight
              className={cn(
                'transition-transform duration-200 motion-reduce:transition-none',
                open && 'rotate-90',
              )}
              aria-hidden
            />
          </SidebarMenuAction>
          {open && (
            <SidebarMenuSub>
              {subs.map((sub) => (
                <SidebarSubItem key={sub.to} sub={sub} />
              ))}
            </SidebarMenuSub>
          )}
        </>
      )}
    </SidebarMenuItem>
  );
}

/** One section of a page, lit while it's open: its path and its `?tab=` both match. */
function SidebarSubItem({ sub }: { sub: SubItem }) {
  const location = useLocation();
  const [path, query = ''] = sub.to.split('?');
  const active =
    location.pathname === path &&
    new URLSearchParams(location.search).get('tab') === new URLSearchParams(query).get('tab');
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton asChild isActive={active}>
        <Link to={sub.to} aria-current={active ? 'page' : undefined}>
          <span>{sub.label}</span>
        </Link>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
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
function BottomBar({ bar, more }: { bar: NavItem[]; more: NavGroup[] }) {
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
            cn(tab, isActive ? 'font-medium text-foreground' : 'text-muted-foreground')
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
          <div className="flex flex-col gap-4">
            {more.map((group) => (
              <section key={group.label} aria-labelledby={`more-${group.label}`}>
                <h3
                  id={`more-${group.label}`}
                  className="px-3 pb-1 text-xs font-medium text-muted-foreground"
                >
                  {group.label}
                </h3>
                <ul className="flex flex-col">
                  {group.items.map(({ to, label, Icon }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            'flex min-h-12 items-center gap-3 rounded-lg px-3 text-base',
                            isActive ? 'bg-surface-muted font-medium' : '',
                          )
                        }
                      >
                        <Icon {...ICON} size={20} />
                        {label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </BottomSheet>
      )}
    </nav>
  );
}
