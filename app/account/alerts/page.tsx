'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';

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

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [watches, setWatches] = useState<WatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    try {
      await fetch('/api/watchlist?usdot=' + usdot, { method: 'DELETE' });
      setWatches((ws) => ws.filter((x) => x.usdot !== usdot));
    } catch {
      setError('Failed to remove watch.');
    }
  };

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Alerts &amp; Watchlist</h1>
            <p className="text-sm text-slate-500 mt-1">
              Watched carriers are checked against the FMCSA census on an hourly schedule; changes create alerts here.
            </p>
          </div>
          <Link href="/account" className="text-sm font-semibold text-blue-700 hover:underline">
            ← Back to account
          </Link>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">{error}</div>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Watchlist</h2>
              {watches.length === 0 ? (
                <p className="text-sm text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl p-6 text-center">
                  No carriers watched yet. Expand any search result and click <strong>&quot;+ Watch changes&quot;</strong>.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-xl overflow-hidden">
                  {watches.map((w) => (
                    <div key={w.usdot} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{w.legal_name || 'Unknown carrier'}</p>
                        <p className="text-xs text-slate-500">USDOT {w.usdot} · watched {new Date(w.created_at).toLocaleDateString()}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeWatch(w.usdot)}
                        className="text-xs font-semibold text-rose-600 border border-rose-200 bg-white rounded-lg px-3 py-1.5 hover:bg-rose-50 transition-colors shrink-0"
                      >
                        Unwatch
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Recent changes</h2>
              {alerts.length === 0 ? (
                <p className="text-sm text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl p-6 text-center">
                  No changes detected yet. Alerts appear here when a watched carrier&apos;s name, phone, email, insurance,
                  or authority status changes.
                </p>
              ) : (
                <div className="space-y-2">
                  {alerts.map((a) => (
                    <div key={a.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {a.legal_name || 'Carrier'} <span className="text-slate-400 font-normal">· USDOT {a.usdot}</span>
                        </p>
                        <span className="text-xs text-slate-400 shrink-0">
                          {new Date(a.detected_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{a.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}