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
const ENTITY_TYPE: Record<string, string> = { MC: 'Motor Carrier', MX: 'Broker', FF: 'Freight Forwarder' };
const ENTITY_ORDER = ['Motor Carrier', 'Broker', 'Freight Forwarder'];
const esc = (s: string) => s.replace(/'/g, "''");
type Row = Record<string, unknown>;
const str = (r: Row, k: string) => {
  const v = r[k];
  return v === undefined || v === null ? undefined : String(v);
};
const num = (v: unknown) => (v !== undefined && v !== null && v !== '' ? Number(v) : null);

function entityTypesOf(r: Row): string[] {
  const found = [str(r, 'docket1prefix'), str(r, 'docket2prefix'), str(r, 'docket3prefix')]
    .map((p) => ENTITY_TYPE[(p || '').toUpperCase()])
    .filter((t): t is string => !!t);
  return ENTITY_ORDER.filter((t) => found.includes(t));
}

function fmtDate(v?: string | null) {
  if (!v) return null;
  const s = String(v).slice(0, 10).replace(/-/g, '');
  return s.length === 8 ? `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}` : v;
}

function mapCarrier(r: Row) {
  const prefix = str(r, 'docket1prefix') || '';
  const num1 = str(r, 'docket1') || '';
  const flag = (v: unknown) => v === 'Y' || v === 'X';
  const eTypes = entityTypesOf(r);
  return {
    usdot: (str(r, 'dot_number') || '').replace(/^0+/, '') || str(r, 'dot_number'),
    docketDigits: num1,
    docket: prefix && num1 ? `${prefix}${num1}` : num1 || null,
    legalName: str(r, 'legal_name') || null,
    dba: str(r, 'dba_name') || null,
    companyOfficer: str(r, 'company_officer_1') || null,
    entityType: eTypes[0] || null,
    entityTypes: eTypes,
    dotStatus: STATUS[(str(r, 'status_code') || '').toUpperCase()] || str(r, 'status_code') || 'Unknown',
    authStatus: STATUS[(str(r, 'docket1_status_code') || '').toUpperCase()] || str(r, 'docket1_status_code') || 'Unknown',
    authType: str(r, 'classdef') || null,
    phone: str(r, 'phone') || str(r, 'bus_telno') || null,
    email: str(r, 'email_address') || null,
    powerUnits: num(r.power_units) ?? num(r.owntract),
    drivers: num(r.total_drivers) ?? num(r.total_cdl),
    phy: { street: str(r, 'phy_street'), city: str(r, 'phy_city'), state: str(r, 'phy_state'), zip: str(r, 'phy_zip') },
    mail: { street: str(r, 'carrier_mailing_street'), city: str(r, 'carrier_mailing_city'), state: str(r, 'carrier_mailing_state'), zip: str(r, 'carrier_mailing_zip') },
    cargo: {
      'General Freight': flag(r.crgo_genfreight),
      'Fresh Produce': flag(r.crgo_freshprod),
      'Meat': flag(r.crgo_meat),
      'Refrigerated': flag(r.crgo_coldfood),
      'Hazmat': flag(r.hm_ind),
    },
    addDate: fmtDate(str(r, 'add_date')),
    mcs150: fmtDate(str(r, 'mcsipdate')),
  };
}

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const limit = Math.min(parseInt(p.get('limit') || '50', 10) || 50, 50);
  const page = Math.max(parseInt(p.get('page') || '1', 10) || 1, 1);
  const offset = (page - 1) * limit;

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
  const addedFrom = (p.get('addedFrom') || '').trim();
  const addedTo = (p.get('addedTo') || '').trim();

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const badDate = (d: string) => {
    if (!d) return false;
    if (!DATE_RE.test(d)) return true;
    return isNaN(new Date(d + 'T00:00:00Z').getTime());
  };
  if (badDate(addedFrom) || badDate(addedTo)) {
    return NextResponse.json({ error: 'Added dates must be in YYYY-MM-DD format.' }, { status: 400 });
  }
  if (addedFrom && addedTo) {
    const from = new Date(addedFrom + 'T00:00:00Z').getTime();
    const to = new Date(addedTo + 'T00:00:00Z').getTime();
    if (to < from) {
      return NextResponse.json({ error: 'Added To must be on or after Added From.' }, { status: 400 });
    }
    if (to - from > 31 * 86400000) {
      return NextResponse.json({ error: 'Added date range cannot exceed one month (31 days).' }, { status: 400 });
    }
  }

  const hasDiscrete = !!(fName || fDba || fUsdot || fMc || fPhone || fCity || fZip);
  const hasDates = !!(addedFrom || addedTo);
  if (!q && !hasDiscrete && !state && status === 'all' && !hasDates) {
    return NextResponse.json({ error: 'Enter a search term or pick at least one filter.' }, { status: 400 });
  }

  const cacheKey = JSON.stringify([q, fName, fDba, fUsdot, fMc, fPhone, fCity, fZip, state, status, addedFrom, addedTo, limit, page]);
  const hit = cached(cacheKey);
  if (hit) return NextResponse.json(hit);

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
  } else if (q) {
    const stripped = q.replace(/[\s-]/g, '');
    const mcMatch = stripped.match(/^(MC|FF|MX)(\d+)$/i);
    const digits = mcMatch ? mcMatch[2] : stripped.replace(/\D/g, '');
    const isNumeric = /^\d+$/.test(stripped) || !!mcMatch;
    if (isNumeric && digits) {
      wheres.push(`(dot_number='${esc(digits)}' OR docket1='${esc(digits)}' OR phone like '%${esc(digits)}%')`);
    } else {
      wheres.push(`upper(legal_name) like '%${esc(q.toUpperCase())}%'`);
    }
  }

  if (state) wheres.push(`phy_state='${esc(state)}'`);
  if (status === 'active') wheres.push(`docket1_status_code='A'`);
  if (hasDates) {
    if (addedFrom) wheres.push(`add_date>='${addedFrom.replace(/-/g, '')}'`);
    if (addedTo) wheres.push(`add_date<='${addedTo.replace(/-/g, '')}'`);
    wheres.push(`docket1_status_code='A'`);
  }

  const order = hasDates ? `&$order=${encodeURIComponent('add_date DESC')}` : '';
  const dotFetch = async (where: string) => {
    const rowsUrl = `${CENSUS}?$limit=${limit}&$offset=${offset}&$where=${encodeURIComponent(where)}${order}`;
    const countUrl = `${CENSUS}?$select=count(*)&$where=${encodeURIComponent(where)}`;
    const headers = { 'X-App-Token': process.env.DOT_APP_TOKEN || '' };
    const [rowsRes, countRes] = await Promise.all([fetch(rowsUrl, { headers }), fetch(countUrl, { headers })]);
    const [rows, count] = await Promise.all([rowsRes.json(), countRes.json()]);
    return { rowsRes, countRes, rows, count };
  };

  try {
    let { rowsRes, rows, count } = await dotFetch(wheres.join(' AND '));

    // Fallback: if dba_name column doesn't exist in this dataset, retry without it
    if ((!rowsRes.ok || !Array.isArray(rows)) && dbaUsed) {
      const retryWheres = wheres.filter((w) => !w.includes('dba_name'));
      ({ rowsRes, rows, count } = await dotFetch(retryWheres.join(' AND ')));
      console.warn('dba_name column not supported — DBA filter skipped');
    }

    if (!rowsRes.ok || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'DOT search failed', detail: rows }, { status: 502 });
    }

    let results = rows.map(mapCarrier);
    let total = 0;
    if (Array.isArray(count) && count[0] && count[0].count !== undefined) {
      total = Number(count[0].count) || 0;
    }

    if (q) {
      const stripped = q.replace(/[\s-]/g, '');
      const digits = stripped.replace(/\D/g, '');
      if (/^\d+$/.test(stripped) || /^(MC|FF|MX)\d+$/i.test(stripped)) {
        const exact = results.filter((c) => c.usdot === digits || c.docketDigits === digits);
        if (exact.length > 0) {
          results = exact;
          total = exact.length;
        }
      }
    }

    const payload = {
      results,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      cached: false,
    };
    cache.set(cacheKey, { ts: Date.now(), data: payload });
    return NextResponse.json(payload);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}