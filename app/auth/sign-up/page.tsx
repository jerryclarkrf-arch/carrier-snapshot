'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signUpWithEmail } from './actions';

const inputCls =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState(signUpWithEmail, null);

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <form action={formAction} className="w-full max-w-md space-y-4 bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Create account</h1>
          <p className="text-sm text-slate-500 mt-1">Join Carrier Intelligence to unlock saved searches and alerts.</p>
        </div>

        <div>
          <label htmlFor="name" className={labelCls}>Name</label>
          <input id="name" name="name" type="text" required placeholder="John Doe" className={inputCls} />
        </div>

        <div>
          <label htmlFor="email" className={labelCls}>Email address</label>
          <input id="email" name="email" type="email" required placeholder="john@company.com" className={inputCls} />
        </div>

        <div>
          <label htmlFor="password" className={labelCls}>Password</label>
          <input id="password" name="password" type="password" required placeholder="••••••••" minLength={8} className={inputCls} />
        </div>

        {state?.error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
        >
          {isPending ? 'Creating account…' : 'Create Account'}
        </button>

        <p className="text-sm text-slate-500 text-center">
          Already have an account?{' '}
          <Link href="/auth/sign-in" className="font-semibold text-blue-700 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}