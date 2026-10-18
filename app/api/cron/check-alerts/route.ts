import { NextRequest, NextResponse } from 'next/server';
import { runDailyCheck } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret') || '';
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runDailyCheck();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}