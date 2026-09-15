'use client';
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    
    let dbQuery = supabase.from('carriers').select('*');

    // Apply text search if a query is typed
    if (query) {
      dbQuery = dbQuery.or(`usdot_number.eq.${query},docket_number.eq.${query},legal_name.ilike.%${query}%`);
    }

    // Apply the dropdown filter if it is not set to 'All'
    if (statusFilter !== 'All') {
      dbQuery = dbQuery.eq('op_auth_status', statusFilter);
    }

    const { data } = await dbQuery.limit(20);
    if (data) setResults(data);
    
    setLoading(false);
  }

  // Determine Tailwind badge colors based on authority status
  const getBadgeStyle = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Inactive':
      case 'Withdrawn':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Carrier Lookup Dashboard</h1>
      
      <form onSubmit={handleSearch} className="mb-8 flex flex-col sm:flex-row gap-4">
        <input 
          type="text" 
          placeholder="Search by USDOT, MC Number, or Legal Name..." 
          className="border p-2 flex-1 rounded text-black bg-white"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        
        <select 
          className="border p-2 rounded text-black bg-white"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Pending">Pending</option>
          <option value="Inactive">Inactive</option>
          <option value="Withdrawn">Withdrawn</option>
        </select>

        <button type="submit" className="bg-blue-600 text-white px-8 py-2 rounded font-semibold hover:bg-blue-700 transition">
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      <div className="grid gap-4">
        {results.length === 0 && !loading && (
          <p className="text-gray-400">Search for a carrier to see results.</p>
        )}
        
        {results.map((carrier) => (
          <div key={carrier.usdot_number} className="p-5 rounded-lg shadow bg-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border border-gray-200 border-l-4 border-l-blue-600 text-black">
            <div>
              <h2 className="text-xl font-bold mb-1">{carrier.legal_name || 'Name Not Listed'}</h2>
              <div className="text-sm text-gray-700 flex flex-wrap gap-x-4 gap-y-1 mb-2">
                <span><strong>USDOT:</strong> {carrier.usdot_number}</span>
                <span><strong>MC:</strong> {carrier.docket_number || 'N/A'}</span>
                <span><strong>Phone:</strong> {carrier.phone_number || 'No phone listed'}</span>
              </div>
              <p className="text-xs text-gray-500 font-medium tracking-wide">{carrier.op_auth_type}</p>
            </div>
            
            <span className={`px-3 py-1 text-xs font-bold rounded-full border shadow-sm ${getBadgeStyle(carrier.op_auth_status)}`}>
              {carrier.op_auth_status || 'Unknown'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}