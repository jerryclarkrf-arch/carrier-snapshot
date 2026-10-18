import { auth } from '@/lib/auth/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { signOut } from '@/app/auth/sign-out/actions';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const { data: session } = await auth.getSession();

  if (!session?.user) {
    redirect('/auth/sign-in');
  }

  const user = session.user;

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <h1 className="text-2xl font-extrabold text-slate-900">My Account</h1>
          <p className="text-sm text-slate-500 mt-1">
            Signed in as <strong className="text-slate-800">{user.email}</strong>
          </p>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-[11px] font-bold text-slate-500 uppercase">Name</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{user.name || '—'}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-[11px] font-bold text-slate-500 uppercase">User ID</p>
              <p className="text-sm font-mono text-slate-800 mt-0.5 truncate">{user.id}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/account/alerts"
            className="rounded-lg bg-slate-800 hover:bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            Alerts &amp; Watchlist
          </Link>
          <Link
            href="/"
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            Back to search
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}