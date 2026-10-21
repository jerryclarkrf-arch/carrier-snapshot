import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { auth } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

const INSURANCE = 'https://data.transportation.gov/resource/qh9u-swkp.json';
const FINREQ = 'https://data.transportation.gov/resource/inys-ebih.json';
const CENSUS = 'https://data.transportation.gov/resource/az4n-8mr2.json';
const TTL = 12 * 60 * 60 * 1000;
const MAX_CACHE = 500;
const SCRAPE_TIMEOUT = 6000;
const cache = new Map<string, { ts: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
const H = { 'X-App-Token': process.env.DOT_APP_TOKEN || '' };

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => {
  const v = r[k];
  return v === undefined || v === null ? undefined : String(v);
};
const enc = (s: string) => encodeURIComponent(s);

const fmtCoverage = (v?: string | null): string | null => {
  if (!v) return null;
  const n = Number(v);
  if (!n || isNaN(n)) return null;
  return `$${(n * 1000).toLocaleString('en-US')}`;
};

const toMoney = (v: unknown): string | null => {
  const n = Number(v);
  if (!n || isNaN(n) || n <= 0) return null;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

const parseMDY = (v?: string | null): number | null => {
  if (!v) return null;
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const t = new Date(`${m[3]}-${m[1]}-${m[2]}T00:00:00Z`).getTime();
  return isNaN(t) ? null : t;
};

const policyStatus = (r: Row): string => {
  const now = Date.now();
  const cancl = parseMDY(str(r, 'cancl_effective_date'));
  const eff = parseMDY(str(r, 'effective_date'));
  if (cancl && cancl <= now) return 'Cancelled';
  if (eff && eff > now) return 'Pending';
  return 'Active';
};

const mapPolicy = (r: Row) => ({
  form: str(r, 'ins_form_code') || '—',
  type: str(r, 'mod_col_1') || '—',
  carrier: str(r, 'name_company') || '—',
  policy: str(r, 'policy_no') || '—',
  coverage: fmtCoverage(str(r, 'max_cov_amount')) || '—',
  effective: parseMDY(str(r, 'effective_date')) ? str(r, 'effective_date') : '—',
  status: policyStatus(r),
});

const soda = async (url: string): Promise<Row[]> => {
  const res = await fetch(url, { headers: H });
  const data = await res.json();
  return Array.isArray(data) ? (data as Row[]) : [];
};

const censusOwner = async (dot: string): Promise<string | null> => {
  const rows = await soda(`${CENSUS}?$select=company_officer_1&$where=${enc(`dot_number='${dot}'`)}&$limit=1`);
  return str(rows[0] || {}, 'company_officer_1') || null;
};

const financial = async (dot: string) => {
  const rows = await soda(`${FINREQ}?$limit=10&$where=${enc(`usdot_number='${dot}' AND op_auth_status='Active'`)}`);
  if (rows.length === 0) return null;
  const amount = (r: Row) => Number(str(r, 'min_cov_amount')) || 0;
  rows.sort((a, b) => amount(b) - amount(a));
  const r = rows[0];
  return {
    minCoverage: toMoney(r.min_cov_amount),
    bipd: toMoney(r.bipd_file),
    cargoReq: (str(r, 'cargo_req') || '').toUpperCase() === 'Y',
    cargoFile: (str(r, 'cargo_file') || '').toUpperCase() === 'Y',
    bondReq: (str(r, 'bond_req') || '').toUpperCase() === 'Y',
    bondFile: (str(r, 'bond_file') || '').toUpperCase() === 'Y',
  };
};

const insuranceRows = async (dot: string): Promise<Row[]> => {
  const padded = dot.padStart(8, '0');
  let rows = await soda(`${INSURANCE}?$where=${enc(`dot_number='${padded}'`)}&$limit=200`);
  if (rows.length === 0 && padded !== dot) {
    rows = await soda(`${INSURANCE}?$where=${enc(`dot_number='${dot}'`)}&$limit=200`);
  }
  // trans_date is a MM/DD/YYYY text column — Socrata $order would be month-major,
  // so sort chronologically here before truncating and deduping.
  rows.sort((a, b) => (parseMDY(str(b, 'trans_date')) ?? 0) - (parseMDY(str(a, 'trans_date')) ?? 0));
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of rows) {
    const key = str(r, 'policy_no') || str(r, 'docket_number') || JSON.stringify(r);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
};

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

async function scrapeLNI(dotNumber: string) {
  const searchBody = new URLSearchParams();
  searchBody.append('n_dotno', dotNumber);
  searchBody.append('s_prefix', 'MC');
  searchBody.append('n_docketno', '');
  searchBody.append('s_legalname', '');
  searchBody.append('s_dbaname', '');
  searchBody.append('s_state', '');

  const searchRes = await fetch('https://li-public.fmcsa.dot.gov/LIVIEW/pkg_carrquery.prc_carrlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: searchBody.toString(),
  });
  const searchHtml = await searchRes.text();

  const idMatch = searchHtml.match(/name="pv_apcant_id"\s+value="([^"]+)"/i);
  if (!idMatch) {
    return { owner: null, policies: [] };
  }
  const apcantId = idMatch[1];

  const detailBody = new URLSearchParams();
  detailBody.append('pv_apcant_id', apcantId);
  detailBody.append('pv_vpath', 'LIVIEW');

  const detailRes = await fetch('https://li-public.fmcsa.dot.gov/LIVIEW/pkg_carrquery.prc_getdetail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: detailBody.toString(),
  });
  const detailHtml = await detailRes.text();

  const repMatch = detailHtml.match(/Representative:[\s\S]*?<td[^>]*><font[^>]*>(.*?)<\/font>/i);
  const ownerName = repMatch ? repMatch[1].replace(/<br>/gi, ' ').replace(/<[^>]+>/g, '').trim() : null;

  const insRes = await fetch('https://li-public.fmcsa.dot.gov/LIVIEW/pkg_carrquery.prc_activeinsurance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: detailBody.toString(),
  });
  const insHtml = await insRes.text();

  const $ = cheerio.load(insHtml);
  const policies: { form: string; type: string; carrier: string; policy: string; coverage: string; effective: string; status: string }[] = [];

  $('table th:contains("Form")').closest('table').find('tr').each((_, el) => {
    const cols = $(el).find('td');
    if (cols.length >= 9) {
      policies.push({
        form: $(cols[0]).text().trim(),
        type: $(cols[1]).text().trim(),
        carrier: $(cols[2]).text().trim(),
        policy: $(cols[3]).text().trim(),
        coverage: $(cols[5]).text().trim(),
        effective: $(cols[6]).text().trim(),
        status: $(cols[8]).text().trim(),
      });
    }
  });

  return { owner: ownerName, policies };
}

