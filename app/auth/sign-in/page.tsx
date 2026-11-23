'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import AuthShell from '@/components/AuthShell';
import { FormError } from '@/components/FormMessage';
import { signInWithEmail } from './actions';

export default function SignInPage() {
  const [state, formAction, isPending] = useActionState(signInWithEmail, null);

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back to Carrier Intelligence."
    >
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="field-label">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            className="field"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <label htmlFor="password" className="field-label mb-0">
              Password
            </label>
            <Link
              href="/auth/forgot-password"
              className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="field"
          />
        </div>

        {state?.error && <FormError>{state.error}</FormError>}

        <button
          type="submit"
          disabled={isPending}
          className="btn btn-primary w-full"
        >
          {isPending ? (
            <>
              <span
                className="h-2 w-2 animate-pulse bg-ink"
                aria-hidden="true"
              />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>

        <p className="text-center text-sm text-steel">
          No account?{' '}
          <Link
            href="/auth/sign-up"
            className="font-medium text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
          >
            Create one
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}