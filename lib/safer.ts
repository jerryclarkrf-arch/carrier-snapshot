/**
 * Fallback carrier lookups from FMCSA's SAFER Company Snapshot.
 *
 * The Socrata census dataset (az4n-8mr2) is federated and is throttled with
 * HTTP 429 for long stretches, which used to take the whole search page down.
 * SAFER is FMCSA's own public Company Snapshot service — no key required — so
 * exact USDOT/MC lookups and name searches can still return something useful
 * while the census feed is unavailable.
 *
 * Everything here is cached for 12 hours and fails soft (null) so a SAFER
 * outage never becomes an exception in the API route.
 */

import * as cheerio from 'cheerio';

const SAFER = 'https://safer.fmcsa.dot.gov/query.asp';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TIMEOUT_MS = 9000;
const TTL = 12 * 60 * 60 * 1000;
const MAX_CACHE = 300;

const cache = new Map<string, { ts: number; data: unknown }>();

export interface SaferCarrier {
  usdot: string;
  docketDigits: string;
  docket: string | null;
  legalName: string | null;
  dba: string | null;
  companyOfficer: string | null;
  entityType: string | null;
  entityTypes: string[];
  dotStatus: string;
  authStatus: string;
  authType: string | null;
  phone: string | null;
  email: string | null;
  powerUnits: number | null;
  drivers: number | null;
  phy: { street?: string; city?: string; state?: string; zip?: string };
  mail: { street?: string; city?: string; state?: string; zip?: string };
  cargo: Record<string, boolean>;
  addDate: string | null;
  mcs150: string | null;
}

export interface SaferLookup {
  carrier: SaferCarrier | null;
  /** True when SAFER knows the USDOT number but the record is inactive. */
  inactive?: boolean;
}

const ENTITY_NAME: Record<string, string> = {
  CARRIER: 'Motor Carrier',
  BROKER: 'Broker',
  'FREIGHT FORWARDER': 'Freight Forwarder',
};
const ENTITY_ORDER = ['Motor Carrier', 'Broker', 'Freight Forwarder'];

const clean = (value: string) =>
  value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > TTL) {
    cache.delete(key);
    return null;
  }
  return hit.data as T;
}

function cacheSet(key: string, data: unknown) {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { ts: Date.now(), data });
}

function parseAddress(value: string): SaferCarrier['phy'] {
  const text = clean(value);
  if (!text) return {};
  // SAFER renders "STREET CITY, ST ZIP" with no comma before the city, so the
  // part before the last comma is kept intact as the street line.
  const match = text.match(/^(.*),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!match) return { street: text };
  return { street: match[1].trim(), state: match[2], zip: match[3] };
}

function parseIntOrNull(value: string | undefined): number | null {
  const digits = (value || '').replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function dotStatusOf(value: string | undefined): string {
  const raw = (value || '').toUpperCase();
  if (raw.includes('INACTIVE')) return 'Inactive';
  if (raw.includes('ACTIVE')) return 'Active';
  if (raw.includes('OUT OF SERVICE')) return 'Out of Service';
  if (raw.includes('PENDING')) return 'Pending';
  return raw ? titleCase(raw) : 'Unknown';
}

async function getHtml(params: Record<string, string>): Promise<string> {
  const url = new URL(SAFER);
  url.searchParams.set('searchtype', 'ANY');
  url.searchParams.set('query_type', 'queryCarrierSnapshot');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`SAFER responded ${res.status}`);
  return res.text();
}

/** Read the Company Snapshot label/value table into a flat map. */
function readFields($: cheerio.CheerioAPI): Record<string, string> {
  const fields: Record<string, string> = {};
  $('th.querylabelbkg').each((_, el) => {
    const label = clean($(el).text()).replace(/:+$/, '').toLowerCase();
    if (!label || label in fields) return;
    fields[label] = clean($(el).next('td').text());
  });
  return fields;
}

function emptyCarrier(usdot: string): SaferCarrier {
  return {
    usdot,
    docketDigits: '',
    docket: null,
    legalName: null,
    dba: null,
    companyOfficer: null,
    entityType: null,
    entityTypes: [],
    dotStatus: 'Unknown',
    authStatus: 'Unknown',
    authType: null,
    phone: null,
    email: null,
    powerUnits: null,
    drivers: null,
    phy: {},
    mail: {},
    cargo: {
      'General Freight': false,
      'Fresh Produce': false,
      Meat: false,
      Refrigerated: false,
      Hazmat: false,
    },
    addDate: null,
    mcs150: null,
  };
}

export type SaferQueryParam = 'USDOT' | 'MC_MX';

