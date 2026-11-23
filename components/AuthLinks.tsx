'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';

export default function AuthLinks() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <span
        className="h-11 w-16 animate-pulse border border-ink/15 bg-ink/5 sm:w-24"
        aria-hidden="true"
      />
    );
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-1">
        <Link href="/account" className="btn btn-secondary">
          Account
        </Link>
        <button
          type="button"
          onClick={async () => {
            await authClient.signOut();
            router.refresh();
          }}
          className="btn btn-ghost hidden sm:inline-flex"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Link href="/auth/sign-in" className="btn btn-ghost">
        Sign in
      </Link>
      <Link
        href="/auth/sign-up"
        className="btn btn-primary hidden sm:inline-flex"
      >
        Sign up
      </Link>
    </div>
  );
}