'use client';

import { useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import CarrierCard, { Carrier } from '@/components/CarrierCard';
import { authClient } from '@/lib/auth/client';
import { isRetryable, searchWithRetry } from '@/lib/search-client';

export default function SimpleSearch() {
  const { data: session } = authClient.useSession();
  const loggedIn = !!session?.user;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Carrier[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [lastQuery, setLastQuery] = useState('');

  async function run(targetPage = 1) {
    const query = q.trim();
    if (!query) {
      setError('Enter a USDOT, MC/FF number, phone, or company name.');
      return;
    }
    setLoading(true);
    setSearched(true);
    setError(null);
    setNotice(null);
    setCanRetry(false);
    setLastQuery(query);
    const params = new URLSearchParams();
    params.set('q', query);
    params.set('page', String(targetPage));
    params.set('limit', '50');
    try {
      const json = await searchWithRetry(params);
      setResults(json.results || []);
      setTotal(json.total || 0);
      setPage(json.page || 1);
      setPages(json.pages || 0);
      setNotice(json.notice || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setCanRetry(isRetryable(e));
      setResults([]);
      setTotal(0);
      setPages(0);
    } finally {
      setLoading(false);
    }
  }

  function exportCSV() {
    if (results.length === 0) return;
    const head = ['USDOT','MC','Legal Name','DBA','DOT Status','Auth Status','Phone','Email','City','State','Zip','Added','MCS-150'];
    const rows = results.map((c) => [c.usdot, c.docket || '', c.legalName || '', c.dba || '', c.dotStatus, c.authStatus, c.phone || '', c.email || '', c.phy.city || '', c.phy.state || '', c.phy.zip || '', c.addDate || '', c.mcs150 || '']);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'carrier-search.csv';
    a.click();
  }

  function clearSearch() {
    setQ('');
    setResults([]);
    setTotal(0);
    setPage(1);
    setPages(0);
    setSearched(false);
    setError(null);
    setNotice(null);
    setCanRetry(false);
    setLastQuery('');
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        {/* Hero */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-blue-50 px-6 py-8 shadow-sm">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Live FMCSA data
              </span>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Carrier Search</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-600">
                Look up any motor carrier by USDOT, MC/FF number, phone or company name — census, authority,
                insurance, safety and inspections in one view.
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-center sm:gap-4">
              {[
                ['2.7M+', 'Carriers'],
                ['24 mo', 'Inspections'],
                ['5', 'BASICs'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
                  <dd className="text-sm font-extrabold text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Search */}
        <form
          onSubmit={(e) => { e.preventDefault(); run(1); }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <svg
                aria-hidden
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="USDOT, MC/FF number, phone, or company name"
                aria-label="Search carriers"
                autoComplete="off"
                className="w-full rounded-xl border border-slate-300 bg-white py-3.5 pl-11 pr-10 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              {q && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? 'Searching…' : 'Search'}
            </button>
            <Link
              href="/advanced"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Advanced filters
            </Link>
          </div>
          <p className="mt-2.5 text-[11px] text-slate-400">
            Tip: a USDOT number returns an exact match. Need state, authority, fleet or cargo filters?{' '}
            <Link href="/advanced" className="font-semibold text-blue-700 hover:underline">Use Advanced Search</Link>.
          </p>
        </form>

        {error && (
          <div className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between">
            <p>{error}</p>
            {canRetry && (
              <button
                type="button"
                onClick={() => run(page)}
                disabled={loading}
                className="shrink-0 self-start rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50 sm:self-auto"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {notice && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {notice}
          </div>
        )}

        {/* Results header */}
        {searched && !loading && !error && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {total.toLocaleString()} {total === 1 ? 'carrier' : 'carriers'} found
              </p>
              <p className="text-xs text-slate-500">
                {lastQuery && <>Matching <span className="font-mono text-slate-600">{lastQuery}</span></>}
                {pages > 1 && <> · page {page} of {pages}</>}
              </p>
            </div>
            {results.length > 0 &&
              (loggedIn ? (
                <button
                  type="button"
                  onClick={exportCSV}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50"
                >
                  Export CSV
                </button>
              ) : (
                <Link
                  href="/auth/sign-up"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50"
                >
                  Sign in to export
                </Link>
              ))}
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-4" aria-busy="true" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="w-full space-y-2">
                    <div className="h-4 w-1/3 rounded bg-slate-200 animate-pulse" />
                    <div className="h-3 w-1/2 rounded bg-slate-100 animate-pulse" />
                  </div>
                  <div className="h-9 w-24 shrink-0 rounded-lg bg-slate-100 animate-pulse" />
                </div>
                <div className="mt-4 h-3 w-2/3 rounded bg-slate-100 animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && (
          <div className="space-y-4">
            {results.map((c) => <CarrierCard key={c.usdot} carrier={c} />)}
          </div>
        )}

        {/* Empty state */}
        {searched && !loading && !error && results.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-sm font-semibold text-slate-700">
              No carriers matched{lastQuery ? ` \u201c${lastQuery}\u201d` : ''}
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
              Check the spelling, try a USDOT number for an exact match, or combine name and location
              filters in Advanced Search.
            </p>
            <Link
              href="/advanced"
              className="mt-4 inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Open Advanced Search
            </Link>
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && !loading && (
          <div className="flex flex-col items-center justify-between gap-3 pt-2 sm:flex-row">
            <p className="text-xs text-slate-500">
              Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => run(page - 1)}
                disabled={page <= 1 || loading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                {page} / {pages}
              </span>
              <button
                type="button"
                onClick={() => run(page + 1)}
                disabled={page >= pages || loading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}