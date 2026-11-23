'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import {
  AlertIcon,
  ArrowLeftIcon,
  ClockIcon,
  XIcon,
} from '@/components/icons';

interface AlertRow {
  id: number;
  usdot: string;
  legal_name: string | null;
  summary: string;
  detected_at: string;
}
interface WatchRow {
  usdot: string;
  legal_name: string | null;
  created_at: string;
}

const fmtDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

const fmtDateTime = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [watches, setWatches] = useState<WatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch('/api/alerts'), fetch('/api/watchlist')])
      .then(([a, w]) => Promise.all([a.json(), w.json()]))
      .then(([a, w]) => {
        setAlerts(a.alerts || []);
        setWatches(w.watches || []);
      })
      .catch(() => setError('Failed to load alerts.'))
      .finally(() => setLoading(false));
  }, []);

  const removeWatch = async (usdot: string) => {
    setRemoving(usdot);
    try {
      const res = await fetch('/api/watchlist?usdot=' + usdot, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('remove failed');
      setWatches((ws) => ws.filter((x) => x.usdot !== usdot));
    } catch {
      setError('Failed to remove watch. Try again.');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Nav />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
          <header className="flex flex-col gap-3 border-b-2 border-ink pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-steel">
                Account · alerts
              </p>
              <h1 className="mt-1 font-display text-4xl font-semibold leading-[0.95] sm:text-5xl">
                Alerts &amp; watchlist
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-steel">
                Watched carriers are checked against the FMCSA census daily.
                Changes to name, phone, email, insurance, or authority create an
                alert here.
              </p>
            </div>
            <Link
              href="/account"
              className="inline-flex min-h-11 items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink hover:underline"
            >
              <ArrowLeftIcon size={14} />
              Back to account
            </Link>
          </header>

          <p className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
            <ClockIcon size={14} />
            Checked daily · 03:00 UTC
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 border border-alert/30 bg-alert/5 px-3 py-2 text-sm leading-5 text-alert"
            >
              <AlertIcon size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div
              className="mt-6 grid gap-6 lg:grid-cols-2"
              aria-busy="true"
              aria-live="polite"
            >
              {[0, 1].map((i) => (
                <div key={i} className="border-2 border-ink bg-white p-4">
                  <div className="h-5 w-32 animate-pulse bg-ink/10" />
                  <div className="mt-4 space-y-3">
                    <div className="h-9 w-full animate-pulse bg-ink/5" />
                    <div className="h-9 w-full animate-pulse bg-ink/5" />
                    <div className="h-9 w-4/5 animate-pulse bg-ink/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <section aria-labelledby="watchlist-heading">
                <div className="flex items-baseline justify-between gap-2 border-b-2 border-ink pb-2">
                  <h2
                    id="watchlist-heading"
                    className="font-display text-2xl font-semibold leading-none"
                  >
                    Watchlist
                  </h2>
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
                    {watches.length} watched
                  </span>
                </div>

                {watches.length === 0 ? (
                  <div className="mt-3 border border-ink/20 bg-white p-5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-steel">
                      No carriers watched
                    </p>
                    <p className="mt-1 text-sm leading-6 text-steel">
                      Open any search result and choose{' '}
                      <span className="font-medium text-ink">Watch changes</span>{' '}
                      to start tracking it.
                    </p>
                    <Link href="/" className="btn btn-secondary mt-4">
                      Run a lookup
                    </Link>
                  </div>
                ) : (
                  <ul className="mt-3 border-2 border-ink bg-white">
                    {watches.map((w) => (
                      <li
                        key={w.usdot}
                        className="flex flex-col gap-3 border-b border-ink/15 p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="break-words font-display text-xl font-semibold leading-tight text-ink">
                            {w.legal_name || 'Unknown carrier'}
                          </p>
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
                            USDOT {w.usdot} · watched{' '}
                            <time dateTime={w.created_at}>
                              {fmtDate(w.created_at)}
                            </time>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeWatch(w.usdot)}
                          disabled={removing === w.usdot}
                          aria-label={`Unwatch ${
                            w.legal_name || `USDOT ${w.usdot}`
                          }`}
                          className="btn btn-danger shrink-0 self-start sm:self-auto"
                        >
                          {removing === w.usdot ? (
                            'Removing…'
                          ) : (
                            <>
                              <XIcon size={14} />
                              Unwatch
                            </>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section aria-labelledby="changes-heading">
                <div className="flex items-baseline justify-between gap-2 border-b-2 border-ink pb-2">
                  <h2
                    id="changes-heading"
                    className="font-display text-2xl font-semibold leading-none"
                  >
                    Recent changes
                  </h2>
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
                    {alerts.length} alerts
                  </span>
                </div>

                {alerts.length === 0 ? (
                  <div className="mt-3 border border-ink/20 bg-white p-5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-steel">
                      No changes detected
                    </p>
                    <p className="mt-1 text-sm leading-6 text-steel">
                      Alerts appear when a watched carrier&apos;s name, phone,
                      email, insurance, or authority status changes.
                    </p>
                  </div>
                ) : (
                  <ol className="relative mt-4 space-y-4 border-l-2 border-ink/15 pl-4">
                    {alerts.map((a) => (
                      <li key={a.id} className="relative">
                        <span
                          className="absolute -left-[1.32rem] top-1.5 h-2 w-2 rounded-full border-2 border-paper bg-safety"
                          aria-hidden="true"
                        />
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-ink">
                            {a.legal_name || 'Carrier'}{' '}
                            <span className="font-mono text-[10px] font-normal text-steel">
                              USDOT {a.usdot}
                            </span>
                          </p>
                          <time
                            dateTime={a.detected_at}
                            className="font-mono text-[10px] text-steel"
                          >
                            {fmtDateTime(a.detected_at)}
                          </time>
                        </div>
                        <p className="mt-1 text-sm leading-5 text-steel">
                          {a.summary}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}