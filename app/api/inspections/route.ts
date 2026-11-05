import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

const INSP = 'https://data.transportation.gov/resource/fx4q-ay7w.json';
const TTL = 30 * 60 * 1000;
const cache = new Map<string, { ts: number; data: unknown }>();

const LEVELS: Record<string, string> = {
  '1': 'Level 1 — Full',
  '2': 'Level 2 — Walk-Around',
  '3': 'Level 3 — Driver Only',
  '4': 'Level 4 — Special Study',
  '5': 'Level 5 — Vehicle Only',
  '6': 'Level 6 — Enhanced',
};

function fmtDate(v?: string) {
  if (!v) return 'N/A';
  const s = String(v).slice(0, 10).replace(/-/g, '');
  return s.length === 8 ? `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}` : v;
}

// MCMIS stores inspection times as HHMM (e.g. 1243 -> 12:43 PM).
function fmtTime(v?: string) {
  const s = String(v || '').replace(/\D/g, '');
  if (s.length < 3) return null;
  const hours = Number(s.slice(0, s.length - 2));
  const minutes = s.slice(-2);
  if (!Number.isFinite(hours) || hours > 23 || Number(minutes) > 59) return null;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${minutes} ${suffix}`;
}

export async function GET(req: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dot = (new URL(req.url).searchParams.get('dot') || '').replace(/^0+/, '');
  if (!dot) return NextResponse.json({ error: 'dot param required' }, { status: 400 });

  const hit = cache.get(dot);
  if (hit && Date.now() - hit.ts < TTL) return NextResponse.json({ inspections: hit.data, cached: true });

  const where = encodeURIComponent(`dot_number='${dot}'`);
  const order = encodeURIComponent('insp_date DESC');

  try {
    const res = await fetch(`${INSP}?$limit=50&$where=${where}&$order=${order}`, {
      headers: { 'X-App-Token': process.env.DOT_APP_TOKEN || '' },
    });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data)) return NextResponse.json({ inspections: [] });

    type Row = Record<string, unknown>;
    const str = (r: Row, k: string) => {
      const v = r[k];
      return v === undefined || v === null ? undefined : String(v);
    };
    const inspections = (data as Row[]).map((r) => {
      const viol = parseInt(str(r, 'viol_total') || '0', 10);
      const oos = parseInt(str(r, 'oos_total') || '0', 10);
      let summary = 'No violations';
      if (viol > 0) {
        summary = `${viol} violation${viol > 1 ? 's' : ''}`;
        if (oos > 0) summary += ` (${oos} out-of-service)`;
      }
      const reportNumber = str(r, 'report_number') || '';
      const reportState = str(r, 'report_state') || '';
      return {
        inspectionId: str(r, 'inspection_id') || '',
        date: fmtDate(str(r, 'insp_date')),
        report: reportNumber || str(r, 'inspection_id') || 'Unknown',
        reportState,
        reportNumber,
        state: reportState || 'N/A',
        level: LEVELS[str(r, 'insp_level_id') || ''] || `Level ${str(r, 'insp_level_id') || '?'}`,
        summary,
        timeStart: fmtTime(str(r, 'insp_start_time')),
        timeEnd: fmtTime(str(r, 'insp_end_time')),
        facility: str(r, 'insp_facility') || null,
        shipper: str(r, 'shipper_name') || null,
        location: str(r, 'location_desc') || null,
        grossWeight: str(r, 'gross_comb_veh_wt') || null,
      };
    });

    cache.set(dot, { ts: Date.now(), data: inspections });
    return NextResponse.json({ inspections });
  } catch {
    return NextResponse.json({ inspections: [] });
  }
}