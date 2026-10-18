import { createHash } from 'node:crypto';
import { query } from '@/lib/db';

const CENSUS = 'https://data.transportation.gov/resource/az4n-8mr2.json';
const headers = () => ({ 'X-App-Token': process.env.DOT_APP_TOKEN || '' });

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? null : String(v));
const num = (v: unknown) => {
  const n = Number(v);
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? null : n;
};

export interface CensusProfile {
  dotNumber: string;
  legalName: string | null;
  dba: string | null;
  statusCode: string | null;
  authStatus: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  powerUnits: number | null;
  drivers: number | null;
  addDate: string | null;
  mcs150Date: string | null;
}

export async function fetchCensusProfile(dot: string): Promise<CensusProfile | null> {
  const url = `${CENSUS}?$limit=1&$where=${encodeURIComponent(
    `dot_number='${dot}'`,
  )}&$select=dot_number,legal_name,dba_name,status_code,docket1_status_code,phone,email_address,phy_city,phy_state,phy_zip,power_units,total_drivers,add_date,mcsipdate`;
  try {
    const res = await fetch(url, { headers: headers() });
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const r = rows[0] as Row;
    return {
      dotNumber: dot,
      legalName: str(r.legal_name) || null,
      dba: str(r.dba_name) || null,
      statusCode: str(r.status_code) || null,
      authStatus: str(r.docket1_status_code) || null,
      phone: str(r.phone) || str(r.bus_telno) || null,
      email: str(r.email_address) || null,
      city: str(r.phy_city) || null,
      state: str(r.phy_state) || null,
      zip: str(r.phy_zip) || null,
      powerUnits: num(r.power_units),
      drivers: num(r.total_drivers),
      addDate: str(r.add_date) || null,
      mcs150Date: str(r.mcsipdate) || null,
    };
  } catch {
    return null;
  }
}

const STATUS_LABEL: Record<string, string> = { A: 'Active', I: 'Inactive', P: 'Pending' };
const label = (code: string | null) => (code ? STATUS_LABEL[code.toUpperCase()] || code : 'Unknown');
const changed = (a: unknown, b: unknown) => (a ?? null) !== (b ?? null);
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

export function diffProfiles(prev: CensusProfile, curr: CensusProfile): string[] {
  const lines: string[] = [];
  if (changed(prev.legalName, curr.legalName)) lines.push(`Legal name: "${show(prev.legalName)}" → "${show(curr.legalName)}"`);
  if (changed(prev.dba, curr.dba)) lines.push(`DBA: "${show(prev.dba)}" → "${show(curr.dba)}"`);
  if (changed(prev.phone, curr.phone)) lines.push(`Phone: ${show(prev.phone)} → ${show(curr.phone)}`);
  if (changed(prev.email, curr.email)) lines.push(`Email: ${show(prev.email)} → ${show(curr.email)}`);
  if (changed(prev.statusCode, curr.statusCode)) lines.push(`DOT status: ${label(prev.statusCode)} → ${label(curr.statusCode)}`);
  if (changed(prev.authStatus, curr.authStatus)) lines.push(`Authority status: ${label(prev.authStatus)} → ${label(curr.authStatus)}`);
  if (changed(prev.powerUnits, curr.powerUnits)) lines.push(`Power units: ${show(prev.powerUnits)} → ${show(curr.powerUnits)}`);
  if (changed(prev.drivers, curr.drivers)) lines.push(`Drivers: ${show(prev.drivers)} → ${show(curr.drivers)}`);
  if (changed(prev.mcs150Date, curr.mcs150Date)) lines.push(`MCS-150 filing date: ${show(prev.mcs150Date)} → ${show(curr.mcs150Date)}`);
  return lines;
}

export function profileHash(p: CensusProfile): string {
  const payload = Object.entries(p)
    .filter(([k]) => k !== 'dotNumber')
    .map(([k, v]) => [k, v === undefined ? null : v])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

// Fetch current census state for every watched DOT, diff against the previous
// observation, and emit deduplicated alerts for each watcher.
export async function runDailyCheck(): Promise<{ checked: number; alertsCreated: number }> {
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
    return { checked: 0, alertsCreated: 0 };
  }

  const dots = await query<{ usdot: string }>('SELECT DISTINCT usdot FROM watches');
  let checked = 0;
  let alertsCreated = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const { usdot } of dots) {
    const profile = await fetchCensusProfile(usdot);
    if (!profile) continue;
    checked++;

    const hash = profileHash(profile);

    await query(
      `INSERT INTO watch_history (usdot, watched_on, content_hash, census)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (usdot, watched_on)
       DO UPDATE SET content_hash = EXCLUDED.content_hash, census = EXCLUDED.census`,
      [usdot, today, hash, JSON.stringify(profile)],
    );

    const prevRows = await query<{ content_hash: string; census: unknown }>(
      `SELECT content_hash, census FROM watch_history WHERE usdot = $1 AND watched_on <> $2
       ORDER BY id DESC LIMIT 1`,
      [usdot, today],
    );
    const prev = prevRows[0] ?? null;
    if (prev && prev.content_hash === hash) continue;

    const changes = prev ? diffProfiles(prev.census as CensusProfile, profile) : [];
    if (changes.length === 0) continue;

    const watchers = await query<{ user_id: string }>('SELECT user_id FROM watches WHERE usdot = $1', [usdot]);
    for (const w of watchers) {
      const summary = changes.join(' | ');
      const alertHash = createHash('sha256').update(`${usdot}|${summary}`).digest('hex');
      const inserted = await query<{ id: number }>(
        `INSERT INTO alerts (user_id, usdot, alert_hash, alert_type, legal_name, summary, detail)
         VALUES ($1,$2,$3,'record_changed',$4,$5,$6)
         ON CONFLICT (user_id, usdot, alert_hash) DO NOTHING
         RETURNING id`,
        [w.user_id, usdot, alertHash, profile.legalName, summary, JSON.stringify({ changes })],
      );
      if (inserted.length > 0) alertsCreated++;
    }
  }

  return { checked, alertsCreated };
}