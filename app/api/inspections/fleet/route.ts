import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

// Equipment / fleet profile derived from the SMS Input - Inspection file (rbkj-cgst),
// which is the only public FMCSA file carrying per-vehicle data (VIN, type, make,
// plate) for both the power unit and its trailer. Counts are "unit appearances" in
// inspections inside the ~24 month SMS window, not registered fleet size.
const UNITS = 'https://datahub.transportation.gov/resource/rbkj-cgst.json';
const INSP = 'https://datahub.transportation.gov/resource/fx4q-ay7w.json';
const TTL = 30 * 60 * 1000;
const cache = new Map<string, { ts: number; data: unknown }>();
const H = { 'X-App-Token': process.env.DOT_APP_TOKEN || '' };
const FLEET_LIMIT = 100;

const LEVELS: Record<string, string> = {
  '1': 'I. Full',
  '2': 'II. Walk-Around',
  '3': 'III. Driver-Only',
  '4': 'IV. Special Study',
  '5': 'V. Vehicle-Only',
  '6': 'VI. Enhanced',
};
const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => {
  const v = r[k];
  return v === undefined || v === null ? '' : String(v);
};
const num = (r: Row, k: string) => {
  const n = parseInt(str(r, k), 10);
  return Number.isFinite(n) ? n : 0;
};
const esc = (s: string) => s.replace(/'/g, "''");
const enc = encodeURIComponent;

// rbkj-cgst dates look like 11-AUG-26; fx4q uses 20260811.
function isoDate(v: string) {
  const m = v.match(/^(\d{1,2})-([A-Z]{3})-(\d{2})$/i);
  if (m) {
    const mo = MONTHS[(m[2] || '').toUpperCase()];
    const yr = Number(m[3]) < 70 ? `20${m[3]}` : `19${m[3]}`;
    return mo ? `${yr}${mo}${m[1].padStart(2, '0')}` : '';
  }
  const s = v.slice(0, 10).replace(/-/g, '');
  return s.length === 8 ? s : '';
}

function fmtDate(v: string) {
  const s = isoDate(v);
  return s ? `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}` : v;
}

async function fetchRows(url: string): Promise<Row[]> {
  try {
    const res = await fetch(url, { headers: H, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as Row[]) : [];
  } catch {
    return [];
  }
}

type Equipment = { type: string; role: string; count: number };

async function carrierFleet(dot: string) {
  const where = `dot_number='${dot}'`;
  const [unit1, unit2, vinRows] = await Promise.all([
    fetchRows(`${UNITS}?$select=unit_type_desc,count(*)&$group=unit_type_desc&$where=${enc(where)}`),
    fetchRows(
      `${UNITS}?$select=unit_type_desc2,count(*)&$group=unit_type_desc2&$where=${enc(
        `${where} AND unit_type_desc2 IS NOT NULL`
      )}`
    ),
    fetchRows(
      `${UNITS}?$select=vin,unit_make,unit_type_desc,count(*)&$group=vin,unit_make,unit_type_desc&$where=${enc(
        where
      )}&$order=${enc('count(*) DESC')}&$limit=${FLEET_LIMIT}`
    ),
  ]);

  const mixed = new Map<string, Equipment>();
  const add = (type: string, role: string, count: number) => {
    if (!type) return;
    const key = `${role}|${type}`;
    const cur = mixed.get(key) || { type, role, count: 0 };
    cur.count += count;
    mixed.set(key, cur);
  };
  unit1.forEach((r) => add(str(r, 'unit_type_desc'), 'Power unit', num(r, 'count')));
  unit2.forEach((r) => add(str(r, 'unit_type_desc2'), 'Trailer', num(r, 'count')));

  const equipment = [...mixed.values()].sort((a, b) => b.count - a.count);
  const fleet = vinRows
    .map((r) => ({
      vin: str(r, 'vin'),
      make: str(r, 'unit_make'),
      type: str(r, 'unit_type_desc'),
      inspections: num(r, 'count'),
    }))
    .filter((v) => v.vin.length > 0);

  return {
    equipment,
    fleet,
    truncated: vinRows.length >= FLEET_LIMIT,
    totals: {
      unitAppearances: unit1.reduce((sum, r) => sum + num(r, 'count'), 0),
      distinctVehicles: fleet.length,
    },
  };
}

async function vinHistory(dot: string, vin: string) {
  const rows = await fetchRows(
    `${UNITS}?$select=report_number,report_state,insp_date,unit_type_desc,unit_make,unit_license,unit_license_state,unit_type_desc2,unit_make2,unit_license2,unit_license_state2,vin,vin2&$where=${enc(
      `dot_number='${dot}' AND (vin='${esc(vin)}' OR vin2='${esc(vin)}')`
    )}&$limit=100`
  );

  const seen = new Map<string, { number: string; state: string; rawDate: string; type: string; make: string; plate: string }>();
  for (const r of rows) {
    const number = str(r, 'report_number');
    if (!number) continue;
    const state = str(r, 'report_state');
    const key = `${state}|${number}`;
    if (seen.has(key)) continue;
    // A VIN can show up as the power unit (unit 1) or as the trailing unit (unit 2).
    const asTrailer = str(r, 'vin2') === vin;
    seen.set(key, {
      number,
      state,
      rawDate: str(r, 'insp_date'),
      type: asTrailer ? str(r, 'unit_type_desc2') : str(r, 'unit_type_desc'),
      make: asTrailer ? str(r, 'unit_make2') : str(r, 'unit_make'),
      plate: [asTrailer ? str(r, 'unit_license_state2') : str(r, 'unit_license_state'), asTrailer ? str(r, 'unit_license2') : str(r, 'unit_license')]
        .filter(Boolean)
        .join(' '),
    });
  }

  const numbers = [...new Set([...seen.values()].map((v) => v.number))];
  const inList = numbers.map((n) => `'${esc(n)}'`).join(',');
  const headers = numbers.length
    ? await fetchRows(
        `${INSP}?$select=inspection_id,report_number,insp_date,insp_level_id,viol_total,oos_total&$where=${enc(
          `dot_number='${dot}' AND report_number in(${inList})`
        )}&$limit=200`
      )
    : [];
  const byNumber = new Map(headers.map((r) => [str(r, 'report_number'), r]));

  const ordered = [...seen.values()].sort((a, b) => {
    const ha = byNumber.get(a.number);
    const hb = byNumber.get(b.number);
    const da = isoDate(ha ? str(ha, 'insp_date') : a.rawDate);
    const db = isoDate(hb ? str(hb, 'insp_date') : b.rawDate);
    return da < db ? 1 : da > db ? -1 : 0;
  });

  const inspections = ordered.map((v) => {
    const h = byNumber.get(v.number);
    const raw = h ? str(h, 'insp_date') : v.rawDate;
    return {
      inspectionId: h ? str(h, 'inspection_id') : '',
      reportNumber: v.number,
      reportState: v.state,
      reportDisplay: `${v.state}${v.number}`,
      date: fmtDate(raw),
      level: h ? LEVELS[str(h, 'insp_level_id')] || '' : '',
      violTotal: h ? num(h, 'viol_total') : 0,
      oosTotal: h ? num(h, 'oos_total') : 0,
      unitType: v.type,
      unitMake: v.make,
      plate: v.plate,
    };
  });

  return { vin, inspections };
}

export async function GET(req: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const dot = (params.get('dot') || '').replace(/^0+/, '');
  if (!dot) return NextResponse.json({ error: 'dot param required' }, { status: 400 });

  const vin = (params.get('vin') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const key = vin ? `vin:${dot}:${vin}` : `dot:${dot}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return NextResponse.json(hit.data);

  try {
    const data = vin ? await vinHistory(dot, vin) : await carrierFleet(dot);
    cache.set(key, { ts: Date.now(), data });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: 'Fleet lookup failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}

