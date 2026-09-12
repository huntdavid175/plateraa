import { createBrowserRouter, Navigate } from 'react-router';
import { ChooseBusinessPage } from './auth/ChooseBusinessPage';
import { SignInPage } from './auth/SignInPage';
import { ItemEditorPage } from './pages/ItemEditorPage';
import { MenuPage } from './pages/MenuPage';
import { OrderPage } from './pages/OrderPage';
import { OrdersPage } from './pages/OrdersPage';
import { RefundsPage } from './pages/RefundsPage';
import { SettingsPage } from './pages/SettingsPage';
import { StaffPage } from './pages/StaffPage';
import { TodayPage } from './pages/TodayPage';
import { Shell } from './shell/Shell';
import { Button } from './ui/controls';
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
      { path: 'settings', Component: SettingsPage },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
