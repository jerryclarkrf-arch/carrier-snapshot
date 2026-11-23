'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Section from '@/components/Section';
import { CheckIcon, CopyIcon } from '@/components/icons';

interface Unit {
  unit: number; type: string; make: string; license: string; licenseState: string;
  vin: string; decal: string; year: string; model: string; bodyClass: string; gvwr: string;
}
interface Violation {
  seqNo: number; code: string; description: string; unit: string;
  oos: boolean; partNo: string; partSection: string; citation: string;
}
interface Detail {
  header: {
    inspectionId: string; reportNumber: string; reportState: string; reportDisplay: string;
    date: string; timeStart: string; timeEnd: string; level: string; facility: string;
    shipper: string; shippingPaper: string; location: string; county: string; grossWeight: string;
    interstate: boolean; hazmatPlacard: boolean; dotNumber: string; carrierName: string; carrierAddress: string;
    violTotal: number; oosTotal: number; driverViolTotal: number; vehicleViolTotal: number;
    hazmatViolTotal: number; smsIncluded: boolean;
  };
  units: Unit[];
  violations: Violation[];
}

const filled = (v: string | null | undefined) => (v && String(v).trim() ? v : '—');

// MCMIS stores unit types in caps ("STRAIGHT TRUCK"); BrokerSnapshot title-cases them.
const titleCase = (v: string) =>
  v ? v.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase()) : '';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-ink/10 py-1.5 last:border-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
        {label}
      </span>
      <span className="max-w-[65%] break-words text-right text-sm text-ink">
        {value || '—'}
      </span>
    </div>
  );
}

function VinCell({ vin }: { vin: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(vin).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined
    );
  };
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-[11px]">{vin}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          copy();
        }}
        aria-label="Copy VIN"
        title="Copy VIN"
        className="flex h-11 w-11 items-center justify-center text-steel transition-colors hover:text-ink"
      >
        {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      </button>
    </span>
  );
}

