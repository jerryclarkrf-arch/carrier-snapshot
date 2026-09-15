import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  let offset = 0;
  const limit = 1000;
  let hasMore = true;
  let totalProcessed = 0;

  // Maintaining the 5,000 limit for the local test
  const MAX_RECORDS = 5000; 

  while (hasMore && totalProcessed < MAX_RECORDS) {
    const ODATA_URL = `https://data.transportation.gov/resource/inys-ebih.json?$limit=${limit}&$offset=${offset}`;
    
    const res = await fetch(ODATA_URL);
    const data = await res.json();

    if (data.length === 0) {
      hasMore = false;
      break;
    }

    for (const carrier of data) {
      await supabase.from('carriers').upsert({
        usdot_number: carrier.usdot_number,
        docket_number: carrier.docket_number,
        legal_name: carrier.legal_name,
        op_auth_status: carrier.op_auth_status,
        op_auth_type: carrier.op_auth_type,
        // The new mapping to backfill the phone numbers
        phone_number: carrier.bus_telno || null,
      }, { onConflict: 'usdot_number' }); 
    }

    offset += limit;
    totalProcessed += data.length;
    
    console.log(`Processed ${totalProcessed} records with phone numbers...`);
  }

  return NextResponse.json({ 
    message: 'Backfill sync complete', 
    total_processed: totalProcessed 
  });
}