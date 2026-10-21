import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

const CRASH = 'https://data.transportation.gov/resource/4wxs-vbns.json';
const TTL = 30 * 60 * 1000;
const cache = new Map<string, { ts: number; data: unknown }>();
const H = { 'X-App-Token': process.env.DOT_APP_TOKEN || '' };

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => {
  const v = r[k];
  return v === undefined || v === null ? undefined : String(v);
};
const flag = (v: unknown) => v === true || v === 'true' || v === 'Y' || v === 'y';

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

function fmtDate(v?: string) {
  if (!v) return 'N/A';
  const m = v.match(/^(\d{1,2})-([A-Z]{3})-(\d{2})$/i);
  if (m) {
    const mo = MONTHS[m[2].toUpperCase()];
    const yr = Number(m[3]) < 70 ? `20${m[3]}` : `19${m[3]}`;
    return mo ? `${mo}/${m[1].padStart(2, '0')}/${yr}` : v;
  }
  const s = String(v).slice(0, 10).replace(/-/g, '');
  if (s.length === 8) return `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}`;
  return v;
}

const toTs = (v?: string) => {
  const m = String(v || '').match(/^(\d{1,2})-([A-Z]{3})-(\d{2})$/i);
  if (m) {
    const mo = MONTHS[(m[2] || '').toUpperCase()];
    const yr = Number(m[3]) < 70 ? `20${m[3]}` : `19${m[3]}`;
    if (mo) return Date.parse(`${yr}-${mo}-${m[1].padStart(2, '0')}T00:00:00Z`) || 0;
  }
  const s = String(v || '').slice(0, 10).replace(/-/g, '');
  return s.length === 8 ? Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`) || 0 : 0;
};

export async function GET(req: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dot = (new URL(req.url).searchParams.get('dot') || '').replace(/^0+/, '');
  if (!dot) return NextResponse.json({ error: 'dot param required' }, { status: 400 });

  const hit = cache.get(dot);
  if (hit && Date.now() - hit.ts < TTL) return NextResponse.json(hit.data);

  try {
    const res = await fetch(
      `${CRASH}?$limit=100&$where=${encodeURIComponent(`dot_number='${dot}'`)}`,
      { headers: H },
    );
    const rows = await res.json();
    if (!Array.isArray(rows)) {
      return NextResponse.json({ crashes: [] });
    }

    const crashes = rows
      .map((r: Row) => ({
        date: fmtDate(str(r, 'report_date')),
        report: str(r, 'report_number') || 'Unknown',
        state: str(r, 'report_state') || 'N/A',
        fatalities: Number(str(r, 'fatalities')) || 0,
        injuries: Number(str(r, 'injuries')) || 0,
        towAway: flag(r.tow_away),
        hazmat: flag(r.hazmat_released),
        vehicle: [str(r, 'vehicle_license_number'), str(r, 'vehicle_license_state')].filter(Boolean).join(' ') || 'N/A',
        conditions: [str(r, 'weather_condition_desc'), str(r, 'light_condition_desc')]
          .filter(Boolean)
          .join(' · ') || 'N/A',
        road: str(r, 'road_surface_condition_desc') || 'N/A',
      }))
      .sort((a, b) => toTs(b.date) - toTs(a.date))
      .slice(0, 50);

    const total = crashes.length;
    const fatal = crashes.filter((c) => c.fatalities > 0).length;
    const withInjury = crashes.filter((c) => c.injuries > 0).length;
    const towAway = crashes.filter((c) => c.towAway).length;

    const payload = { crashes, summary: { total, fatal, withInjury, towAway } };
    cache.set(dot, { ts: Date.now(), data: payload });
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ crashes: [], summary: { total: 0, fatal: 0, withInjury: 0, towAway: 0 } });
  }
}