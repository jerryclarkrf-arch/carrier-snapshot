'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface InsurancePolicy {
  policy_no: string;
  insurance_company_name: string | null;
  ins_type_code: string | null;
  max_cov_amount: number | null;
  effective_date: string | null;
}

interface Carrier {
  usdot_number: string;
  docket_number: string | null;
  legal_name: string | null;
  dot_status: string | null;
  op_auth_status: string | null;
  op_auth_type: string | null;
  phone_number: string | null;
  email_address: string | null;
  tot_pwr: number | null;
  tot_cdl: number | null;
  phy_street: string | null;
  phy_city: string | null;
  phy_state: string | null;
  phy_zip: string | null;
  mailing_street: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  mcs150_date: string | null;
  cargo_classifications: Record<string, string> | null;
  insurance_policies: InsurancePolicy[];
}

interface Inspection {
  report_number: string;
  inspection_date: string;
  report_state: string;
  basic_desc: string | null;
  violation_group_desc: string | null;
}

export default function CarrierSearchPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Active Only');
  const [filterState, setFilterState] = useState('');
  const [activeSince, setActiveSince] = useState<number | null>(null);
  
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [openFilterMenu, setOpenFilterMenu] = useState<string | null>('Added');

  const [activeTab, setActiveTab] = useState<Record<string, string>>({});
  const [inspections, setInspections] = useState<Record<string, Inspection[]>>({});
  const [loadingInspections, setLoadingInspections] = useState<Record<string, boolean>>({});
  const [smsData, setSmsData] = useState<Record<string, any>>({});
  const [loadingSms, setLoadingSms] = useState<Record<string, boolean>>({});

  const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ];

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    setLoading(true);
    setSearched(true);
    setCarriers([]);
    setActiveTab({});

    try {
      const { data, error } = await supabase.rpc('search_carriers', {
        query_text: searchTerm.trim(),
        only_active: filterStatus === 'Active Only',
        filter_state: filterState || null,
        active_since_days: activeSince,
        row_limit: 25,
      });

      if (error) {
        console.error('Search query error:', error);
      } else {
        const results = (data as Carrier[]) || [];
        setCarriers(results);
        const initialTabs: Record<string, string> = {};
        results.forEach((c: Carrier) => { initialTabs[c.usdot_number] = 'General'; });
        setActiveTab(initialTabs);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSearchTerm('');
    setFilterStatus('Active Only');
    setFilterState('');
    setActiveSince(null);
    setCarriers([]);
    setSearched(false);
  };

  const fetchFMCSAInspections = async (dotNumber: string) => {
    if (inspections[dotNumber]) return;
    setLoadingInspections(prev => ({ ...prev, [dotNumber]: true }));
    try {
      const response = await fetch(`https://data.transportation.gov/resource/fx4q-ay7w.json?dot_number=${dotNumber}&$limit=50&$order=insp_date DESC`);
      if (!response.ok) throw new Error('Failed to fetch DOT inspection data');
      
      const rawData = await response.json();
      const mappedData = rawData.map((item: any) => {
        const rawDate = item.insp_date || '';
        const formattedDate = rawDate.length === 8 ? `${rawDate.substring(4,6)}/${rawDate.substring(6,8)}/${rawDate.substring(0,4)}` : 'N/A';
        const category = `Level ${item.insp_level_id || 'Unknown'}`;
        const violTotal = parseInt(item.viol_total || '0', 10);
        let violDetail = violTotal > 0 ? `${violTotal} Violations` : 'No Violations';

        return {
          report_number: item.report_number || item.inspection_id || 'Unknown',
          inspection_date: formattedDate,
          report_state: item.report_state || 'N/A',
          basic_desc: category,
          violation_group_desc: violDetail
        };
      });
      setInspections(prev => ({ ...prev, [dotNumber]: mappedData }));
    } catch (error) {
      setInspections(prev => ({ ...prev, [dotNumber]: [] }));
    } finally {
      setLoadingInspections(prev => ({ ...prev, [dotNumber]: false }));
    }
  };

  const fetchFMCSASMS = async (dotNumber: string) => {
    if (smsData[dotNumber] !== undefined) return;
    setLoadingSms(prev => ({ ...prev, [dotNumber]: true }));
    try {
      const response = await fetch(`/api/sms?dotNumber=${dotNumber}`);
      if (!response.ok) throw new Error('API Reject');
      const rawData = await response.json();
      setSmsData(prev => ({ ...prev, [dotNumber]: rawData[0] || null }));
    } catch (error) {
      setSmsData(prev => ({ ...prev, [dotNumber]: null }));
    } finally {
      setLoadingSms(prev => ({ ...prev, [dotNumber]: false }));
    }
  };

  const handleTabChange = (dotNumber: string, tab: string) => {
    setActiveTab(prev => ({ ...prev, [dotNumber]: tab }));
    if (tab === 'Inspections') fetchFMCSAInspections(dotNumber);
    else if (tab === 'SMS') fetchFMCSASMS(dotNumber);
  };

  const formatCargo = (cargo: Record<string, string> | null) => {
    if (!cargo) return [];
    const labels: Record<string, string> = { general_freight: 'General Freight', refrigerated: 'Refrigerated Food', hazmat: 'Hazmat' };
    return Object.entries(cargo).filter(([_, val]) => val === 'Y' || val === 'X').map(([key]) => labels[key] || key);
  };

  const SidebarItem = ({ title, value }: { title: string, value: string }) => {
    const isOpen = openFilterMenu === value;
    return (
      <div className="border-b border-slate-200 last:border-0">
        <button 
          onClick={() => setOpenFilterMenu(isOpen ? null : value)}
          className="w-full text-left px-4 py-3 flex justify-between items-center bg-white hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700"
        >
          {title}
          <span className="text-slate-400 text-xs">{isOpen ? '▼' : '▶'}</span>
        </button>
        {isOpen && (
          <div className="px-4 pb-4 pt-1 bg-white">
            {value === 'Added' && (
              <select value={activeSince === null ? '' : activeSince} onChange={(e) => setActiveSince(e.target.value ? Number(e.target.value) : null)} className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-700 shadow-sm focus:ring-2 focus:ring-[#0f172a]">
                <option value="">Any Time</option>
                <option value="7">Last 7 Days</option>
                <option value="30">Last 1 Month</option>
                <option value="90">Last 3 Months</option>
                <option value="180">Last 6 Months</option>
              </select>
            )}
            {value === 'Location' && (
              <select value={filterState} onChange={(e) => setFilterState(e.target.value)} className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-700 shadow-sm focus:ring-2 focus:ring-[#0f172a]">
                <option value="">All States</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {value === 'DOT Status' && (
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-700 shadow-sm focus:ring-2 focus:ring-[#0f172a]">
                <option value="Active Only">Active Only</option>
                <option value="All Authorities">All Authorities</option>
              </select>
            )}
            {['Power Units', 'Entity Type'].includes(value) && (
              <div className="text-xs text-slate-400 italic">Filter module under construction.</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-8 border-b border-slate-200 pb-4">
          <h1 className="text-3xl font-extrabold text-[#0f172a] tracking-tight">Advanced Search Companies</h1>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* ADVANCED FILTERS SIDEBAR */}
          <aside className="w-full lg:w-72 shrink-0 bg-white border border-slate-200 rounded-lg shadow-sm h-fit overflow-hidden">
            <SidebarItem title="Added" value="Added" />
            <SidebarItem title="Location" value="Location" />
            <SidebarItem title="DOT Status" value="DOT Status" />
            <SidebarItem title="Entity Type" value="Entity Type" />
            <SidebarItem title="Power Units" value="Power Units" />
            
            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
              <button onClick={handleSearch} className="w-full bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-bold py-2.5 rounded shadow-sm transition-colors">
                {loading ? 'Searching...' : 'Search'}
              </button>
              <button onClick={handleReset} className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded shadow-sm transition-colors">
                Reset
              </button>
            </div>
          </aside>

          {/* MAIN RESULTS AREA */}
          <section className="flex-1 space-y-6">
            <form onSubmit={handleSearch} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by USDOT, MC#, Company Name, or Phone (Optional)"
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0f172a]"
              />
            </form>

            <div className="space-y-6">
              {carriers.map((carrier) => {
                const currentTab = activeTab[carrier.usdot_number] || 'General';
                const policies = carrier.insurance_policies || [];
                const carrierInspections = inspections[carrier.usdot_number];

                return (
                  <div key={carrier.usdot_number} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-200 bg-white">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                          <h2 className="text-xl font-bold text-slate-900 uppercase">{carrier.legal_name || 'LEGAL NAME NOT ON FILE'}</h2>
                          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs font-semibold">
                            <span className="text-slate-600">USDOT# <span className="text-slate-900">{carrier.usdot_number}</span></span>
                            <span className={`px-2 py-0.5 rounded-full ${carrier.dot_status?.toUpperCase() === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                              {carrier.dot_status || 'Unknown'}
                            </span>
                            {carrier.docket_number && (
                              <>
                                <span className="text-slate-300">|</span>
                                <span className="text-slate-600">Carrier <span className="text-slate-900">{carrier.docket_number}</span></span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center min-w-[90px]">
                            <span className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase">Power Units</span>
                            <span className="text-lg font-extrabold text-slate-800">{carrier.tot_pwr ?? '-'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex border-b border-slate-200 bg-slate-50 px-4 overflow-x-auto">
                      {['General', 'SMS', 'Inspections'].map(tab => (
                        <button
                          key={tab}
                          onClick={() => handleTabChange(carrier.usdot_number, tab)}
                          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            currentTab === tab ? 'border-[#0f172a] text-[#0f172a] bg-white' : 'border-transparent text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    <div className="p-6">
                      {currentTab === 'General' && (
                        <div className="animate-in fade-in duration-300 space-y-6">
                          <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div className="space-y-1 text-slate-600">
                              <p><strong className="text-slate-800">Physical Address:</strong><br />
                                {[carrier.phy_street, carrier.phy_city, carrier.phy_state].filter(Boolean).join(', ') || 'Not Listed'}
                              </p>
                            </div>
                            <div className="space-y-1 text-slate-600">
                              <p><strong className="text-slate-800">Operating Scope:</strong> {carrier.op_auth_type || 'N/A'}</p>
                              <p><strong className="text-slate-800">Last MCS-150:</strong> {carrier.mcs150_date || 'N/A'}</p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {currentTab === 'Inspections' && (
                        <div className="animate-in fade-in duration-300">
                          {loadingInspections[carrier.usdot_number] ? (
                            <div className="py-12 flex justify-center text-sm text-slate-600">Querying Federal Motor Carrier database...</div>
                          ) : (
                            <div>
                               {!carrierInspections || carrierInspections.length === 0 ? (
                                 <p className="text-sm italic text-slate-500">No recent roadside inspections found.</p>
                               ) : (
                                 <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                   <table className="min-w-full divide-y divide-slate-200 text-xs">
                                     <thead className="bg-slate-50 text-slate-600 font-semibold">
                                       <tr>
                                         <th className="py-2 px-3 text-left">Date</th>
                                         <th className="py-2 px-3 text-left">State</th>
                                         <th className="py-2 px-3 text-left">Category</th>
                                       </tr>
                                     </thead>
                                     <tbody className="divide-y divide-slate-100 bg-white">
                                       {carrierInspections.map((insp, idx) => (
                                         <tr key={idx} className="hover:bg-slate-50">
                                           <td className="py-2 px-3 whitespace-nowrap">{insp.inspection_date}</td>
                                           <td className="py-2 px-3 font-semibold">{insp.report_state}</td>
                                           <td className="py-2 px-3 text-slate-700">{insp.basic_desc}</td>
                                         </tr>
                                       ))}
                                     </tbody>
                                   </table>
                                 </div>
                               )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {searched && !loading && carriers.length === 0 && (
                <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center text-sm text-slate-500">
                  No active carrier records found matching your exact advanced filters.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}