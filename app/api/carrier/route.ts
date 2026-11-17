import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { sodaJson } from '@/lib/soda';
import { fetchSaferSnapshot } from '@/lib/safer';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const CENSUS = 'https://data.transportation.gov/resource/az4n-8mr2.json';
const TTL = 60 * 60 * 1000;
const MAX_CACHE = 500;
const cache = new Map<string, { ts: number; data: unknown }>();

const SELECT = [
  'dot_number',
  'legal_name',
  'dba_name',
  'company_officer_1',
  'classdef',
  'email_address',
  'phy_street',
  'phy_city',
  'phy_state',
  'phy_zip',
  'carrier_mailing_street',
  'carrier_mailing_city',
  'carrier_mailing_state',
  'carrier_mailing_zip',
  'crgo_genfreight',
  'crgo_freshprod',
  'crgo_meat',
  'crgo_coldfood',
  'hm_ind',
  'docket1prefix',
  'docket2prefix',
  'docket3prefix',
  'docket1_status_code',
  'status_code',
  'add_date',
  'mcsipdate',
].join(',');

const STATUS: Record<string, string> = { A: 'Active', I: 'Inactive', P: 'Pending' };
const ENTITY_TYPE: Record<string, string> = { MC: 'Motor Carrier', MX: 'Broker', FF: 'Freight Forwarder' };
const ENTITY_ORDER = ['Motor Carrier', 'Broker', 'Freight Forwarder'];

type Row = Record<string, unknown>;
const str = (row: Row, key: string) => {
  const value = row[key];
  return value === undefined || value === null ? null : String(value);
};
const flag = (value: unknown) => value === 'Y' || value === 'X';
const statusLabel = (code: string | null) =>
  code ? STATUS[code.toUpperCase()] || code : 'Unknown';
const fmtDate = (value: string | null) => {
  if (!value) return null;
  const digits = value.slice(0, 10).replace(/-/g, '');
  return digits.length === 8
    ? `${digits.slice(4, 6)}/${digits.slice(6, 8)}/${digits.slice(0, 4)}`
    : value;
};
const entityTypesOf = (row: Row) => {
  const found = [str(row, 'docket1prefix'), str(row, 'docket2prefix'), str(row, 'docket3prefix')]
    .map((prefix) => ENTITY_TYPE[(prefix || '').toUpperCase()])
    .filter((type): type is string => Boolean(type));
  return ENTITY_ORDER.filter((type) => found.includes(type));
};

export async function GET(req: NextRequest) {
  const dot = (new URL(req.url).searchParams.get('dot') || '').replace(/\D/g, '');
  if (!dot) return NextResponse.json({ error: 'dot param required' }, { status: 400 });

  const { data: session } = await auth.getSession();
  const loggedIn = Boolean(session?.user);

  const hit = cache.get(dot);
  if (hit && Date.now() - hit.ts < TTL) {
    return NextResponse.json({ ...(hit.data as Record<string, unknown>), cached: true });
  }

  const mask = (details: Record<string, unknown>) => {
    if (loggedIn) return details;
    return {
      ...details,
      email: details.email ? 'xxx@xxx.xxx' : details.email,
      companyOfficer: details.companyOfficer ? 'XXXXX' : details.companyOfficer,
    };
  };

  try {
    const rows = await sodaJson<Row[]>(
      CENSUS,
      { $limit: '1', $select: SELECT, $where: `dot_number='${dot}'` },
      { attempts: 1, timeoutMs: 4000 }
    );
    if (Array.isArray(rows) && rows[0]) {
      const row = rows[0];
      const details = {
        email: str(row, 'email_address'),
        companyOfficer: str(row, 'company_officer_1'),
        authType: str(row, 'classdef'),
        mcs150: fmtDate(str(row, 'mcsipdate')),
        addDate: fmtDate(str(row, 'add_date')),
        dotStatus: statusLabel(str(row, 'status_code')),
        authStatus: statusLabel(str(row, 'docket1_status_code')),
        entityTypes: entityTypesOf(row),
        entityType: entityTypesOf(row)[0] || null,
        phy: {
          street: str(row, 'phy_street') || undefined,
          city: str(row, 'phy_city') || undefined,
          state: str(row, 'phy_state') || undefined,
          zip: str(row, 'phy_zip') || undefined,
        },
        mail: {
          street: str(row, 'carrier_mailing_street') || undefined,
          city: str(row, 'carrier_mailing_city') || undefined,
          state: str(row, 'carrier_mailing_state') || undefined,
          zip: str(row, 'carrier_mailing_zip') || undefined,
        },
        cargo: {
          'General Freight': flag(row.crgo_genfreight),
          'Fresh Produce': flag(row.crgo_freshprod),
          Meat: flag(row.crgo_meat),
          Refrigerated: flag(row.crgo_coldfood),
          Hazmat: flag(row.hm_ind),
        },
      };
      const payload = { details: mask(details), source: 'census' };
      if (cache.size >= MAX_CACHE) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      cache.set(dot, { ts: Date.now(), data: payload });
      return NextResponse.json(payload);
    }
  } catch (error) {
    console.warn('[api/carrier] census failed', {
      dot,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const safer = await fetchSaferSnapshot(dot);
  if (safer?.carrier) {
    const carrier = safer.carrier;
    const payload = {
      details: mask({
        email: carrier.email,
        companyOfficer: carrier.companyOfficer,
        authType: carrier.authType,
        mcs150: carrier.mcs150,
        addDate: carrier.addDate,
        dotStatus: carrier.dotStatus,
        authStatus: carrier.authStatus,
        entityTypes: carrier.entityTypes,
        entityType: carrier.entityType,
        phy: carrier.phy,
        mail: carrier.mail,
        cargo: carrier.cargo,
      }),
      source: 'safer',
    };
    cache.set(dot, { ts: Date.now(), data: payload });
    return NextResponse.json(payload);
  }

  return NextResponse.json({ error: 'Carrier details unavailable.' }, { status: 404 });
}
