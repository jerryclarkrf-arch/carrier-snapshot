'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Carrier {
  usdot_number: string;
  docket_number: string | null;
  legal_name: string | null;
  owner_name: string | null;
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
  
  const [insuranceData, setInsuranceData] = useState<Record<string, any>>({});
  const [loadingInsurance, setLoadingInsurance] = useState<Record<string, boolean>>({});

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true); setSearched(true); setCarriers([]); setActiveTab({});

    try {
      const cleanTerm = searchTerm.trim().toUpperCase();
      const numericTerm = cleanTerm.replace(/\D/g, '');
      const appToken = 'OoEPnNHuAHbkGpmXKwtXZRd1M';

      // Universal Socrata search to catch overlapping records (DOT, MC, or Company Name)
      const queryParam = numericTerm.length > 0 ? numericTerm : encodeURIComponent(cleanTerm);
      const censusRes = await fetch(`https://data.transportation.gov/resource/az4n-8mr2.json?$q=${queryParam}&$$app_token=${appToken}&$limit=15`);
      
      if (!censusRes.ok) throw new Error('Failed to query Socrata Census');
      const censusData = await censusRes.json();

      const usdotsToFetch = new Set<string>();

      censusData.forEach((c: any) => {
        const dot = c.dot_number || c.usdot_number || '';
        if (numericTerm) {
          // Strict check to ensure the numeric input explicitly matches the DOT or MC column, ignoring random phone number hits
          const mc = c.mc_mx_ff_number || '';
          const mcDigits = mc.replace(/\D/g, '');
          if (dot === numericTerm || mc.includes(numericTerm) || mcDigits === numericTerm) {
            usdotsToFetch.add(dot);
          }
        } else {
          // For fuzzy text searches (names), collect all returned DOTs
          usdotsToFetch.add(dot);
        }
      });

      const uniqueDots = Array.from(usdotsToFetch).filter(Boolean);

      if (uniqueDots.length > 0) {
         const carrierResults: Carrier[] = [];
         const newTabs: Record<string, string> = {};

         // Process all valid entities in parallel
         await Promise.all(uniqueDots.map(async (dot) => {
           const cRes = await fetch(`https://data.transportation.gov/resource/az4n-8mr2.json?dot_number=${dot}&$$app_token=${appToken}&$limit=1`);
           const cData = await cRes.json();
           const carrierRaw = cData.length > 0 ? cData[0] : null;

           const mRes = await fetch(`https://data.transportation.gov/resource/inys-ebih.json?usdot_number=${dot}&$$app_token=${appToken}&$limit=1`);
           const mData = await mRes.json();
           const auth = mData.length > 0 ? mData[0] : null;

           if (!carrierRaw && !auth) return;

           const raw = carrierRaw || {};
           const aut = auth || {};

           let mcNumber = aut.docket_number || raw.mc_mx_ff_number || null;
           if (mcNumber && !mcNumber.startsWith('MC') && !mcNumber.startsWith('FF') && !mcNumber.startsWith('MX')) {
             mcNumber = `MC${mcNumber}`;
           }

           const carrier: Carrier = {
              usdot_number: dot,
              docket_number: mcNumber,
              legal_name: raw.legal_name || aut.legal_name || 'UNKNOWN',
              owner_name: 'Searching L&I...',
              dot_status: raw.status_code === 'A' ? 'Active' : (raw.status_code || 'Inactive'),
              op_auth_status: aut.op_auth_status || 'Pending / New',
              op_auth_type: aut.op_auth_type || 'N/A',
              phone_number: raw.telephone || raw.phone || raw.contact_phone || 'N/A',
              email_address: raw.email_address || 'N/A',
              tot_pwr: parseInt(raw.nbr_power_unit || raw.power_units || raw.total_power_units || '0') || 0,
              tot_cdl: parseInt(raw.driver_total || raw.drivers || raw.total_drivers || '0') || 0,
              mcs150_date: raw.mcs150_date || raw.add_date || 'N/A',
              phy_street: raw.phy_street || null,
              phy_city: raw.phy_city || null,
              phy_state: raw.phy_state || null,
              phy_zip: raw.phy_zip_code || null,
              mailing_street: raw.mailing_street || null,
              mailing_city: raw.mailing_city || null,
              mailing_state: raw.mailing_state || null,
              mailing_zip: raw.mailing_zip_code || null,
           };

           carrierResults.push(carrier);
           newTabs[dot] = 'General';
         }));

         // Sort so Active records appear first
         carrierResults.sort((a, b) => (a.dot_status === 'Active' ? -1 : 1));
         setCarriers(carrierResults);
         setActiveTab(newTabs);

         // Fire the background L&I scrape AFTER the UI is rendered
         uniqueDots.forEach(dot => {
           setLoadingInsurance(prev => ({ ...prev, [dot]: true }));
           fetch(`/api/insurance?dotNumber=${dot}`)
              .then(res => res.json())
              .then(data => {
                 setCarriers(prev => prev.map(c => 
                   c.usdot_number === dot ? { ...c, owner_name: data.owner && data.owner !== 'Not Listed' ? data.owner : 'Not Listed' } : c
                 ));
                 setInsuranceData(prev => ({ ...prev, [dot]: data.policies || [] }));
              })
              .catch(() => {
                 setCarriers(prev => prev.map(c => c.usdot_number === dot ? { ...c, owner_name: 'Not Listed' } : c));
                 setInsuranceData(prev => ({ ...prev, [dot]: [] }));
              })
              .finally(() => setLoadingInsurance(prev => ({ ...prev, [dot]: false })));
         });
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
        const violTotal = parseInt(item.viol_total || '0', 10);
        const oosTotal = parseInt(item.oos_total || '0', 10);
        let violDetail = 'No Violations';
        if (violTotal > 0) violDetail = `${violTotal} Violation${violTotal > 1 ? 's' : ''}${oosTotal > 0 ? ` (${oosTotal} Out-of-Service)` : ''}`;
        return {
          report_number: item.report_number || item.inspection_id || 'Unknown',
          inspection_date: formattedDate,
          report_state: item.report_state || 'N/A',
          basic_desc: `Level ${item.insp_level_id || 'Unknown'}`,
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
            placeholder="Search by USDOT, MC#, or Company Name..."
            className="flex-1 bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
          <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-8 py-3 rounded-lg shadow-sm transition-colors disabled:opacity-50">
            {loading ? 'Querying Socrata...' : 'Search'}
          </button>
        </form>

        <div className="space-y-6">
          {searched && !loading && carriers.length > 1 && (
            <div className="text-sm text-slate-500 font-medium px-1">
              Found {carriers.length} matching entities.
            </div>
          )}

          {carriers.map((carrier) => {
            const currentTab = activeTab[carrier.usdot_number] || 'General';
            const carrierInspections = inspections[carrier.usdot_number];
            const isLoadingInspections = loadingInspections[carrier.usdot_number];
            const insData = insuranceData[carrier.usdot_number];
            const isLoadingInsurance = loadingInsurance[carrier.usdot_number];

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
                        <span className="text-lg font-extrabold text-slate-800">{carrier.tot_pwr ?? '0'}</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center min-w-[90px]">
                        <span className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase">Drivers</span>
                        <span className="text-lg font-extrabold text-slate-800">{carrier.tot_cdl ?? '0'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex border-b border-slate-200 bg-slate-50 px-4 overflow-x-auto">
                  {['General', 'SMS', 'Inspections', 'Insurance'].map(tab => (
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
                          <p className="flex items-center gap-2">
                            <strong className="text-slate-800">Owner/Contact:</strong> 
                            {carrier.owner_name === 'Searching L&I...' ? (
                               <span className="flex items-center text-blue-600 gap-1"><span className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span> Searching L&I...</span>
                            ) : carrier.owner_name}
                          </p>
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

                  {currentTab === 'Insurance' && (
                    <div className="animate-in fade-in duration-300">
                      {isLoadingInsurance ? (
                        <div className="py-12 flex justify-center items-center text-sm text-blue-600 font-medium space-x-2">
                           <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                           <span>Scraping Licensing & Insurance data from DOT...</span>
                        </div>
                      ) : (
                        <div>
                           {!insData || insData.length === 0 ? (
                             <p className="text-sm italic text-slate-500 py-4">No active insurance certificates found in the L&I database.</p>
                           ) : (
                             <div className="overflow-x-auto border border-slate-200 rounded-lg">
                               <table className="min-w-full divide-y divide-slate-200 text-xs">
                                 <thead className="bg-slate-50 text-slate-600 font-semibold">
                                   <tr>
                                     <th className="py-3 px-4 text-left">Form</th>
                                     <th className="py-3 px-4 text-left">Class</th>
                                     <th className="py-3 px-4 text-left">Insurance Carrier</th>
                                     <th className="py-3 px-4 text-left">Policy/Surety</th>
                                     <th className="py-3 px-4 text-left">Received Date</th>
                                     <th className="py-3 px-4 text-left">Coverage</th>
                                     <th className="py-3 px-4 text-left">Effective Date</th>
                                     <th className="py-3 px-4 text-left">Status</th>
                                   </tr>
                                 </thead>
                                 <tbody className="divide-y divide-slate-100 bg-white">
                                   {insData.map((pol: any, idx: number) => (
                                     <tr key={idx} className="hover:bg-slate-50">
                                       <td className="py-3 px-4 font-medium text-slate-800">{pol.form}</td>
                                       <td className="py-3 px-4">{pol.type}</td>
                                       <td className="py-3 px-4">{pol.carrier}</td>
                                       <td className="py-3 px-4 font-mono text-blue-600">{pol.policy}</td>
                                       <td className="py-3 px-4">{pol.received}</td>
                                       <td className="py-3 px-4 font-semibold text-emerald-700">{pol.coverage}</td>
                                       <td className="py-3 px-4">{pol.effective}</td>
                                       <td className="py-3 px-4 font-bold text-emerald-700">{pol.status}</td>
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
              No carrier records found matching &ldquo;{searchTerm}&rdquo;. Try another USDOT, MC number, or company name.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}