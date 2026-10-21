import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

// SMS results are published live as four SODA tables (refresh monthly, mirroring the
// downloads at ai.fmcsa.dot.gov/SMS/Tools/Downloads.aspx). Property carriers live in the
// PassProperty files (measures + counts, no percentiles); passenger carriers also have
// percentile ranks in the Pass files. Crash counts come from the SMS Input - Crash table.
const SMS_DATASETS = [
  { id: '4y6x-dmck', kind: 'ab_pass_property' },
  { id: 'h9zy-gjn8', kind: 'c_pass_property' },
  { id: 'm3ry-qcip', kind: 'ab_pass' },
  { id: 'h3zn-uid9', kind: 'c_pass' },
];
const CRASH = 'https://data.transportation.gov/resource/4wxs-vbns.json';
const TTL = 30 * 60 * 1000;
const cache = new Map<string, { ts: number; data: unknown }>();
const H = { 'X-App-Token': process.env.DOT_APP_TOKEN || '' };

const BASICS = [
  { key: 'unsafeDriving', col: 'unsafe_driv', label: 'Unsafe Driving' },
  { key: 'hoursOfService', col: 'hos_driv', label: 'Hours-of-Service (HOS) Compliance' },
  { key: 'driverFitness', col: 'driv_fit', label: 'Driver Fitness' },
  { key: 'controlledSubs', col: 'contr_subst', label: 'Controlled Substances / Alcohol' },
  { key: 'vehicleMaintenance', col: 'veh_maint', label: 'Vehicle Maintenance' },
];

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const toPct = (v: unknown): number | null => {
  const s = String(v ?? '').trim();
  return /^\d+%?$/.test(s) ? Number(s.replace('%', '')) : null;
};

export async function GET(req: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dot = (new URL(req.url).searchParams.get('dot') || '').replace(/^0+/, '');
  if (!dot) return NextResponse.json({ error: 'dot param required' }, { status: 400 });

  const hit = cache.get(dot);
  if (hit && Date.now() - hit.ts < TTL) return NextResponse.json(hit.data);

  const fetchRow = async (id: string) => {
    const res = await fetch(
      `https://data.transportation.gov/resource/${id}.json?$limit=1&$where=${encodeURIComponent(`dot_number='${dot}'`)}`,
      { headers: H }
    );
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? (data[0] as Record<string, unknown>) : null;
  };

  try {
    const [abProperty, cProperty, abPass, cPass, crashRes] = await Promise.all([
      fetchRow(SMS_DATASETS[0].id),
      fetchRow(SMS_DATASETS[1].id),
      fetchRow(SMS_DATASETS[2].id),
      fetchRow(SMS_DATASETS[3].id),
      fetch(`${CRASH}?$select=count(*)&$where=${encodeURIComponent(`dot_number='${dot}'`)}`, { headers: H }),
    ]);

    const crashData = await crashRes.json();
    const crashes = Array.isArray(crashData) && crashData[0] ? Number(crashData[0].count) || 0 : null;

    const row = abProperty || cProperty || abPass || cPass;
    if (!row) {
      const payload = { available: true, found: false, crashes, basics: [], counts: null };
      cache.set(dot, { ts: Date.now(), data: payload });
      return NextResponse.json(payload);
    }

    const kinds = [];
    if (abProperty) kinds.push('ab_pass_property');
    if (cProperty) kinds.push('c_pass_property');
    if (abPass) kinds.push('ab_pass');
    if (cPass) kinds.push('c_pass');

    // Percentile ranks only exist in the passenger files; a carrier can appear in
    // both property and passenger datasets, so read percentiles from the passenger row.
    const pctRow = abPass || cPass;
    const basics = BASICS.map((b) => {
      return {
        key: b.key,
        label: b.label,
        measure: toNum(row[`${b.col}_measure`]),
        inspectionsWithViolations: toNum(row[`${b.col}_insp_w_viol`]),
        percentile: pctRow ? toPct(pctRow[`${b.col}_pct`]) : null,
      };
    });

    const payload = {
      available: true,
      found: true,
      source: kinds.join('+'),
      basics,
      counts: {
        inspections: toNum(row.insp_total),
        driverInspections: toNum(row.driver_insp_total),
        driverOutOfService: toNum(row.driver_oos_insp_total),
        vehicleInspections: toNum(row.vehicle_insp_total),
        vehicleOutOfService: toNum(row.vehicle_oos_insp_total),
      },
      crashes,
    };
    cache.set(dot, { ts: Date.now(), data: payload });
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { available: false, reason: 'error', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}