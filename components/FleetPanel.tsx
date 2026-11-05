'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import InspectionDetail from '@/components/InspectionDetail';

interface Equipment {
  type: string;
  role: string;
  count: number;
}
interface VehicleRow {
  vin: string;
  make: string;
  type: string;
  inspections: number;
}
interface FleetData {
  equipment: Equipment[];
  fleet: VehicleRow[];
  truncated: boolean;
  totals: { unitAppearances: number; distinctVehicles: number };
}
interface VinReport {
  inspectionId: string;
  reportNumber: string;
  reportState: string;
  reportDisplay: string;
  date: string;
  level: string;
  violTotal: number;
  oosTotal: number;
  unitType: string;
  unitMake: string;
  plate: string;
}

const titleCase = (v: string) =>
  v ? v.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase()) : '';

export default function FleetPanel({ dot }: { dot: string }) {
  const [data, setData] = useState<FleetData | null>(null);
  const [error, setError] = useState<'unauthorized' | 'failed' | null>(null);
  const [openVin, setOpenVin] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/inspections/fleet?dot=${encodeURIComponent(dot)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setError('unauthorized');
          return;
        }
        if (!res.ok) {
          setError('failed');
          return;
        }
        const json = (await res.json()) as FleetData;
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [dot]);

  if (error === 'unauthorized') {
    return (
      <p className="text-xs text-slate-600">
        <Link href="/auth/sign-in" className="font-semibold text-blue-700 hover:underline">
          Sign in
        </Link>{' '}
        to view equipment and fleet details.
      </p>
    );
  }

  if (error) return <p className="text-xs text-slate-500">Equipment data could not be loaded. Please try again.</p>;

  if (!data) {
    return (
      <div className="space-y-2" aria-busy="true">
        <div className="h-3 w-56 rounded bg-slate-200 animate-pulse" />
        <div className="h-3 w-full rounded bg-slate-200 animate-pulse" />
        <div className="h-3 w-4/5 rounded bg-slate-200 animate-pulse" />
      </div>
    );
  }

  if (data.equipment.length === 0 && data.fleet.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        No vehicle-level inspection data is published for this carrier. FMCSA only releases VIN and
        equipment detail for inspections included in the SMS snapshot.
      </p>
    );
  }

  const max = Math.max(...data.equipment.map((e) => e.count), 1);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        {data.totals.unitAppearances.toLocaleString()} unit appearances across inspections
        {data.totals.distinctVehicles > 0 &&
          ` · ${data.totals.distinctVehicles.toLocaleString()} distinct vehicle${data.totals.distinctVehicles === 1 ? '' : 's'} identified by VIN`}
        {data.truncated && ' · showing the 100 most-inspected vehicles'}
      </p>

      {data.equipment.length > 0 && (
        <div className="space-y-1">
          {data.equipment.map((e) => (
            <div key={`${e.role}-${e.type}`} className="flex items-center gap-2 text-xs">
              <span className="w-32 sm:w-44 shrink-0 truncate">{titleCase(e.type)}</span>
              <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {e.role}
              </span>
              <span className="flex-1 h-1.5 rounded bg-slate-100 overflow-hidden">
                <span
                  className="block h-full bg-blue-500"
                  style={{ width: `${Math.max(4, Math.round((e.count / max) * 100))}%` }}
                />
              </span>
              <span className="w-14 text-right font-semibold tabular-nums">{e.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {data.fleet.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold">
              <tr>
                <th className="py-2 px-2 text-left w-6" />
                <th className="py-2 px-3 text-left">VIN</th>
                <th className="py-2 px-3 text-left">Type</th>
                <th className="py-2 px-3 text-left">Manufacturer</th>
                <th className="py-2 px-3 text-right">Inspections</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.fleet.map((v) => {
                const isOpen = openVin === v.vin;
                const toggle = () => setOpenVin(isOpen ? null : v.vin);
                return (
                  <Fragment key={v.vin}>
                    <tr className={isOpen ? 'bg-blue-50/40' : 'hover:bg-slate-50'}>
                      <td className="py-2 px-2 align-middle">
                        <button
                          type="button"
                          onClick={toggle}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Hide inspections for this vehicle' : 'Show inspections for this vehicle'}
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          <span className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>▸</span>
                        </button>
                      </td>
                      <td className="py-2 px-3">
                        <button type="button" onClick={toggle} className="font-mono text-blue-600 hover:underline">
                          {v.vin}
                        </button>
                      </td>
                      <td className="py-2 px-3">{titleCase(v.type) || '—'}</td>
                      <td className="py-2 px-3">{v.make || '—'}</td>
                      <td className="py-2 px-3 text-right font-semibold tabular-nums">{v.inspections}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={5} className="px-4 pb-4 pt-2">
                          <VinReports dot={dot} vin={v.vin} />
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
    </div>
  );
}

function VinReports({ dot, vin }: { dot: string; vin: string }) {
  const [rows, setRows] = useState<VinReport[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openReport, setOpenReport] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/inspections/fleet?dot=${encodeURIComponent(dot)}&vin=${encodeURIComponent(vin)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const json = (await res.json()) as { inspections?: VinReport[] };
        if (!cancelled) setRows(json.inspections || []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [dot, vin]);

  if (failed) return <p className="text-xs text-slate-500">This vehicle&apos;s inspections could not be loaded.</p>;
  if (!rows) return <p className="text-xs text-slate-400">Loading inspections for this vehicle…</p>;
  if (rows.length === 0) return <p className="text-xs text-slate-500">No inspections recorded for this VIN.</p>;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-100 text-slate-600 font-semibold">
          <tr>
            <th className="py-1.5 px-2 text-left w-6" />
            <th className="py-1.5 px-3 text-left">Date</th>
            <th className="py-1.5 px-3 text-left">Report #</th>
            <th className="py-1.5 px-3 text-left">Level</th>
            <th className="py-1.5 px-3 text-left">Plate</th>
            <th className="py-1.5 px-3 text-left">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const key = r.inspectionId || `${r.reportState}-${r.reportNumber}`;
            const isOpen = openReport === key;
            const toggle = () => {
              if (r.inspectionId) setOpenReport(isOpen ? null : key);
            };
            return (
              <Fragment key={key}>
                <tr className={isOpen ? 'bg-blue-50/40' : 'hover:bg-slate-50'}>
                  <td className="py-1.5 px-2 align-middle">
                    {r.inspectionId ? (
                      <button
                        type="button"
                        onClick={toggle}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? 'Hide report details' : 'Show report details'}
                        className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-blue-700 hover:bg-blue-100 transition-colors"
                      >
                        <span className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>▸</span>
                      </button>
                    ) : null}
                  </td>
                  <td className="py-1.5 px-3 whitespace-nowrap">{r.date}</td>
                  <td className="py-1.5 px-3">
                    {r.inspectionId ? (
                      <button type="button" onClick={toggle} className="font-mono text-blue-600 hover:underline">
                        {r.reportDisplay}
                      </button>
                    ) : (
                      <span className="font-mono">{r.reportDisplay}</span>
                    )}
                  </td>
                  <td className="py-1.5 px-3">{r.level || '—'}</td>
                  <td className="py-1.5 px-3 whitespace-nowrap">{r.plate || '—'}</td>
                  <td className="py-1.5 px-3">
                    {r.violTotal > 0
                      ? `${r.violTotal} violation${r.violTotal === 1 ? '' : 's'}${
                          r.oosTotal > 0 ? ` · ${r.oosTotal} OOS` : ''
                        }`
                      : 'No violations'}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={6} className="px-4 pb-4 pt-2">
                      <InspectionDetail
                        inspectionId={r.inspectionId}
                        report={r.reportNumber}
                        state={r.reportState}
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
  );
}


