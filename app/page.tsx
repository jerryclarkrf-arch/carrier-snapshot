'use client';

import { useState } from 'react';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

interface Carrier {
  usdot: string; docketDigits: string; docket: string | null; legalName: string | null;
  dotStatus: string; authStatus: string; authType: string | null;
  phone: string | null; email: string | null;
  powerUnits: number | null; drivers: number | null;
  phy: { street?: string; city?: string; state?: string; zip?: string };
  mail: { street?: string; city?: string; state?: string; zip?: string };
  cargo: Record<string, boolean>;
  addDate: string | null; mcs150: string | null;
}

interface InsPolicy { form: string; type: string; carrier: string; policy: string; received: string; coverage: string; effective: string; status: string; }
interface Insp { date: string; report: string; state: string; level: string; summary: string; }

const badge = (s: string) =>
  s === 'Active' ? 'bg-emerald-100 text-emerald-800' :
  s === 'Pending' ? 'bg-amber-100 text-amber-800' :
  s === 'Inactive' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700';

export default function Home() {
  const [q, setQ] = useState('');
  const [stateF, setStateF] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [addedF, setAddedF] = useState('');
  const [results, setResults] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [offset, setOffset] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<Record<string, 'insurance' | 'inspections'>>({});
  const [ins, setIns] = useState<Record<string, { loading: boolean; data: { owner: string; policies: InsPolicy[] } | null }>>({});
  const [insp, setInsp] = useState<Record<string, { loading: boolean; data: Insp[] | null }>>({});

  async function runSearch(append: boolean) {
    if (!q.trim() && !stateF && statusF === 'all' && !addedF) {
      alert('Enter a search term (USDOT, MC, phone, or name) — or pick a filter like State or New Authorities.');
      return;
    }
    setLoading(true);
    setSearched(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (stateF) params.set('state', stateF);
    if (statusF !== 'all') params.set('status', statusF);
    if (addedF) params.set('added', addedF);
    const off = append ? offset : 0;
    params.set('limit', '25');
    params.set('offset', String(off));
    try {
      const res = await fetch('/api/search?' + params.toString());
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Search failed');
      const rows: Carrier[] = json.results || [];
      setResults((prev) => (append ? [...prev, ...rows] : rows));
      setOffset(off + rows.length);
      setExhausted(rows.length < 25);
      if (!append) { setExpanded(null); setTab({}); }
    } catch (e: any) {
      alert('Search error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadInsurance(usdot: string) {
    setIns((p) => ({ ...p, [usdot]: { loading: true, data: null } }));
    try {
      const r = await fetch('/api/insurance?dotNumber=' + usdot);
      const j = await r.json();
      setIns((p) => ({ ...p, [usdot]: { loading: false, data: j.error ? null : j } }));
    } catch {
      setIns((p) => ({ ...p, [usdot]: { loading: false, data: null } }));
    }
  }

  async function loadInspections(usdot: string) {
    if (insp[usdot]) return;
    setInsp((p) => ({ ...p, [usdot]: { loading: true, data: null } }));
    try {
      const r = await fetch('/api/inspections?dot=' + usdot);
      const j = await r.json();
      setInsp((p) => ({ ...p, [usdot]: { loading: false, data: j.inspections || [] } }));
    } catch {
      setInsp((p) => ({ ...p, [usdot]: { loading: false, data: [] } }));
    }
  }

  function toggleExpand(usdot: string) {
    const next = expanded === usdot ? null : usdot;
    setExpanded(next);
    if (next) {
      if (!ins[next]) loadInsurance(next);
      if (!tab[next]) setTab((p) => ({ ...p, [next]: 'insurance' }));
    }
  }

  function switchTab(usdot: string, t: 'insurance' | 'inspections') {
    setTab((p) => ({ ...p, [usdot]: t }));
    if (t === 'inspections') loadInspections(usdot);
  }

  function exportCSV() {
    if (results.length === 0) return;
    const head = ['USDOT','MC','Legal Name','DOT Status','Auth Status','Phone','Email','City','State','Zip','Added','MCS-150'];
    const rows = results.map((c) => [c.usdot, c.docket || '', c.legalName || '', c.dotStatus, c.authStatus, c.phone || '', c.email || '', c.phy.city || '', c.phy.state || '', c.phy.zip || '', c.addDate || '', c.mcs150 || '']);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'carrier-search.csv';
    a.click();
  }

  return (
    <main className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Carrier Intelligence Platform</h1>
          <p className="text-sm text-slate-500 mt-1">Live FMCSA data — no database, always current.</p>
        </div>

        {/* Search + filters */}
        <form onSubmit={(e) => { e.preventDefault(); runSearch(false); }} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="USDOT, MC#, phone, or company name… (leave blank to browse by filters)"
              className="flex-1 bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none" />
            <button type="submit" disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-2.5 rounded-lg disabled:opacity-50">
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <select value={stateF} onChange={(e) => setStateF(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">All States</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={statusF} onChange={(e) => setStatusF(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="all">All Authorities</option>
              <option value="active">Active Only</option>
            </select>
            <select value={addedF} onChange={(e) => setAddedF(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Any time added</option>
              <option value="7">New authorities — last 7 days</option>
              <option value="30">New authorities — last month</option>
              <option value="90">New authorities — last 3 months</option>
              <option value="180">New authorities — last 6 months</option>
            </select>
            {results.length > 0 && (
              <button type="button" onClick={exportCSV}
                className="ml-auto text-sm font-semibold text-blue-700 border border-blue-300 bg-white rounded-lg px-4 py-2 hover:bg-blue-50">
                Export CSV ({results.length})
              </button>
            )}
          </div>
        </form>

        {/* Results */}
        <div className="space-y-4">
          {results.map((c) => {
            const isOpen = expanded === c.usdot;
            const cargoTags = Object.entries(c.cargo).filter(([, v]) => v).map(([k]) => k);
            return (
              <div key={c.usdot} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <button onClick={() => toggleExpand(c.usdot)} className="w-full text-left p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-slate-900 uppercase">{c.legalName || 'NAME NOT LISTED'}</h2>
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${badge(c.dotStatus)}`}>{c.dotStatus}</span>
                        {c.docket && <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${badge(c.authStatus)}`}>{c.docket} · {c.authStatus}</span>}
                      </div>
                      <div className="text-xs text-slate-600 mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                        <span><strong>USDOT:</strong> {c.usdot}</span>
                        <span><strong>Phone:</strong> {c.phone || 'N/A'}</span>
                        {c.email && <span><strong>Email:</strong> <span className="text-blue-600">{c.email}</span></span>}
                        <span><strong>Location:</strong> {[c.phy.city, c.phy.state].filter(Boolean).join(', ') || 'N/A'}</span>
                        {c.addDate && <span><strong>Added:</strong> {c.addDate}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-center">
                        <div className="text-[10px] font-bold text-slate-500 uppercase">Power Units</div>
                        <div className="text-lg font-extrabold">{c.powerUnits ?? '—'}</div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-center">
                        <div className="text-[10px] font-bold text-slate-500 uppercase">Drivers</div>
                        <div className="text-lg font-extrabold">{c.drivers ?? '—'}</div>
                      </div>
                      <span className="text-slate-400 text-xl ml-1">{isOpen ? '▾' : '▸'}</span>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-200">
                    <div className="flex border-b border-slate-200 bg-slate-50 px-4">
                      {(['insurance', 'inspections'] as const).map((t) => (
                        <button key={t} onClick={() => switchTab(c.usdot, t)}
                          className={`px-5 py-2.5 text-sm font-medium border-b-2 capitalize ${tab[c.usdot] === t ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-slate-500'}`}>
                          {t}
                        </button>
                      ))}
                    </div>

                    <div className="p-5">
                      {/* Overview strip */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
                        <div>
                          <p><strong>Physical:</strong> {[c.phy.street, c.phy.city, c.phy.state, c.phy.zip].filter(Boolean).join(', ') || 'Not listed'}</p>
                          <p className="mt-1"><strong>Mailing:</strong> {[c.mail.street, c.mail.city, c.mail.state, c.mail.zip].filter(Boolean).join(', ') || 'Not listed'}</p>
                          <p className="mt-1"><strong>Authority Type:</strong> {c.authType || 'N/A'} · <strong>MCS-150:</strong> {c.mcs150 || 'N/A'}</p>
                        </div>
                        <div>
                          <strong>Cargo:</strong>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {cargoTags.length ? cargoTags.map((t) => (
                              <span key={t} className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-medium">{t}</span>
                            )) : <span className="text-slate-400">None reported</span>}
                          </div>
                        </div>
                      </div>

                      {tab[c.usdot] !== 'inspections' ? (
                        ins[c.usdot]?.loading ? (
                          <p className="text-sm text-blue-600 py-6 text-center">Loading insurance from FMCSA L&amp;I portal…</p>
                        ) : !ins[c.usdot]?.data ? (
                          <p className="text-sm text-slate-500 py-4">Insurance data unavailable for this carrier.</p>
                        ) : (
                          <div>
                            <p className="text-xs text-slate-500 mb-2">
                              <strong className="text-slate-700">Owner / Representative:</strong> {ins[c.usdot]!.data!.owner}
                            </p>
                            {ins[c.usdot]!.data!.policies.length === 0 ? (
                              <p className="text-sm text-slate-500">No active/pending insurance filings found.</p>
                            ) : (
                              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                <table className="min-w-full text-xs">
                                  <thead className="bg-slate-50 text-slate-600 font-semibold">
                                    <tr>
                                      <th className="py-2 px-3 text-left">Form</th><th className="py-2 px-3 text-left">Type</th>
                                      <th className="py-2 px-3 text-left">Insurance Carrier</th><th className="py-2 px-3 text-left">Policy #</th>
                                      <th className="py-2 px-3 text-left">Coverage</th><th className="py-2 px-3 text-left">Effective</th>
                                      <th className="py-2 px-3 text-left">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {ins[c.usdot]!.data!.policies.map((p, i) => (
                                      <tr key={i} className="hover:bg-slate-50">
                                        <td className="py-2 px-3">{p.form}</td>
                                        <td className="py-2 px-3">{p.type}</td>
                                        <td className="py-2 px-3">{p.carrier}</td>
                                        <td className="py-2 px-3 font-mono">{p.policy}</td>
                                        <td className="py-2 px-3">{p.coverage}</td>
                                        <td className="py-2 px-3">{p.effective}</td>
                                        <td className="py-2 px-3">
                                          <span className={`px-2 py-0.5 rounded-full font-semibold ${p.status.toLowerCase().includes('active') ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{p.status}</span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )
                      ) : (
                        insp[c.usdot]?.loading ? (
                          <p className="text-sm text-blue-600 py-6 text-center">Querying roadside inspection records…</p>
                        ) : !insp[c.usdot]?.data || insp[c.usdot]!.data!.length === 0 ? (
                          <p className="text-sm text-slate-500 py-4">No roadside inspections on record for this carrier.</p>
                        ) : (
                          <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <table className="min-w-full text-xs">
                              <thead className="bg-slate-50 text-slate-600 font-semibold">
                                <tr>
                                  <th className="py-2 px-3 text-left">Date</th><th className="py-2 px-3 text-left">Report #</th>
                                  <th className="py-2 px-3 text-left">State</th><th className="py-2 px-3 text-left">Inspection</th>
                                  <th className="py-2 px-3 text-left">Result</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {insp[c.usdot]!.data!.map((r, i) => (
                                  <tr key={i} className="hover:bg-slate-50">
                                    <td className="py-2 px-3 whitespace-nowrap">{r.date}</td>
                                    <td className="py-2 px-3 font-mono text-blue-600">{r.report}</td>
                                    <td className="py-2 px-3 font-semibold">{r.state}</td>
                                    <td className="py-2 px-3">{r.level}</td>
                                    <td className="py-2 px-3">{r.summary}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {results.length > 0 && !exhausted && (
            <button onClick={() => runSearch(true)} disabled={loading}
              className="w-full py-3 text-sm font-semibold text-blue-700 border border-blue-300 bg-white rounded-lg hover:bg-blue-50 disabled:opacity-50">
              {loading ? 'Loading…' : 'Load more results'}
            </button>
          )}

          {searched && !loading && results.length === 0 && (
            <div className="border border-dashed border-slate-300 rounded-xl p-12 text-center text-sm text-slate-500">
              No carriers matched. Try a different term or loosen the filters.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}