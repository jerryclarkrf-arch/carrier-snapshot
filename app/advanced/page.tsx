'use client';

import { useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import CarrierCard, { Carrier } from '@/components/CarrierCard';
import { authClient } from '@/lib/auth/client';
import { isRetryable, searchWithRetry } from '@/lib/search-client';
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  DownloadIcon,
  InfoIcon,
  LockIcon,
  SearchIcon,
  XIcon,
} from '@/components/icons';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const COUNTRY_OPTIONS = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'MX', label: 'Mexico' },
];

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
  name: '', dba: '', usdot: '', docket: '', docketPrefix: '', phone: '', city: '', zip: '', state: '', country: '',
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

const inputCls = 'field';
const labelCls = 'field-label';
const presetCls =
  'inline-flex min-h-11 items-center rounded-[2px] border border-ink/25 bg-white px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink transition-colors hover:border-ink';

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 border border-ink/15 bg-white p-3 sm:p-4">
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex min-h-11 items-center justify-center rounded-[2px] border px-2.5 py-1 text-left font-mono text-[10px] tracking-[0.02em] transition-colors ${
        on
          ? 'border-ink bg-ink text-paper'
          : 'border-ink/20 bg-white text-ink hover:border-ink/50'
      }`}
    >
      {children}
    </button>
  );
}

function Group({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="field-label mb-0">{title}</p>
        {hint && (
          <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-steel">
            {hint}
          </p>
        )}
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
  const [notice, setNotice] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [openGroup, setOpenGroup] = useState<GroupKey | null>(null);

  const counts: Record<GroupKey, number> = {
    identity: [f.name, f.dba, f.usdot, f.contact].filter((v) => v.trim()).length,
    location: [f.docket, f.docketPrefix, f.phone, f.city, f.zip, f.state, f.country, f.operation].filter((v) => v.trim()).length,
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
      f.name, f.dba, f.usdot, f.docket, f.docketPrefix, f.phone, f.city, f.zip, f.state, f.country,
      f.contact, f.operation, f.addedFrom, f.addedTo, f.powerMin, f.powerMax,
      f.authorityRoles.length, f.cargo.length, f.rating.length, f.fleetSize.length,
      f.priorRevoked, f.status !== 'all',
    ].some(Boolean);
    if (!anyField) {
      setError('Choose at least one filter before running the search.');
      setSearched(false);
      return;
    }
    const dateErr = validateDates();
    if (dateErr) { setError(dateErr); return; }

    setLoading(true);
    setSearched(true);
    setError(null);
    setNotice(null);
    setCanRetry(false);

    const params = new URLSearchParams();
    (['name', 'dba', 'usdot', 'phone', 'city', 'zip', 'contact'] as const).forEach((k) => f[k] && params.set(k, f[k]));
    if (f.docket) params.set('docket', f.docket);
    if (f.docketPrefix) params.set('docketPrefix', f.docketPrefix);
    if (f.state) params.set('state', f.state);
    if (f.country) params.set('country', f.country);
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

  function resetResults() {
    setResults([]);
    setTotal(0);
    setPage(1);
    setPages(0);
    setSearched(false);
    setError(null);
    setNotice(null);
    setCanRetry(false);
  }

  function clear() {
    setF({ ...empty });
    resetResults();
    setOpenGroup(null);
  }

  function clearGroup(key: GroupKey) {
    setF((p) => {
      switch (key) {
        case 'identity':
          return { ...p, name: '', dba: '', usdot: '', contact: '' };
        case 'location':
          return {
            ...p,
            docket: '',
            docketPrefix: '',
            phone: '',
            city: '',
            zip: '',
            state: '',
            country: '',
            operation: '',
          };
        case 'authority':
          return { ...p, status: 'all', authorityRoles: [], priorRevoked: false };
        case 'safety':
          return { ...p, rating: [], fleetSize: [], powerMin: '', powerMax: '' };
        case 'cargo':
          return { ...p, cargo: [] };
      }
    });
    resetResults();
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
    <div className="flex min-h-screen flex-col bg-paper">
      <Nav />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
          <header className="flex flex-col gap-3 border-b-2 border-ink pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-steel">
                FMCSA census · filter builder
              </p>
              <h1 className="mt-1 font-display text-4xl font-semibold leading-[0.95] sm:text-5xl">
                Build a carrier list
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-steel">
                Filter the census by authority date, identity, location,
                authority, safety, fleet, and cargo. Combine as many as the
                file needs.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-steel">
                26 fleet buckets · 29 cargo types · 1-month window
              </p>
              <Link
                href="/"
                className="inline-flex min-h-11 items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink hover:underline"
              >
                <ArrowLeftIcon size={14} />
                Simple lookup
              </Link>
            </div>
          </header>

          <div className="mt-6 grid gap-6 lg:grid-cols-12 lg:gap-8">
            <section aria-label="Filters" className="lg:col-span-4">
              <form onSubmit={(e) => { e.preventDefault(); run(1); }} className="space-y-4">
          {/* Authority New (date range) — always visible */}
          <div className="border border-ink/20 border-l-4 border-l-safety bg-white p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="field-label mb-0">Authority new</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-steel">
                Max 1 month
              </p>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <label htmlFor="added-from" className="field-label">
                  From
                </label>
                <input
                  id="added-from"
                  type="date"
                  value={f.addedFrom}
                  onChange={set('addedFrom')}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="added-to" className="field-label">
                  To
                </label>
                <input
                  id="added-to"
                  type="date"
                  value={f.addedTo}
                  onChange={set('addedTo')}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => preset(7)} className={presetCls}>
                Last 7 days
              </button>
              <button type="button" onClick={() => preset(30)} className={presetCls}>
                Last 30 days
              </button>
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

          {/* Collapsed filter groups */}
          <div className="border-t border-ink/15 pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-steel">
                Filters
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
                {applied} applied
                {applied > 0 && (
                  <button
                    type="button"
                    onClick={clear}
                    className="ml-2 text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
                  >
                    Reset all
                  </button>
                )}
              </p>
            </div>

            {!openGroup && (
            <div className="mt-2 divide-y divide-ink/10 border-y border-ink/10">
              {GROUPS.map((g) => {
                const isOpen = openGroup === g.key;
                const n = counts[g.key];
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setOpenGroup(isOpen ? null : g.key)}
                    aria-expanded={isOpen}
                    className="flex min-h-12 w-full items-center justify-between gap-2 px-1 text-left transition-colors hover:bg-paper/60"
                  >
                    <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink">
                      {g.label}
                      {n > 0 && (
                        <span className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 font-mono text-[9px] text-paper">
                          {n}
                        </span>
                      )}
                    </span>
                    <ChevronDownIcon
                      size={16}
                      className={`shrink-0 text-steel transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            )}

            {openGroup && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setOpenGroup(null)}
                  className="inline-flex min-h-11 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
                >
                  <ArrowLeftIcon size={14} />
                  All filters
                </button>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
                  {GROUPS.find((g) => g.key === openGroup)?.label}
                </span>
              </div>
            )}

            {openGroup === 'identity' && (
              <Panel>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="filter-legal-name" className={labelCls}>
                      Legal name
                    </label>
                    <input id="filter-legal-name" placeholder="e.g. ABC Trucking" value={f.name} onChange={set('name')} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="filter-dba" className={labelCls}>
                      DBA name
                    </label>
                    <input id="filter-dba" placeholder="Doing business as" value={f.dba} onChange={set('dba')} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="filter-usdot" className={labelCls}>
                      DOT #
                    </label>
                    <input id="filter-usdot" placeholder="e.g. 3270258" inputMode="numeric" value={f.usdot} onChange={set('usdot')} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="filter-contact" className={labelCls}>
                      Contact (owner / officer)
                    </label>
                    <input id="filter-contact" placeholder="e.g. Travis Martin" value={f.contact} onChange={set('contact')} className={inputCls} />
                  </div>
                </div>
              </Panel>
            )}

            {openGroup === 'location' && (
              <Panel>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="filter-docket" className={labelCls}>
                      Docket # + prefix
                    </label>
                    <div className="flex gap-2">
                      <select aria-label="Docket prefix" value={f.docketPrefix} onChange={set('docketPrefix')} className={inputCls + ' w-24 shrink-0'}>
                        <option value="">Any</option>
                        <option value="MC">MC</option>
                        <option value="MX">MX</option>
                        <option value="FF">FF</option>
                      </select>
                      <input id="filter-docket" placeholder="e.g. 1032275" inputMode="numeric" value={f.docket} onChange={set('docket')} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="filter-phone" className={labelCls}>
                      Phone number
                    </label>
                    <input id="filter-phone" placeholder="e.g. 7068323093" inputMode="numeric" value={f.phone} onChange={set('phone')} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="filter-city" className={labelCls}>
                      City
                    </label>
                    <input id="filter-city" placeholder="e.g. Atlanta" value={f.city} onChange={set('city')} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="filter-zip" className={labelCls}>
                      ZIP code
                    </label>
                    <input id="filter-zip" placeholder="e.g. 30303" inputMode="numeric" value={f.zip} onChange={set('zip')} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="filter-state" className={labelCls}>
                      State
                    </label>
                    <select id="filter-state" value={f.state} onChange={set('state')} className={inputCls}>
                      <option value="">All states</option>
                      {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="filter-country" className={labelCls}>
                      Country
                    </label>
                    <select id="filter-country" value={f.country} onChange={set('country')} className={inputCls}>
                      <option value="">All countries</option>
                      {COUNTRY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="filter-operation" className={labelCls}>
                      Carrier operations
                    </label>
                    <select id="filter-operation" value={f.operation} onChange={set('operation')} className={inputCls}>
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="filter-status" className={labelCls}>
                        Authority status
                      </label>
                      <select id="filter-status" value={f.status} onChange={set('status')} className={inputCls}>
                        <option value="all">All statuses</option>
                        <option value="active">Active authority</option>
                        <option value="inactive">Inactive authority</option>
                        <option value="pending">Pending authority</option>
                        <option value="none">No MC authority</option>
                      </select>
                      <p className="field-hint">Dates no longer imply &quot;active only&quot;.</p>
                    </div>
                    <div>
                      <span className={labelCls}>Prior revocation</span>
                      <label className="check-row">
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
                      <span className="mx-1 font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
                        Match
                      </span>
                      <label className="check-row text-xs">
                        <input type="radio" name="authorityOp" checked={f.authorityOp === 'or'} onChange={() => setF((p) => ({ ...p, authorityOp: 'or' }))} /> Any (OR)
                      </label>
                      <label className="check-row text-xs">
                        <input type="radio" name="authorityOp" checked={f.authorityOp === 'and'} onChange={() => setF((p) => ({ ...p, authorityOp: 'and' }))} /> All (AND)
                      </label>
                    </div>
                  </Group>
                </div>
              </Panel>
            )}

            {openGroup === 'safety' && (
              <Panel>
                <div className="space-y-4">
                  <Group title="Safety rating">
                    <div className="flex flex-wrap gap-2">
                      {(['Satisfactory', 'Conditional', 'Unsatisfactory'] as const).map((r) => (
                        <Chip key={r} on={f.rating.includes(r)} onClick={() => toggleIn('rating')(r)}>{r}</Chip>
                      ))}
                    </div>
                  </Group>

                  <Group title="Power units (min – max)">
                    <div className="grid max-w-md grid-cols-2 gap-2">
                      <input aria-label="Minimum power units" placeholder="Min" inputMode="numeric" value={f.powerMin} onChange={set('powerMin')} className={inputCls} />
                      <input aria-label="Maximum power units" placeholder="Max" inputMode="numeric" value={f.powerMax} onChange={set('powerMax')} className={inputCls} />
                    </div>
                  </Group>

                  <Group title="Fleet size (power unit buckets)">
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
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
                <div className="grid max-h-80 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                  {CARGO_OPTIONS.map((c) => (
                    <Chip key={c} on={f.cargo.includes(c)} onClick={() => toggleIn('cargo')(c)}>{c}</Chip>
                  ))}
                </div>
              </Panel>
            )}
          </div>

          <div className="sticky bottom-0 z-20 border-t-2 border-ink bg-paper/95 py-3 backdrop-blur">
            {error && (
              <div
                role="alert"
                className="mb-2 flex items-center justify-between gap-2 border border-alert/30 bg-alert/5 px-2 py-1 text-xs leading-5 text-alert"
              >
                <span className="flex items-start gap-2">
                  <AlertIcon size={14} className="mt-0.5 shrink-0" />
                  {error}
                </span>
                {canRetry && (
                  <button
                    type="button"
                    onClick={() => run(page)}
                    disabled={loading}
                    className="inline-flex min-h-11 shrink-0 items-center px-1 font-medium underline decoration-alert/40 underline-offset-2"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary flex-1"
              >
                <SearchIcon size={14} />
                {loading ? 'Searching…' : 'Run search'}
              </button>
              <button type="button" onClick={clear} className="btn btn-secondary">
                Reset
              </button>
            </div>
          </div>
        </form>
      </section>

      <section aria-labelledby="advanced-results" className="lg:col-span-8">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-3">
          <div>
            <h2
              id="advanced-results"
              className="font-display text-2xl font-semibold leading-none"
            >
              Results
            </h2>
            <p
              aria-live="polite"
              className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-steel"
            >
              {searched && !loading
                ? `${total.toLocaleString()} ${
                    total === 1 ? 'carrier' : 'carriers'
                  } · ${applied} active`
                : 'Run a filter set to build a list'}
            </p>
          </div>
          {results.length > 0 &&
            (loggedIn ? (
              <button
                type="button"
                onClick={exportCSV}
                className="btn btn-secondary"
              >
                <DownloadIcon size={14} />
                Export CSV
              </button>
            ) : (
              <Link href="/auth/sign-up" className="btn btn-secondary">
                <LockIcon size={14} />
                Sign in to export
              </Link>
            ))}
        </div>

        {applied > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(f.addedFrom || f.addedTo) && (
              <button
                type="button"
                onClick={() => {
                  setF((p) => ({ ...p, addedFrom: '', addedTo: '' }));
                  resetResults();
                }}
                className="inline-flex min-h-11 items-center gap-1.5 border border-ink/20 bg-white px-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink transition-colors hover:border-ink"
              >
                Authority new
                <XIcon size={12} />
              </button>
            )}
            {GROUPS.map(
              (g) =>
                counts[g.key] > 0 && (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => clearGroup(g.key)}
                    className="inline-flex min-h-11 items-center gap-1.5 border border-ink/20 bg-white px-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink transition-colors hover:border-ink"
                  >
                    {g.label} · {counts[g.key]}
                    <XIcon size={12} />
                  </button>
                )
            )}
            <button
              type="button"
              onClick={clear}
              className="inline-flex min-h-11 items-center px-2 font-mono text-[10px] uppercase tracking-[0.06em] text-steel underline decoration-steel/40 underline-offset-2 hover:text-ink"
            >
              Clear all
            </button>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="mt-3 flex items-start gap-2 border border-ink/20 bg-white px-3 py-2 text-sm leading-5 text-steel"
          >
            <InfoIcon size={16} className="mt-0.5 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {loading && (
          <div className="mt-4" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading carriers</span>
            <div className="border-2 border-ink bg-white">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="border-b border-ink/15 p-4 last:border-b-0 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="w-full max-w-md space-y-2">
                      <div className="h-5 w-28 animate-pulse bg-ink/10" />
                      <div className="h-7 w-2/3 animate-pulse bg-ink/10" />
                      <div className="h-3 w-1/2 animate-pulse bg-ink/5" />
                    </div>
                    <div className="h-10 w-24 animate-pulse border border-ink/10 bg-ink/5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="result-list mt-4 border-2 border-ink bg-white">
            {results.map((c) => (
              <CarrierCard key={c.usdot} carrier={c} />
            ))}
          </div>
        )}

        {searched && !loading && !error && results.length === 0 && (
          <div className="mt-4 border-2 border-ink bg-white p-5 sm:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-alert">
              No match
            </p>
            <h3 className="mt-1 font-display text-2xl font-semibold leading-tight">
              No carriers matched those filters.
            </h3>
            <p className="mt-1 max-w-xl text-sm leading-6 text-steel">
              Widen the date range, remove a filter group, or look the carrier
              up by name or USDOT in simple lookup.
            </p>
            <Link href="/" className="btn btn-secondary mt-4">
              Go to simple lookup
            </Link>
          </div>
        )}

        {pages > 1 && !loading && (
          <div className="mt-4 flex flex-col gap-3 border-t border-ink/15 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-steel">
              Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of{' '}
              {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => run(page - 1)}
                disabled={page <= 1 || loading}
                aria-label="Previous page"
                className="btn btn-secondary px-3"
              >
                <ArrowLeftIcon size={16} />
                Prev
              </button>
              <span className="font-mono text-[11px] text-steel">
                {page} / {pages}
              </span>
              <button
                type="button"
                onClick={() => run(page + 1)}
                disabled={page >= pages || loading}
                aria-label="Next page"
                className="btn btn-secondary px-3"
              >
                Next
                <ArrowRightIcon size={16} />
              </button>
            </div>
          </div>
        )}
      </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}