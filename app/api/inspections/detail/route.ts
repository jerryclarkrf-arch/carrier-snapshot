import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Full roadside inspection report, assembled from three complementary SODA files:
//   fx4q-ay7w  Vehicle Inspection File         -> report header (times, shipper, weight, level)
//   rbkj-cgst  SMS Input - Inspection          -> vehicle units (VIN, type, make, plate), unit 1 & 2
//   876r-jsdb  Vehicle Inspections & Violations -> every cited violation with description + OOS flag
// FMCSA publishes no vehicle year/model, so those are decoded from the VIN via NHTSA vPIC
// and cached in Postgres (a VIN's attributes never change).
const INSP = 'https://datahub.transportation.gov/resource/fx4q-ay7w.json';
const UNITS = 'https://datahub.transportation.gov/resource/rbkj-cgst.json';
const VIOL = 'https://datahub.transportation.gov/resource/876r-jsdb.json';
const VPIC = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';
const TTL = 30 * 60 * 1000;
const cache = new Map<string, { ts: number; data: unknown }>();
const H = { 'X-App-Token': process.env.DOT_APP_TOKEN || '' };

const LEVELS: Record<string, string> = {
  '1': 'I. Full',
  '2': 'II. Walk-Around',
  '3': 'III. Driver-Only',
  '4': 'IV. Special Study',
  '5': 'V. Vehicle-Only',
  '6': 'VI. Enhanced',
};
const FACILITIES: Record<string, string> = { R: 'Roadside', F: 'Fixed facility' };
const VIOL_UNITS: Record<string, string> = {
  '1': 'Vehicle 1',
  '2': 'Vehicle 2',
  '3': 'Vehicle 3',
  '4': 'Vehicle 4',
  '5': 'Vehicle 5',
  '6': 'Vehicle 6',
  D: 'Driver',
  C: 'Co-driver',
  M: 'Motor carrier',
};

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => {
  const v = r[k];
  return v === undefined || v === null ? '' : String(v);
};
const int = (r: Row, k: string) => {
  const n = parseInt(str(r, k), 10);
  return Number.isFinite(n) ? n : 0;
};
const esc = (s: string) => s.replace(/'/g, "''");

function fmtDate(v: string) {
  const s = v.slice(0, 10).replace(/-/g, '');
  return s.length === 8 ? `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}` : v;
}

// MCMIS stores inspection times as HHMM (e.g. 1243 -> 12:43 PM).
function fmtTime(v: string) {
  const s = v.replace(/\D/g, '');
  if (s.length < 3) return '';
  const hours = Number(s.slice(0, s.length - 2));
  const minutes = s.slice(-2);
  if (!Number.isFinite(hours) || hours > 23 || Number(minutes) > 59) return '';
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${suffix}`;
}

function fmtWeight(v: string) {
  const n = Number(v);
  return v && Number.isFinite(n) ? `${n.toLocaleString('en-US')} lb` : '';
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

const unitsUrl = (reportNumber: string, reportState: string) =>
  `${UNITS}?$where=${encodeURIComponent(`report_number='${esc(reportNumber)}' AND report_state='${esc(reportState)}'`)}&$limit=5`;

type VinInfo = { make: string; model: string; modelYear: string; bodyClass: string; gvwr: string };

async function readVinCache(vin: string): Promise<VinInfo | null> {
  try {
    const rows = await query<Record<string, unknown>>(
      'SELECT make, model, model_year, body_class, gvwr FROM vin_decode WHERE vin = $1',
      [vin]
    );
    const r = rows[0];
    if (!r) return null;
    return {
      make: String(r.make ?? ''),
      model: String(r.model ?? ''),
      modelYear: String(r.model_year ?? ''),
      bodyClass: String(r.body_class ?? ''),
      gvwr: String(r.gvwr ?? ''),
    };
  } catch {
    // Cache is optional: a missing table or DATABASE_URL must not break the report.
    return null;
  }
}

async function writeVinCache(vin: string, v: VinInfo) {
  try {
    await query(
      `INSERT INTO vin_decode (vin, make, model, model_year, body_class, gvwr)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (vin) DO UPDATE SET
         make = EXCLUDED.make,
         model = EXCLUDED.model,
         model_year = EXCLUDED.model_year,
         body_class = EXCLUDED.body_class,
         gvwr = EXCLUDED.gvwr,
         decoded_at = now()`,
      [vin, v.make, v.model, v.modelYear, v.bodyClass, v.gvwr]
    );
  } catch {
    // best-effort cache write
  }
}

async function decodeVin(vin: string): Promise<VinInfo | null> {
  const cached = await readVinCache(vin);
  if (cached) return cached;
  try {
    const res = await fetch(`${VPIC}/${encodeURIComponent(vin)}?format=json`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { Results?: Record<string, unknown>[] };
    const r = j.Results?.[0];
    if (!r) return null;
    const info: VinInfo = {
      make: String(r.Make ?? ''),
      model: String(r.Model ?? ''),
      modelYear: String(r.ModelYear ?? ''),
      bodyClass: String(r.BodyClass ?? ''),
      gvwr: String(r.GVWR ?? ''),
    };
    await writeVinCache(vin, info);
    return info;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const id = (params.get('id') || '').replace(/\D/g, '');
  if (!id) return NextResponse.json({ error: 'id param required' }, { status: 400 });

  const hit = cache.get(id);
  if (hit && Date.now() - hit.ts < TTL) return NextResponse.json(hit.data);

  // The inspections list already knows state + report number, which lets all three
  // SODA calls run in parallel instead of header-then-units.
  const hintReport = (params.get('report') || '').replace(/[^A-Za-z0-9]/g, '');
  const hintState = (params.get('state') || '').replace(/[^A-Za-z]/g, '').toUpperCase();

  try {
    const headerP = fetchRows(`${INSP}?$where=${encodeURIComponent(`inspection_id='${id}'`)}&$limit=1`);
    const violP = fetchRows(`${VIOL}?$where=${encodeURIComponent(`inspection_id='${id}'`)}&$order=seq_no&$limit=100`);
    const hintedUnitsP = hintReport && hintState ? fetchRows(unitsUrl(hintReport, hintState)) : null;

    const [headerRows, violRows] = await Promise.all([headerP, violP]);
    const header = headerRows[0];
    if (!header) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });

    let unitRows: Row[];
    if (hintedUnitsP) {
      unitRows = await hintedUnitsP;
    } else {
      const st = str(header, 'report_state');
      const rn = str(header, 'report_number');
      unitRows = st && rn ? await fetchRows(unitsUrl(rn, st)) : [];
    }

    const vins = Array.from(
      new Set(unitRows.flatMap((r) => [str(r, 'vin'), str(r, 'vin2')]).filter((v) => v.length === 17))
    );
    const decoded = new Map<string, VinInfo | null>();
    await Promise.all(vins.map(async (vin) => decoded.set(vin, await decodeVin(vin))));

    const units = unitRows.flatMap((r) => {
      const sides = [
        { unit: 1, type: 'unit_type_desc', make: 'unit_make', plate: 'unit_license', plateState: 'unit_license_state', vin: 'vin', decal: 'unit_decal_number' },
        { unit: 2, type: 'unit_type_desc2', make: 'unit_make2', plate: 'unit_license2', plateState: 'unit_license_state2', vin: 'vin2', decal: 'unit_decal_number2' },
      ];
      return sides.flatMap((s) => {
        const vin = str(r, s.vin);
        const type = str(r, s.type);
        const make = str(r, s.make);
        const license = str(r, s.plate);
        if (!vin && !type && !make && !license) return [];
        const d = decoded.get(vin) || null;
        return [
          {
            unit: s.unit,
            type,
            make,
            license,
            licenseState: str(r, s.plateState),
            vin,
            decal: str(r, s.decal),
            year: d?.modelYear || '',
            model: d?.model || '',
            bodyClass: d?.bodyClass || '',
            gvwr: d?.gvwr || '',
          },
        ];
      });
    });

    const violations = violRows
      .map((r) => ({
        seqNo: int(r, 'seq_no'),
        code: str(r, 'viol_code'),
        description: str(r, 'viol_desc'),
        unit: VIOL_UNITS[str(r, 'insp_viol_unit')] || str(r, 'insp_viol_unit'),
        oos: str(r, 'out_of_service_indicator').toUpperCase() === 'Y',
        partNo: str(r, 'part_no'),
        partSection: str(r, 'part_no_section'),
        citation: str(r, 'citation_number') === '--' ? '' : str(r, 'citation_number'),
      }))
      .sort((a, b) => a.seqNo - b.seqNo);

    const street = str(header, 'insp_carrier_street');
    const city = str(header, 'insp_carrier_city');
    const carrierState = str(header, 'insp_carrier_state');
    const zip = str(header, 'insp_carrier_zip_code');
    const cityLine = [city, carrierState].filter(Boolean).join(', ') + (zip ? ` ${zip}` : '');

    const payload = {
      header: {
        inspectionId: id,
        reportNumber: str(header, 'report_number'),
        reportState: str(header, 'report_state'),
        reportDisplay: `${str(header, 'report_state')}${str(header, 'report_number')}`,
        date: fmtDate(str(header, 'insp_date')),
        timeStart: fmtTime(str(header, 'insp_start_time')),
        timeEnd: fmtTime(str(header, 'insp_end_time')),
        level: LEVELS[str(header, 'insp_level_id')] || `Level ${str(header, 'insp_level_id') || '?'}`,
        facility: FACILITIES[str(header, 'insp_facility').toUpperCase()] || str(header, 'insp_facility'),
        shipper: str(header, 'shipper_name'),
        shippingPaper: str(header, 'shipping_paper_number'),
        location: str(header, 'location_desc'),
        county: [str(header, 'county_code'), str(header, 'county_code_state')].filter(Boolean).join(' / '),
        grossWeight: fmtWeight(str(header, 'gross_comb_veh_wt')),
        interstate: str(header, 'insp_interstate').toUpperCase() === 'Y',
        hazmatPlacard: str(header, 'hazmat_placard_req').toUpperCase() === 'Y',
        dotNumber: str(header, 'dot_number'),
        carrierName: str(header, 'insp_carrier_name'),
        carrierAddress: [street, cityLine.trim()].filter(Boolean).join(', '),
        violTotal: int(header, 'viol_total'),
        oosTotal: int(header, 'oos_total'),
        driverViolTotal: int(header, 'driver_viol_total'),
        vehicleViolTotal: int(header, 'vehicle_viol_total'),
        hazmatViolTotal: int(header, 'hazmat_viol_total'),
        // FMCSA ships no "in SMS" flag (ci_status_code is always 'C'). An inspection only
        // appears in the SMS input file when it counts toward SMS, so presence is the signal.
        smsIncluded: unitRows.length > 0,
      },
      units,
      violations,
    };

    cache.set(id, { ts: Date.now(), data: payload });
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { error: 'Inspection lookup failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}




