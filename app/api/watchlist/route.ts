import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function requireUser() {
  const { data: session } = await auth.getSession();
  if (!session?.user) return null;
  return session.user.id as string;
}

export async function GET(req: NextRequest) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dot = (new URL(req.url).searchParams.get('usdot') || '').replace(/^0+/, '');
  if (dot && /^\d{1,8}$/.test(dot)) {
    const rows = await query<{ usdot: string; legal_name: string | null }>(
      'SELECT usdot, legal_name FROM watches WHERE user_id = $1 AND usdot = $2 LIMIT 1',
      [userId, dot],
    );
    return NextResponse.json({ watching: rows.length > 0 });
  }

  const rows = await query<{ usdot: string; legal_name: string | null; created_at: string }>(
    'SELECT usdot, legal_name, created_at FROM watches WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200',
    [userId],
  );
  return NextResponse.json({ watches: rows });
}

export async function POST(req: NextRequest) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { usdot?: string; legalName?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const usdot = String(body?.usdot || '').replace(/^0+/, '');
  if (!/^\d{1,8}$/.test(usdot)) {
    return NextResponse.json({ error: 'A valid DOT number is required.' }, { status: 400 });
  }

  const name = String(body?.legalName || '').slice(0, 200) || null;
  const inserted = await query<{ id: number }>(
    `INSERT INTO watches (user_id, usdot, legal_name) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, usdot) DO UPDATE SET legal_name = COALESCE(EXCLUDED.legal_name, watches.legal_name)
     RETURNING id`,
    [userId, usdot, name],
  );

  return NextResponse.json({ ok: true, added: inserted.length > 0 });
}

export async function DELETE(req: NextRequest) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const usdot = (searchParams.get('usdot') || '').replace(/^0+/, '');
  if (!/^\d{1,8}$/.test(usdot)) {
    return NextResponse.json({ error: 'A valid DOT number is required.' }, { status: 400 });
  }

  await query('DELETE FROM watches WHERE user_id = $1 AND usdot = $2', [userId, usdot]);
  return NextResponse.json({ ok: true });
}