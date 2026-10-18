import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? null : String(v));
const num = (v: unknown) => {
  const n = Number(v);
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? null : n;
};

// Stable, ordered payload signature so identical observations hash the same.
function contentHash(carrier: Row, ins: Row | null, events: unknown[]): string {
  const phy = (carrier.phy as Row | undefined) || {};
  const payload = [
    ['legalName', str(carrier.legalName)],
    ['dba', str(carrier.dba)],
    ['entityTypes', Array.isArray(carrier.entityTypes) ? carrier.entityTypes.map(String).sort() : null],
    ['owner', str(carrier.companyOfficer)],
    ['phone', str(carrier.phone)],
    ['email', str(carrier.email)],
    ['city', str(phy.city)],
    ['state', str(phy.state)],
    ['zip', str(phy.zip)],
    ['powerUnits', num(carrier.powerUnits)],
    ['drivers', num(carrier.drivers)],
    ['dotStatus', str(carrier.dotStatus)],
    ['authStatus', str(carrier.authStatus)],
    ['addedDate', str(carrier.addDate)],
    ['mcs150', str(carrier.mcs150)],
    ['insuranceOwner', ins ? str(ins.owner) : null],
    ['insurancePolicies', ins && typeof ins.policies !== 'undefined' ? JSON.stringify(ins.policies ?? []) : null],
    ['insuranceFinancial', ins && typeof ins.financial !== 'undefined' ? JSON.stringify(ins.financial ?? null) : null],
    ['statusEvents', JSON.stringify(events ?? [])],
  ] as [string, unknown][];
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
    return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503 });
  }

  let body: { carrier?: Row; insurance?: Row | null; statusEvents?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const carrier = body?.carrier;
  const usdot = String(str(carrier?.usdot) || '').replace(/^0+/, '');
  if (!/^\d{1,8}$/.test(usdot) || !carrier) {
    return NextResponse.json({ error: 'carrier.usdot is required' }, { status: 400 });
  }

  const ins = body?.insurance || null;
  const events = Array.isArray(body?.statusEvents) ? body.statusEvents : [];
  const hash = contentHash(carrier, ins, events);

  try {
    // Skip when this carrier already recorded the exact same content today.
    const dup = await query<{ id: number }>(
      `SELECT id FROM carrier_snapshots
       WHERE usdot = $1 AND content_hash = $2 AND snapshot_at::date = CURRENT_DATE
       LIMIT 1`,
      [usdot, hash],
    );
    if (dup.length > 0) {
      return NextResponse.json({ ok: true, recorded: false });
    }

    await query(
      `INSERT INTO carrier_snapshots
        (usdot, content_hash, legal_name, dba, entity_types, owner_name, phone, email, city, state, zip,
         power_units, drivers, dot_status, auth_status, added_date, mcs150_date,
         insurance_policies, insurance_financial, status_events)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        usdot,
        hash,
        str(carrier.legalName),
        str(carrier.dba),
        Array.isArray(carrier.entityTypes) && carrier.entityTypes.length
          ? carrier.entityTypes.map(String)
          : null,
        str(carrier.companyOfficer),
        str(carrier.phone),
        str(carrier.email),
        str((carrier.phy as Row | undefined)?.city),
        str((carrier.phy as Row | undefined)?.state),
        str((carrier.phy as Row | undefined)?.zip),
        num(carrier.powerUnits),
        num(carrier.drivers),
        str(carrier.dotStatus),
        str(carrier.authStatus),
        str(carrier.addDate),
        str(carrier.mcs150),
        ins && typeof ins.policies !== 'undefined' ? JSON.stringify(ins.policies ?? []) : null,
        ins && typeof ins.financial !== 'undefined' ? JSON.stringify(ins.financial ?? null) : null,
        events.length ? JSON.stringify(events) : null,
      ],
    );
    return NextResponse.json({ ok: true, recorded: true });
  } catch (e) {
    console.error('Snapshot insert failed:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}