'use client';

import { useState } from 'react';
import Nav from '@/components/Nav';
import CarrierCard, { Carrier } from '@/components/CarrierCard';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

export default function SimpleSearch() {
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [status, setStatus] = useState('all');
  const [results, setResults] = useState<Carrier[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(targetPage = 1) {
    if (!q.trim() && !state && status === 'all') {
      alert('Enter a USDOT, MC/FF number, phone, or company name.');
      return;
    }
    setLoading(true);
    setSearched(true);
    setError(null);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (state) params.set('state', state);
    if (status !== 'all') params.set('status', status);
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

  const selectCls = "bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none";

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        <div className="text-center">
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900">Carrier Search</h1>
          <p className="text-sm text-slate-500 mt-2">Find a motor carrier by USDOT, MC/FF number, phone, or company name — live from FMCSA data.</p>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); run(1); }}
          className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4"
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="USDOT #, MC #, phone number, or company name…"
              className="flex-1 bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-600 outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg text-sm disabled:opacity-50 transition-colors"
            >
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select value={state} onChange={(e) => setState(e.target.value)} className={selectCls} aria-label="State">
              <option value="">All States</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls} aria-label="Authority status">
              <option value="all">All Authorities</option>
              <option value="active">Active Only</option>
            </select>
            {results.length > 0 && (
              <button
                type="button"
                onClick={exportCSV}
                className="ml-auto text-sm font-semibold text-blue-700 border border-blue-300 bg-white rounded-lg px-4 py-2.5 hover:bg-blue-50 transition-colors"
              >
                Export CSV
              </button>
            )}
          </div>
        </form>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

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
            No carriers matched. Try a different term or loosen the filters.
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