export default function InspectionDetail({
  inspectionId,
  report,
  state,
}: {
  inspectionId: string;
  report: string;
  state: string;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'unauthorized' | 'failed' | null>(null);

  useEffect(() => {
    let cancelled = false;
    // This component only mounts while its row is expanded, so initial state is
    // already "loading" and no synchronous setState is needed here.
    const qs = new URLSearchParams({ id: inspectionId, report, state });
    fetch(`/api/inspections/detail?${qs.toString()}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setError('unauthorized');
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setError('failed');
          setLoading(false);
          return;
        }
        const json = (await res.json()) as Detail;
        if (cancelled) return;
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('failed');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inspectionId, report, state]);

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading inspection report</span>
        <div className="h-3 w-40 animate-pulse bg-ink/10" />
        <div className="h-3 w-full animate-pulse bg-ink/5" />
        <div className="h-3 w-5/6 animate-pulse bg-ink/5" />
        <div className="h-3 w-2/3 animate-pulse bg-ink/5" />
      </div>
    );
  }

  if (error === 'unauthorized') {
    return (
      <p className="text-sm leading-6 text-steel">
        <Link
          href="/auth/sign-in"
          className="font-medium text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
        >
          Sign in
        </Link>{' '}
        to view full inspection report details.
      </p>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm leading-6 text-alert">
        Report details could not be loaded. Please try again.
      </p>
    );
  }

  const h = data.header;
  const timeRange = h.timeStart && h.timeEnd ? `${h.timeStart} – ${h.timeEnd}` : h.timeStart || h.timeEnd;
  const decodedNote = data.units
    .map((u) => [u.model, u.bodyClass, u.gvwr].filter(Boolean).join(' · '))
    .filter(Boolean);

  return (
    <div className="space-y-4 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-xl font-semibold leading-none text-ink">
          Report details
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-6 items-center border border-ink/20 bg-paper px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink">
            In SMS: {h.smsIncluded ? 'Yes' : 'No'}
          </span>
          <span
            className={`inline-flex min-h-6 items-center border px-2 font-mono text-[10px] uppercase tracking-[0.08em] ${
              h.violTotal === 0
                ? 'border-authority/30 bg-authority/5 text-authority'
                : 'border-alert/30 bg-alert/5 text-alert'
            }`}
          >
            {h.violTotal === 0
              ? 'No violations'
              : `${h.violTotal} violation${h.violTotal === 1 ? '' : 's'}${
                  h.oosTotal > 0 ? ` · ${h.oosTotal} OOS` : ''
                }`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        <Section title="Carrier information">
          <Field label="Name" value={h.carrierName} />
          <Field label="DOT#" value={h.dotNumber} />
          <Field label="Physical address" value={h.carrierAddress} />
        </Section>
        <Section title="Inspection information">
          <Field label="Report #" value={<span className="font-mono">{h.reportDisplay}</span>} />
          <Field label="State" value={h.reportState} />
          <Field label="Date" value={h.date} />
          <Field label="Time" value={timeRange} />
          <Field label="Level" value={h.level} />
          <Field label="Shipper" value={h.shipper} />
          <Field label="Location" value={h.location} />
          <Field label="Inspection facility" value={h.facility} />
          <Field label="Total gross weight" value={h.grossWeight} />
        </Section>
      </div>

      <Section title={`Vehicle information${data.units.length ? ` (${data.units.length})` : ''}`}>
        {data.units.length === 0 ? (
          <p className="text-sm leading-6 text-steel">
            Vehicle details are not published by FMCSA for this inspection
            {h.smsIncluded ? '.' : ' (it is excluded from the SMS snapshot).'}
          </p>
        ) : (
          <div className="overflow-hidden border border-ink/15 bg-white">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Type</th>
                  <th>Year</th>
                  <th>Manufacturer</th>
                  <th>License #</th>
                  <th>VIN</th>
                </tr>
              </thead>
              <tbody>
                {data.units.map((u) => (
                  <tr key={u.unit}>
                    <td data-label="Unit" className="font-medium">
                      {u.unit}
                    </td>
                    <td data-label="Type">{filled(titleCase(u.type))}</td>
                    <td data-label="Year" className="font-mono text-[11px]">
                      {filled(u.year)}
                    </td>
                    <td data-label="Manufacturer">{filled(u.make)}</td>
                    <td data-label="License #" className="whitespace-nowrap">
                      {u.license ? `${u.licenseState ? `${u.licenseState} ` : ''}${u.license}` : '—'}
                    </td>
                    <td data-label="VIN">{u.vin ? <VinCell vin={u.vin} /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {decodedNote.length > 0 && (
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-steel">
            Decoded from VIN (NHTSA vPIC): {decodedNote.join(' | ')}
          </p>
        )}
      </Section>

      <Section title={`Violations${h.violTotal > 0 ? ` (${h.violTotal})` : ''}`}>
        {data.violations.length > 0 ? (
          <div className="overflow-hidden border border-ink/15 bg-white">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Unit</th>
                  <th>OOS</th>
                </tr>
              </thead>
              <tbody>
                {data.violations.map((v) => (
                  <tr key={`${v.seqNo}-${v.code}`}>
                    <td data-label="#" className="font-mono text-[11px] text-steel">
                      {v.seqNo}
                    </td>
                    <td data-label="Code" className="whitespace-nowrap font-mono text-[11px]">
                      {v.code}
                    </td>
                    <td data-label="Description">{v.description}</td>
                    <td data-label="Unit" className="whitespace-nowrap">
                      {filled(v.unit)}
                    </td>
                    <td data-label="OOS">
                      {v.oos ? (
                        <span className="inline-flex min-h-6 items-center border border-alert/30 bg-alert/5 px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-alert">
                          OOS
                        </span>
                      ) : (
                        <span className="text-steel">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : h.violTotal > 0 ? (
          <p className="text-sm leading-6 text-steel">
            {h.violTotal} violation{h.violTotal === 1 ? '' : 's'} on record, but
            the detail lines are not published for this report.
          </p>
        ) : (
          <p className="text-sm leading-6 text-steel">No violations</p>
        )}
      </Section>
    </div>
  );
}



