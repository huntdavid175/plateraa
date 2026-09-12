import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { signOutAndForget, useBusinesses, useSlow } from '../lib/query';
import { session, useSession } from '../lib/session';
import { ROLE_WORDS } from '../lib/words';
import { Button, ErrorNote, Spinner, cx } from '../ui/controls';
import { Centered } from '../ui/Page';

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
        <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted">
          <Spinner />
          {slow && (
            <p className="text-center">Plateraa is waking up. This can take up to a minute.</p>
          )}
        </div>
      )}

      {businesses.isError && (
        <div className="space-y-4">
          <ErrorNote>{businesses.error.message}</ErrorNote>
          <Button full onClick={() => businesses.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {businesses.data?.length === 0 && (
        <div className="space-y-4">
          <p className="rounded-xl border border-border bg-surface px-4 py-4 text-sm text-muted">
            This login isn’t an owner or manager of any business yet. A manager is added by the
            owner; an owner sets their business up here.
          </p>
          <Button full onClick={() => navigate('/setup')}>
            Set up your business
          </Button>
        </div>
      )}

      {businesses.data && businesses.data.length > 0 && (
        <ul className="space-y-2">
          {businesses.data.map((business) => (
            <li key={business.tenantId}>
              <button
                type="button"
                onClick={() => choose(business.tenantId)}
                className={cx(
                  'flex w-full items-center justify-between rounded-xl border bg-surface px-4 py-3.5 text-left transition-colors hover:border-brand',
                  business.tenantId === tenantId ? 'border-brand' : 'border-border',
                )}
              >
                <span className="font-medium">{business.name}</span>
                <span className="text-xs text-muted">{ROLE_WORDS[business.role]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Button variant="ghost" full className="mt-6" onClick={signOutAndForget}>
        Sign out
      </Button>
    </Centered>
  );
}
