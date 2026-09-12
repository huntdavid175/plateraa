import { createBrowserRouter, Navigate } from 'react-router';
import { ChooseBusinessPage } from './auth/ChooseBusinessPage';
import { SignInPage } from './auth/SignInPage';
import { OrderPage } from './pages/OrderPage';
import { OrdersPage } from './pages/OrdersPage';
import { SettingsPage } from './pages/SettingsPage';
import { TodayPage } from './pages/TodayPage';
import { Shell } from './shell/Shell';
import { Button } from './ui/controls';
import { Centered, ComingSoon } from './ui/Page';

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
      {
        path: 'menu',
        element: (
          <ComingSoon
            title="Menu"
            what="Add and edit items, sizes, extras, and Bolt and Chowdeck prices."
          />
        ),
      },
      {
        path: 'staff',
        element: (
          <ComingSoon title="Staff" what="Add staff, set PINs and choose who sees sales figures." />
        ),
      },
      {
        path: 'refunds',
        element: (
          <ComingSoon
            title="Refunds"
            what="Orders that owe the customer money back, and recording the refunds you give."
          />
        ),
      },
      { path: 'settings', Component: SettingsPage },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
