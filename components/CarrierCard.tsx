'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import Section from '@/components/Section';
import StatusStamp from '@/components/StatusStamp';
import { UsdotPlate } from '@/components/Plate';
import InspectionDetail from '@/components/InspectionDetail';
import FleetPanel from '@/components/FleetPanel';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  LockIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  PlusIcon,
} from '@/components/icons';

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
  /** True when the row came from the index or SAFER and lacks detail fields. */
  partial?: boolean;
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

function dotBarClass(status: string) {
  const value = status.toLowerCase();
  if (value.includes('inactive') || value.includes('out of service')) return 'bg-alert';
  if (value.includes('pending')) return 'bg-safety';
  if (value.includes('active')) return 'bg-authority';
  return 'bg-steel';
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-ink/10 py-1.5 last:border-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
        {label}
      </dt>
      <dd className="max-w-[65%] break-words text-right text-sm text-ink">
        {children || '—'}
      </dd>
    </div>
  );
}

function SectionLoading({ label }: { label: string }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="h-3 w-2/3 animate-pulse bg-ink/10" />
      <div className="h-3 w-full animate-pulse bg-ink/5" />
      <div className="h-3 w-4/5 animate-pulse bg-ink/5" />
    </div>
  );
}

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

function CopyBtn({
  value,
  label,
  text = 'Copy',
}: {
  value: string;
  label: string;
  text?: string;
}) {
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
        void copy();
      }}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      className="btn btn-ghost px-2 text-[10px]"
    >
      {copied ? (
        <>
          <CheckIcon size={14} />
          Copied
        </>
      ) : (
        <>
          <CopyIcon size={14} />
          {text}
        </>
      )}
    </button>
  );
}

/** Drops null/undefined fields so a partial detail response can't erase known values. */
function compact<T extends object>(value: T | null | undefined): Partial<T> {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== null && field !== undefined)
  ) as Partial<T>;
}