export async function GET(request: Request) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get('dotNumber') || '').trim();
  const dot = raw.replace(/^0+/, '');
  if (!dot || !/^\d{1,8}$/.test(dot)) {
    return NextResponse.json({ error: 'A valid DOT number is required.' }, { status: 400 });
  }
  const ownerParam = (searchParams.get('owner') || '').trim() || null;

  const build = async (): Promise<unknown> => {
    const [owner, rows, fin] = await Promise.all([
      ownerParam ? Promise.resolve(ownerParam) : censusOwner(dot),
      insuranceRows(dot),
      financial(dot),
    ]);

    let policies = rows.map(mapPolicy);
    let finalOwner = owner;

    if (policies.length === 0) {
      const scraped = await withTimeout(scrapeLNI(dot), SCRAPE_TIMEOUT);
      if (scraped && scraped.policies.length > 0) {
        policies = scraped.policies;
        finalOwner = finalOwner || scraped.owner;
      }
    }
    return { owner: finalOwner, policies, financial: fin };
  };

  const fresh = cache.get(dot);
  if (fresh && Date.now() - fresh.ts < TTL) {
    return NextResponse.json({ cached: true, ...(fresh.data as object) });
  }

  let promise = inflight.get(dot);
  if (!promise) {
    promise = build();
    inflight.set(dot, promise);
    promise
      .then((data) => {
        cache.delete(dot);
        cache.set(dot, { ts: Date.now(), data });
        if (cache.size > MAX_CACHE) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest as string);
        }
      })
      .catch(() => void 0)
      .finally(() => inflight.delete(dot));
  }

  try {
    const payload = await promise;
    return NextResponse.json(payload as object);
  } catch (e: unknown) {
    const scraped = await withTimeout(scrapeLNI(dot), SCRAPE_TIMEOUT);
    if (scraped && scraped.policies.length > 0) {
      return NextResponse.json({ owner: scraped.owner, policies: scraped.policies, financial: null });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Insurance lookup failed' }, { status: 500 });
  }
}