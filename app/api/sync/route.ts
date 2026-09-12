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

  // Safety limit to prevent local timeout during initial testing
  const MAX_RECORDS = 5000; 

  while (hasMore && totalProcessed < MAX_RECORDS) {
    const ODATA_URL = `https://data.transportation.gov/resource/inys-ebih.json?$limit=${limit}&$offset=${offset}`;
    
    const res = await fetch(ODATA_URL);
    const data = await res.json();

    // If no more data is returned, exit the loop
    if (data.length === 0) {
      hasMore = false;
      break;
    }

    // Upsert the current batch to Supabase
    for (const carrier of data) {
      await supabase.from('carriers').upsert({
        usdot_number: carrier.usdot_number,
        docket_number: carrier.docket_number,
        legal_name: carrier.legal_name,
        op_auth_status: carrier.op_auth_status,
        op_auth_type: carrier.op_auth_type,
      }, { onConflict: 'usdot_number' }); 
    }

    // Increment the offset to get the next chunk on the next loop
    offset += limit;
    totalProcessed += data.length;
    
    // Log progress in your VS Code terminal
    console.log(`Processed ${totalProcessed} records...`);
  }

  return NextResponse.json({ 
    message: 'Batch sync complete', 
    total_processed: totalProcessed 
  });
}