export default function CarrierCard({ carrier: base }: { carrier: Carrier }) {
  const [extra, setExtra] = useState<Partial<Carrier> | null>(null);
  const c: Carrier = {
    ...base,
    ...compact(extra),
    phy: { ...base.phy, ...compact(extra?.phy) },
    mail: { ...base.mail, ...compact(extra?.mail) },
    cargo: { ...base.cargo, ...(extra?.cargo ?? {}) },
  };
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
      router.push('/auth/sign-in');
      return;
    }
    const next = !open;
    setOpen(next);
    if (!next) return;
    if (session?.user) void refreshWatch();

    // The search index carries list fields only; fill in email, owner, cargo and
    // full addresses from the live census (or SAFER) the first time a card opens.
    if (!extra && base.partial) {
      fetch('/api/carrier?dot=' + c.usdot)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (j?.details) setExtra(j.details as Partial<Carrier>);
        })
        .catch(() => void 0);
    }

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
  const name = c.legalName || 'Name not listed';
  const location = [c.phy.city, c.phy.state].filter(Boolean).join(', ');
  const entityTypes = c.entityTypes.length
    ? c.entityTypes
    : c.entityType
      ? [c.entityType]
      : [];

  return (
    <article className="border-b border-ink/15 bg-white last:border-b-0">
      <div className="relative transition-colors hover:bg-paper/40 focus-within:bg-paper/40">
        <button
          type="button"
          onClick={expand}
          aria-expanded={open}
          aria-controls={`carrier-${c.usdot}`}
          aria-label={`${
            session?.user ? (open ? 'Close' : 'Open') : 'Sign in to open'
          } carrier snapshot for ${name}`}
          className="absolute inset-0 z-0 h-full w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
        />
        <span
          className={`pointer-events-none absolute inset-y-0 left-0 w-1 ${dotBarClass(c.dotStatus)}`}
          aria-hidden="true"
        />

        <div className="pointer-events-none relative flex flex-col gap-4 p-4 pl-5 sm:p-5 sm:pl-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusStamp status={c.dotStatus} label={`DOT ${c.dotStatus}`} />
              {c.authStatus && (
                <StatusStamp
                  status={c.authStatus}
                  label={`Authority ${c.authStatus}`}
                />
              )}
              {entityTypes.length > 0 && (
                <span className="inline-flex min-h-6 items-center rounded-[2px] border border-ink/20 bg-paper px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
                  {entityTypes.join(' / ')}
                </span>
              )}
            </div>

            <h2 className="mt-1.5 break-words font-display text-2xl font-semibold leading-tight text-ink">
              {name}
            </h2>
            {c.dba && (
              <p className="mt-0.5 text-xs text-steel">
                DBA <span className="text-ink">{c.dba}</span>
              </p>
            )}
            {c.companyOfficer && (
              <p className="mt-0.5 text-xs text-steel">
                Owner / officer <span className="text-ink">{c.companyOfficer}</span>
              </p>
            )}

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.06em] text-steel">
              <span>
                USDOT <span className="text-ink">{c.usdot}</span>
              </span>
              {c.docket && (
                <span>
                  MC <span className="text-ink">{c.docketDigits || c.docket}</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <MapPinIcon size={12} />
                {location || 'Location not listed'}
              </span>
              {phone &&
                (c.masked ? (
                  <span className="inline-flex items-center gap-1">
                    <LockIcon size={12} />
                    {phone}
                  </span>
                ) : (
                  <a
                    href={`tel:${phone.replace(/\D/g, '')}`}
                    className="pointer-events-auto relative z-10 inline-flex items-center gap-1 hover:text-ink"
                  >
                    <PhoneIcon size={12} />
                    {phone}
                  </a>
                ))}
              {!phone && <span>Phone not listed</span>}
              {email &&
                (c.masked ? (
                  <span className="inline-flex items-center gap-1">
                    <LockIcon size={12} />
                    {email}
                  </span>
                ) : (
                  <a
                    href={`mailto:${email}`}
                    className="pointer-events-auto relative z-10 inline-flex min-w-0 items-center gap-1 break-all hover:text-ink"
                  >
                    <MailIcon size={12} className="shrink-0" />
                    {email}
                  </a>
                ))}
              {c.addDate && (
                <span>
                  Added <span className="text-ink">{c.addDate}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 xl:shrink-0 xl:justify-end">
            <dl className="flex gap-4">
              <div className="border-l border-ink/15 pl-3">
                <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-steel">
                  Power units
                </dt>
                <dd className="font-display text-2xl font-semibold leading-none tabular-nums text-ink">
                  {c.powerUnits ?? '—'}
                </dd>
              </div>
              <div className="border-l border-ink/15 pl-3">
                <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-steel">
                  Drivers
                </dt>
                <dd className="font-display text-2xl font-semibold leading-none tabular-nums text-ink">
                  {c.drivers ?? '—'}
                </dd>
              </div>
            </dl>

            <span className="inline-flex min-h-11 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-steel">
              {session?.user ? (open ? 'Close' : 'Open dossier') : 'Sign in to open'}
              {session?.user ? (
                <ChevronDownIcon
                  size={16}
                  className={`transition-transform ${open ? 'rotate-180' : ''}`}
                />
              ) : (
                <LockIcon size={14} />
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div id={`carrier-${c.usdot}`} className="border-t-2 border-ink bg-paper/30 p-4 sm:p-5">
          <div className="flex flex-col gap-3 border-b border-ink/15 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <UsdotPlate usdot={c.usdot} />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-steel">
                Carrier snapshot
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {session?.user ? (
                <button
                  type="button"
                  onClick={toggleWatch}
                  disabled={watched.loading}
                  aria-pressed={watched.watching}
                  className={`btn ${
                    watched.watching
                      ? 'border-authority bg-authority text-white hover:bg-authority/90'
                      : 'btn-secondary'
                  }`}
                >
                  {watched.loading ? (
                    'Saving…'
                  ) : watched.watching ? (
                    <>
                      <CheckIcon size={14} />
                      Watching
                    </>
                  ) : (
                    <>
                      <PlusIcon size={14} />
                      Watch changes
                    </>
                  )}
                </button>
              ) : (
                <Link href="/auth/sign-in" className="btn btn-secondary">
                  <LockIcon size={14} />
                  Sign in to watch
                </Link>
              )}
              <CopyBtn value={c.usdot} label="USDOT number" text="Copy USDOT" />
              <button
                type="button"
                onClick={expand}
                className="btn btn-ghost px-3"
              >
                Close snapshot
              </button>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-x-8 border border-ink/15 bg-white p-4 md:grid-cols-2">
            <DetailRow label="Owner / representative">
              {c.companyOfficer || (ins?.loading ? 'Loading…' : ins?.owner) || 'Not listed'}
            </DetailRow>
            <DetailRow label="Physical address">{addr(c.phy) || 'Not listed'}</DetailRow>
            <DetailRow label="Mailing address">{addr(c.mail) || 'Not listed'}</DetailRow>
            <DetailRow label="Authority type">{c.authType || 'N/A'}</DetailRow>
            <DetailRow label="Last MCS-150">{c.mcs150 || 'N/A'}</DetailRow>
            <DetailRow label="Added to census">{c.addDate || 'N/A'}</DetailRow>
            <div className="pt-3 md:col-span-2">
              <dt className="field-label">Cargo</dt>
              <dd className="flex flex-wrap gap-1.5">
                {cargoTags.length ? (
                  cargoTags.map((tag) => (
                    <span
                      key={tag}
                      className="border border-ink/20 bg-paper px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink"
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-steel">None reported</span>
                )}
              </dd>
            </div>
          </dl>

          <div className="mt-6 grid grid-cols-1 gap-6">
          <Section title="Authority status history">
            {history?.loading ? (
              <SectionLoading label="Loading status history" />
            ) : history?.events.length ? (
              <ol className="relative space-y-3 border-l-2 border-ink/15 pl-4">
                {history.events.map((e, i) => (
                  <li key={i} className="relative">
                    <span
                      className="absolute -left-[1.32rem] top-1.5 h-2 w-2 rounded-full border-2 border-paper bg-safety"
                      aria-hidden="true"
                    />
                    <p className="text-sm font-medium leading-5 text-ink">{e.label}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
                      {e.date}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm leading-6 text-steel">
                No revocation, suspension, or reinstatement events on record.
              </p>
            )}
          </Section>

          <Section title={`Insurance filings (${ins?.policies.length ?? (ins?.loading ? '…' : 0)})`}>
            {!ins || ins.loading ? (
              <SectionLoading label="Loading insurance filings" />
            ) : (
              <div className="space-y-3">
                {ins.financial && (
                  <dl className="grid grid-cols-2 gap-px border border-ink/15 bg-ink/10 lg:grid-cols-4">
                    {ins.financial.minCoverage && (
                      <div className="bg-white p-3">
                        <dt className="field-label">Min. required</dt>
                        <dd className="text-sm font-medium text-ink">
                          {ins.financial.minCoverage}
                        </dd>
                      </div>
                    )}
                    {ins.financial.bipd && (
                      <div className="bg-white p-3">
                        <dt className="field-label">BIPD on file</dt>
                        <dd className="text-sm font-medium text-ink">{ins.financial.bipd}</dd>
                      </div>
                    )}
                    <div className="bg-white p-3">
                      <dt className="field-label">Cargo</dt>
                      <dd className="text-sm font-medium text-ink">
                        {ins.financial.cargoReq ? 'Required' : 'Not required'}
                        {ins.financial.cargoFile ? ' · On file' : ''}
                      </dd>
                    </div>
                    <div className="bg-white p-3">
                      <dt className="field-label">Bond</dt>
                      <dd className="text-sm font-medium text-ink">
                        {ins.financial.bondReq ? 'Required' : 'Not required'}
                        {ins.financial.bondFile ? ' · On file' : ''}
                      </dd>
                    </div>
                  </dl>
                )}

                {ins.policies.length === 0 ? (
                  <p className="text-sm leading-6 text-steel">
                    No active or pending insurance filings found.
                  </p>
                ) : (
                  <div className="overflow-hidden border border-ink/15 bg-white">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Form</th>
                          <th>Type</th>
                          <th>Carrier</th>
                          <th>Policy #</th>
                          <th>Coverage</th>
                          <th>Effective</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ins.policies.map((p, i) => (
                          <tr key={i}>
                            <td data-label="Form">{p.form}</td>
                            <td data-label="Type">{p.type}</td>
                            <td data-label="Carrier">{p.carrier}</td>
                            <td data-label="Policy #" className="font-mono text-[11px]">
                              {p.policy}
                            </td>
                            <td data-label="Coverage">{p.coverage}</td>
                            <td data-label="Effective" className="whitespace-nowrap font-mono text-[11px]">
                              {p.effective}
                            </td>
                            <td data-label="Status">
                              <StatusStamp status={p.status} />
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

          <Section
            title={`Roadside inspections (${insp?.rows.length ?? (insp?.loading ? '…' : 0)})`}
          >
            {insp?.loading ? (
              <SectionLoading label="Loading roadside inspections" />
            ) : !insp || insp.rows.length === 0 ? (
              <p className="text-sm leading-6 text-steel">
                No roadside inspections on record.
              </p>
            ) : (
              <div className="overflow-hidden border border-ink/15 bg-white">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>
                        <span className="sr-only">Expand report</span>
                      </th>
                      <th>Date</th>
                      <th>Report #</th>
                      <th>State</th>
                      <th>Inspection</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insp.rows.map((r) => {
                      const key = r.inspectionId || `${r.reportState}-${r.report}`;
                      const isOpen = openInsp === key;
                      const toggle = () => setOpenInsp(isOpen ? null : key);
                      return (
                        <Fragment key={key}>
                          <tr className={isOpen ? 'bg-paper/60' : undefined}>
                            <td className="w-12">
                              <button
                                type="button"
                                onClick={toggle}
                                aria-expanded={isOpen}
                                aria-label={isOpen ? 'Hide report details' : 'Show report details'}
                                title={isOpen ? 'Hide report details' : 'Show report details'}
                                className="flex h-11 w-11 items-center justify-center text-steel transition-colors hover:text-ink"
                              >
                                <ChevronRightIcon
                                  size={16}
                                  className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
                                />
                              </button>
                            </td>
                            <td data-label="Date" className="whitespace-nowrap font-mono text-[11px]">
                              {r.date}
                            </td>
                            <td data-label="Report #">
                              <button
                                type="button"
                                onClick={toggle}
                                aria-expanded={isOpen}
                                className="inline-flex min-h-11 items-center font-mono text-[11px] text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
                              >
                                {r.report}
                              </button>
                            </td>
                            <td data-label="State" className="font-medium">
                              {r.state}
                            </td>
                            <td data-label="Inspection">{r.level}</td>
                            <td data-label="Result">{r.summary}</td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={6} className="data-table-detail bg-paper/40">
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

          <Section title="Equipment & fleet">
            <FleetPanel dot={c.usdot} />
          </Section>

          <Section title="Safety measurement system">
            {sms?.loading ? (
              <SectionLoading label="Loading safety measurement data" />
            ) : !sms?.data || !sms.data.available ? (
              <p className="text-sm leading-6 text-steel">
                SMS safety data is not available for this carrier.
              </p>
            ) : !sms.data.found ||
              sms.data.basics.every((b) => b.measure === null && b.percentile === null) ? (
              <p className="text-sm leading-6 text-steel">
                No SMS safety data on record for this carrier.
              </p>
            ) : (
              <div className="space-y-3">
                <dl className="grid grid-cols-1 gap-x-8 border-t border-ink/10 sm:grid-cols-2">
                  {sms.data.basics.map((b) => {
                    const band =
                      b.percentile === null
                        ? 'bg-steel'
                        : b.percentile < 50
                          ? 'bg-authority'
                          : b.percentile < 75
                            ? 'bg-safety'
                            : 'bg-alert';
                    return (
                      <div
                        key={b.key}
                        className="flex items-center justify-between gap-3 border-b border-ink/10 py-2"
                      >
                        <dt className="text-xs text-ink">{b.label}</dt>
                        <dd className="flex items-center gap-2 font-mono text-[11px]">
                          {b.inspectionsWithViolations !== null &&
                            b.inspectionsWithViolations > 0 && (
                              <span className="text-steel">
                                {b.inspectionsWithViolations} viol
                              </span>
                            )}
                          <span
                            className={`h-2 w-2 shrink-0 ${band}`}
                            aria-hidden="true"
                          />
                          <span className="font-medium text-ink">
                            {b.percentile !== null
                              ? `${b.percentile}%`
                              : b.measure !== null
                                ? b.measure
                                : '—'}
                          </span>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                {sms.data.counts &&
                  (sms.data.counts.inspections !== null ||
                    sms.data.crashes !== null) && (
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
                      {sms.data.counts.inspections !== null
                        ? `${sms.data.counts.inspections.toLocaleString()} inspection${
                            sms.data.counts.inspections === 1 ? '' : 's'
                          }`
                        : 'No inspections'}
                      {sms.data.counts.driverOutOfService ||
                      sms.data.counts.vehicleOutOfService
                        ? ` · ${(
                            (sms.data.counts.driverOutOfService || 0) +
                            (sms.data.counts.vehicleOutOfService || 0)
                          ).toLocaleString()} out-of-service`
                        : ''}
                      {sms.data.crashes !== null
                        ? ` · ${sms.data.crashes.toLocaleString()} crash${
                            sms.data.crashes === 1 ? '' : 'es'
                          }`
                        : ''}
                    </p>
                  )}
              </div>
            )}
          </Section>

          <Section
            title={`Crashes (${crashes?.rows.length ?? (crashes?.loading ? '…' : 0)})`}
          >
            {crashes?.loading ? (
              <SectionLoading label="Loading crash records" />
            ) : !crashes || crashes.rows.length === 0 ? (
              <p className="text-sm leading-6 text-steel">
                No crashes on record for this carrier.
              </p>
            ) : (
              <div className="space-y-3">
                {crashes.summary && (
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
                    {crashes.summary.total} crash
                    {crashes.summary.total === 1 ? '' : 'es'} recorded
                    {crashes.summary.fatal > 0
                      ? ` · ${crashes.summary.fatal} with fatalit${
                          crashes.summary.fatal === 1 ? 'y' : 'ies'
                        }`
                      : ''}
                    {crashes.summary.withInjury > 0
                      ? ` · ${crashes.summary.withInjury} with injur${
                          crashes.summary.withInjury === 1 ? 'y' : 'ies'
                        }`
                      : ''}
                    {crashes.summary.towAway > 0
                      ? ` · ${crashes.summary.towAway} tow-away`
                      : ''}
                  </p>
                )}
                <div className="overflow-hidden border border-ink/15 bg-white">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>State</th>
                        <th>Report #</th>
                        <th>Outcome</th>
                        <th>Vehicle</th>
                        <th>Conditions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {crashes.rows.map((r, i) => (
                        <tr key={i}>
                          <td data-label="Date" className="whitespace-nowrap font-mono text-[11px]">
                            {r.date}
                          </td>
                          <td data-label="State" className="font-medium">
                            {r.state}
                          </td>
                          <td data-label="Report #" className="font-mono text-[11px]">
                            {r.report}
                          </td>
                          <td data-label="Outcome">
                            {r.fatalities > 0 ? (
                              <span className="font-medium text-alert">
                                {r.fatalities} fatal
                              </span>
                            ) : r.injuries > 0 ? (
                              <span className="font-medium text-ink">
                                {r.injuries} injured
                              </span>
                            ) : (
                              <span className="text-steel">No injury</span>
                            )}
                            {r.towAway && <span className="text-steel"> · tow-away</span>}
                            {r.hazmat && <span className="font-medium text-alert"> · hazmat</span>}
                          </td>
                          <td data-label="Vehicle">{r.vehicle}</td>
                          <td data-label="Conditions" className="text-steel">
                            {r.conditions} · {r.road}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>
          </div>
        </div>
      )}
    </article>
  );
}