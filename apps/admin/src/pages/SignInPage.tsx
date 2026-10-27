import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Input } from '@/components/arc/input/input';
import { PasswordField } from '@/components/arc/password-field/password-field';
import { signIn } from '@/lib/api';
import { queryClient } from '@/lib/query';
import { session, useToken } from '@/lib/session';
import { Centered } from '@/ui/Page';

export function SignInPage() {
  const token = useToken();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signingIn = useMutation({
    // The form says why underneath; a toast on top of it would only repeat itself.
    meta: { quiet: true },
    mutationFn: () => signIn(email.trim(), password),
    onSuccess: (next) => {
      queryClient.clear();
      session.signIn(next);
      navigate(from, { replace: true });
    },
  });

  if (token) return <Navigate to={from} replace />;

  return (
    <Centered title="Brixx Admin" subtitle="For the Brixx team. Vendors sign in on the dashboard.">
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
      </form>
    </Centered>
  );
}
