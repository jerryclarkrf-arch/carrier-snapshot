import { NextResponse } from 'next/server';
import { carrierIndexStats, isCarrierIndexEnabled } from '@/lib/carrier-index';

export const dynamic = 'force-dynamic';

/**
 * Progress of the local carrier index. Open in a browser:
 * rows should approach ~2.25 M after the first full sync; `lastSync` comes from
 * the sync_runs table and `enabled` reflects SEARCH_INDEX_ENABLED.
 */
export async function GET() {
  const stats = await carrierIndexStats();
  return NextResponse.json({
    configured: Boolean(process.env.CARRIER_INDEX_DATABASE_URL),
    enabled: isCarrierIndexEnabled(),
    rows: stats?.rows ?? null,
    size: stats?.size ?? null,
    lastSync: stats?.lastSync ?? null,
  });
}
