import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

const REVOKE = 'https://data.transportation.gov/resource/wb4f-neki.json';
const AUTHHIST = 'https://data.transportation.gov/resource/yu5v-wbh6.json';
const TTL = 30 * 60 * 1000;
const cache = new Map<string, { ts: number; data: unknown }>();

function fmtDate(v?: string | null) {
  if (!v) return null;
  const s = String(v).slice(0, 10).replace(/-/g, '');
  if (s.length !== 8) return v;
  const mo = s.slice(4, 6);
  const dy = s.slice(6, 8);
  const yr = s.slice(0, 4);
  const d = new Date(`${yr}-${mo}-${dy}T00:00:00Z`);
  return isNaN(d.getTime()) ? v : `${mo}/${dy}/${yr}`;
}

const titleCase = (s: string) =>
  s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/(^|\s)\w/g, (c) => c.toUpperCase());

export async function GET(req: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dot = (new URL(req.url).searchParams.get('dot') || '').replace(/^0+/, '');
  if (!dot) return NextResponse.json({ error: 'dot param required' }, { status: 400 });

  const hit = cache.get(dot);
  if (hit && Date.now() - hit.ts < TTL) return NextResponse.json({ events: hit.data, cached: true });

  const headers = { 'X-App-Token': process.env.DOT_APP_TOKEN || '' };

  try {
    const [revokeRes, authRes] = await Promise.all([
      fetch(`${REVOKE}?$limit=50&$where=usdot_number='${dot}'&$order=order1_effective_date DESC`, { headers }),
      fetch(`${AUTHHIST}?$limit=50&$where=usdot_number='${dot}'&$order=status_change_date DESC`, { headers }),
    ]);
    const [revoke, auth] = await Promise.all([revokeRes.json(), authRes.json()]);

    const events: { date: string; label: string }[] = [];

    if (Array.isArray(revoke)) {
      for (const r of revoke) {
        const label = titleCase(r.order1_type_desc || 'Authority Order');
        events.push({ date: fmtDate(r.order1_effective_date || r.order1_serve_date) || 'N/A', label });
      }
    }
    if (Array.isArray(auth)) {
      for (const r of auth) {
        const reason = r.reason ? titleCase(r.reason) : r.op_auth_status || 'Status change';
        const docket = r.docket_number ? ` — ${r.docket_number}` : '';
        events.push({ date: fmtDate(r.status_change_date) || 'N/A', label: `${reason}${docket}` });
      }
    }

    const deduped = Array.from(new Map(events.map((e) => [`${e.date}|${e.label}`, e])).values())
      .sort((a, b) => (a.date === 'N/A' ? 1 : b.date === 'N/A' ? -1 : b.date.localeCompare(a.date)))
      .slice(0, 50);

    cache.set(dot, { ts: Date.now(), data: deduped });
    return NextResponse.json({ events: deduped, cached: false });
  } catch {
    return NextResponse.json({ events: [], cached: false });
  }
}