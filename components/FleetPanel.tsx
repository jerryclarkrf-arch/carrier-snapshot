'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import InspectionDetail from '@/components/InspectionDetail';
import { ChevronRightIcon } from '@/components/icons';

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
      <p className="text-sm leading-6 text-steel">
        <Link
          href="/auth/sign-in"
          className="font-medium text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
        >
          Sign in
        </Link>{' '}
        to view equipment and fleet details.
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-sm leading-6 text-alert">
        Equipment data could not be loaded. Please try again.
      </p>
    );
  }

  if (!data) {
    return (
      <div className="space-y-2" aria-busy="true">
        <span className="sr-only">Loading equipment data</span>
        <div className="h-3 w-56 animate-pulse bg-ink/10" />
        <div className="h-3 w-full animate-pulse bg-ink/5" />
        <div className="h-3 w-4/5 animate-pulse bg-ink/5" />
      </div>
    );
  }

  if (data.equipment.length === 0 && data.fleet.length === 0) {
    return (
      <p className="text-sm leading-6 text-steel">
        No vehicle-level inspection data is published for this carrier. FMCSA
        only releases VIN and equipment detail for inspections included in the
        SMS snapshot.
      </p>
    );
  }

  const max = Math.max(...data.equipment.map((e) => e.count), 1);

  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
        {data.totals.unitAppearances.toLocaleString()} unit appearances across inspections
        {data.totals.distinctVehicles > 0 &&
          ` · ${data.totals.distinctVehicles.toLocaleString()} distinct vehicle${data.totals.distinctVehicles === 1 ? '' : 's'} identified by VIN`}
        {data.truncated && ' · showing the 100 most-inspected vehicles'}
      </p>

      {data.equipment.length > 0 && (
        <div className="space-y-2">
          {data.equipment.map((e) => (
            <div
              key={`${e.role}-${e.type}`}
              className="flex flex-wrap items-center gap-2 text-xs sm:flex-nowrap"
            >
              <span className="w-full shrink-0 truncate text-ink sm:w-40">
                {titleCase(e.type)}
              </span>
              <span className="w-16 shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-steel">
                {e.role}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden bg-paper">
                <span
                  className="block h-full bg-ink"
                  style={{ width: `${Math.max(4, Math.round((e.count / max) * 100))}%` }}
                />
              </span>
              <span className="w-12 text-right font-mono text-[11px] tabular-nums text-ink">
                {e.count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {data.fleet.length > 0 && (
        <div className="overflow-hidden border border-ink/15 bg-white">
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  <span className="sr-only">Expand vehicle</span>
                </th>
                <th>VIN</th>
                <th>Type</th>
                <th>Manufacturer</th>
                <th>Inspections</th>
              </tr>
            </thead>
            <tbody>
              {data.fleet.map((v) => {
                const isOpen = openVin === v.vin;
                const toggle = () => setOpenVin(isOpen ? null : v.vin);
                return (
                  <Fragment key={v.vin}>
                    <tr className={isOpen ? 'bg-paper/60' : undefined}>
                      <td className="w-12">
                        <button
                          type="button"
                          onClick={toggle}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Hide inspections for this vehicle' : 'Show inspections for this vehicle'}
                          className="flex h-11 w-11 items-center justify-center text-steel transition-colors hover:text-ink"
                        >
                          <ChevronRightIcon
                            size={16}
                            className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
                          />
                        </button>
                      </td>
                      <td data-label="VIN">
                        <button
                          type="button"
                          onClick={toggle}
                          className="inline-flex min-h-11 items-center font-mono text-[11px] text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
                        >
                          {v.vin}
                        </button>
                      </td>
                      <td data-label="Type">{titleCase(v.type) || '—'}</td>
                      <td data-label="Manufacturer">{v.make || '—'}</td>
                      <td data-label="Inspections" className="text-right font-mono text-[11px] tabular-nums">
                        {v.inspections}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} className="data-table-detail bg-paper/40">
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

  if (failed) {
    return (
      <p className="text-sm leading-6 text-alert">
        This vehicle&apos;s inspections could not be loaded.
      </p>
    );
  }

  if (!rows) {
    return (
      <div className="space-y-2" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading inspections for this vehicle</span>
        <div className="h-3 w-2/3 animate-pulse bg-ink/10" />
        <div className="h-3 w-full animate-pulse bg-ink/5" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm leading-6 text-steel">
        No inspections recorded for this VIN.
      </p>
    );
  }

  return (
    <div className="overflow-hidden border border-ink/15 bg-white">
      <table className="data-table">
        <thead>
          <tr>
            <th>
              <span className="sr-only">Expand report</span>
            </th>
            <th>Date</th>
            <th>Report #</th>
            <th>Level</th>
            <th>Plate</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = r.inspectionId || `${r.reportState}-${r.reportNumber}`;
            const isOpen = openReport === key;
            const toggle = () => {
              if (r.inspectionId) setOpenReport(isOpen ? null : key);
            };
            return (
              <Fragment key={key}>
                <tr className={isOpen ? 'bg-paper/60' : undefined}>
                  <td className="w-12">
                    {r.inspectionId ? (
                      <button
                        type="button"
                        onClick={toggle}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? 'Hide report details' : 'Show report details'}
                        className="flex h-11 w-11 items-center justify-center text-steel transition-colors hover:text-ink"
                      >
                        <ChevronRightIcon
                          size={16}
                          className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
                        />
                      </button>
                    ) : null}
                  </td>
                  <td data-label="Date" className="whitespace-nowrap font-mono text-[11px]">
                    {r.date}
                  </td>
                  <td data-label="Report #">
                    {r.inspectionId ? (
                      <button
                        type="button"
                        onClick={toggle}
                        className="inline-flex min-h-11 items-center font-mono text-[11px] text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
                      >
                        {r.reportDisplay}
                      </button>
                    ) : (
                      <span className="font-mono text-[11px]">{r.reportDisplay}</span>
                    )}
                  </td>
                  <td data-label="Level">{r.level || '—'}</td>
                  <td data-label="Plate" className="whitespace-nowrap">
                    {r.plate || '—'}
                  </td>
                  <td data-label="Result">
                    {r.violTotal > 0
                      ? `${r.violTotal} violation${r.violTotal === 1 ? '' : 's'}${
                          r.oosTotal > 0 ? ` · ${r.oosTotal} OOS` : ''
                        }`
                      : 'No violations'}
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={6} className="data-table-detail bg-paper/40">
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


