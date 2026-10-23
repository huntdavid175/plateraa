import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Input } from '@/components/arc/input/input';
import { PasswordField } from '@/components/arc/password-field/password-field';
import { signIn } from '../lib/api';
import { useSlow } from '../lib/query';
import { session, useSession } from '../lib/session';
import { Centered } from '../ui/Page';

export function SignInPage() {
  const { token } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signingIn = useMutation({
    // The form says why underneath; a toast on top of it would only repeat itself.
    meta: { quiet: true },
    mutationFn: () => signIn(email.trim(), password),
    onSuccess: (newToken) => session.signedIn(newToken),
  });
  const slow = useSlow(signingIn.isPending);

  if (token) return <Navigate to="/businesses" replace />;

  return (
    <Centered title="Sign in" subtitle="For owners and managers.">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          signingIn.mutate();
        }}
      >
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {signingIn.error && (
          <Alert tone="danger" title="Couldn’t sign in">
            {signingIn.error.message}
          </Alert>
        )}
        <Button type="submit" size="lg" loading={signingIn.isPending} className="w-full">
          Sign in
        </Button>
        {slow && (
          <p className="text-sm text-muted-foreground" role="status">
            Brixx is waking up. The first sign-in of the day can take up to a minute.
          </p>
        )}
      </form>
      <p className="text-sm text-muted-foreground">
        New to Brixx?{' '}
        <Link to="/sign-up" className="font-medium text-accent-strong">
          Set up your business
        </Link>
      </p>
    </Centered>
  );
}
