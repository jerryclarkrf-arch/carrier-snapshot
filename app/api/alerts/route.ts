import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id as string;

  const rows = await query<{
    id: number;
    usdot: string;
    legal_name: string | null;
    alert_type: string;
    summary: string;
    detail: unknown;
    detected_at: string;
    read: boolean;
  }>(
    `SELECT id, usdot, legal_name, alert_type, summary, detail, detected_at, read
     FROM alerts WHERE user_id = $1 ORDER BY detected_at DESC LIMIT 100`,
    [userId],
  );

  return NextResponse.json({ alerts: rows });
}