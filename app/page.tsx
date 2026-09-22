'use client';

import { useState } from 'react';
import Link from 'next/link';

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
}

interface Inspection {
  report_number: string;
  inspection_date: string;
  report_state: string;
  basic_desc: string | null;
  violation_group_desc: string | null;
}

export default function SimpleSearchPage() {
  const [searchTerm, setSearchTerm] = useState('');
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

    setLoading(true); setSearched(true); setCarriers([]); setActiveTab({});

    try {
      const cleanTerm = searchTerm.trim().toUpperCase();
      const isMC = cleanTerm.startsWith('MC') || (cleanTerm.length > 5 && cleanTerm.length < 9 && !isNaN(Number(cleanTerm)));
      const numericTerm = cleanTerm.replace(/\D/g, '');
      const appToken = 'OoEPnNHuAHbkGpmXKwtXZRd1M';

      let usdotToFetch = numericTerm;

      // 1. If searching by MC, cross-reference the Motus History dataset to find the USDOT
      if (isMC) {
         const authRes = await fetch(`https://data.transportation.gov/resource/inys-ebih.json?docket_number=MC${numericTerm}&$$app_token=${appToken}&$limit=1`);
         const authData = await authRes.json();
         if (!authData || authData.length === 0) {
            setLoading(false); return;
         }
         usdotToFetch = authData[0].usdot_number;
      }

      // 2. Fetch Core Demographics from the Company Census File
      const censusRes = await fetch(`https://data.transportation.gov/resource/az4n-8mr2.json?usdot_number=${usdotToFetch}&$$app_token=${appToken}&$limit=1`);
      const censusData = await censusRes.json();

      if (censusData && censusData.length > 0) {
         const carrierRaw = censusData[0];
         
         // 3. Fetch Operational Authority Status
         const authFinalRes = await fetch(`https://data.transportation.gov/resource/inys-ebih.json?usdot_number=${usdotToFetch}&$$app_token=${appToken}&$limit=1`);
         const authFinalData = await authFinalRes.json();
         const auth = authFinalData.length > 0 ? authFinalData[0] : {};

         // 4. Transform into UI Schema
         const carrier: Carrier = {
            usdot_number: usdotToFetch,
            docket_number: auth.docket_number || null,
            legal_name: carrierRaw.legal_name || 'UNKNOWN',
            dot_status: carrierRaw.status_code === 'A' ? 'Active' : 'Inactive',
            op_auth_status: auth.op_auth_status || 'None',
            op_auth_type: auth.op_auth_type || 'N/A',
            phone_number: carrierRaw.telephone || 'N/A',
            email_address: carrierRaw.email_address || 'N/A',
            tot_pwr: parseInt(carrierRaw.nbr_power_unit) || 0,
            tot_cdl: parseInt(carrierRaw.driver_total) || 0,
            phy_street: carrierRaw.phy_street || null,
            phy_city: carrierRaw.phy_city || null,
            phy_state: carrierRaw.phy_state || null,
            phy_zip: carrierRaw.phy_zip_code || null,
            mailing_street: carrierRaw.mailing_street || null,
            mailing_city: carrierRaw.mailing_city || null,
            mailing_state: carrierRaw.mailing_state || null,
            mailing_zip: carrierRaw.mailing_zip_code || null,
            mcs150_date: carrierRaw.mcs150_date || null
         };

         setCarriers([carrier]);
         setActiveTab({ [usdotToFetch]: 'General' });
      }
    } catch (err) { 
      console.error(err); 
    } finally { 
      setLoading(false); 
    }
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

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="bg-[#0f172a] text-white px-6 py-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-xl tracking-tight">CARRIER SNAPSHOT</span>
        </div>
        <div className="flex gap-6 text-sm font-medium">
          <Link href="/" className="text-blue-400">Simple Search</Link>
          <Link href="/advanced" className="hover:text-blue-400 transition-colors">Advanced Search</Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-[#0f172a] tracking-tight">Direct Lookup</h1>
          <p className="text-sm text-slate-500 mt-2">Find active, inactive, and pending carriers instantly via live Socrata query.</p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by USDOT or MC#..."
            className="flex-1 bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
          <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-8 py-3 rounded-lg shadow-sm transition-colors disabled:opacity-50">
            {loading ? 'Querying Socrata...' : 'Search'}
          </button>
        </form>

        <div className="space-y-6">
          {carriers.map((carrier) => {
            const currentTab = activeTab[carrier.usdot_number] || 'General';
            const carrierInspections = inspections[carrier.usdot_number];
            const isLoadingInspections = loadingInspections[carrier.usdot_number];

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

                <div className="flex border-b border-slate-200 bg-slate-50 px-4 overflow-x-auto">
                  {['General', 'SMS', 'Inspections'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => handleTabChange(carrier.usdot_number, tab)}
                      className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                        currentTab === tab ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
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
                        </div>
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
              No carrier records found matching &ldquo;{searchTerm}&rdquo;. Try another USDOT or MC number.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}