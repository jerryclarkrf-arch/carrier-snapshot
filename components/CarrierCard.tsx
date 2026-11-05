'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import Section from '@/components/Section';
import InspectionDetail from '@/components/InspectionDetail';
import FleetPanel from '@/components/FleetPanel';

export interface Carrier {
  usdot: string; docketDigits: string; docket: string | null; legalName: string | null; dba: string | null;
  companyOfficer: string | null; entityType: string | null; entityTypes: string[];
  dotStatus: string; authStatus: string; authType: string | null;
  phone: string | null; email: string | null; masked?: boolean;
  powerUnits: number | null; drivers: number | null;
  phy: { street?: string; city?: string; state?: string; zip?: string };
  mail: { street?: string; city?: string; state?: string; zip?: string };
  cargo: Record<string, boolean>;
  addDate: string | null; mcs150: string | null;
}

interface InsPolicy { form: string; type: string; carrier: string; policy: string; coverage: string; effective: string; status: string; }
interface Financial {
  minCoverage: string | null;
  bipd: string | null;
  cargoReq: boolean;
  cargoFile: boolean;
  bondReq: boolean;
  bondFile: boolean;
}
interface Insp {
  inspectionId: string;
  date: string;
  report: string;
  reportState: string;
  reportNumber: string;
  state: string;
  level: string;
  summary: string;
  timeStart: string | null;
  timeEnd: string | null;
  facility: string | null;
  shipper: string | null;
  location: string | null;
  grossWeight: string | null;
}
interface HistoryEvent { date: string; label: string; }
interface SmsBasic { key: string; label: string; measure: number | null; inspectionsWithViolations: number | null; percentile: number | null; }
interface CrashRow {
  date: string;
  report: string;
  state: string;
  fatalities: number;
  injuries: number;
  towAway: boolean;
  hazmat: boolean;
  vehicle: string;
  conditions: string;
  road: string;
}
interface SmsData {
  available: boolean;
  found: boolean;
  basics: SmsBasic[];
  counts: {
    inspections: number | null;
    driverInspections: number | null;
    driverOutOfService: number | null;
    vehicleInspections: number | null;
    vehicleOutOfService: number | null;
  } | null;
  crashes: number | null;
}

const badge = (s: string) =>
  s === 'Active' ? 'bg-emerald-100 text-emerald-800' :
  s === 'Pending' ? 'bg-amber-100 text-amber-800' :
  s === 'Inactive' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700';

export function fmtPhone(v?: string | null): string | null {
  if (!v) {
    return null;
  }
  const d = v.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d.startsWith('1')) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return v.trim();
}

function CopyBtn({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        copy();
      }}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-semibold text-slate-500 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50 transition-colors"
    >
      {copied ? '✓ Copied' : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      )}
    </button>
  );
}

