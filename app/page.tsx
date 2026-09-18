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
  const [filterStatus, setFilterStatus] = useState('All Authorities');
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [activeTab, setActiveTab] = useState<Record<string, string>>({});
  const [inspections, setInspections] = useState<Record<string, Inspection[]>>({});
  const [loadingInspections, setLoadingInspections] = useState<Record<string, boolean>>({});
  const [smsData, setSmsData] = useState<Record<string, any>>({});
  const [loadingSms, setLoadingSms] = useState<Record<string, boolean>>({});

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setSearched(true);
    setCarriers([]);
    setActiveTab({});

    try {
      const { data, error } = await supabase.rpc('search_carriers', {
        query_text: searchTerm.trim(),
        only_active: filterStatus === 'Active Only',
        row_limit: 25,
      });

      if (error) {
        console.error('Search query error:', error);
      } else {
        const results = (data as Carrier[]) || [];
        setCarriers(results);
        
        const initialTabs: Record<string, string> = {};
        results.forEach((c: Carrier) => {
          initialTabs[c.usdot_number] = 'General';
        });
        setActiveTab(initialTabs);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFMCSAInspections = async (dotNumber: string) => {
    if (inspections[dotNumber]) return;

    setLoadingInspections(prev => ({ ...prev, [dotNumber]: true }));
    try {
      const response = await fetch(
        `https://data.transportation.gov/resource/fx4q-ay7w.json?dot_number=${dotNumber}&$limit=50&$order=insp_date DESC`
      );
      
      if (!response.ok) throw new Error('Failed to fetch DOT inspection data');
      
      const rawData = await response.json();

      const mappedData = rawData.map((item: any) => {
        const rawDate = item.insp_date || '';
        const formattedDate = rawDate.length === 8 
          ? `${rawDate.substring(4,6)}/${rawDate.substring(6,8)}/${rawDate.substring(0,4)}`
          : 'N/A';

        const levelMap: Record<string, string> = {
          '1': 'Level 1 - Full',
          '2': 'Level 2 - Walk-Around',
          '3': 'Level 3 - Driver Only',
          '4': 'Level 4 - Special',
          '5': 'Level 5 - Vehicle Only',
          '6': 'Level 6 - Radioactive'
        };
        const category = levelMap[item.insp_level_id] || `Level ${item.insp_level_id || 'Unknown'}`;
        
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
    } catch (error) {
      console.error('Error fetching FMCSA inspections:', error);
      setInspections(prev => ({ ...prev, [dotNumber]: [] }));
    } finally {
      setLoadingInspections(prev => ({ ...prev, [dotNumber]: false }));
    }
  };

  const fetchFMCSASMS = async (dotNumber: string) => {
    if (smsData[dotNumber] !== undefined) return;

    setLoadingSms(prev => ({ ...prev, [dotNumber]: true }));
    try {
      const response = await fetch(
        `https://data.transportation.gov/resource/sjpe-nzai.json?$where=dot_number='${dotNumber}' OR usdot_number='${dotNumber}'`,
        {
          method: 'GET',
          headers: {
            'X-App-Token': 'OoEPnNHuAHbkGpmXKwtXZRd1M',
            'Accept': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch SMS data. Status: ${response.status}`);
      }
      
      const rawData = await response.json();
      console.log('RAW SMS DATA FOR DOT', dotNumber, ':', rawData);
      
      setSmsData(prev => ({ ...prev, [dotNumber]: rawData[0] || null }));
    } catch (error) {
      console.error('Error fetching FMCSA SMS:', error);
      setSmsData(prev => ({ ...prev, [dotNumber]: null }));
    } finally {
      setLoadingSms(prev => ({ ...prev, [dotNumber]: false }));
    }
  
  };

  const handleTabChange = (dotNumber: string, tab: string) => {
    setActiveTab(prev => ({ ...prev, [dotNumber]: tab }));
    
    if (tab === 'Inspections') {
      fetchFMCSAInspections(dotNumber);
    } else if (tab === 'SMS') {
      fetchFMCSASMS(dotNumber);
    }
  };

  const formatCargo = (cargo: Record<string, string> | null) => {
    if (!cargo) return [];
    const labels: Record<string, string> = {
      general_freight: 'General Freight',
      fresh_produce: 'Fresh Produce',
      meat: 'Meat',
      refrigerated: 'Refrigerated Food',
      hazmat: 'Hazmat',
    };
    return Object.entries(cargo)
      .filter(([_, val]) => val === 'Y' || val === 'X')
      .map(([key]) => labels[key] || key);
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-extrabold text-[#0f172a] tracking-tight">
            Carrier Intelligence Platform
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time entity census, verified insurance, fleet size, and operational filings.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by USDOT, MC#, Company Name, or Phone..."
            className="flex-1 bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="All Authorities">All Authorities</option>
            <option value="Active Only">Active Only</option>
          </select>

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-2.5 rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        <div className="space-y-6">
          {carriers.map((carrier) => {
            const currentTab = activeTab[carrier.usdot_number] || 'General';
            const cargoBadges = formatCargo(carrier.cargo_classifications);
            const policies = carrier.insurance_policies || [];
            const carrierInspections = inspections[carrier.usdot_number];
            const isLoadingInspections = loadingInspections[carrier.usdot_number];

            return (
              <div
                key={carrier.usdot_number}
                className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
              >
                <div className="p-6 border-b border-slate-200 bg-white">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 uppercase">
                        {carrier.legal_name || 'LEGAL NAME NOT ON FILE'}
                      </h2>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs font-semibold">
                        <span className="text-slate-600">
                          USDOT# <span className="text-slate-900">{carrier.usdot_number}</span>
                        </span>
                        <span className={`px-2 py-0.5 rounded-full ${carrier.dot_status?.toUpperCase() === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                          {carrier.dot_status || 'Unknown'}
                        </span>
                        {carrier.docket_number && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span className="text-slate-600">
                              Carrier <span className="text-slate-900">{carrier.docket_number}</span>
                            </span>
                            <span className={`px-2 py-0.5 rounded-full ${carrier.op_auth_status?.toUpperCase() === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                              {carrier.op_auth_status || 'Pending'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center min-w-[90px]">
                        <span className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase">Power Units</span>
                        <span className="text-lg font-extrabold text-slate-800">{carrier.tot_pwr ?? '-'}</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center min-w-[90px]">
                        <span className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase">Drivers</span>
                        <span className="text-lg font-extrabold text-slate-800">{carrier.tot_cdl ?? '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex border-b border-slate-200 bg-slate-50 px-4">
                  {['General', 'SMS', 'Inspections'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => handleTabChange(carrier.usdot_number, tab)}
                      className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                        currentTab === tab 
                          ? 'border-blue-600 text-blue-700 bg-white' 
                          : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="p-6">
                  {currentTab === 'General' && (
                    <div className="animate-in fade-in duration-300 space-y-6">
                      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                        <span>Phone: <strong className="text-slate-800">{carrier.phone_number || 'N/A'}</strong></span>
                        <span>Email: <strong className="text-blue-600">{carrier.email_address || 'N/A'}</strong></span>
                      </div>

                      <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-1 text-slate-600">
                          <p><strong className="text-slate-800">Physical Address:</strong><br />
                            {[carrier.phy_street, carrier.phy_city, carrier.phy_state, carrier.phy_zip].filter(Boolean).join(', ') || 'Not Listed'}
                          </p>
                          <p className="pt-2"><strong className="text-slate-800">Mailing:</strong><br />
                            {[carrier.mailing_street, carrier.mailing_city, carrier.mailing_state, carrier.mailing_zip].filter(Boolean).join(', ') || 'Not Listed'}
                          </p>
                        </div>
                        <div className="space-y-1 text-slate-600">
                          <p><strong className="text-slate-800">Operating Scope:</strong> {carrier.op_auth_type || 'N/A'}</p>
                          <p><strong className="text-slate-800">Last MCS-150:</strong> {carrier.mcs150_date || 'N/A'}</p>
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

                  {currentTab === 'SMS' && (
                    <div className="animate-in fade-in duration-300">
                      {loadingSms[carrier.usdot_number] ? (
                        <div className="py-12 flex justify-center items-center text-sm text-blue-600 font-medium space-x-2">
                           <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                           <span>Querying Carrier Safety Measurement System...</span>
                        </div>
                      ) : (
                        <div>
                           {!smsData[carrier.usdot_number] ? (
                             <p className="text-sm italic text-slate-500 py-4">No SMS safety scores found for this carrier in the FMCSA database.</p>
                           ) : (
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                  <h3 className="text-xs font-bold tracking-wider text-slate-500 uppercase mb-3">Vehicle & Driver Fitness</h3>
                                  <div className="space-y-2 text-sm text-slate-700">
                                    <p className="flex justify-between border-b border-slate-200 pb-1">
                                      <span>Unsafe Driving Measure:</span> 
                                      <span className="font-semibold">{smsData[carrier.usdot_number].unsafe_driving_measure || 'N/A'}</span>
                                    </p>
                                    <p className="flex justify-between border-b border-slate-200 pb-1">
                                      <span>HOS Compliance Measure:</span> 
                                      <span className="font-semibold">{smsData[carrier.usdot_number].hos_compliance_measure || 'N/A'}</span>
                                    </p>
                                    <p className="flex justify-between border-b border-slate-200 pb-1">
                                      <span>Vehicle Maint. Measure:</span> 
                                      <span className="font-semibold">{smsData[carrier.usdot_number].vehicle_maint_measure || 'N/A'}</span>
                                    </p>
                                  </div>
                               </div>
                               
                               <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                  <h3 className="text-xs font-bold tracking-wider text-slate-500 uppercase mb-3">Compliance & Incidents</h3>
                                  <div className="space-y-2 text-sm text-slate-700">
                                    <p className="flex justify-between border-b border-slate-200 pb-1">
                                      <span>Crash Indicator Measure:</span> 
                                      <span className="font-semibold">{smsData[carrier.usdot_number].crash_indicator_measure || 'N/A'}</span>
                                    </p>
                                    <p className="flex justify-between border-b border-slate-200 pb-1">
                                      <span>Controlled Substance Measure:</span> 
                                      <span className="font-semibold">{smsData[carrier.usdot_number].controlled_substance_measure || 'N/A'}</span>
                                    </p>
                                    <p className="flex justify-between border-b border-slate-200 pb-1">
                                      <span>Total Inspections:</span> 
                                      <span className="font-semibold">{smsData[carrier.usdot_number].total_inspections || 'N/A'}</span>
                                    </p>
                                  </div>
                               </div>
                             </div>
                           )}
                        </div>
                      )}
                    </div>
                  )}

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
            );
          })}

          {searched && !loading && carriers.length === 0 && (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center text-sm text-slate-500">
              No carrier records found matching &ldquo;{searchTerm}&rdquo;. Try another USDOT, MC number, phone, or name.
            </div>
          )}

          {!searched && (
            <div className="border border-dashed border-slate-300 rounded-xl p-12 text-center text-sm text-slate-400">
              Enter a search parameter to view carrier operational intelligence and filings.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}