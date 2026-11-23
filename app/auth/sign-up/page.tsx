'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthShell from '@/components/AuthShell';
import { FormError, FormNotice } from '@/components/FormMessage';
import { authClient } from '@/lib/auth/client';

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);
    try {
      const { data, error } = await authClient.signUp.email({ name, email, password });
      if (error) {
        setError(error.message || 'Failed to create account');
        return;
      }
      if (data?.user && !data.user.emailVerified) {
        setInfo('Check your email for a verification code, then enter it below.');
        setStep('verify');
        return;
      }
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setPending(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { error } = await authClient.emailOtp.verifyEmail({ email, otp: code.trim() });
      if (error) {
        setError(error.message || 'Invalid or expired code');
        return;
      }
      // Auto sign-in after verification is enabled on the branch, so a session exists now.
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setPending(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setInfo('Resending…');
    try {
      const { error } = await authClient.sendVerificationEmail({ email, callbackURL: window.location.origin + '/' });
      if (error) {
        setError(error.message || 'Could not resend the code');
        setInfo(null);
        return;
      }
      setInfo('Verification code resent. Codes expire after 15 minutes.');
    } catch {
      setError('Could not resend the code');
      setInfo(null);
    }
  };

  return (
    <AuthShell
      title={step === 'form' ? 'Create account' : 'Verify your email'}
      subtitle={
        step === 'form'
          ? 'Unlock saved searches, exports, and carrier alerts.'
          : `Enter the verification code sent to ${email}.`
      }
    >
      {step === 'form' ? (
        <form onSubmit={handleSignUp} className="space-y-4">
          <div>
            <label htmlFor="name" className="field-label">
              Name
            </label>
            <input
              id="name"
              type="text"
              required
              autoComplete="name"
              placeholder="Jordan Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field"
            />
          </div>
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
          <div>
            <label htmlFor="password" className="field-label">
              Password
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

          {error && <FormError>{error}</FormError>}
          {info && <FormNotice>{info}</FormNotice>}

          <button type="submit" disabled={pending} className="btn btn-primary w-full">
            {pending ? (
              <>
                <span className="h-2 w-2 animate-pulse bg-ink" aria-hidden="true" />
                Creating account…
              </>
            ) : (
              'Create account'
            )}
          </button>

          <p className="text-center text-sm text-steel">
            Already have an account?{' '}
            <Link
              href="/auth/sign-in"
              className="font-medium text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
            >
              Sign in
            </Link>
          </p>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label htmlFor="code" className="field-label">
              Verification code
            </label>
            <input
              id="code"
              type="text"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="field"
            />
            <p className="field-hint">
              Codes expire after 15 minutes. Check spam if it has not arrived.
            </p>
          </div>

          {error && <FormError>{error}</FormError>}
          {info && <FormNotice>{info}</FormNotice>}

          <button type="submit" disabled={pending} className="btn btn-primary w-full">
            {pending ? 'Verifying…' : 'Verify and continue'}
          </button>

          <div className="flex flex-col items-center gap-1 text-center text-sm text-steel">
            <span>
              Didn&apos;t get it?{' '}
              <button
                type="button"
                onClick={handleResend}
                className="min-h-11 px-1 font-medium text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
              >
                Resend code
              </button>
            </span>
            <Link
              href="/auth/sign-in"
              className="inline-flex min-h-11 items-center text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
            >
              Back to sign in
            </Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}