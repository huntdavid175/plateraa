import type { PlatformCapability } from '@brixx/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Building2,
  ChartColumn,
  Ellipsis,
  House,
  Inbox,
  LifeBuoy,
  ScrollText,
  Search,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Dialog as RadixDialog } from 'radix-ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { BottomSheet } from '@/components/arc/bottom-sheet/bottom-sheet';
import { Button } from '@/components/arc/button/button';
import { CommandPalette, type CommandItem } from '@/components/arc/command-palette/command-palette';
import { motionTokens } from '@/components/arc/lib/motion-tokens';
import { UserMenu } from '@/components/arc/user-menu/user-menu';
import { ScreenLoading } from '@/components/app/loading';
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { api, ApiError, call, signOut, type BusinessRow, type Me, type Request } from '@/lib/api';
import { useMe } from '@/lib/query';
import { useToken } from '@/lib/session';
import { setTheme, useThemeChoice } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Centered } from '@/ui/Page';

interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  needs?: PlatformCapability;
  /** Shows how many requests are waiting. */
  count?: boolean;
}

const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: 'Work',
    items: [
      { to: '/', label: 'Home', Icon: House },
      { to: '/requests', label: 'Requests', Icon: Inbox, count: true },
      { to: '/businesses', label: 'Businesses', Icon: Building2 },
      { to: '/support', label: 'Support', Icon: LifeBuoy },
    ],
  },
  {
    label: 'Platform',
    items: [
      { to: '/analytics', label: 'Analytics', Icon: ChartColumn },
      { to: '/health', label: 'Health', Icon: Activity },
      { to: '/audit', label: 'Audit log', Icon: ScrollText },
    ],
  },
  { label: 'Brixx', items: [{ to: '/team', label: 'Team', Icon: Users }] },
];

const BOTTOM_BAR = ['/', '/requests', '/businesses', '/support'];
const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;
export const ROLE_WORDS = { ADMIN: 'Admin', SUPPORT: 'Customer service' } as const;

function useWaiting() {
  return useQuery({
    queryKey: ['requests'],
    queryFn: () => call<Request[]>(api.GET('/api/platform/requests')),
    select: (rows) => rows.filter((r) => r.status === 'PENDING').length,
    refetchInterval: 60_000,
  });
}

export function Shell() {
  const token = useToken();
  const me = useMe();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  }
  if (me.isPending) return <ScreenLoading />;
  if (me.isError) {
    const refused = me.error instanceof ApiError && me.error.status === 403;
    return (
      <Centered
        title={refused ? 'This login isn’t on the Brixx team' : 'Couldn’t open the console'}
        subtitle={
          refused
            ? 'Ask an Admin to add you on the Team page, then sign in again. Vendors use the dashboard.'
            : undefined
        }
      >
        <div className="flex flex-col gap-3">
          {!refused && (
            <Alert tone="danger" title="Something went wrong">
              {me.error.message}
            </Alert>
          )}
          {!refused && (
            <Button size="lg" className="w-full" onClick={() => me.refetch()}>
              Try again
            </Button>
          )}
          <Button variant="secondary" size="lg" className="w-full" onClick={() => void signOut()}>
            Sign in with another login
          </Button>
        </div>
      </Centered>
    );
  }

  return (
    <SidebarProvider defaultOpen={!document.cookie.includes('sidebar_state=false')}>
      <AppSidebar me={me.data} />
      <SidebarInset className="min-w-0 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <PhoneHeader me={me.data} />
        {import.meta.env.DEV && token === 'preview' && (
          <div className="border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-center text-xs text-warning">
            Preview with made-up sample data. Nothing here is real, and nothing is saved.
          </div>
        )}
        <Outlet />
      </SidebarInset>
      <BottomBar />
      <Finder />
    </SidebarProvider>
  );
}

function visible(me: Me) {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.needs || me.capabilities.includes(item.needs)),
  })).filter((group) => group.items.length > 0);
}

