import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { ChooseBusinessPage } from './auth/ChooseBusinessPage';
import { SignInPage } from './auth/SignInPage';
import { SignUpPage } from './auth/SignUpPage';
import { HomePage } from './pages/HomePage';
import { Shell } from './shell/Shell';
import { Button } from '@/components/arc/button/button';
import { ScreenLoading } from '@/components/app/loading';
import { Centered } from './ui/Page';

function Crashed() {
  return (
    <Centered title="Something went wrong" subtitle="Reload the page to carry on.">
      <Button size="lg" className="w-full" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </Centered>
  );
}

/**
 * A screen loaded only when it's first opened, so the first screen (sign-in, then Home) doesn't
 * wait for all the others on mobile data.
 */
const later =
  (load: () => Promise<ComponentType>): RouteObject['lazy'] =>
  async () => ({ Component: await load() });

/** Every screen inside the shell. Home comes with the first load; the rest when opened. */
const SCREENS: RouteObject[] = [
  { index: true, Component: HomePage },
  { path: 'orders', lazy: later(async () => (await import('./pages/OrdersPage')).OrdersPage) },
  {
    path: 'orders/:orderId',
    lazy: later(async () => (await import('./pages/OrderPage')).OrderPage),
  },
  {
    path: 'customers',
    lazy: later(async () => (await import('./pages/CustomersPage')).CustomersPage),
  },
  {
    path: 'customers/:customerId',
    lazy: later(async () => (await import('./pages/CustomerPage')).CustomerPage),
  },
  { path: 'menu', lazy: later(async () => (await import('./pages/MenuPage')).MenuPage) },
  ...['menu/items/new', 'menu/items/:itemId'].map((path) => ({
    path,
    lazy: later(async () => (await import('./pages/ItemEditorPage')).ItemEditorPage),
  })),
  {
    path: 'store',
    lazy: later(async () => (await import('./pages/OnlineStorePage')).OnlineStorePage),
  },
  { path: 'staff', lazy: later(async () => (await import('./pages/StaffPage')).StaffPage) },
  { path: 'refunds', lazy: later(async () => (await import('./pages/RefundsPage')).RefundsPage) },
  { path: 'reports', lazy: later(async () => (await import('./pages/ReportsPage')).ReportsPage) },
  {
    path: 'expenses',
    lazy: later(async () => (await import('./pages/ExpensesPage')).ExpensesPage),
  },
  { path: 'stock', lazy: later(async () => (await import('./pages/StockPage')).StockPage) },
  {
    path: 'settings',
    lazy: later(async () => (await import('./pages/SettingsPage')).SettingsPage),
  },
];

export const router = createBrowserRouter([
  { path: '/sign-in', Component: SignInPage, errorElement: <Crashed /> },
  { path: '/businesses', Component: ChooseBusinessPage, errorElement: <Crashed /> },
  { path: '/sign-up', Component: SignUpPage, errorElement: <Crashed /> },
  {
    // Only new owners need it, and it brings the menu templates.
    path: '/setup',
    lazy: later(async () => (await import('./auth/SetupPage')).default),
    HydrateFallback: ScreenLoading,
    errorElement: <Crashed />,
  },
  {
    path: '/',
    Component: Shell,
    HydrateFallback: ScreenLoading,
    errorElement: <Crashed />,
    children: SCREENS,
  },
  // Development only: the screens with sample data, without signing in (src/dev/Preview.tsx).
  ...(import.meta.env.DEV
    ? [
        {
          path: '/__preview',
          lazy: later(async () => (await import('./dev/Preview')).default),
          HydrateFallback: ScreenLoading,
          children: [
            ...SCREENS,
            {
              path: 'fields',
              lazy: later(async () => (await import('./dev/FieldsPreview')).default),
            },
          ],
        },
      ]
    : []),
  { path: '*', element: <Navigate to="/" replace /> },
]);
