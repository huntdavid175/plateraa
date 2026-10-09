import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { signIn } from '../lib/api';
import { useSlow } from '../lib/query';
import { session, useSession } from '../lib/session';
import { Button, ErrorNote, FieldLabel, TextInput } from '../ui/controls';
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
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          signingIn.mutate();
        }}
      >
        <div>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <TextInput
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {signingIn.error && <ErrorNote>{signingIn.error.message}</ErrorNote>}
        <Button type="submit" full busy={signingIn.isPending}>
          Sign in
        </Button>
        {slow && (
          <p className="text-center text-xs text-muted-foreground">
            Plateraa is waking up. The first sign-in of the day can take up to a minute.
          </p>
        )}
        <p className="text-center text-sm text-muted-foreground">
          New to Plateraa?{' '}
          <Link to="/sign-up" className="font-medium text-brand">
            Set up your business
          </Link>
        </p>
      </form>
    </Centered>
  );
}
