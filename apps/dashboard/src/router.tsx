import { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { ChooseBusinessPage } from './auth/ChooseBusinessPage';
import { SignInPage } from './auth/SignInPage';
import { SignUpPage } from './auth/SignUpPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { ItemEditorPage } from './pages/ItemEditorPage';
import { MenuPage } from './pages/MenuPage';
import { OrderPage } from './pages/OrderPage';
import { OrdersPage } from './pages/OrdersPage';
import { RefundsPage } from './pages/RefundsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { StaffPage } from './pages/StaffPage';
import { StockPage } from './pages/StockPage';
import { TodayPage } from './pages/TodayPage';
import { Shell } from './shell/Shell';
import { Button, Spinner } from './ui/controls';

/** Loaded on its own: only new owners need it, and it brings the menu templates. */
const SetupPage = lazy(() => import('./auth/SetupPage'));
import { Centered } from './ui/Page';

function Crashed() {
  return (
    <Centered title="Something went wrong" subtitle="Reload the page to carry on.">
      <Button full onClick={() => window.location.reload()}>
        Reload
      </Button>
    </Centered>
  );
}

export const router = createBrowserRouter([
  { path: '/sign-in', Component: SignInPage, errorElement: <Crashed /> },
  { path: '/businesses', Component: ChooseBusinessPage, errorElement: <Crashed /> },
  { path: '/sign-up', Component: SignUpPage, errorElement: <Crashed /> },
  {
    path: '/setup',
    element: (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        }
      >
        <SetupPage />
      </Suspense>
    ),
    errorElement: <Crashed />,
  },
  {
    path: '/',
    Component: Shell,
    errorElement: <Crashed />,
    children: [
      { index: true, Component: TodayPage },
      { path: 'orders', Component: OrdersPage },
      { path: 'orders/:orderId', Component: OrderPage },
      { path: 'menu', Component: MenuPage },
      { path: 'menu/items/new', Component: ItemEditorPage },
      { path: 'menu/items/:itemId', Component: ItemEditorPage },
      { path: 'staff', Component: StaffPage },
      { path: 'refunds', Component: RefundsPage },
      { path: 'reports', Component: ReportsPage },
      { path: 'expenses', Component: ExpensesPage },
      { path: 'stock', Component: StockPage },
      { path: 'settings', Component: SettingsPage },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
