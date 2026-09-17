async function checkSchema() {
  console.log("Fetching raw DOT data for 3270258...\n");

  // 1. Querying the Legacy Master Dataset using 'usdot_number'
  const legacyUrl = `https://data.transportation.gov/resource/6eyk-hxee.json?usdot_number=3270258`;
  
  // 2. Querying the Company Census Dataset using 'dot_number'
  const censusUrl = `https://data.transportation.gov/resource/az4n-8mr2.json?dot_number=3270258`;
  
  try {
    const [legacyRes, censusRes] = await Promise.all([
      fetch(legacyUrl),
      fetch(censusUrl)
    ]);

    const legacyData = await legacyRes.json();
    const censusData = await censusRes.json();
    
    console.log("=== 1. LEGACY MASTER DATASET (6eyk-hxee) ===");
    if (legacyData.length > 0) {
      console.log(legacyData[0]);
    } else {
      console.log("❌ Still no record found in Legacy.");
    }

    console.log("\n=== 2. CENSUS DATASET (az4n-8mr2) ===");
    if (censusData.length > 0) {
      console.log(censusData[0]);
    } else {
      console.log("❌ No record found in Census.");
    }
    
  } catch (err) {
    console.error("Error:", err);
  }
}

checkSchema();