'use client';

import { useState } from 'react';
import Link from 'next/link';
import CarrierCard, { Carrier } from '@/components/CarrierCard';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const empty = { name: '', dba: '', usdot: '', mc: '', phone: '', city: '', zip: '', state: '', status: 'all', added: '' };

export default function AdvancedSearch() {
  const [f, setF] = useState({ ...empty });
  const [results, setResults] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [offset, setOffset] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function search(append: boolean) {
    const anyField = Object.values(f).some((v) => v && v !== 'all');
    if (!anyField) { alert('Fill in at least one field or filter.'); return; }
    setLoading(true);
    setSearched(true);

    const params = new URLSearchParams();
    (['name','dba','usdot','mc','phone','city','zip','state'] as const).forEach((k) => f[k] && params.set(k, f[k]));
    if (f.status !== 'all') params.set('status', f.status);
    if (f.added) params.set('added', f.added);
    const off = append ? offset : 0;
    params.set('limit', '25');
    params.set('offset', String(off));

    try {
      const res = await fetch('/api/search?' + params.toString());
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Search failed');
      const rows: Carrier[] = json.results || [];
      setResults((p) => (append ? [...p, ...rows] : rows));
      setOffset(off + rows.length);
      setExhausted(rows.length < 25);
    } catch (err: any) {
      alert('Search error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none";

  return (
    <main className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-slate-900">Advanced Search</h1>
          <Link href="/" className="text-xs text-blue-700 hover:underline underline-offset-4">← Simple Search</Link>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); search(false); }} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input placeholder="Legal Name" value={f.name} onChange={set('name')} className={inputCls} />
            <input placeholder="DBA Name" value={f.dba} onChange={set('dba')} className={inputCls} />
            <input placeholder="USDOT Number" value={f.usdot} onChange={set('usdot')} className={inputCls} />
            <input placeholder="MC / FF Number" value={f.mc} onChange={set('mc')} className={inputCls} />
            <input placeholder="Phone Number" value={f.phone} onChange={set('phone')} className={inputCls} />
            <input placeholder="City" value={f.city} onChange={set('city')} className={inputCls} />
            <select value={f.state} onChange={set('state')} className={inputCls}>
              <option value="">All States</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input placeholder="ZIP" value={f.zip} onChange={set('zip')} className={inputCls} />
            <select value={f.status} onChange={set('status')} className={inputCls}>
              <option value="all">All Authorities</option>
              <option value="active">Active Only</option>
            </select>
            <select value={f.added} onChange={set('added')} className={inputCls}>
              <option value="">Any time added</option>
              <option value="7">New authorities — last 7 days</option>
              <option value="30">New authorities — last month</option>
              <option value="90">New authorities — last 3 months</option>
              <option value="180">New authorities — last 6 months</option>
            </select>
          </div>
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-2.5 rounded-lg text-sm disabled:opacity-50">
              {loading ? 'Searching…' : 'Search'}
            </button>
            <button type="button" onClick={() => { setF({ ...empty }); setResults([]); setSearched(false); }}
              className="border border-slate-300 bg-white px-6 py-2.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Clear
            </button>
          </div>
        </form>

        <div className="space-y-4">
          {searched && !loading && results.length === 0 && (
            <div className="border border-dashed border-slate-300 rounded-xl p-12 text-center text-sm text-slate-500 bg-white">
              No carriers matched those criteria.
            </div>
          )}
          {results.map((c) => <CarrierCard key={c.usdot + offset} carrier={c} />)}
          {results.length > 0 && !exhausted && (
            <button onClick={() => search(true)} disabled={loading}
              className="w-full py-3 text-sm font-semibold text-blue-700 border border-blue-300 bg-white rounded-lg hover:bg-blue-50 disabled:opacity-50">
              {loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}