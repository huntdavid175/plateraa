import { Check, ChevronRight } from 'lucide-react';
import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Skeleton } from '@/components/ui/skeleton';
import { signOutAndForget, useBusinesses, useSlow } from '../lib/query';
import { session, useSession } from '../lib/session';
import { ROLE_WORDS } from '../lib/words';
import { Centered } from '../ui/Page';

/** One bordered group, a row per business. */
const GROUP = 'flex flex-col divide-y overflow-hidden rounded-(--radius-surface) border bg-card';

/** Picks the business to work on. With only one, it's picked straight away. */
export function ChooseBusinessPage() {
  const { token, tenantId } = useSession();
  const businesses = useBusinesses();
  const slow = useSlow(businesses.isPending);
  const navigate = useNavigate();
  const only = businesses.data?.length === 1 ? businesses.data[0] : undefined;

  useEffect(() => {
    if (only && tenantId === null) {
      session.chooseBusiness(only.tenantId);
      navigate('/', { replace: true });
    }
  }, [only, tenantId, navigate]);

  if (!token) return <Navigate to="/sign-in" replace />;

  const choose = (id: string) => {
    session.chooseBusiness(id);
    navigate('/', { replace: true });
  };

  return (
    <Centered title="Choose a business">
      {businesses.isPending && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <div className={GROUP}>
            {[0, 1].map((row) => (
              <div key={row} className="flex min-h-16 items-center justify-between gap-3 px-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </div>
          {slow && (
            <p className="text-sm text-muted-foreground" role="status">
              Plateraa is waking up. This can take up to a minute.
            </p>
          )}
        </div>
      )}

      {businesses.isError && (
        <div className="flex flex-col gap-4">
          <Alert tone="danger" title="Couldn’t load your businesses">
            {businesses.error.message}
          </Alert>
          <Button size="lg" className="w-full" onClick={() => businesses.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {businesses.data?.length === 0 && (
        <div className="flex flex-col gap-4">
          <p className="text-text-secondary">
            This login isn’t an owner or manager of any business yet. A manager is added by the
            owner; an owner sets their business up here.
          </p>
          <Button size="lg" className="w-full" onClick={() => navigate('/setup')}>
            Set up your business
          </Button>
        </div>
      )}

      {businesses.data && businesses.data.length > 0 && (
        <ul className={GROUP}>
          {businesses.data.map((business) => {
            const current = business.tenantId === tenantId;
            return (
              <li key={business.tenantId}>
                <button
                  type="button"
                  onClick={() => choose(business.tenantId)}
                  aria-current={current || undefined}
                  className="flex min-h-16 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-muted"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{business.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {ROLE_WORDS[business.role]}
                      {current && <span className="sr-only">, open now</span>}
                    </span>
                  </span>
                  {current ? (
                    <Check
                      size={18}
                      strokeWidth={1.75}
                      className="text-accent-strong"
                      aria-hidden
                    />
                  ) : (
                    <ChevronRight
                      size={18}
                      strokeWidth={1.75}
                      className="text-muted-foreground"
                      aria-hidden
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Button variant="ghost" className="self-start" onClick={signOutAndForget}>
        Sign out
      </Button>
    </Centered>
  );
}
