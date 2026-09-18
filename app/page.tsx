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

export default function CarrierSearchPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All Authorities');
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setSearched(true);

    try {
      const { data, error } = await supabase.rpc('search_carriers', {
        query_text: searchTerm.trim(),
        only_active: filterStatus === 'Active Only',
        row_limit: 25,
      });

      if (error) {
        console.error('Search query error:', error);
        setCarriers([]);
      } else {
        setCarriers((data as Carrier[]) || []);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      setCarriers([]);
    } finally {
      setLoading(false);
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
        {/* Header */}
        <div>
          <h1 className="text-3xl font-extrabold text-[#0f172a] tracking-tight">
            Carrier Intelligence Platform
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time entity census, verified insurance, fleet size, and operational filings.
          </p>
        </div>

        {/* Search Bar Form */}
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

        {/* Results Container */}
        <div className="space-y-6">
          {carriers.map((carrier) => {
            const cargoBadges = formatCargo(carrier.cargo_classifications);
            const policies = carrier.insurance_policies || [];

            return (
              <div
                key={carrier.usdot_number}
                className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow transition-shadow"
              >
                {/* Header row with Company Name & Power Units / Drivers */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 uppercase">
                      {carrier.legal_name || 'LEGAL NAME NOT ON FILE'}
                    </h2>

                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs font-semibold">
                      <span className="text-slate-600">
                        USDOT# <span className="text-slate-900">{carrier.usdot_number}</span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full ${
                          carrier.dot_status?.toUpperCase() === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {carrier.dot_status || 'Unknown'}
                      </span>

                      {carrier.docket_number && (
                        <>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-600">
                            Carrier <span className="text-slate-900">{carrier.docket_number}</span>
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full ${
                              carrier.op_auth_status?.toUpperCase() === 'ACTIVE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {carrier.op_auth_status || 'Pending'}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-600">
                      <span>Phone: <strong className="text-slate-800">{carrier.phone_number || 'N/A'}</strong></span>
                      <span>Email: <strong className="text-blue-600">{carrier.email_address || 'N/A'}</strong></span>
                    </div>
                  </div>

                  {/* Power Units and Drivers Box */}
                  <div className="flex gap-2">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center min-w-[90px]">
                      <span className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                        Power Units
                      </span>
                      <span className="text-lg font-extrabold text-slate-800">
                        {carrier.tot_pwr ?? '-'}
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center min-w-[90px]">
                      <span className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                        Drivers
                      </span>
                      <span className="text-lg font-extrabold text-slate-800">
                        {carrier.tot_cdl ?? '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Operations & Address Grid */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-4 mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1 text-slate-600">
                    <p>
                      <strong className="text-slate-800">Physical Address (PPOB):</strong><br />
                      {[carrier.phy_street, carrier.phy_city, carrier.phy_state, carrier.phy_zip]
                        .filter(Boolean)
                        .join(', ') || 'Not Listed'}
                    </p>
                    <p className="pt-1">
                      <strong className="text-slate-800">Mailing:</strong><br />
                      {[carrier.mailing_street, carrier.mailing_city, carrier.mailing_state, carrier.mailing_zip]
                        .filter(Boolean)
                        .join(', ') || 'Not Listed'}
                    </p>
                  </div>

                  <div className="space-y-1 text-slate-600">
                    <p>
                      <strong className="text-slate-800">Operating Scope:</strong>{' '}
                      {carrier.op_auth_type || 'N/A'}
                    </p>
                    <p>
                      <strong className="text-slate-800">Last MCS-150 Filing:</strong>{' '}
                      {carrier.mcs150_date || 'N/A'}
                    </p>

                    {cargoBadges.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-2">
                        {cargoBadges.map((tag) => (
                          <span
                            key={tag}
                            className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-medium"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Verified On-File Insurance Section */}
                <div className="mt-5">
                  <h3 className="text-xs font-bold tracking-wider text-slate-500 uppercase mb-2">
                    Verified On-File Insurance ({policies.length})
                  </h3>

                  {policies.length === 0 ? (
                    <p className="text-xs italic text-slate-500">
                      No active insurance certificates currently on file with the FMCSA.
                    </p>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="min-w-full divide-y divide-slate-200 text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-semibold">
                          <tr>
                            <th className="py-2 px-3 text-left">Policy #</th>
                            <th className="py-2 px-3 text-left">Insurance Company</th>
                            <th className="py-2 px-3 text-left">Type</th>
                            <th className="py-2 px-3 text-left">Coverage</th>
                            <th className="py-2 px-3 text-left">Effective Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {policies.map((p, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-mono font-medium text-slate-900">{p.policy_no}</td>
                              <td className="py-2 px-3 text-slate-700">{p.insurance_company_name || 'Unknown'}</td>
                              <td className="py-2 px-3 text-slate-700">{p.ins_type_code || 'N/A'}</td>
                              <td className="py-2 px-3 font-medium text-emerald-700">
                                {p.max_cov_amount ? `$${Number(p.max_cov_amount).toLocaleString()}` : 'N/A'}
                              </td>
                              <td className="py-2 px-3 text-slate-600">{p.effective_date || 'N/A'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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