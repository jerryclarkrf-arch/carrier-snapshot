'use client';

import { useState } from 'react';
import Link from 'next/link';
import AuthShell from '@/components/AuthShell';
import { FormError, FormSuccess } from '@/components/FormMessage';
import { authClient } from '@/lib/auth/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: window.location.origin + '/auth/reset-password',
      });
      if (error) {
        setError(error.message || 'Could not send the reset email');
        return;
      }
      setSent(true);
    } catch {
      setError('Could not send the reset email');
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="If an account exists, a reset link is on its way."
      >
        <div className="space-y-4">
          <FormSuccess>
            If an account exists for <strong className="font-medium">{email}</strong>,
            a password reset link has been sent. The link expires after 15
            minutes.
          </FormSuccess>
          <Link href="/auth/sign-in" className="btn btn-secondary w-full">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset password"
      subtitle="Enter your account email and we’ll send a reset link."
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="email" className="field-label">
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
          />
        </div>

        {error && <FormError>{error}</FormError>}

        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? 'Sending…' : 'Send reset link'}
        </button>

        <p className="text-center text-sm text-steel">
          Remembered it?{' '}
          <Link
            href="/auth/sign-in"
            className="font-medium text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}