export async function fetchSaferSnapshot(
  ref: string,
  queryParam: SaferQueryParam = 'USDOT'
): Promise<SaferLookup | null> {
  const id = ref.replace(/\D/g, '');
  if (!id) return null;

  const key = `${queryParam}:${id}`;
  const cached = cacheGet<SaferLookup>(key);
  if (cached) return cached;

  try {
    const html = await getHtml({ query_param: queryParam, query_string: id });
    const $ = cheerio.load(html);
    const fields = readFields($);

    if (!fields['legal name']) {
      const payload: SaferLookup | null = /record inactive/i.test(html)
        ? { carrier: null, inactive: true }
        : { carrier: null };
      cacheSet(key, payload);
      return payload;
    }

    const carrier = emptyCarrier(id);
    carrier.legalName = fields['legal name'] || null;
    carrier.dba = fields['dba name'] || null;
    carrier.phone = fields['phone'] || null;
    carrier.mcs150 = fields['mcs-150 form date'] || null;
    carrier.powerUnits = parseIntOrNull(fields['power units']);
    carrier.drivers = parseIntOrNull(fields['drivers']);
    carrier.phy = parseAddress(fields['physical address'] || '');
    carrier.mail = parseAddress(fields['mailing address'] || '');
    carrier.dotStatus = dotStatusOf(fields['usdot status']);

    const entityTypes = (fields['entity type'] || '')
      .split('/')
      .map((part) => clean(part).toUpperCase())
      .map((part) => ENTITY_NAME[part] || (part ? titleCase(part) : ''))
      .filter(Boolean);
    carrier.entityTypes = ENTITY_ORDER.filter((t) => entityTypes.includes(t)).concat(
      entityTypes.filter((t) => !ENTITY_ORDER.includes(t))
    );
    carrier.entityType = carrier.entityTypes[0] || null;

    const docketMatch = (fields['mc/mx/ff number(s)'] || fields['mc/mx/ff number'] || '').match(
      /^(MC|MX|FF)-?(\d+)/i
    );
    if (docketMatch) {
      carrier.docketDigits = docketMatch[2];
      carrier.docket = `${docketMatch[1].toUpperCase()}${docketMatch[2]}`;
    }

    const authority = fields['operating authority status'] || '';
    if (/^authorized/i.test(authority)) {
      carrier.authStatus = 'Active';
      carrier.authType =
        clean(authority.replace(/^authorized\s*(for)?:?/i, '').split(/for licensing/i)[0]) || null;
    } else if (/not authorized/i.test(authority)) {
      carrier.authStatus = 'None';
    }

    const payload: SaferLookup = { carrier };
    cacheSet(key, payload);
    return payload;
  } catch (e) {
    console.warn('[safer] snapshot failed', {
      id,
      queryParam,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/** Parse the "Possible Keyword Matches" list returned for a name query. */
export async function searchSaferByName(
  name: string,
  limit = 50
): Promise<{ results: SaferCarrier[]; total: number; capped: boolean; relaxed?: string } | null> {
  const term = clean(name);
  if (!term) return null;

  const key = `name:${term.toLowerCase()}:${limit}`;
  const cached =
    cacheGet<{ results: SaferCarrier[]; total: number; capped: boolean; relaxed?: string }>(key);
  if (cached) return cached;

  const parse = (html: string): SaferCarrier[] => {
    const $ = cheerio.load(html);
    const rows: SaferCarrier[] = [];
    $('th[scope="rpw"] a[href*="query_param=USDOT"]').each((_, el) => {
      if (rows.length >= limit) return;
      const href = $(el).attr('href') || '';
      const dot = (href.match(/query_string=(\d+)/) || [])[1];
      const legalName = clean($(el).text());
      if (!dot || !legalName) return;
      if (rows.some((r) => r.usdot === dot)) return;

      const carrier = emptyCarrier(dot);
      carrier.legalName = legalName;
      const location = clean($(el).closest('tr').find('td').first().text());
      const place = location.match(/^(.*),\s*([A-Z]{2})$/);
      if (place) carrier.phy = { city: place[1].trim(), state: place[2] };
      rows.push(carrier);
    });
    return rows;
  };

  try {
    let results = parse(await getHtml({ query_param: 'NAME', query_string: term }));
    let relaxed: string | undefined;

    // SAFER matches whole keywords, so "Lolly P.s" finds nothing while "Lolly"
    // finds the carrier. Fall back to the first keyword before giving up.
    const keyword = term.split(/\s+/)[0];
    if (results.length === 0 && keyword.length >= 3 && keyword.toLowerCase() !== term.toLowerCase()) {
      results = parse(await getHtml({ query_param: 'NAME', query_string: keyword }));
      relaxed = keyword;
    }

    const payload = { results, total: results.length, capped: results.length >= limit, relaxed };
    cacheSet(key, payload);
    return payload;
  } catch (e) {
    console.warn('[safer] name search failed', {
      term,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

