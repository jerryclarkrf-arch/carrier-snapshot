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
      return {
        date: fmtDate(str(r, 'insp_date')),
        report: str(r, 'report_number') || str(r, 'inspection_id') || 'Unknown',
        state: str(r, 'report_state') || 'N/A',
        level: LEVELS[str(r, 'insp_level_id') || ''] || `Level ${str(r, 'insp_level_id') || '?'}`,
        summary,
      };
    });

    cache.set(dot, { ts: Date.now(), data: inspections });
    return NextResponse.json({ inspections });
  } catch {
    return NextResponse.json({ inspections: [] });
  }
}