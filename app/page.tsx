'use client';
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface InsurancePolicy {
  id: string;
  policy_no: string;
  insurance_company_name: string;
  ins_type_code: string;
  max_cov_amount: number | null;
  effective_date: string;
}

interface Carrier {
  usdot_number: string;
  docket_number: string | null;
  legal_name: string | null;
  op_auth_status: string | null;
  op_auth_type: string | null;
  phone_number: string | null;
  insurance_policies?: InsurancePolicy[];
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [results, setResults] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() && statusFilter === 'All') return;
    setLoading(true);

    // Join the insurance_policies table via Supabase nested select
    let dbQuery = supabase
      .from('carriers')
      .select('*, insurance_policies(*)');

    if (query.trim()) {
      const q = query.trim();
      dbQuery = dbQuery.or(
        `usdot_number.eq.${q},docket_number.eq.${q},legal_name.ilike.%${q}%`
      );
    }

    if (statusFilter !== 'All') {
      dbQuery = dbQuery.eq('op_auth_status', statusFilter);
    }

    const { data, error } = await dbQuery.limit(25);
    if (!error && data) {
      setResults(data as Carrier[]);
    }
    setLoading(false);
  }

  const getBadgeStyle = (status: string | null) => {
    switch (status) {
      case 'Active':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'Pending':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'Inactive':
      case 'Withdrawn':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  const formatInsuranceType = (code: string) => {
    switch (code) {
      case '1':
        return 'BI&PD (Liability)';
      case '2':
        return 'Cargo';
      case '3':
        return 'Bond / Trust Fund';
      default:
        return code || 'General';
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Carrier Intelligence Platform
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time entity census, operating authority, and verified insurance filings.
          </p>
        </header>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-8 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by USDOT, MC/FF Docket, or Company Name..."
            className="flex-1 px-4 py-3 rounded-lg border border-slate-300 bg-white text-slate-900 shadow-sm focus:ring-2 focus:ring-blue-600 focus:outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <select
            className="px-4 py-3 rounded-lg border border-slate-300 bg-white text-slate-900 shadow-sm focus:ring-2 focus:ring-blue-600 focus:outline-none font-medium"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Authorities</option>
            <option value="Active">Active Only</option>
            <option value="Pending">Pending Only</option>
            <option value="Inactive">Inactive</option>
            <option value="Withdrawn">Withdrawn</option>
          </select>

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg shadow-sm transition duration-150 disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {/* Results Stream */}
        <div className="space-y-5">
          {results.length === 0 && !loading && (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-400">
              Enter a search parameter to view carrier details and compliance filings.
            </div>
          )}

          {results.map((carrier) => (
            <div
              key={carrier.usdot_number}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition duration-150"
            >
              {/* Header Row */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {carrier.legal_name || 'Legal Name Not Available'}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-600 mt-1">
                    <span>
                      <strong className="text-slate-900">USDOT:</strong> {carrier.usdot_number}
                    </span>
                    <span>
                      <strong className="text-slate-900">Docket:</strong> {carrier.docket_number || 'N/A'}
                    </span>
                    <span>
                      <strong className="text-slate-900">Phone:</strong> {carrier.phone_number || 'None Reported'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full border ${getBadgeStyle(
                      carrier.op_auth_status
                    )}`}
                  >
                    {carrier.op_auth_status || 'Unknown Status'}
                  </span>
                </div>
              </div>

              {/* Sub-Info */}
              <div className="mt-3 text-xs text-slate-500 font-medium">
                Authority Type: <span className="text-slate-700">{carrier.op_auth_type || 'Standard Property'}</span>
              </div>

              {/* Insurance Cards Section */}
              <div className="mt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                  Verified On-File Insurance ({carrier.insurance_policies?.length || 0})
                </h3>

                {carrier.insurance_policies && carrier.insurance_policies.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {carrier.insurance_policies.map((policy, idx) => (
                      <div
                        key={policy.id || `${policy.policy_no}-${idx}`}
                        className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 space-y-1"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-blue-700">
                            {formatInsuranceType(policy.ins_type_code)}
                          </span>
                          <span className="font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            {formatCurrency(policy.max_cov_amount)}
                          </span>
                        </div>
                        <div className="truncate text-slate-800 font-medium" title={policy.insurance_company_name}>
                          {policy.insurance_company_name || 'Carrier Filings'}
                        </div>
                        <div className="text-[11px] text-slate-500 flex justify-between">
                          <span>Pol #: {policy.policy_no}</span>
                          {policy.effective_date && <span>Eff: {policy.effective_date}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    No active insurance certificates currently on file with the FMCSA.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}