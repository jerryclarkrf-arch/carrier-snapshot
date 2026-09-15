import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase keys. Ensure your .env.local file is configured.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runFullSeed() {
  let offset = 0;
  const limit = 1000;
  let hasMore = true;
  let totalProcessed = 0;

  console.log('Initiating complete FMCSA database seed...');
  console.log('This will process over 1 million records. Grab a coffee!\n');

  while (hasMore) {
    const url = `https://data.transportation.gov/resource/inys-ebih.json?$limit=${limit}&$offset=${offset}`;
    
    try {
      const res = await fetch(url);
      const data = await res.json();

      if (!data || data.length === 0) {
        hasMore = false;
        console.log('\n\n✅ Database seed completely finished!');
        break;
      }

      // 1. Deduplicate the batch to prevent PostgreSQL ON CONFLICT errors
      const uniqueCarriers = new Map();
      
      for (const carrier of data) {
        // Skip if there is no USDOT number (bad data)
        if (!carrier.usdot_number) continue; 
        
        // A Map automatically overwrites older duplicates with the newest data
        uniqueCarriers.set(carrier.usdot_number, {
          usdot_number: carrier.usdot_number,
          docket_number: carrier.docket_number || null,
          legal_name: carrier.legal_name || null,
          op_auth_status: carrier.op_auth_status || null,
          op_auth_type: carrier.op_auth_type || null,
          phone_number: carrier.bus_telno || null,
        });
      }

      // 2. Convert the Map back into a standard array for Supabase
      const batch = Array.from(uniqueCarriers.values());

      // 3. Send the clean, deduplicated batch to the database
      const { error } = await supabase.from('carriers').upsert(batch, { onConflict: 'usdot_number' });

      if (error) throw error;

      offset += limit;
      totalProcessed += data.length;
      
      process.stdout.write(`\rProcessed ${totalProcessed.toLocaleString()} raw records...`);
      
    } catch (err) {
      console.error(`\n❌ Error during fetch or upsert: ${err.message}`);
      console.log('Retrying the current batch in 5 seconds...');
      await new Promise(res => setTimeout(res, 5000));
    }
  }
}

runFullSeed();