import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { ScreenLoading } from '@/components/app/loading';
import { Centered, Page } from '@/ui/Page';

const RELOADED_AT = 'brixx.reloadedForUpdate';

/**
 * A page's code is gone because Brixx was deployed while this tab was open: the old page asks for
 * files the new build no longer has. Each browser words it its own way.
 */
function isStaleBuild(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|importing a module script failed|unable to preload css/i.test(
    message,
  );
}

/** One automatic reload a minute at most, so a build that's really broken shows the screen. */
function mayReload() {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT));
    return !last || Date.now() - last > 60_000;
  } catch {
    return false;
  }
}

function errorWords(error: unknown) {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * The routes' errorElement. Inside the console it keeps the sidebar and fills the page; at the
 * top (`whole`) it stands alone, like signing in. After a deploy it quietly reloads once.
 */
export function RouteError({ whole }: { whole?: boolean }) {
  const error = useRouteError();
  const stale = isStaleBuild(error);
  const reloading = stale && mayReload();

  useEffect(() => {
    if (!reloading) return;
    try {
      sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    } catch {
      // Storage full: reload anyway.
    }
    window.location.reload();
  }, [reloading]);

  useEffect(() => {
    if (!stale) console.error(error);
  }, [error, stale]);

  if (reloading) return <ScreenLoading />;

  const title = stale ? 'Brixx Admin has been updated' : 'This page hit a problem';
  const subtitle = stale
    ? 'Reload to get the new version. Nothing you’ve saved is lost.'
    : 'Reload to try again. If it keeps happening, share the details below with the team.';
  const size = whole ? 'lg' : 'md';
  const wide = whole ? 'w-full' : undefined;

  const body = (
    <div className="flex flex-col gap-3">
      {!stale && (
        <Alert tone="danger" title="What went wrong">
          {errorWords(error)}
        </Alert>
      )}
      <div className={whole ? 'flex flex-col gap-3' : 'flex flex-wrap gap-2'}>
        <Button size={size} className={wide} onClick={() => window.location.reload()}>
          Reload
        </Button>
        {!stale && (
          <Button
            variant="secondary"
            size={size}
            className={wide}
            onClick={() => window.location.assign('/')}
          >
            Go to Home
          </Button>
        )}
      </div>
    </div>
  );

  return whole ? (
    <Centered title={title} subtitle={subtitle}>
      {body}
    </Centered>
  ) : (
    <Page title={title} subtitle={subtitle} narrow>
      {body}
    </Page>
  );
}
