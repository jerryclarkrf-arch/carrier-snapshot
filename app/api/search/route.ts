import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

const CENSUS = 'https://data.transportation.gov/resource/az4n-8mr2.json';
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { ts: number; data: unknown }>();

const MASK_PHONE = '(xxx) xxx-xxxx';
const MASK_EMAIL = 'xxx@xxx.xxx';
const MASK_NAME = 'XXXXX';

const CARGO_MAP: Record<string, string> = {
  'General Freight': 'crgo_genfreight',
  'Household Goods': 'crgo_household',
  'Metal (Sheets/Coils/Rolls)': 'crgo_metalsheet',
  'Motor Vehicles': 'crgo_motoveh',
  'Driveaway/Towaway': 'crgo_drivetow',
  'Logs/Poles/Beams/Lumber': 'crgo_logpole',
  'Building Materials': 'crgo_bldgmat',
  'Mobile Homes': 'crgo_mobilehome',
  'Machinery/Large Objects': 'crgo_machlrg',
  'Fresh Produce': 'crgo_produce',
  'Liquids/Gases': 'crgo_liqgas',
  'Intermodal Containers': 'crgo_intermodal',
  'Passengers': 'crgo_passengers',
  'Oilfield Equipment': 'crgo_oilfield',
  'Livestock': 'crgo_livestock',
  'Grain/Feed/Hay': 'crgo_grainfeed',
  'Coal/Coke': 'crgo_coalcoke',
  'Meat': 'crgo_meat',
  'Garbage/Refuse/Trash': 'crgo_garbage',
  'U.S. Mail': 'crgo_usmail',
  'Chemicals': 'crgo_chem',
  'Commodities Dry Bulk': 'crgo_drybulk',
  'Refrigerated Food': 'crgo_coldfood',
  'Beverages': 'crgo_beverages',
  'Paper Products': 'crgo_paperprod',
  'Utility': 'crgo_utility',
  'Farm Supplies': 'crgo_farmsupp',
  'Construction': 'crgo_construct',
  'Water-Well': 'crgo_waterwell',
};
const RATING_MAP: Record<string, string> = {
  Satisfactory: 'S',
  Conditional: 'C',
  Unsatisfactory: 'U',
};

type CarrierRecord = ReturnType<typeof mapCarrier> & { masked?: boolean };

