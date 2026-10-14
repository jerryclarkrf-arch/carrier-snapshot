import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CENSUS = 'https://data.transportation.gov/resource/az4n-8mr2.json';
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { ts: number; data: unknown }>();

function cached(key: string) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;
  cache.delete(key);
  return null;
}

const STATUS: Record<string, string> = { A: 'Active', I: 'Inactive', P: 'Pending' };
const esc = (s: string) => s.replace(/'/g, "''");
const num = (v: any) => (v !== undefined && v !== null && v !== '' ? Number(v) : null);

function fmtDate(v?: string | null) {
  if (!v) return null;
  const s = String(v).slice(0, 10).replace(/-/g, '');
  return s.length === 8 ? `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}` : v;
}

function mapCarrier(r: any) {
  const prefix = r.docket1prefix || '';
  const num1 = r.docket1 || '';
  const flag = (v: any) => v === 'Y' || v === 'X';
  return {
    usdot: String(r.dot_number || '').replace(/^0+/, '') || String(r.dot_number),
    docketDigits: num1,
    docket: prefix && num1 ? `${prefix}${num1}` : num1 || null,
    legalName: r.legal_name || null,
    dba: r.dba_name || null,
    dotStatus: STATUS[(r.status_code || '').toUpperCase()] || r.status_code || 'Unknown',
    authStatus: STATUS[(r.docket1_status_code || '').toUpperCase()] || r.docket1_status_code || 'Unknown',
    authType: r.classdef || null,
    phone: r.phone || r.bus_telno || null,
    email: r.email_address || null,
    powerUnits: num(r.power_units) ?? num(r.owntract),
    drivers: num(r.total_drivers) ?? num(r.total_cdl),
    phy: { street: r.phy_street, city: r.phy_city, state: r.phy_state, zip: r.phy_zip },
    mail: { street: r.carrier_mailing_street, city: r.carrier_mailing_city, state: r.carrier_mailing_state, zip: r.carrier_mailing_zip },
    cargo: {
      'General Freight': flag(r.crgo_genfreight),
      'Fresh Produce': flag(r.crgo_freshprod),
      'Meat': flag(r.crgo_meat),
      'Refrigerated': flag(r.crgo_coldfood),
      'Hazmat': flag(r.hm_ind),
    },
    addDate: fmtDate(r.add_date),
    mcs150: fmtDate(r.mcsipdate),
  };
}

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const limit = Math.min(parseInt(p.get('limit') || '25', 10) || 25, 50);
  const offset = parseInt(p.get('offset') || '0', 10) || 0;

  // Universal (simple page)
  const q = (p.get('q') || '').trim();
  // Discrete (advanced page)
  const fName = (p.get('name') || '').trim();
  const fDba = (p.get('dba') || '').trim();
  const fUsdot = (p.get('usdot') || '').trim().replace(/^0+/, '');
  const fMc = (p.get('mc') || '').trim().replace(/\D/g, '');
  const fPhone = (p.get('phone') || '').trim().replace(/\D/g, '');
  const fCity = (p.get('city') || '').trim();
  const fZip = (p.get('zip') || '').trim();
  // Shared filters
  const state = (p.get('state') || '').trim().toUpperCase();
  const status = p.get('status') || 'all';
  const added = parseInt(p.get('added') || '', 10);

  const hasDiscrete = !!(fName || fDba || fUsdot || fMc || fPhone || fCity || fZip);
  if (!q && !hasDiscrete && !state && status === 'all' && !added) {
    return NextResponse.json({ error: 'Enter a search term or pick at least one filter.' }, { status: 400 });
  }

  const cacheKey = JSON.stringify([q, fName, fDba, fUsdot, fMc, fPhone, fCity, fZip, state, status, added, limit, offset]);
  const hit = cached(cacheKey);
  if (hit) return NextResponse.json({ results: hit, cached: true });

  const wheres: string[] = [];
  let dbaUsed = false;

  if (hasDiscrete) {
    if (fUsdot) wheres.push(`dot_number='${esc(fUsdot)}'`);
    if (fMc) wheres.push(`docket1='${esc(fMc)}'`);
    if (fPhone) wheres.push(`phone like '%${esc(fPhone)}%'`);
    if (fName) wheres.push(`upper(legal_name) like '%${esc(fName.toUpperCase())}%'`);
    if (fDba) { wheres.push(`upper(dba_name) like '%${esc(fDba.toUpperCase())}%'`); dbaUsed = true; }
    if (fCity) wheres.push(`upper(phy_city) like '%${esc(fCity.toUpperCase())}%'`);
    if (fZip) wheres.push(`phy_zip like '%${esc(fZip)}%'`);
  } else {
    const stripped = q.replace(/[\s-]/g, '');
    const mcMatch = stripped.match(/^(MC|FF|MX)(\d+)$/i);
    const digits = mcMatch ? mcMatch[2] : stripped.replace(/\D/g, '');
    const isNumeric = /^\d+$/.test(stripped) || !!mcMatch;
    if (isNumeric && digits) {
      wheres.push(`(dot_number='${esc(digits)}' OR docket1='${esc(digits)}' OR phone like '%${esc(digits)}%')`);
    } else if (q) {
      wheres.push(`upper(legal_name) like '%${esc(q.toUpperCase())}%'`);
    }
  }

  if (state) wheres.push(`phy_state='${esc(state)}'`);
  if (status === 'active') wheres.push(`docket1_status_code='A'`);
  if (added > 0) {
    const cutoff = new Date(Date.now() - added * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    wheres.push(`add_date>='${cutoff}'`);
    wheres.push(`docket1_status_code='A'`);
  }

  const order = added > 0 ? `&$order=${encodeURIComponent('add_date DESC')}` : '';
  const dotFetch = async (where: string) => {
    const url = `${CENSUS}?$limit=${limit}&$offset=${offset}&$where=${encodeURIComponent(where)}${order}`;
    const res = await fetch(url, { headers: { 'X-App-Token': process.env.DOT_APP_TOKEN || '' } });
    return { res, data: await res.json() };
  };

  try {
    let { res, data } = await dotFetch(wheres.join(' AND '));

    // Fallback: if dba_name column doesn't exist in this dataset, retry without it
    if ((!res.ok || !Array.isArray(data)) && dbaUsed) {
      const retryWheres = wheres.filter((w) => !w.includes('dba_name'));
      ({ res, data } = await dotFetch(retryWheres.join(' AND ')));
      console.warn('dba_name column not supported — DBA filter skipped');
    }

    if (!res.ok || !Array.isArray(data)) {
      return NextResponse.json({ error: 'DOT search failed', detail: data }, { status: 502 });
    }

    let results = data.map(mapCarrier);

    if (!hasDiscrete && q) {
      const stripped = q.replace(/[\s-]/g, '');
      const digits = stripped.replace(/\D/g, '');
      if (/^\d+$/.test(stripped) || /^(MC|FF|MX)\d+$/i.test(stripped)) {
        const exact = results.filter((c) => c.usdot === digits || c.docketDigits === digits);
        if (exact.length > 0) results = exact;
      }
    }

    cache.set(cacheKey, { ts: Date.now(), data: results });
    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}