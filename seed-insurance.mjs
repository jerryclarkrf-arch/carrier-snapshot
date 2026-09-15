import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase keys. Ensure your .env.local file is configured.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runInsuranceSeed() {
  let offset = 0;
  const limit = 1000;
  let hasMore = true;
  let totalProcessed = 0;

  console.log('Initiating FMCSA active insurance database seed...');

  while (hasMore) {
    // FMCSA "ActPendInsur - All With History" endpoint
    const url = `https://data.transportation.gov/resource/qh9u-swkp.json?$limit=${limit}&$offset=${offset}`;
    
    try {
      const res = await fetch(url);
      const data = await res.json();

      if (!data || data.length === 0) {
        hasMore = false;
        console.log('\n\n✅ Insurance database seed completely finished!');
        break;
      }

      // Deduplicate using a composite key: usdot_number + policy_no + ins_type_code
      const uniquePolicies = new Map();
      
      for (const policy of data) {
        // The insurance endpoint identifies the USDOT as dot_number
        const rawDot = policy.dot_number || policy.usdot_number;
        const policyNo = policy.policy_no || 'UNKNOWN';
        const typeCode = policy.ins_type_code || 'UNKNOWN';
        
        if (!rawDot) continue; 
        
        // Strip leading zeros to ensure primary key matches your carriers table
        const normalizedDot = String(rawDot).replace(/^0+/, '');
        const compositeKey = `${normalizedDot}-${policyNo}-${typeCode}`;
        
        uniquePolicies.set(compositeKey, {
          usdot_number: normalizedDot,
          insurance_company_name: policy.insurance_company_name || null,
          policy_no: policyNo,
          ins_type_code: typeCode,
          max_cov_amount: policy.max_cov_amount ? parseFloat(policy.max_cov_amount) : null,
          effective_date: policy.effective_date || null,
        });
      }

      const batch = Array.from(uniquePolicies.values());

      // Execute upsert against the composite UNIQUE constraint
      const { error } = await supabase.from('insurance_policies').upsert(batch, { 
        onConflict: 'usdot_number, policy_no, ins_type_code' 
      });

      if (error) throw error;

      offset += limit;
      totalProcessed += data.length;
      
      process.stdout.write(`\rProcessed ${totalProcessed.toLocaleString()} raw insurance records...`);
      
    } catch (err) {
      console.error(`\n❌ Error during fetch or upsert: ${err.message}`);
      console.log('Retrying the current batch in 5 seconds...');
      await new Promise(res => setTimeout(res, 5000));
    }
  }
}

runInsuranceSeed();