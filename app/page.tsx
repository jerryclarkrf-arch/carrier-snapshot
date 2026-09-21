'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function SimpleSearchPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [carriers, setCarriers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeTab, setActiveTab] = useState<Record<string, string>>({});

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;
    setLoading(true); setSearched(true); setCarriers([]); setActiveTab({});

    try {
      // Calling the original simple search function
      const { data, error } = await supabase.rpc('search_carriers', {
        query_text: searchTerm.trim(), only_active: false, row_limit: 25,
      });

      if (!error && data) {
        setCarriers(data);
        const tabs: Record<string, string> = {};
        data.forEach((c: any) => tabs[c.usdot_number] = 'General');
        setActiveTab(tabs);
      }
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      {/* Top Navigation */}
      <div className="bg-[#0f172a] text-white px-6 py-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-xl tracking-tight">CARRIER SNAPSHOT</span>
        </div>
        <div className="flex gap-6 text-sm font-medium">
          <Link href="/" className="text-blue-400">Simple Search</Link>
          <Link href="/advanced" className="hover:text-blue-400 transition-colors">Advanced Search</Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-[#0f172a] tracking-tight">Direct Lookup</h1>
          <p className="text-sm text-slate-500 mt-2">Find a specific carrier by USDOT, MC#, or Name.</p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 shadow-sm mb-10">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Enter DOT, MC Number, or Company Name..."
            className="flex-1 bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors">
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        <div className="space-y-6">
          {carriers.map((carrier) => (
             <div key={carrier.usdot_number} className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
               <div className="flex justify-between items-start">
                 <div>
                   <h2 className="text-xl font-bold uppercase">{carrier.legal_name}</h2>
                   <div className="text-xs font-semibold text-slate-600 mt-1">
                     USDOT: {carrier.usdot_number} <span className="text-emerald-700 ml-1">{carrier.dot_status}</span>
                     {carrier.docket_number && <span className="ml-3">MC: {carrier.docket_number}</span>}
                   </div>
                 </div>
                 <div className="text-right">
                    <div className="text-xs text-slate-500 uppercase font-bold">Fleet</div>
                    <div className="font-extrabold text-lg">{carrier.tot_pwr || '-'} Units</div>
                 </div>
               </div>
               
               <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4 text-sm text-slate-700">
                  <div><strong>Phone:</strong> {carrier.phone_number || 'N/A'}</div>
                  <div><strong>Location:</strong> {[carrier.phy_city, carrier.phy_state].filter(Boolean).join(', ')}</div>
                  <div><strong>Auth:</strong> {carrier.op_auth_type || 'N/A'}</div>
                  <div><strong>Added:</strong> {carrier.mcs150_date || 'N/A'}</div>
               </div>
             </div>
          ))}
          {searched && !loading && carriers.length === 0 && (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-500">No carrier found.</div>
          )}
        </div>
      </div>
    </main>
  );
}