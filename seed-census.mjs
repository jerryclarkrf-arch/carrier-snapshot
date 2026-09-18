import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase keys in environment.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function mapStatusCode(code) {
  if (!code) return 'Unknown';
  const c = code.toUpperCase();
  if (c === 'A') return 'Active';
  if (c === 'I') return 'Inactive';
  if (c === 'P') return 'Pending';
  return code;
}

async function runCensusPatch() {
  let offset = 0;
  const limit = 1000; 
  let hasMore = true;
  let totalProcessed = 0;

  console.log('Initiating Strict Enrichment (Updating existing 1.86M records only)...');

  while (hasMore) {
    const url = `https://data.transportation.gov/resource/az4n-8mr2.json?$limit=${limit}&$offset=${offset}&$order=:id`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (!Array.isArray(data)) throw new Error('API returned an invalid response.');

      if (data.length === 0) {
        hasMore = false;
        console.log('\nStrict Enrichment finished successfully.');
        break;
      }

      const uniqueCarriers = new Map();

      for (const record of data) {
        const rawDot = record.dot_number || record.usdot_number;
        if (!rawDot) continue;
        const normalizedDot = String(rawDot).replace(/^0+/, '');

        const prefix = record.docket1prefix || '';
        const num = record.docket1 || '';
        const formattedDocket = prefix || num ? `${prefix}${num}`.trim() : null;

        const pwr = parseInt(record.owntract || record.tot_pwr, 10);
        const cdl = parseInt(record.total_cdl, 10);
        
        const mappedStatus = mapStatusCode(record.docket1_status_code);

        uniqueCarriers.set(normalizedDot, {
          usdot_number: normalizedDot,
          docket_number: formattedDocket,
          dot_status: mappedStatus,
          op_auth_status: mappedStatus,
          op_auth_type: record.classdef || null,
          email_address: record.email_address || null,
          mcs150_date: record.mcsipdate || record.mcs150_date || null,
          tot_pwr: isNaN(pwr) ? null : pwr,
          tot_cdl: isNaN(cdl) ? null : cdl,
          phy_street: record.phy_street || null,
          phy_city: record.phy_city || null,
          phy_state: record.phy_state || null,
          phy_zip: record.phy_zip || null,
          mailing_street: record.carrier_mailing_street || null,
          mailing_city: record.carrier_mailing_city || null,
          mailing_state: record.carrier_mailing_state || null,
          mailing_zip: record.carrier_mailing_zip || null,
          cargo_classifications: {
            general_freight: record.crgo_genfreight || 'N',
            fresh_produce: record.crgo_freshprod || 'N',
            meat: record.crgo_meat || 'N',
            refrigerated: record.crgo_coldfood || 'N',
            hazmat: record.hm_ind || 'N'
          }
        });
      }

      const batch = Array.from(uniqueCarriers.values());

      if (batch.length > 0) {
        // We trigger the SQL RPC function instead of upsert
        const { error } = await supabase.rpc('bulk_update_carriers', { payload: batch });
        if (error) throw error;
      }

      offset += limit;
      totalProcessed += data.length;
      process.stdout.write(`\rScanned ${totalProcessed.toLocaleString()} records...`);
      
    } catch (err) {
      console.error(`\nError encountered: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

runCensusPatch();