function maskCarriers(results: CarrierRecord[]): CarrierRecord[] {
  return results.map((c) => ({
    ...c,
    masked: true,
    phone: c.phone ? MASK_PHONE : c.phone,
    email: c.email ? MASK_EMAIL : c.email,
    companyOfficer: c.companyOfficer ? MASK_NAME : c.companyOfficer,
  }));
}

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
  const fDocket = (p.get('docket') || '').trim().replace(/\D/g, '') || fMc;
  const fDocketPrefix = (p.get('docketPrefix') || '').trim().toUpperCase();
  const fPhone = (p.get('phone') || '').trim().replace(/\D/g, '');
  const fCity = (p.get('city') || '').trim();
  const fZip = (p.get('zip') || '').trim();
  const fContact = (p.get('contact') || '').trim();
  // Shared filters
  const state = (p.get('state') || '').trim().toUpperCase();
  const status = p.get('status') || 'all';
  const addedFrom = (p.get('addedFrom') || '').trim();
  const addedTo = (p.get('addedTo') || '').trim();
  // BrokerSnapshot-style advanced filters
  const authorityRoles = (p.getAll('authorityRoles') as string[])
    .map((r) => r.trim().toUpperCase())
    .filter((r) => r === 'MC' || r === 'MX' || r === 'FF');
  const authorityOp = p.get('authorityOp') === 'and' ? 'and' : 'or';
  const operation = (p.get('operation') || '').trim().toUpperCase();
  const cargo = (p.getAll('cargo') as string[]).filter((c) => CARGO_MAP[c]);
  const ratings = (p.getAll('rating') as string[]).map((r) => RATING_MAP[r]).filter(Boolean);
  const fleetSize = (p.getAll('fleetSize') as string[])
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^[A-Z]$/.test(f));
  const powerMin = parseInt(p.get('powerMin') || '', 10);
  const powerMax = parseInt(p.get('powerMax') || '', 10);
  const priorRevoked = p.get('priorRevoked') === 'true';
  const pendingAuthority = p.get('pendingAuthority') === 'true';

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

  const hasDiscrete = !!(fName || fDba || fUsdot || fMc || fDocket || fDocketPrefix || fPhone || fCity || fZip || fContact ||
    authorityRoles.length || operation || cargo.length || ratings.length || fleetSize.length ||
    Number.isFinite(powerMin) || Number.isFinite(powerMax) || priorRevoked || pendingAuthority);
  const hasDates = !!(addedFrom || addedTo);
  if (!q && !hasDiscrete && !state && status === 'all' && !hasDates) {
    return NextResponse.json({ error: 'Enter a search term or pick at least one filter.' }, { status: 400 });
  }

  const { data: session } = await auth.getSession();
  const loggedIn = !!session?.user;

  const cacheKey = JSON.stringify([q, fName, fDba, fUsdot, fMc, fDocket, fDocketPrefix, fPhone, fCity, fZip, fContact,
    [...authorityRoles].sort(), authorityOp, operation, [...cargo].sort(), [...ratings].sort(), [...fleetSize].sort(),
    powerMin, powerMax, priorRevoked, pendingAuthority, state, status, addedFrom, addedTo, limit, page, loggedIn]);
  const hit = cached(cacheKey);
  if (hit) return NextResponse.json(hit);

  const wheres: string[] = [];
  let dbaUsed = false;

  if (hasDiscrete) {
    if (fUsdot) wheres.push(`dot_number='${esc(fUsdot)}'`);
    if (fDocket) {
      const slots = ['1', '2', '3'];
      if (fDocketPrefix) {
        wheres.push(`(${slots.map((s) => `(docket${s}prefix='${esc(fDocketPrefix)}' AND docket${s}='${esc(fDocket)}')`).join(' OR ')})`);
      } else {
        wheres.push(`(${slots.map((s) => `docket${s}='${esc(fDocket)}'`).join(' OR ')})`);
      }
    } else if (fDocketPrefix) {
      const slots = ['1', '2', '3'];
      wheres.push(`(${slots.map((s) => `docket${s}prefix='${esc(fDocketPrefix)}'`).join(' OR ')})`);
    }
    if (fPhone) wheres.push(`phone like '%${esc(fPhone)}%'`);
    if (fName) wheres.push(`upper(legal_name) like '%${esc(fName.toUpperCase())}%'`);
    if (fDba) { wheres.push(`upper(dba_name) like '%${esc(fDba.toUpperCase())}%'`); dbaUsed = true; }
    if (fContact) {
      const c = fContact.toUpperCase();
      wheres.push(`(upper(company_officer_1) like '%${esc(c)}%' OR upper(company_officer_2) like '%${esc(c)}%')`);
    }
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

  if (state === 'CA') {
    wheres.push(`phy_nationality_indicator='C'`);
  } else if (state === 'MX') {
    wheres.push(`phy_nationality_indicator='M'`);
  } else if (state) {
    wheres.push(`phy_state='${esc(state)}'`);
  }
  if (status === 'active') wheres.push(`docket1_status_code='A'`);
  if (hasDates) {
    if (addedFrom) wheres.push(`add_date>='${addedFrom.replace(/-/g, '')}'`);
    if (addedTo) wheres.push(`add_date<='${addedTo.replace(/-/g, '')}'`);
    wheres.push(`docket1_status_code='A'`);
  }

  // BrokerSnapshot-style advanced filters
  if (operation === 'A' || operation === 'B' || operation === 'C') {
    wheres.push(`carrier_operation='${operation}'`);
  }
  if (cargo.length > 0) {
    wheres.push(`(${cargo.map((c) => `${CARGO_MAP[c]} IN ('X','Y')`).join(' OR ')})`);
  }
  if (ratings.length > 0) {
    wheres.push(`safety_rating IN (${ratings.map((r) => `'${r}'`).join(',')})`);
  }
  if (fleetSize.length > 0) {
    wheres.push(`fleetsize IN (${fleetSize.map((f) => `'${f}'`).join(',')})`);
  }
  if (Number.isFinite(powerMin) || Number.isFinite(powerMax)) {
    if (Number.isFinite(powerMin)) wheres.push(`power_units::number >= ${powerMin}`);
    if (Number.isFinite(powerMax)) wheres.push(`power_units::number <= ${powerMax}`);
  }
  if (priorRevoked) wheres.push(`prior_revoke_flag='Y'`);
  if (pendingAuthority) {
    wheres.push(`(docket1_status_code='P' OR docket2_status_code='P' OR docket3_status_code='P')`);
  }
  if (authorityRoles.length > 0) {
    const roleCond = (prefix: string) =>
      `(${['1', '2', '3'].map((s) => `(docket${s}prefix='${prefix}' AND docket${s}_status_code IN ('A','P'))`).join(' OR ')})`;
    const roleExprs = authorityRoles.map(roleCond);
    if (authorityOp === 'and') {
      wheres.push(roleExprs.join(' AND '));
    } else {
      wheres.push(`(${roleExprs.join(' OR ')})`);
    }
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
    if (!loggedIn) {
      payload.results = maskCarriers(results);
    }
    cache.set(cacheKey, { ts: Date.now(), data: payload });
    return NextResponse.json(payload);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}