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

  console.log('Initiating complete Master FMCSA database seed...');
  console.log('This will process over 1.86 million records. Grab a coffee!\n');

  while (hasMore) {
    // Using Socrata's internal :id for bulletproof deep pagination
    const url = `https://data.transportation.gov/resource/6eyk-hxee.json?$limit=${limit}&$offset=${offset}&$order=:id`;
    
    try {
      const res = await fetch(url);
      const data = await res.json();

      // Catch API error objects (like Rate Limits or Bad Requests) instead of crashing
      if (!Array.isArray(data)) {
        console.error(`\n❌ API Rejected the Request. Status: ${res.status}`);
        console.error('API Response Payload:', data);
        throw new Error('API returned an error object instead of an array.');
      }

      if (data.length === 0) {
        hasMore = false;
        console.log('\n\n✅ Master Database seed completely finished!');
        break;
      }

      const uniqueCarriers = new Map();
      
      for (const carrier of data) {
        const rawDot = carrier.usdot_number || carrier.dot_number;
        if (!rawDot) continue; 
        
        const normalizedDot = String(rawDot).replace(/^0+/, '');
        
        uniqueCarriers.set(normalizedDot, {
          usdot_number: normalizedDot,
          docket_number: carrier.docket_number || carrier.mc_mx_ff_number || null,
          legal_name: carrier.legal_name || carrier.carrier_name || null,
          op_auth_status: carrier.op_auth_status || null,
          op_auth_type: carrier.op_auth_type || null,
          phone_number: carrier.bus_telno || carrier.telephone || null,
        });
      }

      const batch = Array.from(uniqueCarriers.values());

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