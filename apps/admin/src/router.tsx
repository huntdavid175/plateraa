import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Link } from 'react-router';
import { ScreenLoading } from './components/app/loading';
import { RouteError } from './components/app/route-error';
import { HomePage } from './pages/HomePage';
import { SignInPage } from './pages/SignInPage';
import { Shell } from './shell/Shell';
import { Page } from './ui/Page';

// Everything but sign-in and Home loads when first opened.
const RequestsPage = lazy(() =>
  import('./pages/RequestsPage').then((m) => ({ default: m.RequestsPage })),
);
const BusinessesPage = lazy(() =>
  import('./pages/BusinessesPage').then((m) => ({ default: m.BusinessesPage })),
);
const BusinessPage = lazy(() =>
  import('./pages/BusinessPage').then((m) => ({ default: m.BusinessPage })),
);
const SupportPage = lazy(() =>
  import('./pages/SupportPage').then((m) => ({ default: m.SupportPage })),
);
const AnalyticsPage = lazy(() =>
  import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);
const HealthPage = lazy(() =>
  import('./pages/HealthPage').then((m) => ({ default: m.HealthPage })),
);
const AuditPage = lazy(() => import('./pages/AuditPage').then((m) => ({ default: m.AuditPage })));
const TeamPage = lazy(() => import('./pages/TeamPage').then((m) => ({ default: m.TeamPage })));

const later = (page: ReactNode) => <Suspense fallback={<ScreenLoading />}>{page}</Suspense>;

export const router = createBrowserRouter([
  { path: '/sign-in', element: <SignInPage />, errorElement: <RouteError whole /> },
  {
    element: <Shell />,
    errorElement: <RouteError whole />,
    children: [
      {
        // A page that fails shows its error beside the sidebar.
        errorElement: <RouteError />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'requests', element: later(<RequestsPage />) },
          { path: 'businesses', element: later(<BusinessesPage />) },
          { path: 'businesses/:tenantId', element: later(<BusinessPage />) },
          { path: 'support', element: later(<SupportPage />) },
          { path: 'analytics', element: later(<AnalyticsPage />) },
          { path: 'health', element: later(<HealthPage />) },
          { path: 'audit', element: later(<AuditPage />) },
          { path: 'team', element: later(<TeamPage />) },
          {
            path: '*',
            element: (
              <Page title="No such page">
                <p className="text-muted-foreground">
                  That address isn’t part of the console.{' '}
                  <Link to="/" className="font-medium text-accent-strong">
                    Go to Home
                  </Link>
                </p>
              </Page>
            ),
          },
        ],
      },
    ],
  },
]);
