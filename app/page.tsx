'use client';
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    
    // Search by USDOT or Name
    const { data } = await supabase
      .from('carriers')
      .select('*')
      .or(`usdot_number.eq.${query},docket_number.eq.${query},legal_name.ilike.%${query}%`)
      .limit(10);
    
    if (data) setResults(data);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Motus Carrier Lookup</h1>
      
      <form onSubmit={handleSearch} className="mb-8 flex gap-4">
        <input 
          type="text" 
          placeholder="Enter USDOT or Company Name..." 
          className="border p-2 flex-1 rounded text-black"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded">
          Search
        </button>
      </form>

      <div className="grid gap-4">
        {results.map((carrier) => (
          <div key={carrier.usdot_number} className="border p-4 rounded shadow">
            <h2 className="text-xl font-bold">{carrier.legal_name}</h2>
            <p><strong>USDOT:</strong> {carrier.usdot_number}</p>
            <p><strong>Status:</strong> {carrier.op_auth_status}</p>
            <p><strong>Authority Type:</strong> {carrier.op_auth_type}</p>
          </div>
        ))}
      </div>
    </div>
  );
}