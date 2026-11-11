import { NextResponse } from 'next/server';
import { asSodaError, sodaJson } from '@/lib/soda';

export const dynamic = 'force-dynamic';

const CENSUS = 'https://data.transportation.gov/resource/az4n-8mr2.json';

/**
 * "Is the FMCSA census feed alive?" probe. Open this in a browser: a 429 or
 * timeout here means the throttling is upstream at data.transportation.gov,
 * not something a new deploy can fix.
 */
export async function GET() {
  const started = Date.now();
  const tokenConfigured = Boolean(process.env.DOT_APP_TOKEN);
  try {
    const rows = await sodaJson<unknown[]>(
      CENSUS,
      { $limit: '1', $select: 'dot_number' },
      { attempts: 1, timeoutMs: 6000 }
    );
    return NextResponse.json({
      ok: true,
      ms: Date.now() - started,
      tokenConfigured,
      rows: Array.isArray(rows) ? rows.length : 0,
    });
  } catch (e) {
    const err = asSodaError(e);
    return NextResponse.json({
      ok: false,
      ms: Date.now() - started,
      tokenConfigured,
      upstreamStatus: err.status,
      retryable: err.retryable,
      requestId: err.requestId,
      message: err.message,
    });
  }
}
