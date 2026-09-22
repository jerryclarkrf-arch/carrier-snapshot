'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

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

export default function AdvancedSearchPage() {
  const [filterStatus, setFilterStatus] = useState('Active Only');
  const [filterState, setFilterState] = useState('');
  const [activeSince, setActiveSince] = useState<number | null>(null);
  const [localFilter, setLocalFilter] = useState('');
  
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [openFilterMenu, setOpenFilterMenu] = useState<string | null>('Added');
  const [searched, setSearched] = useState(false);

  // Detailed View State
  const [expandedCarrier, setExpandedCarrier] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Record<string, string>>({});
  const [inspections, setInspections] = useState<Record<string, Inspection[]>>({});
  const [loadingInspections, setLoadingInspections] = useState<Record<string, boolean>>({});
  const [smsData, setSmsData] = useState<Record<string, any>>({});
  const [loadingSms, setLoadingSms] = useState<Record<string, boolean>>({});

  const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true); setCarriers([]); setExpandedCarrier(null); setSearched(true);

    try {
      const { data, error } = await supabase.rpc('search_carriers_advanced', {
        p_query: '', // Advanced search bypasses text query to prevent timeouts
        p_only_active: filterStatus === 'Active Only',
        p_state: filterState || null,
        p_days_active: activeSince,
        p_limit: 50,
      });

      if (!error && data) {
        const results = data as Carrier[];
        setCarriers(results);
        const initialTabs: Record<string, string> = {};
        results.forEach((c) => { initialTabs[c.usdot_number] = 'General'; });
        setActiveTab(initialTabs);
      } else {
        console.error('Supabase Error:', error);
      }
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  const exportToCSV = () => {
    if (carriers.length === 0) return;
    const headers = ['USDOT', 'MC Number', 'Company Name', 'Status', 'Authority', 'Power Units', 'Drivers', 'Phone', 'State', 'Added Date'];
    const csvRows = [headers.join(',')];
    
    carriers.forEach(c => {
      const cleanName = c.legal_name ? c.legal_name.replace(/"/g, '""') : '';
      const row = [
        c.usdot_number, c.docket_number || '', `"${cleanName}"`, c.dot_status || '',
        c.op_auth_type || '', c.tot_pwr || '0', c.tot_cdl || '0', c.phone_number || '',
        c.phy_state || '', c.mcs150_date || ''
      ];
      csvRows.push(row.join(','));
    });
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TurboFreight_Capacity_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
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
        const oosTotal = parseInt(item.oos_total || '0', 10);
        let violDetail = 'No Violations';
        if (violTotal > 0) {
           violDetail = `${violTotal} Violation${violTotal > 1 ? 's' : ''}`;
           if (oosTotal > 0) violDetail += ` (${oosTotal} Out-of-Service)`;
        }
        return {
          report_number: item.report_number || item.inspection_id || 'Unknown',
          inspection_date: formattedDate,
          report_state: item.report_state || 'N/A',
          basic_desc: category,
          violation_group_desc: violDetail
        };
      });
      setInspections(prev => ({ ...prev, [dotNumber]: mappedData }));
    } catch (error) { setInspections(prev => ({ ...prev, [dotNumber]: [] })); } 
    finally { setLoadingInspections(prev => ({ ...prev, [dotNumber]: false })); }
  };

  const fetchFMCSASMS = async (dotNumber: string) => {
    if (smsData[dotNumber] !== undefined) return;
    setLoadingSms(prev => ({ ...prev, [dotNumber]: true }));
    try {
      const response = await fetch(`/api/sms?dotNumber=${dotNumber}`);
      if (!response.ok) throw new Error('Backend rejected request');
      const rawData = await response.json();
      setSmsData(prev => ({ ...prev, [dotNumber]: rawData[0] || null }));
    } catch (error) { setSmsData(prev => ({ ...prev, [dotNumber]: null })); } 
    finally { setLoadingSms(prev => ({ ...prev, [dotNumber]: false })); }
  };

  const handleTabChange = (dotNumber: string, tab: string) => {
    setActiveTab(prev => ({ ...prev, [dotNumber]: tab }));
    if (tab === 'Inspections') fetchFMCSAInspections(dotNumber);
    else if (tab === 'SMS') fetchFMCSASMS(dotNumber);
  };

  const toggleExpand = (dotNumber: string) => {
    setExpandedCarrier(expandedCarrier === dotNumber ? null : dotNumber);
  };

  const formatCargo = (cargo: Record<string, string> | null) => {
    if (!cargo) return [];
    const labels: Record<string, string> = { general_freight: 'General Freight', fresh_produce: 'Fresh Produce', meat: 'Meat', refrigerated: 'Refrigerated Food', hazmat: 'Hazmat' };
    return Object.entries(cargo).filter(([_, val]) => val === 'Y' || val === 'X').map(([key]) => labels[key] || key);
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
                <option value="90">Last 3 Months</option>
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

  const filteredCarriers = carriers.filter(c => 
    c.legal_name?.toLowerCase().includes(localFilter.toLowerCase()) || 
    c.usdot_number?.includes(localFilter) || 
    c.docket_number?.toLowerCase().includes(localFilter.toLowerCase())
  );

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
            <button onClick={() => { setFilterState(''); setActiveSince(null); setCarriers([]); setSearched(false); }} className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2.5 rounded transition-colors">
              Reset
            </button>
          </div>
        </aside>

        {/* Results Area */}
        <section className="flex-1 space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
             <input type="text" value={localFilter} onChange={(e) => setLocalFilter(e.target.value)} placeholder="Filter by Company Name or Keyword within results..." className="w-full border border-slate-300 rounded px-4 py-2 text-sm focus:ring-2 focus:ring-blue-600 outline-none" />
          </div>

          {searched && (
            <div className="flex justify-between items-center px-1">
               <div className="text-sm font-semibold text-slate-600">
                  Showing <span className="text-blue-600 font-bold">{filteredCarriers.length}</span> results 
                  {carriers.length === 50 && <span className="text-xs text-slate-400 ml-1">(Limited to top 50 matches)</span>}
               </div>
               <button onClick={exportToCSV} className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3 py-1.5 rounded text-xs font-bold transition-colors">
                 Download CSV
               </button>
            </div>
          )}

          <div className="space-y-4">
            {filteredCarriers.map(c => {
              const isExpanded = expandedCarrier === c.usdot_number;
              const currentTab = activeTab[c.usdot_number] || 'General';
              const cargoBadges = formatCargo(c.cargo_classifications);
              const policies = c.insurance_policies || [];
              const carrierInspections = inspections[c.usdot_number];
              const isLoadingInspections = loadingInspections[c.usdot_number];

              return (
                <div key={c.usdot_number} className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden transition-all">
                  {/* Clickable Header Card */}
                  <div 
                    onClick={() => toggleExpand(c.usdot_number)} 
                    className="p-5 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <h3 className="font-bold uppercase text-lg">{c.legal_name}</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        USDOT: {c.usdot_number} | STATE: {c.phy_state} | ADDED: {c.mcs150_date || 'N/A'}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase ${c.dot_status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                          {c.dot_status}
                        </span>
                        <div className="text-sm font-extrabold mt-1">{c.tot_pwr || 0} Units</div>
                      </div>
                      <div className="text-slate-400 text-lg">
                        {isExpanded ? '▲' : '▼'}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Detailed View */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 bg-white">
                      <div className="flex border-b border-slate-200 bg-slate-50 px-4 overflow-x-auto">
                        {['General', 'SMS', 'Inspections'].map(tab => (
                          <button
                            key={tab}
                            onClick={() => handleTabChange(c.usdot_number, tab)}
                            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                              currentTab === tab ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                            }`}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>

                      <div className="p-6">
                        {/* GENERAL TAB */}
                        {currentTab === 'General' && (
                          <div className="animate-in fade-in duration-300 space-y-6">
                            <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                              <span>Phone: <strong className="text-slate-800">{c.phone_number || 'N/A'}</strong></span>
                              <span>Email: <strong className="text-blue-600">{c.email_address || 'N/A'}</strong></span>
                            </div>
                            <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                              <div className="space-y-1 text-slate-600">
                                <p><strong className="text-slate-800">Physical Address:</strong><br />
                                  {[c.phy_street, c.phy_city, c.phy_state, c.phy_zip].filter(Boolean).join(', ') || 'Not Listed'}
                                </p>
                                <p className="pt-2"><strong className="text-slate-800">Mailing:</strong><br />
                                  {[c.mailing_street, c.mailing_city, c.mailing_state, c.mailing_zip].filter(Boolean).join(', ') || 'Not Listed'}
                                </p>
                              </div>
                              <div className="space-y-1 text-slate-600">
                                <p><strong className="text-slate-800">Operating Scope:</strong> {c.op_auth_type || 'N/A'}</p>
                                <p><strong className="text-slate-800">Last MCS-150:</strong> {c.mcs150_date || 'N/A'}</p>
                                {cargoBadges.length > 0 && (
                                  <div className="flex flex-wrap gap-1 pt-2">
                                    {cargoBadges.map((tag) => (
                                      <span key={tag} className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-medium">{tag}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div>
                              <h3 className="text-xs font-bold tracking-wider text-slate-500 uppercase mb-2">Verified Insurance ({policies.length})</h3>
                              {policies.length === 0 ? (
                                <p className="text-xs italic text-slate-500">No active insurance certificates on file.</p>
                              ) : (
                                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                                    <thead className="bg-slate-50 text-slate-600 font-semibold">
                                      <tr>
                                        <th className="py-2 px-3 text-left">Policy #</th>
                                        <th className="py-2 px-3 text-left">Company</th>
                                        <th className="py-2 px-3 text-left">Type</th>
                                        <th className="py-2 px-3 text-left">Coverage</th>
                                        <th className="py-2 px-3 text-left">Effective</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                      {policies.map((p, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                          <td className="py-2 px-3 font-mono font-medium">{p.policy_no}</td>
                                          <td className="py-2 px-3">{p.insurance_company_name || 'Unknown'}</td>
                                          <td className="py-2 px-3">{p.ins_type_code || 'N/A'}</td>
                                          <td className="py-2 px-3 text-emerald-700 font-medium">{p.max_cov_amount ? `$${Number(p.max_cov_amount).toLocaleString()}` : 'N/A'}</td>
                                          <td className="py-2 px-3">{p.effective_date || 'N/A'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* SMS TAB */}
                        {currentTab === 'SMS' && (
                          <div className="animate-in fade-in duration-300">
                            {loadingSms[c.usdot_number] ? (
                              <div className="py-12 flex justify-center items-center text-sm text-blue-600 font-medium space-x-2">
                                 <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                 <span>Querying Carrier Safety Measurement System...</span>
                              </div>
                            ) : (
                              <div>
                                 {!smsData[c.usdot_number] ? (
                                   <p className="text-sm italic text-slate-500 py-4">No SMS safety scores found for this carrier in the FMCSA database.</p>
                                 ) : (
                                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                        <h3 className="text-xs font-bold tracking-wider text-slate-500 uppercase mb-3">Vehicle & Driver Fitness</h3>
                                        <div className="space-y-2 text-sm text-slate-700">
                                          <p className="flex justify-between border-b border-slate-200 pb-1">
                                            <span>Unsafe Driving Measure:</span> 
                                            <span className="font-semibold">{smsData[c.usdot_number].unsafe_driving_measure || 'N/A'}</span>
                                          </p>
                                          <p className="flex justify-between border-b border-slate-200 pb-1">
                                            <span>HOS Compliance Measure:</span> 
                                            <span className="font-semibold">{smsData[c.usdot_number].hos_compliance_measure || 'N/A'}</span>
                                          </p>
                                          <p className="flex justify-between border-b border-slate-200 pb-1">
                                            <span>Vehicle Maint. Measure:</span> 
                                            <span className="font-semibold">{smsData[c.usdot_number].vehicle_maint_measure || 'N/A'}</span>
                                          </p>
                                        </div>
                                     </div>
                                     
                                     <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                        <h3 className="text-xs font-bold tracking-wider text-slate-500 uppercase mb-3">Compliance & Incidents</h3>
                                        <div className="space-y-2 text-sm text-slate-700">
                                          <p className="flex justify-between border-b border-slate-200 pb-1">
                                            <span>Crash Indicator Measure:</span> 
                                            <span className="font-semibold">{smsData[c.usdot_number].crash_indicator_measure || 'N/A'}</span>
                                          </p>
                                          <p className="flex justify-between border-b border-slate-200 pb-1">
                                            <span>Controlled Substance Measure:</span> 
                                            <span className="font-semibold">{smsData[c.usdot_number].controlled_substance_measure || 'N/A'}</span>
                                          </p>
                                          <p className="flex justify-between border-b border-slate-200 pb-1">
                                            <span>Total Inspections:</span> 
                                            <span className="font-semibold">{smsData[c.usdot_number].total_inspections || 'N/A'}</span>
                                          </p>
                                        </div>
                                     </div>
                                   </div>
                                 )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* INSPECTIONS TAB */}
                        {currentTab === 'Inspections' && (
                          <div className="animate-in fade-in duration-300">
                            {isLoadingInspections ? (
                              <div className="py-12 flex justify-center items-center text-sm text-blue-600 font-medium space-x-2">
                                 <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                 <span>Querying Federal Motor Carrier database...</span>
                              </div>
                            ) : (
                              <div>
                                 {!carrierInspections || carrierInspections.length === 0 ? (
                                   <p className="text-sm italic text-slate-500 py-4">No recent roadside inspections found in DOT records.</p>
                                 ) : (
                                   <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                     <table className="min-w-full divide-y divide-slate-200 text-xs">
                                       <thead className="bg-slate-50 text-slate-600 font-semibold">
                                         <tr>
                                           <th className="py-2 px-3 text-left">Date</th>
                                           <th className="py-2 px-3 text-left">Report #</th>
                                           <th className="py-2 px-3 text-left">State</th>
                                           <th className="py-2 px-3 text-left">Category</th>
                                           <th className="py-2 px-3 text-left">Violation Detail</th>
                                         </tr>
                                       </thead>
                                       <tbody className="divide-y divide-slate-100 bg-white">
                                         {carrierInspections.map((insp, idx) => (
                                           <tr key={idx} className="hover:bg-slate-50">
                                             <td className="py-2 px-3 whitespace-nowrap">{insp.inspection_date}</td>
                                             <td className="py-2 px-3 font-mono text-blue-600">{insp.report_number}</td>
                                             <td className="py-2 px-3 font-semibold">{insp.report_state}</td>
                                             <td className="py-2 px-3 text-slate-700">{insp.basic_desc}</td>
                                             <td className="py-2 px-3 text-rose-700">{insp.violation_group_desc}</td>
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
                  )}
                </div>
              );
            })}
          </div>

          {searched && !loading && carriers.length === 0 && (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center text-sm text-slate-500">
              No active carrier records found matching your exact advanced filters.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}