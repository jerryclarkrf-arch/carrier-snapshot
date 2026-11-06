'use client';

import { useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import CarrierCard, { Carrier } from '@/components/CarrierCard';
import { authClient } from '@/lib/auth/client';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const CARGO_OPTIONS = [
  'General Freight', 'Household Goods', 'Metal (Sheets/Coils/Rolls)', 'Motor Vehicles',
  'Driveaway/Towaway', 'Logs/Poles/Beams/Lumber', 'Building Materials', 'Mobile Homes',
  'Machinery/Large Objects', 'Fresh Produce', 'Liquids/Gases', 'Intermodal Containers',
  'Passengers', 'Oilfield Equipment', 'Livestock', 'Grain/Feed/Hay', 'Coal/Coke', 'Meat',
  'Garbage/Refuse/Trash', 'U.S. Mail', 'Chemicals', 'Commodities Dry Bulk', 'Refrigerated Food',
  'Beverages', 'Paper Products', 'Utility', 'Farm Supplies', 'Construction', 'Water-Well',
];

const FLEET_BUCKETS: [string, string][] = [
  ['A', '1'], ['B', '2-3'], ['C', '4-6'], ['D', '7-8'], ['E', '9-11'], ['F', '12-14'],
  ['G', '15-17'], ['H', '18-20'], ['I', '21-23'], ['J', '24-28'], ['K', '29-32'], ['L', '33-38'],
  ['M', '39-44'], ['N', '45-55'], ['O', '56-75'], ['P', '76-100'], ['Q', '101-200'], ['R', '201-300'],
  ['S', '301-400'], ['T', '401-550'], ['U', '551-999'], ['V', '1000-2000'], ['W', '2001-3000'],
  ['X', '3001-4000'], ['Y', '4001-5000'], ['Z', 'Over 5000'],
];

const empty = {
  name: '', dba: '', usdot: '', docket: '', docketPrefix: '', phone: '', city: '', zip: '', state: '',
  status: 'all', addedFrom: '', addedTo: '', contact: '', authorityOp: 'or', operation: '',
  authorityRoles: [] as string[], cargo: [] as string[], rating: [] as string[],
  fleetSize: [] as string[], powerMin: '', powerMax: '', priorRevoked: false,
};

type FilterState = typeof empty;

type GroupKey = 'identity' | 'location' | 'authority' | 'safety' | 'cargo';

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'identity', label: 'Identity' },
  { key: 'location', label: 'Location & Contact' },
  { key: 'authority', label: 'Authority' },
  { key: 'safety', label: 'Safety & Fleet' },
  { key: 'cargo', label: 'Cargo' },
];

const inputCls = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none';
const labelCls = 'text-[11px] font-bold text-slate-500 uppercase tracking-wide';
const presetCls = 'px-2.5 py-1 rounded-lg text-[11px] font-semibold text-blue-700 border border-blue-200 bg-white hover:bg-blue-50 transition-colors';

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60">{children}</div>;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
    >
      {children}
    </button>
  );
}

