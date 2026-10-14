'use client';

import { useState } from 'react';

export interface Carrier {
  usdot: string; docketDigits: string; docket: string | null; legalName: string | null; dba: string | null;
  dotStatus: string; authStatus: string; authType: string | null;
  phone: string | null; email: string | null;
  powerUnits: number | null; drivers: number | null;
  phy: { street?: string; city?: string; state?: string; zip?: string };
  mail: { street?: string; city?: string; state?: string; zip?: string };
  cargo: Record<string, boolean>;
  addDate: string | null; mcs150: string | null;
}

interface InsPolicy { form: string; type: string; carrier: string; policy: string; coverage: string; effective: string; status: string; }
interface Insp { date: string; report: string; state: string; level: string; summary: string; }
interface HistoryEvent { date: string; label: string; }

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
      onClick={copy}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] font-bold tracking-wider text-slate-400 uppercase border-b border-slate-200 pb-1 mb-2">{title}</h4>
      {children}
    </div>
  );
}

export default function CarrierCard({ carrier: c }: { carrier: Carrier }) {
  const [open, setOpen] = useState(false);
  const [ins, setIns] = useState<{ loading: boolean; owner: string | null; policies: InsPolicy[] } | null>(null);
  const [insp, setInsp] = useState<{ loading: boolean; rows: Insp[] } | null>(null);
  const [history, setHistory] = useState<{ loading: boolean; events: HistoryEvent[] } | null>(null);

  const expand = async () => {
    const next = !open;
    setOpen(next);
    if (!next) return;

    if (!ins) {
      setIns({ loading: true, owner: null, policies: [] });
      fetch('/api/insurance?dotNumber=' + c.usdot)
        .then((r) => r.json())
        .then((j) => setIns({ loading: false, owner: j.owner || null, policies: j.error ? [] : j.policies || [] }))
        .catch(() => setIns({ loading: false, owner: null, policies: [] }));
    }
    if (!insp) {
      setInsp({ loading: true, rows: [] });
      fetch('/api/inspections?dot=' + c.usdot)
        .then((r) => r.json())
        .then((j) => setInsp({ loading: false, rows: j.inspections || [] }))
        .catch(() => setInsp({ loading: false, rows: [] }));
    }
    if (!history) {
      setHistory({ loading: true, events: [] });
      fetch('/api/status-history?dot=' + c.usdot)
        .then((r) => (r.ok ? r.json() : { events: [] }))
        .then((j) => setHistory({ loading: false, events: j.events || [] }))
        .catch(() => setHistory({ loading: false, events: [] }));
    }
  };

  const cargoTags = Object.entries(c.cargo).filter(([, v]) => v).map(([k]) => k);
  const addr = (a: Carrier['phy']) => [a.street, a.city, a.state, a.zip].filter(Boolean).join(', ');
  const phone = fmtPhone(c.phone);
  const email = c.email;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header row */}
      <button onClick={expand} className="w-full text-left p-5 hover:bg-slate-50/60 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 uppercase truncate">{c.legalName || 'NAME NOT LISTED'}</h2>
              <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full whitespace-nowrap ${badge(c.dotStatus)}`}>{c.dotStatus}</span>
              {c.docket && (
                <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full whitespace-nowrap ${badge(c.authStatus)}`}>{c.docket} · {c.authStatus}</span>
              )}
            </div>
            {c.dba && <p className="text-xs text-slate-500 mt-0.5">DBA: <span className="font-medium text-slate-700">{c.dba}</span></p>}
            <div className="text-xs text-slate-600 mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
              <span><strong>USDOT:</strong> {c.usdot}</span>
              {phone && (
                <span className="inline-flex items-center gap-1">
                  <strong>Phone:</strong> {phone} <CopyBtn value={phone} label="phone number" />
                </span>
              )}
              {!phone && <span><strong>Phone:</strong> N/A</span>}
              {email && (
                <span className="inline-flex items-center gap-1">
                  <strong>Email:</strong> <a href={`mailto:${email}`} className="text-blue-600 hover:underline">{email}</a>
                  <CopyBtn value={email} label="email address" />
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
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-slate-200 p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="space-y-1.5">
              <p><strong className="text-slate-800">Owner / Representative:</strong> {ins?.loading ? 'Loading…' : ins?.owner || 'See insurance filings below'}</p>
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
            {ins?.loading ? (
              <p className="text-xs text-slate-400">Loading from FMCSA L&amp;I portal…</p>
            ) : !ins || ins.policies.length === 0 ? (
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
                      <th className="py-2 px-3 text-left">Date</th><th className="py-2 px-3 text-left">Report #</th>
                      <th className="py-2 px-3 text-left">State</th><th className="py-2 px-3 text-left">Inspection</th>
                      <th className="py-2 px-3 text-left">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {insp.rows.map((r, i) => (
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
            )}
          </Section>
        </div>
      )}
    </div>
  );
}