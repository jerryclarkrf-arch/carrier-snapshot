import { auth } from '@/lib/auth/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { ArrowRightIcon } from '@/components/icons';
import { signOut } from '@/app/auth/sign-out/actions';

export const metadata: Metadata = {
  title: 'Account',
};

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const { data: session } = await auth.getSession();

  if (!session?.user) {
    redirect('/auth/sign-in');
  }

  const user = session.user;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Nav />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
          <header className="border-b-2 border-ink pb-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-steel">
              Account
            </p>
            <h1 className="mt-1 font-display text-4xl font-semibold leading-[0.95] sm:text-5xl">
              Your carrier watchlist
            </h1>
            <p className="mt-2 text-sm text-steel">
              Signed in as{' '}
              <span className="font-mono text-ink">{user.email}</span>
            </p>
          </header>

          <div className="mt-6 grid gap-6 lg:grid-cols-5">
            <section className="panel p-5 lg:col-span-3">
              <h2 className="font-display text-2xl font-semibold leading-none">
                Identity
              </h2>
              <dl className="mt-3 border-t border-ink/15">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink/10 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
                    Name
                  </dt>
                  <dd className="text-sm font-medium text-ink">
                    {user.name || '—'}
                  </dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink/10 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
                    Email
                  </dt>
                  <dd className="break-all text-right font-mono text-[11px] text-ink">
                    {user.email}
                  </dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
                    User ID
                  </dt>
                  <dd className="break-all text-right font-mono text-[11px] text-steel">
                    {user.id}
                  </dd>
                </div>
              </dl>
            </section>

            <aside className="on-ink border-2 border-ink bg-ink p-5 text-paper lg:col-span-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/60">
                Watchlist
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold leading-[0.95]">
                Carrier changes, logged.
              </h2>
              <p className="mt-2 text-sm leading-6 text-paper/70">
                Watch carriers and review authority, insurance, and contact
                changes as they land.
              </p>
              <Link
                href="/account/alerts"
                className="btn btn-primary mt-5 w-full"
              >
                Alerts &amp; watchlist
                <ArrowRightIcon size={16} />
              </Link>
            </aside>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-ink/15 pt-4">
            <Link href="/" className="btn btn-secondary">
              Back to lookup
            </Link>
            <form action={signOut}>
              <button type="submit" className="btn btn-ghost">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}