function AppSidebar({ me }: { me: Me }) {
  const waiting = useWaiting().data ?? 0;
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Brixx Admin">
              <Link to="/">
                <img src="/logo.png" alt="" className="size-8 shrink-0 rounded-lg" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">Brixx Admin</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {ROLE_WORDS[me.role]}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Find anything (Ctrl K)"
              onClick={() => window.dispatchEvent(new Event('brixx:find'))}
              className="text-muted-foreground"
            >
              <Search {...ICON} />
              <span className="flex-1">Find anything</span>
              <kbd className="rounded border px-1 font-mono text-[11px] group-data-[collapsible=icon]:hidden">
                Ctrl K
              </kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {visible(me).map((group, index) => (
          <div key={group.label} className="contents">
            {index > 0 && (
              <SidebarSeparator className="mx-0 hidden group-data-[collapsible=icon]:block" />
            )}
            <SidebarGroup>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarNavItem key={item.to} item={item} count={item.count ? waiting : 0} />
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

function SidebarNavItem({ item: { to, label, Icon }, count }: { item: NavItem; count: number }) {
  const active = useMatch({ path: to, end: to === '/' }) !== null;
  const reduce = useReducedMotion();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={label}
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
      {count > 0 && (
        <SidebarMenuBadge className="text-warning">
          {count}
          <span className="sr-only"> waiting</span>
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

function Account({ me, compact }: { me: Me; compact?: boolean }) {
  const theme = useThemeChoice();
  const sidebar = useSidebar();
  const navigate = useNavigate();
  return (
    <UserMenu
      user={{ name: me.name, email: me.email, plan: ROLE_WORDS[me.role] }}
      theme={theme}
      onThemeChange={setTheme}
      onSignOut={() => void signOut().then(() => navigate('/sign-in'))}
      showName={!compact && sidebar.state === 'expanded'}
      align={compact ? 'end' : 'start'}
    />
  );
}

function PhoneHeader({ me }: { me: Me }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-surface px-4 md:hidden">
      <Link to="/" className="flex min-w-0 items-center gap-2.5">
        <img src="/logo.png" alt="" className="size-7 shrink-0 rounded-md" />
        <span className="truncate text-sm font-medium">Brixx Admin</span>
      </Link>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Find anything"
          onClick={() => window.dispatchEvent(new Event('brixx:find'))}
          className="flex size-10 items-center justify-center rounded-(--radius-control) text-muted-foreground hover:bg-muted"
        >
          <Search {...ICON} size={20} />
        </button>
        <Account me={me} compact />
      </div>
    </header>
  );
}

function BottomBar() {
  const me = useMe().data!;
  const [open, setOpen] = useState(false);
  const groups = visible(me);
  const flat = groups.flatMap((g) => g.items);
  const bar = flat.filter((item) => BOTTOM_BAR.includes(item.to));
  const more = groups
    .map((g) => ({ ...g, items: g.items.filter((item) => !bar.includes(item)) }))
    .filter((g) => g.items.length > 0);
  const tab = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs';
  return (
    <nav
      aria-label="Pages"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {bar.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cn(tab, isActive ? 'font-medium text-foreground' : 'text-muted-foreground')
          }
        >
          <Icon {...ICON} size={20} />
          {label}
        </NavLink>
      ))}
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="More"
        detents={[0.5]}
        trigger={
          <button type="button" className={cn(tab, 'text-muted-foreground')}>
            <Ellipsis {...ICON} size={20} />
            More
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          {more.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3 className="px-3 pb-1 text-xs font-medium text-muted-foreground">{group.label}</h3>
              <ul className="flex flex-col">
                {group.items.map(({ to, label, Icon }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex min-h-12 items-center gap-3 rounded-lg px-3 text-base',
                          isActive && 'bg-surface-muted font-medium',
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
    </nav>
  );
}

const PAGE_ICON = (Icon: LucideIcon): ReactNode => (
  <Icon size={16} strokeWidth={1.75} aria-hidden />
);

/**
 * Ctrl+K (⌘K), or the sidebar's "Find anything": Arc's command palette over every page and every
 * business (by name, area, phone or owner's email). Anything else typed, such as an order number,
 * goes to Support's search.
 */
function Finder() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const me = useMe().data!;
  const businesses = useQuery({
    queryKey: ['businesses', 'ALL', ''],
    queryFn: () =>
      call<BusinessRow[]>(
        api.GET('/api/platform/businesses', { params: { query: { filter: 'ALL', limit: 500 } } }),
      ),
    enabled: open,
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((was) => !was);
      }
    };
    const onFind = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('brixx:find', onFind);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('brixx:find', onFind);
    };
  }, []);

  const items = useMemo<CommandItem[]>(
    () => [
      ...visible(me).flatMap((group) =>
        group.items.map((item) => ({
          id: `page:${item.to}`,
          label: item.label,
          group: 'Pages',
          icon: PAGE_ICON(item.Icon),
        })),
      ),
      ...(businesses.data ?? []).map((b) => ({
        id: `business:${b.id}`,
        label: b.name,
        description: [b.area, b.ownerName].filter(Boolean).join(' · '),
        group: 'Businesses',
        keywords: [b.slug, b.area ?? '', b.ownerEmail ?? '', b.contactPhone ?? ''],
        icon: PAGE_ICON(Building2),
      })),
      {
        id: 'support',
        label: 'Search orders, phone numbers and customers',
        description: 'Opens Support',
        group: 'Support',
        icon: PAGE_ICON(LifeBuoy),
      },
    ],
    [me, businesses.data],
  );

  const choose = (item: CommandItem) => {
    setOpen(false);
    if (item.id.startsWith('page:')) navigate(item.id.slice(5));
    else if (item.id.startsWith('business:')) navigate(`/businesses/${item.id.slice(9)}`);
    else navigate('/support');
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[min(600px,calc(100vw-24px))] -translate-x-1/2 focus:outline-none"
        >
          <RadixDialog.Title className="sr-only">Find anything</RadixDialog.Title>
          <CommandPalette
            items={items}
            placeholder="Business, page, area or owner’s email"
            label="Find anything"
            onSelect={choose}
            onClose={() => setOpen(false)}
            autoFocus
          />
          {businesses.isPending && (
            <p className="mt-2 text-center text-xs text-white/80">Loading businesses…</p>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** A status badge for a business, the same everywhere. */
export function BusinessStatus({ status }: { status: string }) {
  if (status === 'ACTIVE') return <Badge tone="success">Open</Badge>;
  if (status === 'PENDING') return <Badge tone="warning">Waiting</Badge>;
  if (status === 'SUSPENDED') return <Badge tone="danger">Suspended</Badge>;
  return <Badge>Declined</Badge>;
}
