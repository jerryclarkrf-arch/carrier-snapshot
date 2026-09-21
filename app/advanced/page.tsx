'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function AdvancedSearchPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Active Only');
  const [filterState, setFilterState] = useState('');
  const [activeSince, setActiveSince] = useState<number | null>(null);
  
  const [carriers, setCarriers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [openFilterMenu, setOpenFilterMenu] = useState<string | null>('Added');

  const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true); setCarriers([]);

    try {
      // Calling the NEW advanced RPC function
      const { data, error } = await supabase.rpc('search_carriers_advanced', {
        p_query: searchTerm.trim(),
        p_only_active: filterStatus === 'Active Only',
        p_state: filterState || null,
        p_days_active: activeSince,
        p_limit: 50,
      });

      if (!error && data) setCarriers(data);
      else console.error('Supabase Error:', error);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  const SidebarItem = ({ title, value }: { title: string, value: string }) => {
    const isOpen = openFilterMenu === value;
    return (
      <div className="border-b border-slate-200">
        <button onClick={() => setOpenFilterMenu(isOpen ? null : value)} className="w-full text-left px-4 py-3 flex justify-between items-center bg-slate-50 hover:bg-slate-100 text-sm font-bold text-slate-700">
          {title} <span className="text-slate-400 text-xs">{isOpen ? '▼' : '▶'}</span>
        </button>
        {isOpen && (
          <div className="p-4 bg-white">
            {value === 'Added' && (
              <select value={activeSince === null ? '' : activeSince} onChange={(e) => setActiveSince(e.target.value ? Number(e.target.value) : null)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm">
                <option value="">Any Time</option>
                <option value="7">Last 7 Days</option>
                <option value="30">Last 1 Month</option>
                <option value="180">Last 6 Months</option>
              </select>
            )}
            {value === 'Location' && (
              <select value={filterState} onChange={(e) => setFilterState(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm">
                <option value="">All States</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {value === 'DOT Status' && (
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm">
                <option value="Active Only">Active Only</option>
                <option value="All">All Authorities</option>
              </select>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="bg-[#0f172a] text-white px-6 py-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-xl tracking-tight">CARRIER SNAPSHOT</span>
        </div>
        <div className="flex gap-6 text-sm font-medium">
          <Link href="/" className="hover:text-blue-400 transition-colors">Simple Search</Link>
          <Link href="/advanced" className="text-blue-400">Advanced Search</Link>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto py-8 px-4 flex flex-col lg:flex-row gap-6">
        {/* Left Sidebar */}
        <aside className="w-full lg:w-72 shrink-0 bg-white border border-slate-200 rounded-lg shadow-sm h-fit overflow-hidden">
          <SidebarItem title="Added" value="Added" />
          <SidebarItem title="Location" value="Location" />
          <SidebarItem title="DOT Status" value="DOT Status" />
          
          <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
            <button onClick={handleSearch} className="w-full bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-bold py-2.5 rounded transition-colors">
              {loading ? 'Searching...' : 'Search'}
            </button>
            <button onClick={() => { setSearchTerm(''); setFilterState(''); setActiveSince(null); setCarriers([]); }} className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2.5 rounded transition-colors">
              Reset
            </button>
          </div>
        </aside>

        {/* Results Area */}
        <section className="flex-1 space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
             <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search by Company Name or Keyword within results..." className="w-full border border-slate-300 rounded px-4 py-2 text-sm focus:ring-2 focus:ring-blue-600 outline-none" />
          </div>

          <div className="space-y-4">
            {carriers.map(c => (
              <div key={c.usdot_number} className="bg-white border border-slate-200 p-5 rounded-lg shadow-sm flex justify-between items-center">
                <div>
                  <h3 className="font-bold uppercase text-lg">{c.legal_name}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    USDOT: {c.usdot_number} | STATE: {c.phy_state} | ADDED: {c.mcs150_date || 'N/A'}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase ${c.dot_status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                    {c.dot_status}
                  </span>
                  <div className="text-sm font-extrabold mt-1">{c.tot_pwr || 0} Units</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}