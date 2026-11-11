import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { sodaJson, asSodaError } from '@/lib/soda';
import { fetchSaferSnapshot, searchSaferByName, type SaferCarrier } from '@/lib/safer';

export const dynamic = 'force-dynamic';
// The census feed can be slow while it is throttled; the retry loop needs room
// instead of being killed by the platform's default function timeout.
export const maxDuration = 30;

const CENSUS = 'https://data.transportation.gov/resource/az4n-8mr2.json';
const CENSUS_TTL = 10 * 60 * 1000;
// Counts move slowly and are the most expensive query we issue, so keep them longer.
const COUNT_TTL = 30 * 60 * 1000;
const MAX_CACHE = 400;
// The census feed is usually either fast or immediately 429s, so one attempt
// keeps the fallback responsive. The browser retries once on top of this.
const SODA_OPTS = { attempts: 1, timeoutMs: 7000 };
const cache = new Map<string, { ts: number; ttl: number; data: unknown }>();

type SearchOutcome = {
  payload?: Record<string, unknown>;
  error?: { message: string; status: number; retryable: boolean };
};

const inflight = new Map<string, Promise<SearchOutcome>>();

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
  if (hit && Date.now() - hit.ts < hit.ttl) return hit.data;
  if (hit) cache.delete(key);
  return null;
}

