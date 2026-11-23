'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthShell from '@/components/AuthShell';
import { FormError } from '@/components/FormMessage';
import { authClient } from '@/lib/auth/client';

function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setPending(true);
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) {
        setError(error.message || 'Reset failed. The link may be invalid or expired.');
        return;
      }
      setDone(true);
    } catch {
      setError('Reset failed. The link may be invalid or expired.');
    } finally {
      setPending(false);
    }
  };

  if (!token) {
    return (
      <AuthShell
        title="Reset link incomplete"
        subtitle="This link does not include a reset token."
      >
        <div className="space-y-4">
          <FormError>
            The link may have expired or been copied incompletely. Request a
            fresh reset email to continue.
          </FormError>
          <Link href="/auth/forgot-password" className="btn btn-secondary w-full">
            Request a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        title="Password reset"
        subtitle="Your password has been updated."
      >
        <Link href="/auth/sign-in" className="btn btn-primary w-full">
          Sign in with your new password
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Use the link from your reset email to set a new password."
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="password" className="field-label">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
          />
          <p className="field-hint">At least 8 characters.</p>
        </div>
        <div>
          <label htmlFor="confirm" className="field-label">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            required
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="field"
          />
        </div>

        {error && <FormError>{error}</FormError>}

        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? 'Resetting…' : 'Reset password'}
        </button>

        <p className="text-center text-sm text-steel">
          <Link
            href="/auth/sign-in"
            className="font-medium text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
          >
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell
          title="Set a new password"
          subtitle="Loading the reset link…"
        >
          <div className="space-y-2" aria-busy="true">
            <div className="h-11 animate-pulse border border-ink/10 bg-ink/5" />
            <div className="h-11 animate-pulse border border-ink/10 bg-ink/5" />
            <div className="h-11 animate-pulse border border-ink/10 bg-ink/5" />
          </div>
        </AuthShell>
      }
    >
      <ResetForm />
    </Suspense>
  );
}