function Group({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className={labelCls}>{title}</p>
        {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export default function AdvancedSearch() {
  const { data: session } = authClient.useSession();
  const loggedIn = !!session?.user;
  const [f, setF] = useState<FilterState>({ ...empty });
  const [results, setResults] = useState<Carrier[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<GroupKey | null>(null);

  const counts: Record<GroupKey, number> = {
    identity: [f.name, f.dba, f.usdot, f.contact].filter((v) => v.trim()).length,
    location: [f.docket, f.docketPrefix, f.phone, f.city, f.zip, f.state, f.operation].filter((v) => v.trim()).length,
    authority: (f.status !== 'all' ? 1 : 0) + (f.authorityRoles.length > 0 ? 1 : 0) + (f.priorRevoked ? 1 : 0),
    safety: (f.rating.length > 0 ? 1 : 0) + (f.fleetSize.length > 0 ? 1 : 0) + (f.powerMin || f.powerMax ? 1 : 0),
    cargo: f.cargo.length > 0 ? 1 : 0,
  };
  const applied = Object.values(counts).reduce((a, b) => a + b, 0) + (f.addedFrom || f.addedTo ? 1 : 0);

  function preset(days: number) {
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86400000);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setF((p) => ({ ...p, addedFrom: iso(from), addedTo: iso(to) }));
  }

  const set = (k: keyof FilterState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const toggleIn = (k: 'authorityRoles' | 'cargo' | 'rating' | 'fleetSize') => (label: string) =>
    setF((p) => ({
      ...p,
      [k]: p[k].includes(label) ? p[k].filter((x) => x !== label) : [...p[k], label],
    }));

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
    const anyField = [
      f.name, f.dba, f.usdot, f.docket, f.docketPrefix, f.phone, f.city, f.zip, f.state,
      f.contact, f.operation, f.addedFrom, f.addedTo, f.powerMin, f.powerMax,
      f.authorityRoles.length, f.cargo.length, f.rating.length, f.fleetSize.length,
      f.priorRevoked, f.status !== 'all',
    ].some(Boolean);
    if (!anyField) { alert('Fill in at least one field or filter.'); return; }
    const dateErr = validateDates();
    if (dateErr) { setError(dateErr); return; }

    setLoading(true);
    setSearched(true);
    setError(null);

    const params = new URLSearchParams();
    (['name', 'dba', 'usdot', 'phone', 'city', 'zip', 'contact'] as const).forEach((k) => f[k] && params.set(k, f[k]));
    if (f.docket) params.set('docket', f.docket);
    if (f.docketPrefix) params.set('docketPrefix', f.docketPrefix);
    if (f.state) params.set('state', f.state);
    if (f.status !== 'all') params.set('status', f.status);
    if (f.addedFrom) params.set('addedFrom', f.addedFrom);
    if (f.addedTo) params.set('addedTo', f.addedTo);
    if (f.operation) params.set('operation', f.operation);
    f.authorityRoles.forEach((r) => params.append('authorityRoles', r));
    params.set('authorityOp', f.authorityOp);
    f.cargo.forEach((c) => params.append('cargo', c));
    f.rating.forEach((r) => params.append('rating', r));
    f.fleetSize.forEach((x) => params.append('fleetSize', x));
    if (f.powerMin) params.set('powerMin', f.powerMin);
    if (f.powerMax) params.set('powerMax', f.powerMax);
    if (f.priorRevoked) params.set('priorRevoked', 'true');
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
    const head = ['USDOT', 'MC', 'Legal Name', 'DBA', 'DOT Status', 'Auth Status', 'Phone', 'Email', 'City', 'State', 'Zip', 'Added', 'MCS-150'];
    const rows = results.map((c) => [c.usdot, c.docket || '', c.legalName || '', c.dba || '', c.dotStatus, c.authStatus, c.phone || '', c.email || '', c.phy.city || '', c.phy.state || '', c.phy.zip || '', c.addDate || '', c.mcs150 || '']);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'carrier-advanced-search.csv';
    a.click();
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Advanced Search</h1>
          <p className="text-sm text-slate-500 mt-1">Search the FMCSA census with precise filters.</p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); run(1); }} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
          {/* Authority New (date range) — always visible */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className={`${labelCls} text-blue-800`}>Authority New (date range)</p>
              <p className="text-[10px] font-medium text-blue-700/70">Max 1 month</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="date"
                aria-label="Authority new from"
                value={f.addedFrom}
                onChange={set('addedFrom')}
                className={inputCls + ' w-44'}
              />
              <span className="text-sm text-slate-400">to</span>
              <input
                type="date"
                aria-label="Authority new to"
                value={f.addedTo}
                onChange={set('addedTo')}
                className={inputCls + ' w-44'}
              />
              <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                <button type="button" onClick={() => preset(7)} className={presetCls}>Last 7 days</button>
                <button type="button" onClick={() => preset(30)} className={presetCls}>Last 30 days</button>
                {(f.addedFrom || f.addedTo) && (
                  <button
                    type="button"
                    onClick={() => setF((p) => ({ ...p, addedFrom: '', addedTo: '' }))}
                    className={presetCls}
                  >
                    Clear dates
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Collapsed filter groups */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={labelCls}>More filters</p>
              <p className="text-[11px] text-slate-500">
                {applied} applied
                {applied > 0 && (
                  <button type="button" onClick={clear} className="ml-2 font-semibold text-blue-700 hover:underline">
                    Reset all
                  </button>
                )}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {GROUPS.map((g) => {
                const isOpen = openGroup === g.key;
                const n = counts[g.key];
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setOpenGroup(isOpen ? null : g.key)}
                    aria-expanded={isOpen}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      isOpen
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : n > 0
                          ? 'bg-blue-50 border-blue-200 text-blue-800'
                          : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {g.label}
                    {n > 0 && (
                      <span
                        className={`min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                          isOpen ? 'bg-white/25 text-white' : 'bg-blue-600 text-white'
                        }`}
                      >
                        {n}
                      </span>
                    )}
                    <span className={`text-[9px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                  </button>
                );
              })}
            </div>

            {openGroup === 'identity' && (
              <Panel>
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
                    <label className={labelCls}>DOT #</label>
                    <input placeholder="e.g. 3270258" inputMode="numeric" value={f.usdot} onChange={set('usdot')} className={inputCls} />
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>Contact (Owner/Officer)</label>
                    <input placeholder="e.g. Travis Martin" value={f.contact} onChange={set('contact')} className={inputCls} />
                  </div>
                </div>
              </Panel>
            )}

            {openGroup === 'location' && (
              <Panel>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className={labelCls}>Docket # + Prefix</label>
                    <div className="flex gap-2">
                      <select value={f.docketPrefix} onChange={set('docketPrefix')} className={inputCls + ' w-28 shrink-0'}>
                        <option value="">Any</option>
                        <option value="MC">MC</option>
                        <option value="MX">MX</option>
                        <option value="FF">FF</option>
                      </select>
                      <input placeholder="e.g. 1032275" inputMode="numeric" value={f.docket} onChange={set('docket')} className={inputCls} />
                    </div>
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
                    <label className={labelCls}>ZIP Code</label>
                    <input placeholder="e.g. 30303" inputMode="numeric" value={f.zip} onChange={set('zip')} className={inputCls} />
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>State</label>
                    <select value={f.state} onChange={set('state')} className={inputCls}>
                      <option value="">All States</option>
                      {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                      <option value="CA">Canada</option>
                      <option value="MX">Mexico</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>Carrier Operations</label>
                    <select value={f.operation} onChange={set('operation')} className={inputCls}>
                      <option value="">Any operation</option>
                      <option value="A">Interstate</option>
                      <option value="B">Intrastate / Hazmat</option>
                      <option value="C">Intrastate / Non-HM</option>
                    </select>
                  </div>
                </div>
              </Panel>
            )}

            {openGroup === 'authority' && (
              <Panel>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className={labelCls}>Authority Status</label>
                      <select value={f.status} onChange={set('status')} className={inputCls}>
                        <option value="all">All statuses</option>
                        <option value="active">Active authority</option>
                        <option value="inactive">Inactive authority</option>
                        <option value="pending">Pending authority</option>
                        <option value="none">No MC authority</option>
                      </select>
                      <p className="text-[10px] text-slate-400">Dates no longer imply &quot;active only&quot;.</p>
                    </div>
                    <div className="space-y-1">
                      <label className={labelCls}>Prior revocation</label>
                      <label className="flex items-center gap-2 h-[46px] text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={f.priorRevoked}
                          onChange={(e) => setF((p) => ({ ...p, priorRevoked: e.target.checked }))}
                        />
                        Flag on record
                      </label>
                    </div>
                  </div>

                  <Group title="Company Authority" hint="Roles present on the record">
                    <div className="flex flex-wrap items-center gap-2">
                      {['MC', 'MX', 'FF'].map((r) => (
                        <Chip key={r} on={f.authorityRoles.includes(r)} onClick={() => toggleIn('authorityRoles')(r)}>
                          {r === 'MC' ? 'Carrier' : r === 'MX' ? 'Broker' : 'Freight Forwarder'}
                        </Chip>
                      ))}
                      <span className="mx-1 text-xs text-slate-400">Match:</span>
                      <label className="flex items-center gap-1 text-xs text-slate-600">
                        <input type="radio" name="authorityOp" checked={f.authorityOp === 'or'} onChange={() => setF((p) => ({ ...p, authorityOp: 'or' }))} /> Any (Or)
                      </label>
                      <label className="flex items-center gap-1 text-xs text-slate-600">
                        <input type="radio" name="authorityOp" checked={f.authorityOp === 'and'} onChange={() => setF((p) => ({ ...p, authorityOp: 'and' }))} /> All (And)
                      </label>
                    </div>
                  </Group>
                </div>
              </Panel>
            )}

            {openGroup === 'safety' && (
              <Panel>
                <div className="space-y-4">
                  <Group title="Safety Rating">
                    <div className="flex flex-wrap gap-2">
                      {(['Satisfactory', 'Conditional', 'Unsatisfactory'] as const).map((r) => (
                        <Chip key={r} on={f.rating.includes(r)} onClick={() => toggleIn('rating')(r)}>{r}</Chip>
                      ))}
                    </div>
                  </Group>

                  <Group title="Power Units (min – max)">
                    <div className="flex flex-wrap gap-2 max-w-md">
                      <input placeholder="Min" inputMode="numeric" value={f.powerMin} onChange={set('powerMin')} className={inputCls} />
                      <input placeholder="Max" inputMode="numeric" value={f.powerMax} onChange={set('powerMax')} className={inputCls} />
                    </div>
                  </Group>

                  <Group title="Fleet Size (power units buckets)">
                    <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-13 gap-1.5">
                      {FLEET_BUCKETS.map(([letter, range]) => (
                        <Chip key={letter} on={f.fleetSize.includes(letter)} onClick={() => toggleIn('fleetSize')(letter)}>
                          {letter} · {range}
                        </Chip>
                      ))}
                    </div>
                  </Group>
                </div>
              </Panel>
            )}

            {openGroup === 'cargo' && (
              <Panel>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto">
                  {CARGO_OPTIONS.map((c) => (
                    <Chip key={c} on={f.cargo.includes(c)} onClick={() => toggleIn('cargo')(c)}>{c}</Chip>
                  ))}
                </div>
              </Panel>
            )}
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-2.5 rounded-lg text-sm disabled:opacity-50 transition-colors">
              {loading ? 'Searching…' : 'Search'}
            </button>
            <button type="button" onClick={clear}
              className="border border-slate-300 bg-white px-6 py-2.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              Reset
            </button>
            {results.length > 0 &&
              (loggedIn ? (
                <button type="button" onClick={exportCSV}
                  className="ml-auto text-sm font-semibold text-blue-700 border border-blue-300 bg-white rounded-lg px-4 py-2.5 hover:bg-blue-50 transition-colors">
                  Export CSV
                </button>
              ) : (
                <Link href="/auth/sign-up"
                  className="ml-auto text-sm font-semibold text-blue-700 border border-blue-300 bg-white rounded-lg px-4 py-2.5 hover:bg-blue-50 transition-colors">
                  Sign in to export
                </Link>
              ))}
          </div>
        </form>

        {searched && !loading && !error && (
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span className="font-semibold text-slate-800">
              {total.toLocaleString()} {total === 1 ? 'result' : 'results'} found
            </span>
            {pages > 1 && <span className="text-xs text-slate-400">Page {page} of {pages}</span>}
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
            <button type="button" onClick={() => run(page - 1)} disabled={page <= 1 || loading}
              className="px-5 py-2.5 text-sm font-semibold text-slate-700 border border-slate-300 bg-white rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors">
              ← Prev
            </button>
            <span className="text-sm text-slate-500">Page <strong>{page}</strong> of {pages}</span>
            <button type="button" onClick={() => run(page + 1)} disabled={page >= pages || loading}
              className="px-5 py-2.5 text-sm font-semibold text-slate-700 border border-slate-300 bg-white rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors">
              Next →
            </button>
          </div>
        )}
      </div>
    </main>
  );
}