function remember(key: string, data: unknown, ttl = CENSUS_TTL) {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { ts: Date.now(), ttl, data });
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
  // "Exact" means a plain USDOT / MC-FF-MX number: it maps to a single equality
  // lookup, so we can skip the expensive count(*) query and fall back to SAFER.
  const qStripped = q.replace(/[\s-]/g, '');
  const qMcMatch = qStripped.match(/^(MC|FF|MX)(\d+)$/i);
  const qDigits = qMcMatch ? qMcMatch[2] : qStripped.replace(/\D/g, '');
  const qIsExact = !!q && (/^\d{1,9}$/.test(qStripped) || !!qMcMatch);
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
    if ((/^\d+$/.test(qStripped) || qMcMatch) && qDigits) {
      // Docket numbers can sit in any of the three slots. Phone numbers are
      // stored as ten raw digits, so only match them for phone-shaped input:
      // the old `phone like '%…%'` ran a full scan on every USDOT lookup and
      // was a major contributor to the throttling.
      const conditions = [
        `dot_number='${esc(qDigits)}'`,
        ...['1', '2', '3'].map((slot) => `docket${slot}='${esc(qDigits)}'`),
      ];
      if (qDigits.length >= 10) conditions.push(`phone='${esc(qDigits.slice(-10))}'`);
      wheres.push(`(${conditions.join(' OR ')})`);
    } else {
      const term = esc(q.toUpperCase());
      wheres.push(`(upper(legal_name) like '%${term}%' OR upper(dba_name) like '%${term}%')`);
      dbaUsed = true;
    }
  }

  if (state === 'CA') {
    wheres.push(`phy_nationality_indicator='C'`);
  } else if (state === 'MX') {
    wheres.push(`phy_nationality_indicator='M'`);
  } else if (state) {
    wheres.push(`phy_state='${esc(state)}'`);
  }
  // Authority status is a filter of its own: applying a date range must never
  // imply "active only" (that used to silently hide inactive and DOT-only carriers).
  if (status === 'active') {
    wheres.push(`docket1_status_code='A'`);
  } else if (status === 'inactive') {
    wheres.push(`docket1_status_code='I'`);
  } else if (status === 'pending') {
    wheres.push(`(docket1_status_code='P' OR docket2_status_code='P' OR docket3_status_code='P')`);
  } else if (status === 'none') {
    wheres.push(
      `(docket1_status_code IS NULL AND docket2_status_code IS NULL AND docket3_status_code IS NULL)`
    );
  }
  if (hasDates) {
    if (addedFrom) wheres.push(`add_date>='${addedFrom.replace(/-/g, '')}'`);
    if (addedTo) wheres.push(`add_date<='${addedTo.replace(/-/g, '')}'`);
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

  const censusWhere = wheres.join(' AND ');

  const countFor = async (where: string): Promise<number | null> => {
    const key = `count:${where}`;
    const hit = cached(key);
    if (typeof hit === 'number') return hit;
    try {
      const rows = await sodaJson<Row[]>(
        CENSUS,
        {
          $select: 'count(*)',
          ...(where ? { $where: where } : {}),
        },
        SODA_OPTS
      );
      const raw = Array.isArray(rows) && rows[0] ? rows[0].count : undefined;
      const total = raw === undefined ? null : Number(raw) || 0;
      if (total !== null) remember(key, total, COUNT_TTL);
      return total;
    } catch {
      // A missing total must never fail the search itself.
      return null;
    }
  };

  const fetchRows = (where: string) =>
    sodaJson<Row[]>(
      CENSUS,
      {
        $limit: String(limit),
        $offset: String(offset),
        ...(where ? { $where: where } : {}),
        ...(hasDates ? { $order: 'add_date DESC' } : {}),
      },
      SODA_OPTS
    );

  const fetchRowsWithDbaFallback = async (where: string): Promise<Row[]> => {
    try {
      return await fetchRows(where);
    } catch (e) {
      const err = asSodaError(e);
      // Only a 400 can mean "this column does not exist". Retrying on a 429
      // just doubles the throttling that caused it.
      if (err.status === 400 && dbaUsed) {
        console.warn('dba_name column not supported — DBA filter skipped');
        return fetchRows(wheres.filter((w) => !w.includes('dba_name')).join(' AND '));
      }
      throw e;
    }
  };

  const runSearch = async (): Promise<SearchOutcome> => {
    const [rows, count] = await Promise.all([
      fetchRowsWithDbaFallback(censusWhere),
      qIsExact ? Promise.resolve(null) : countFor(censusWhere),
    ]);
    if (!Array.isArray(rows)) {
      throw new Error('The FMCSA census feed returned an unexpected response.');
    }

    const results = rows.map(mapCarrier);
    // Exact lookups return only equality matches, so the row count is the total
    // and the count(*) request (the most expensive query) can be skipped. When
    // the count alone is throttled we still show the page we do have.
    const total = qIsExact
      ? results.length
      : typeof count === 'number'
        ? count
        : results.length;

    const payload: Record<string, unknown> = {
      results: loggedIn ? results : maskCarriers(results),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      cached: false,
      source: 'census',
    };
    remember(cacheKey, payload);
    return { payload };
  };

  /**
   * SAFER keeps the most common searches usable while the census feed is
   * throttled. Advanced filters cannot be honoured there, so only the simple
   * page falls back.
   */
  const saferFallback = async (): Promise<SearchOutcome | null> => {
    if (qIsExact && qDigits) {
      // "MC123" can only be a docket number, but a bare number can be either a
      // USDOT or an MC number, so try USDOT first and docket second.
      const lookups = [await fetchSaferSnapshot(qDigits, qMcMatch ? 'MC_MX' : 'USDOT')];
      if (!qMcMatch && !lookups[0]?.carrier) {
        lookups.push(await fetchSaferSnapshot(qDigits, 'MC_MX'));
      }

      const seen = new Set<string>();
      const carriers: SaferCarrier[] = [];
      for (const lookup of lookups) {
        const carrier = lookup?.carrier;
        if (!carrier || seen.has(carrier.usdot)) continue;
        seen.add(carrier.usdot);
        carriers.push(carrier);
      }

      if (carriers.length > 0) {
        const results = carriers as unknown as CarrierRecord[];
        const payload = {
          results: loggedIn ? results : maskCarriers(results),
          total: results.length,
          page: 1,
          limit,
          pages: 1,
          cached: false,
          source: 'safer',
          notice: 'The FMCSA census feed is busy — showing limited data from FMCSA SAFER.',
        };
        remember(cacheKey, payload, 5 * 60 * 1000);
        return { payload };
      }
      if (lookups.some((lookup) => lookup?.inactive)) {
        return {
          payload: {
            results: [],
            total: 0,
            page: 1,
            limit,
            pages: 1,
            cached: false,
            source: 'safer',
            notice: `USDOT/MC ${qDigits} is marked INACTIVE in FMCSA SAFER.`,
          },
        };
      }
    }

    if (q && !qIsExact && !hasDiscrete) {
      const found = await searchSaferByName(q, limit);
      if (found && found.results.length > 0) {
        const results = found.results as unknown as CarrierRecord[];
        const payload = {
          results: loggedIn ? results : maskCarriers(results),
          total: found.total,
          page: 1,
          limit,
          pages: 1,
          cached: false,
          source: 'safer',
          notice: found.relaxed
            ? `The FMCSA census feed is busy — FMCSA SAFER has no exact match, so these are matches for "${found.relaxed}".`
            : found.capped
              ? `The FMCSA census feed is busy — showing the first ${limit} name matches from FMCSA SAFER (limited data).`
              : 'The FMCSA census feed is busy — showing matches from FMCSA SAFER (limited data).',
        };
        remember(cacheKey, payload, 5 * 60 * 1000);
        return { payload };
      }
    }

    return null;
  };

  const run = async (): Promise<SearchOutcome> => {
    try {
      return await runSearch();
    } catch (e) {
      const err = asSodaError(e);
      console.error('[api/search] census lookup failed', {
        status: err.status,
        retryable: err.retryable,
        requestId: err.requestId,
        where: censusWhere,
      });
      if (err.retryable) {
        const fromSafer = await saferFallback();
        if (fromSafer) return fromSafer;
      }
      return {
        error: {
          message: err.retryable
            ? 'The FMCSA census feed is busy right now. Please retry in a few seconds.'
            : 'DOT search failed.',
          status: err.retryable ? 503 : 502,
          retryable: err.retryable,
        },
      };
    }
  };

  // Coalesce identical concurrent searches so a double-click (or two users
  // searching the same number) only hits the throttled feed once.
  let pending = inflight.get(cacheKey);
  if (!pending) {
    pending = run().finally(() => inflight.delete(cacheKey));
    inflight.set(cacheKey, pending);
  }
  const outcome = await pending;

  if (outcome.payload) return NextResponse.json(outcome.payload);

  const failure = outcome.error ?? { message: 'DOT search failed.', status: 502, retryable: false };
  const response = NextResponse.json(
    { error: failure.message, retryable: failure.retryable, detail: 'FMCSA census feed unavailable' },
    { status: failure.status }
  );
  if (failure.retryable) response.headers.set('Retry-After', '5');
  return response;
}