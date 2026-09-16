import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { signUp } from '../lib/api';
import { useSlow } from '../lib/query';
import { session, useSession } from '../lib/session';
import { Button, ErrorNote, FieldLabel, TextInput } from '../ui/controls';
import { Centered } from '../ui/Page';

/** A new owner's email login. Setting up the business comes straight after (`/setup`). */
export function SignUpPage() {
  const { token } = useSession();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Set with the new login, so this page goes on to setup instead of the business picker.
  const [created, setCreated] = useState(false);
  const signingUp = useMutation({
    // The form says why underneath; a toast on top of it would only repeat itself.
    meta: { quiet: true },
    mutationFn: () => signUp(name.trim(), email.trim(), password),
    onSuccess: (newToken) => {
      setCreated(true);
      session.signedIn(newToken);
      navigate('/setup', { replace: true });
    },
  });
  const slow = useSlow(signingUp.isPending);

  if (token && !created) return <Navigate to="/businesses" replace />;

  return (
    <Centered title="Create your account" subtitle="For the owner. Staff use PINs on the tablet.">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          signingUp.mutate();
        }}
      >
        <div>
          <FieldLabel htmlFor="name">Your name</FieldLabel>
          <TextInput
            id="name"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
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
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
        </div>
        {signingUp.error && <ErrorNote>{signingUp.error.message}</ErrorNote>}
        <Button type="submit" full busy={signingUp.isPending}>
          Create account
        </Button>
        {slow && (
          <p className="text-center text-xs text-muted">
            Plateraa is waking up. This can take up to a minute.
          </p>
        )}
        <p className="text-center text-sm text-muted">
          Already have an account?{' '}
          <Link to="/sign-in" className="font-medium text-brand">
            Sign in
          </Link>
        </p>
      </form>
    </Centered>
  );
}