export default function CarrierCard({ carrier: c }: { carrier: Carrier }) {
  const [open, setOpen] = useState(false);
  const [ins, setIns] = useState<{ loading: boolean; owner: string | null; policies: InsPolicy[]; financial: Financial | null } | null>(null);
  const [insp, setInsp] = useState<{ loading: boolean; rows: Insp[] } | null>(null);
  const [openInsp, setOpenInsp] = useState<string | null>(null);
  const [history, setHistory] = useState<{ loading: boolean; events: HistoryEvent[] } | null>(null);
  const [sms, setSms] = useState<{ loading: boolean; data: SmsData | null } | null>(null);
  const [crashes, setCrashes] = useState<{ loading: boolean; rows: CrashRow[]; summary: { total: number; fatal: number; withInjury: number; towAway: number } | null } | null>(null);
  const [watched, setWatched] = useState<{ loading: boolean; watching: boolean }>({ loading: false, watching: false });
  const { data: session } = authClient.useSession();
  const router = useRouter();

  const refreshWatch = async () => {
    if (watched.loading) return;
    if (!session?.user) return;
    setWatched((w) => ({ ...w, loading: true }));
    try {
      const r = await fetch('/api/watchlist?usdot=' + c.usdot);
      const j = await r.json();
      setWatched({ loading: false, watching: !!j.watching });
    } catch {
      setWatched({ loading: false, watching: false });
    }
  };

  const toggleWatch = async () => {
    if (!session?.user) return;
    const next = !watched.watching;
    setWatched({ loading: true, watching: next });
    try {
      if (next) {
        await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usdot: c.usdot, legalName: c.legalName }),
        });
      } else {
        await fetch('/api/watchlist?usdot=' + c.usdot, { method: 'DELETE' });
      }
      setWatched({ loading: false, watching: next });
    } catch {
      setWatched({ loading: false, watching: !next });
    }
  };

  const expand = async () => {
    if (!session?.user) {
      router.push('/auth/sign-up');
      return;
    }
    const next = !open;
    setOpen(next);
    if (!next) return;
    if (session?.user) void refreshWatch();

    if (!ins) setIns({ loading: true, owner: null, policies: [], financial: null });
    if (!insp) setInsp({ loading: true, rows: [] });
    if (!history) setHistory({ loading: true, events: [] });
    if (!sms) setSms({ loading: true, data: null });
    if (!crashes) setCrashes({ loading: true, rows: [], summary: null });

    const insData = !ins
      ? fetch('/api/insurance?dotNumber=' + c.usdot + (c.companyOfficer ? '&owner=' + encodeURIComponent(c.companyOfficer) : ''))
          .then((r) => r.json())
          .then((j) => {
            if (j.error) {
              setIns({ loading: false, owner: null, policies: [], financial: null });
              return null;
            }
            const d = { owner: j.owner || null, policies: j.policies || [], financial: j.financial || null };
            setIns({ loading: false, ...d });
            return d;
          })
          .catch(() => {
            setIns({ loading: false, owner: null, policies: [], financial: null });
            return null;
          })
      : Promise.resolve(null);

    if (!insp) {
      fetch('/api/inspections?dot=' + c.usdot)
        .then((r) => r.json())
        .then((j) => setInsp({ loading: false, rows: j.inspections || [] }))
        .catch(() => setInsp({ loading: false, rows: [] }));
    }

    const histData = !history
      ? fetch('/api/status-history?dot=' + c.usdot)
          .then((r) => (r.ok ? r.json() : { events: [] }))
          .then((j) => {
            setHistory({ loading: false, events: j.events || [] });
            return (j.events || []) as unknown[];
          })
          .catch(() => {
            setHistory({ loading: false, events: [] });
            return [];
          })
      : Promise.resolve([] as unknown[]);

    if (!sms) {
      fetch('/api/sms?dot=' + c.usdot)
        .then((r) => r.json())
        .then((j) => setSms({ loading: false, data: j }))
        .catch(() => setSms({ loading: false, data: null }));
    }

    if (!crashes) {
      fetch('/api/crashes?dot=' + c.usdot)
        .then((r) => r.json())
        .then((j) => setCrashes({ loading: false, rows: j.crashes || [], summary: j.summary || null }))
        .catch(() => setCrashes({ loading: false, rows: [], summary: null }));
    }

    // Record an append-only history snapshot once insurance and status history land
    Promise.all([insData, histData]).then(([insRes, events]) => {
      if (!insRes) return;
      fetch('/api/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carrier: {
            usdot: c.usdot,
            legalName: c.legalName,
            dba: c.dba,
            entityTypes: c.entityTypes,
            companyOfficer: c.companyOfficer,
            phone: c.phone,
            email: c.email,
            phy: c.phy,
            powerUnits: c.powerUnits,
            drivers: c.drivers,
            dotStatus: c.dotStatus,
            authStatus: c.authStatus,
            addDate: c.addDate,
            mcs150: c.mcs150,
          },
          insurance: { owner: insRes.owner, policies: insRes.policies, financial: insRes.financial },
          statusEvents: events,
        }),
      }).catch(() => void 0);
    });
  };

  const cargoTags = Object.entries(c.cargo).filter(([, v]) => v).map(([k]) => k);
  const addr = (a: Carrier['phy']) => [a.street, a.city, a.state, a.zip].filter(Boolean).join(', ');
  const phone = fmtPhone(c.phone);
  const email = c.email;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header row */}
      <div
        role="button"
        tabIndex={0}
        onClick={expand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            expand();
          }
        }}
        className="w-full text-left p-5 hover:bg-slate-50/60 transition-colors cursor-pointer"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 uppercase truncate">{c.legalName || 'NAME NOT LISTED'}</h2>
              <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full whitespace-nowrap ${badge(c.dotStatus)}`}>{c.dotStatus}</span>
              {c.docket && (
                <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full whitespace-nowrap ${badge(c.authStatus)}`}>{c.docket} · {c.authStatus}</span>
              )}
              {(c.entityTypes.length ? c.entityTypes : c.entityType ? [c.entityType] : []).map((t) => (
                <span key={t} className="px-2 py-0.5 text-[11px] font-semibold rounded-full whitespace-nowrap bg-indigo-50 text-indigo-700 border border-indigo-200">{t}</span>
              ))}
            </div>
            {c.dba && <p className="text-xs text-slate-500 mt-0.5">DBA: <span className="font-medium text-slate-700">{c.dba}</span></p>}
            {c.companyOfficer && <p className="text-xs text-slate-500 mt-0.5">Owner: <span className="font-medium text-slate-700">{c.companyOfficer}</span></p>}
            <div className="text-xs text-slate-600 mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
              <span><strong>USDOT:</strong> {c.usdot}</span>
              {phone && (
                <span className="inline-flex items-center gap-1">
                  <strong>Phone:</strong>
                  <span className={c.masked ? 'text-slate-400 italic' : undefined}>{phone}</span>
                  {!c.masked && <CopyBtn value={phone} label="phone number" />}
                </span>
              )}
              {!phone && <span><strong>Phone:</strong> N/A</span>}
              {email && (
                <span className="inline-flex items-center gap-1">
                  <strong>Email:</strong>
                  {c.masked ? (
                    <span className="text-slate-400 italic">{email}</span>
                  ) : (
                    <a href={`mailto:${email}`} className="text-blue-600 hover:underline">{email}</a>
                  )}
                  {!c.masked && <CopyBtn value={email} label="email address" />}
                </span>
              )}
              <span><strong>Location:</strong> {[c.phy.city, c.phy.state].filter(Boolean).join(', ') || 'N/A'}</span>
              {c.addDate && <span><strong>Added:</strong> {c.addDate}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-center">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Power Units</div>
              <div className="text-lg font-extrabold leading-tight">{c.powerUnits ?? '—'}</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-center">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Drivers</div>
              <div className="text-lg font-extrabold leading-tight">{c.drivers ?? '—'}</div>
            </div>
            <span className="text-slate-400 text-xl ml-1">{open ? '▾' : '▸'}</span>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-slate-200 p-5 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-700">Carrier Details</h3>
            {session?.user ? (
              <button
                type="button"
                onClick={toggleWatch}
                disabled={watched.loading}
                className={`text-sm font-semibold px-4 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                  watched.watching
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-blue-300 bg-white text-blue-700 hover:bg-blue-50'
                }`}
              >
                {watched.loading ? '…' : watched.watching ? '✓ Watching' : '+ Watch changes'}
              </button>
            ) : (
              <Link
                href="/auth/sign-in"
                className="text-sm font-semibold px-4 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Sign in to watch
              </Link>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="space-y-1.5">
              <p><strong className="text-slate-800">Owner / Representative:</strong> {c.companyOfficer || (ins?.loading ? 'Loading…' : ins?.owner) || 'See insurance filings below'}</p>
              <p><strong className="text-slate-800">Physical Address:</strong> {addr(c.phy) || 'Not listed'}</p>
              <p><strong className="text-slate-800">Mailing Address:</strong> {addr(c.mail) || 'Not listed'}</p>
              <p><strong className="text-slate-800">Authority Type:</strong> {c.authType || 'N/A'}</p>
              <p><strong className="text-slate-800">Last MCS-150:</strong> {c.mcs150 || 'N/A'}</p>
            </div>
            <div>
              <strong className="text-slate-800">Cargo:</strong>
              <div className="flex flex-wrap gap-1 mt-1">
                {cargoTags.length ? cargoTags.map((t) => (
                  <span key={t} className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-medium">{t}</span>
                )) : <span className="text-slate-400">None reported</span>}
              </div>
            </div>
          </div>

          <Section title="Authority Status History">
            {history?.loading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : history?.events.length ? (
              <ul className="space-y-1 text-xs">
                {history.events.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-slate-400 shrink-0">•</span>
                    <span><strong className="text-slate-800">{e.label}</strong> — {e.date}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">No revocation, suspension, or reinstatement events on record.</p>
            )}
          </Section>

          <Section title={`Insurance Filings (${ins?.policies.length ?? (ins?.loading ? '…' : 0)})`}>
            {!ins || ins?.loading ? (
              <p className="text-xs text-slate-400">Loading insurance filings…</p>
            ) : (
              <div className="space-y-3">
                {ins.financial && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    {ins.financial.minCoverage && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Min. Required</p>
                        <p className="text-sm font-extrabold text-slate-800">{ins.financial.minCoverage}</p>
                      </div>
                    )}
                    {ins.financial.bipd && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase">BIPD On File</p>
                        <p className="text-sm font-extrabold text-slate-800">{ins.financial.bipd}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Cargo</p>
                      <p className="text-sm font-semibold text-slate-800">{ins.financial.cargoReq ? 'Required' : 'Not required'}{ins.financial.cargoFile ? ' · On file' : ''}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Bond</p>
                      <p className="text-sm font-semibold text-slate-800">{ins.financial.bondReq ? 'Required' : 'Not required'}{ins.financial.bondFile ? ' · On file' : ''}</p>
                    </div>
                  </div>
                )}
                {ins.policies.length === 0 ? (
                  <p className="text-xs text-slate-500">No active/pending insurance filings found.</p>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold">
                        <tr>
                          <th className="py-2 px-3 text-left">Form</th><th className="py-2 px-3 text-left">Type</th>
                          <th className="py-2 px-3 text-left">Carrier</th><th className="py-2 px-3 text-left">Policy #</th>
                          <th className="py-2 px-3 text-left">Coverage</th><th className="py-2 px-3 text-left">Effective</th>
                          <th className="py-2 px-3 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ins.policies.map((p, i) => (
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
            )}
          </Section>

          <Section title={`Roadside Inspections (${insp?.rows.length ?? (insp?.loading ? '…' : 0)})`}>
            {insp?.loading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : !insp || insp.rows.length === 0 ? (
              <p className="text-xs text-slate-500">No roadside inspections on record.</p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2 px-2 text-left w-6" />
                      <th className="py-2 px-3 text-left">Date</th><th className="py-2 px-3 text-left">Report #</th>
                      <th className="py-2 px-3 text-left">State</th><th className="py-2 px-3 text-left">Inspection</th>
                      <th className="py-2 px-3 text-left">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {insp.rows.map((r) => {
                      const key = r.inspectionId || `${r.reportState}-${r.report}`;
                      const isOpen = openInsp === key;
                      const toggle = () => setOpenInsp(isOpen ? null : key);
                      return (
                        <Fragment key={key}>
                          <tr className={isOpen ? 'bg-blue-50/40' : 'hover:bg-slate-50'}>
                            <td className="py-2 px-2 align-middle">
                              <button
                                type="button"
                                onClick={toggle}
                                aria-expanded={isOpen}
                                aria-label={isOpen ? 'Hide report details' : 'Show report details'}
                                title={isOpen ? 'Hide report details' : 'Show report details'}
                                className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-blue-700 hover:bg-blue-100 transition-colors"
                              >
                                <span className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>▸</span>
                              </button>
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">{r.date}</td>
                            <td className="py-2 px-3">
                              <button
                                type="button"
                                onClick={toggle}
                                aria-expanded={isOpen}
                                className="font-mono text-blue-600 hover:underline"
                              >
                                {r.report}
                              </button>
                            </td>
                            <td className="py-2 px-3 font-semibold">{r.state}</td>
                            <td className="py-2 px-3">{r.level}</td>
                            <td className="py-2 px-3">{r.summary}</td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-slate-50/70">
                              <td colSpan={6} className="px-4 pb-4 pt-2">
                                <InspectionDetail
                                  inspectionId={r.inspectionId}
                                  report={r.reportNumber || r.report}
                                  state={r.reportState || r.state}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title={`Equipment & Fleet`}>
            <FleetPanel dot={c.usdot} />
          </Section>

          <Section title={`Safety Measurement System`}>
            {sms?.loading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : !sms?.data || !sms.data.available ? (
              <p className="text-xs text-slate-500">SMS safety data is not available for this carrier.</p>
            ) : !sms.data.found || sms.data.basics.every((b) => b.measure === null && b.percentile === null) ? (
              <p className="text-xs text-slate-500">No SMS safety data on record for this carrier.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                  {sms.data.basics.map((b) => (
                    <div key={b.key} className="flex items-center gap-2">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
                          b.percentile === null
                            ? 'bg-slate-300'
                            : b.percentile < 50
                              ? 'bg-emerald-500'
                              : b.percentile < 75
                                ? 'bg-amber-400'
                                : 'bg-rose-500'
                        }`}
                      />
                      <span className="text-slate-600 flex-1">{b.label}</span>
                      {b.inspectionsWithViolations !== null && b.inspectionsWithViolations > 0 && (
                        <span className="text-slate-400">{b.inspectionsWithViolations} viol</span>
                      )}
                      <span className="font-semibold text-slate-800 whitespace-nowrap">
                        {b.percentile !== null ? `${b.percentile}%` : b.measure !== null ? b.measure : '—'}
                      </span>
                    </div>
                  ))}
                </div>
                {sms.data.counts && (sms.data.counts.inspections !== null || sms.data.crashes !== null) && (
                  <p className="text-xs text-slate-400">
                    {sms.data.counts.inspections !== null
                      ? `${sms.data.counts.inspections.toLocaleString()} inspection${sms.data.counts.inspections === 1 ? '' : 's'}`
                      : 'No inspections'}
                    {(sms.data.counts.driverOutOfService || sms.data.counts.vehicleOutOfService)
                      ? ` · ${((sms.data.counts.driverOutOfService || 0) + (sms.data.counts.vehicleOutOfService || 0)).toLocaleString()} out-of-service`
                      : ''}
                    {sms.data.crashes !== null ? ` · ${sms.data.crashes.toLocaleString()} crash${sms.data.crashes === 1 ? '' : 'es'}` : ''}
                  </p>
                )}
              </div>
            )}
          </Section>

          <Section title={`Crashes (${crashes?.rows.length ?? (crashes?.loading ? '…' : 0)})`}>
            {crashes?.loading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : !crashes || crashes.rows.length === 0 ? (
              <p className="text-xs text-slate-500">No crashes on record for this carrier.</p>
            ) : (
              <div className="space-y-3">
                {crashes.summary && (
                  <p className="text-xs text-slate-500">
                    {crashes.summary.total} crash{crashes.summary.total === 1 ? '' : 'es'} recorded
                    {crashes.summary.fatal > 0 ? ` · ${crashes.summary.fatal} with fatalit${crashes.summary.fatal === 1 ? 'y' : 'ies'}` : ''}
                    {crashes.summary.withInjury > 0 ? ` · ${crashes.summary.withInjury} with injur${crashes.summary.withInjury === 1 ? 'y' : 'ies'}` : ''}
                    {crashes.summary.towAway > 0 ? ` · ${crashes.summary.towAway} tow-away` : ''}
                  </p>
                )}
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2 px-3 text-left">Date</th><th className="py-2 px-3 text-left">State</th>
                        <th className="py-2 px-3 text-left">Report #</th><th className="py-2 px-3 text-left">Outcome</th>
                        <th className="py-2 px-3 text-left">Vehicle</th><th className="py-2 px-3 text-left">Conditions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {crashes.rows.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-2 px-3 whitespace-nowrap font-semibold">{r.date}</td>
                          <td className="py-2 px-3">{r.state}</td>
                          <td className="py-2 px-3 font-mono text-blue-600">{r.report}</td>
                          <td className="py-2 px-3">
                            {r.fatalities > 0 ? (
                              <span className="text-rose-700 font-semibold">{r.fatalities} fatal</span>
                            ) : r.injuries > 0 ? (
                              <span className="text-amber-700 font-semibold">{r.injuries} injured</span>
                            ) : (
                              <span className="text-slate-600">No injury</span>
                            )}
                            {r.towAway && <span className="text-slate-400"> · tow-away</span>}
                            {r.hazmat && <span className="text-orange-600"> · hazmat</span>}
                          </td>
                          <td className="py-2 px-3">{r.vehicle}</td>
                          <td className="py-2 px-3 text-slate-500">{r.conditions} · {r.road}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}