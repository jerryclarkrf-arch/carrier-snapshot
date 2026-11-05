'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Section from '@/components/Section';

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
    <div className="flex justify-between gap-3 border-b border-slate-100 py-1 last:border-0">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-medium text-slate-800 text-right break-words">{value || '—'}</span>
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
      <span className="font-mono">{vin}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          copy();
        }}
        aria-label="Copy VIN"
        title="Copy VIN"
        className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-semibold text-slate-500 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50 transition-colors"
      >
        {copied ? '✓' : 'Copy'}
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
      <div className="space-y-2" aria-busy="true">
        <div className="h-3 w-40 rounded bg-slate-200 animate-pulse" />
        <div className="h-3 w-full rounded bg-slate-200 animate-pulse" />
        <div className="h-3 w-5/6 rounded bg-slate-200 animate-pulse" />
        <div className="h-3 w-2/3 rounded bg-slate-200 animate-pulse" />
      </div>
    );
  }

  if (error === 'unauthorized') {
    return (
      <p className="text-xs text-slate-600">
        <Link href="/auth/sign-in" className="font-semibold text-blue-700 hover:underline">
          Sign in
        </Link>{' '}
        to view full inspection report details.
      </p>
    );
  }

  if (error || !data) {
    return <p className="text-xs text-slate-500">Report details could not be loaded. Please try again.</p>;
  }

  const h = data.header;
  const timeRange = h.timeStart && h.timeEnd ? `${h.timeStart} – ${h.timeEnd}` : h.timeStart || h.timeEnd;
  const decodedNote = data.units
    .map((u) => [u.model, u.bodyClass, u.gvwr].filter(Boolean).join(' · '))
    .filter(Boolean);

  return (
    <div className="space-y-4 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-700">Report Details</p>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              h.smsIncluded ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Include in SMS: {h.smsIncluded ? 'Yes' : 'No'}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              h.violTotal === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {h.violTotal === 0
              ? 'No violations'
              : `${h.violTotal} violation${h.violTotal === 1 ? '' : 's'}${h.oosTotal > 0 ? ` · ${h.oosTotal} OOS` : ''}`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        <Section title="Carrier Information">
          <Field label="Name" value={h.carrierName} />
          <Field label="DOT#" value={h.dotNumber} />
          <Field label="Physical address" value={h.carrierAddress} />
        </Section>
        <Section title="Inspection Information">
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

      <Section title={`Vehicle Information${data.units.length ? ` (${data.units.length})` : ''}`}>
        {data.units.length === 0 ? (
          <p className="text-xs text-slate-500">
            Vehicle details are not published by FMCSA for this inspection
            {h.smsIncluded ? '.' : ' (it is excluded from the SMS snapshot).'}
          </p>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold">
                <tr>
                  <th className="py-2 px-3 text-left">Unit</th>
                  <th className="py-2 px-3 text-left">Type</th>
                  <th className="py-2 px-3 text-left">Year</th>
                  <th className="py-2 px-3 text-left">Manufacturer</th>
                  <th className="py-2 px-3 text-left">License #</th>
                  <th className="py-2 px-3 text-left">VIN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.units.map((u) => (
                  <tr key={u.unit}>
                    <td className="py-2 px-3 font-semibold">{u.unit}</td>
                    <td className="py-2 px-3">{filled(titleCase(u.type))}</td>
                    <td className="py-2 px-3">{filled(u.year)}</td>
                    <td className="py-2 px-3">{filled(u.make)}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {u.license ? `${u.licenseState ? `${u.licenseState} ` : ''}${u.license}` : '—'}
                    </td>
                    <td className="py-2 px-3">{u.vin ? <VinCell vin={u.vin} /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {decodedNote.length > 0 && (
          <p className="mt-1.5 text-[11px] text-slate-500">
            Decoded from VIN (NHTSA vPIC): {decodedNote.join(' | ')}
          </p>
        )}
      </Section>

      <Section title={`Violations${h.violTotal > 0 ? ` (${h.violTotal})` : ''}`}>
        {data.violations.length > 0 ? (
          <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold">
                <tr>
                  <th className="py-2 px-3 text-left w-8">#</th>
                  <th className="py-2 px-3 text-left">Code</th>
                  <th className="py-2 px-3 text-left">Description</th>
                  <th className="py-2 px-3 text-left">Unit</th>
                  <th className="py-2 px-3 text-left">OOS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.violations.map((v) => (
                  <tr key={`${v.seqNo}-${v.code}`}>
                    <td className="py-2 px-3 text-slate-400">{v.seqNo}</td>
                    <td className="py-2 px-3 font-mono whitespace-nowrap">{v.code}</td>
                    <td className="py-2 px-3">{v.description}</td>
                    <td className="py-2 px-3 whitespace-nowrap">{filled(v.unit)}</td>
                    <td className="py-2 px-3">
                      {v.oos ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold">OOS</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : h.violTotal > 0 ? (
          <p className="text-xs text-slate-500">
            {h.violTotal} violation{h.violTotal === 1 ? '' : 's'} on record, but the detail lines are not published for
            this report.
          </p>
        ) : (
          <p className="text-xs text-slate-500">No violations</p>
        )}
      </Section>
    </div>
  );
}



