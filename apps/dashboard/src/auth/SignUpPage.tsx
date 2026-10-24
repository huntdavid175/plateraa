import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Input } from '@/components/arc/input/input';
import { PasswordField } from '@/components/arc/password-field/password-field';
import { signUp } from '../lib/api';
import { useSlow } from '../lib/query';
import { session, useSession } from '../lib/session';
import { JoinLayout } from './JoinLayout';

/**
 * A new owner's email login, the first of the three steps of joining. The request about the
 * business comes straight after (`/join`).
 */
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
      navigate('/join', { replace: true });
    },
  });
  const slow = useSlow(signingUp.isPending);

  if (token && !created) return <Navigate to="/businesses" replace />;

  return (
    <JoinLayout
      stage={1}
      title="Create your account"
      subtitle="Free to start. Next, tell us about your business and we’ll call you to set it up."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          signingUp.mutate();
        }}
      >
        <Input
          label="Your name"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
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
          description="At least 8 characters."
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {signingUp.error && (
          <Alert tone="danger" title="Couldn’t create your account">
            {signingUp.error.message}
          </Alert>
        )}
        <Button type="submit" size="lg" loading={signingUp.isPending} className="w-full">
          Create my account
        </Button>
        {slow && (
          <p className="text-sm text-muted-foreground" role="status">
            Brixx is waking up. This can take up to a minute.
          </p>
        )}
      </form>
      <p className="text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/sign-in" className="font-medium text-accent-strong">
          Sign in
        </Link>
      </p>
    </JoinLayout>
  );
}
