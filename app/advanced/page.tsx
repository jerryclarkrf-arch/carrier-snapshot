'use client';

import { useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import CarrierCard, { Carrier } from '@/components/CarrierCard';
import { authClient } from '@/lib/auth/client';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const empty = { name: '', dba: '', usdot: '', mc: '', phone: '', city: '', zip: '', state: '', status: 'all', addedFrom: '', addedTo: '' };

export default function AdvancedSearch() {
  const { data: session } = authClient.useSession();
  const loggedIn = !!session?.user;
  const [f, setF] = useState({ ...empty });
  const [results, setResults] = useState<Carrier[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  function validateDates() {
    if (f.addedFrom && f.addedTo) {
      const from = new Date(f.addedFrom + 'T00:00:00');
      const to = new Date(f.addedTo + 'T00:00:00');
      const days = Math.round((to.getTime() - from.getTime()) / 86400000);
      if (days < 0) return 'Added To must be on or after Added From.';
      if (days > 31) return 'Added date range cannot exceed one month (31 days).';
    }
    return null;
  }

  async function run(targetPage = 1) {
    const anyField = Object.values(f).some((v) => v && v !== 'all');
    if (!anyField) { alert('Fill in at least one field or filter.'); return; }
    const dateErr = validateDates();
    if (dateErr) { setError(dateErr); return; }

    setLoading(true);
    setSearched(true);
    setError(null);

    const params = new URLSearchParams();
    (['name','dba','usdot','mc','phone','city','zip','state'] as const).forEach((k) => f[k] && params.set(k, f[k]));
    if (f.status !== 'all') params.set('status', f.status);
    if (f.addedFrom) params.set('addedFrom', f.addedFrom);
    if (f.addedTo) params.set('addedTo', f.addedTo);
    params.set('page', String(targetPage));
    params.set('limit', '50');

    try {
      const res = await fetch('/api/search?' + params.toString());
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Search failed');
      setResults(json.results || []);
      setTotal(json.total || 0);
      setPage(json.page || 1);
      setPages(json.pages || 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setF({ ...empty });
    setResults([]);
    setTotal(0);
    setPage(1);
    setPages(0);
    setSearched(false);
    setError(null);
  }

  function exportCSV() {
    if (results.length === 0) return;
    const head = ['USDOT','MC','Legal Name','DBA','DOT Status','Auth Status','Phone','Email','City','State','Zip','Added','MCS-150'];
    const rows = results.map((c) => [c.usdot, c.docket || '', c.legalName || '', c.dba || '', c.dotStatus, c.authStatus, c.phone || '', c.email || '', c.phy.city || '', c.phy.state || '', c.phy.zip || '', c.addDate || '', c.mcs150 || '']);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'carrier-advanced-search.csv';
    a.click();
  }

  const inputCls = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none";
  const labelCls = "text-[11px] font-bold text-slate-500 uppercase tracking-wide";

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Advanced Search</h1>
          <p className="text-sm text-slate-500 mt-1">Search the FMCSA census with precise filters.</p>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); run(1); }}
          className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className={labelCls}>Legal Name</label>
              <input placeholder="e.g. ABC Trucking" value={f.name} onChange={set('name')} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>DBA Name</label>
              <input placeholder="Doing business as" value={f.dba} onChange={set('dba')} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>USDOT Number</label>
              <input placeholder="e.g. 3270258" inputMode="numeric" value={f.usdot} onChange={set('usdot')} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>MC / FF Number</label>
              <input placeholder="e.g. 1032275" inputMode="numeric" value={f.mc} onChange={set('mc')} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Phone Number</label>
              <input placeholder="e.g. 7068323093" inputMode="numeric" value={f.phone} onChange={set('phone')} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>City</label>
              <input placeholder="e.g. Atlanta" value={f.city} onChange={set('city')} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>State</label>
              <select value={f.state} onChange={set('state')} className={inputCls}>
                <option value="">All States</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className={labelCls}>ZIP Code</label>
              <input placeholder="e.g. 30303" inputMode="numeric" value={f.zip} onChange={set('zip')} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Authority Status</label>
              <select value={f.status} onChange={set('status')} className={inputCls}>
                <option value="all">All Authorities</option>
                <option value="active">Active Only</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Added From</label>
              <input type="date" value={f.addedFrom} onChange={set('addedFrom')} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Added To</label>
              <input type="date" value={f.addedTo} onChange={set('addedTo')} className={inputCls} />
            </div>
            <div className="flex items-end">
              <p className="text-[11px] text-slate-400 leading-tight">
                Added date range cannot exceed 1 month (31 days). Filter applies to active authorities only.
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-2.5 rounded-lg text-sm disabled:opacity-50 transition-colors"
            >
              {loading ? 'Searching…' : 'Search'}
            </button>
            <button
              type="button"
              onClick={clear}
              className="border border-slate-300 bg-white px-6 py-2.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Clear
            </button>
            {results.length > 0 &&
              (loggedIn ? (
                <button
                  type="button"
                  onClick={exportCSV}
                  className="ml-auto text-sm font-semibold text-blue-700 border border-blue-300 bg-white rounded-lg px-4 py-2.5 hover:bg-blue-50 transition-colors"
                >
                  Export CSV
                </button>
              ) : (
                <Link
                  href="/auth/sign-up"
                  className="ml-auto text-sm font-semibold text-blue-700 border border-blue-300 bg-white rounded-lg px-4 py-2.5 hover:bg-blue-50 transition-colors"
                >
                  Sign in to export
                </Link>
              ))}
          </div>
        </form>

        {searched && !loading && !error && (
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span className="font-semibold text-slate-800">
              {total.toLocaleString()} {
                total === 1 ? 'result' : 'results'
              } found
            </span>
            {pages > 1 && (
              <span className="text-xs text-slate-400">Page {page} of {pages}</span>
            )}
          </div>
        )}

        <div className="space-y-4">
          {results.map((c) => <CarrierCard key={c.usdot} carrier={c} />)}
        </div>

        {searched && !loading && !error && results.length === 0 && (
          <div className="border border-dashed border-slate-300 rounded-xl p-12 text-center text-sm text-slate-500 bg-white">
            No carriers matched those criteria.
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => run(page - 1)}
              disabled={page <= 1 || loading}
              className="px-5 py-2.5 text-sm font-semibold text-slate-700 border border-slate-300 bg-white rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              ← Prev
            </button>
            <span className="text-sm text-slate-500">
              Page <strong>{page}</strong> of {pages}
            </span>
            <button
              type="button"
              onClick={() => run(page + 1)}
              disabled={page >= pages || loading}
              className="px-5 py-2.5 text-sm font-semibold text-slate-700 border border-slate-300 bg-white rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </main>
  );
}