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

interface CargoClassifications {
  general_freight?: string;
  fresh_produce?: string;
  meat?: string;
  refrigerated?: string;
  hazmat?: string;
}

interface Carrier {
  usdot_number: string;
  docket_number: string | null;
  legal_name: string | null;
  op_auth_status: string | null;
  op_auth_type: string | null;
  phone_number: string | null;
  email_address: string | null;
  mcs150_date: string | null;
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
  cargo_classifications?: CargoClassifications | null;
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

    let dbQuery = supabase
      .from('carriers')
      .select('*, insurance_policies(*)');

    if (query.trim()) {
      const q = query.trim();
      // Numeric optimization: skip full-text scan if input is pure digits
      if (/^\d+$/.test(q)) {
        dbQuery = dbQuery.or(`usdot_number.eq.${q},docket_number.eq.${q}`);
      } else {
        dbQuery = dbQuery.or(
          `usdot_number.eq.${q},docket_number.eq.${q},legal_name.ilike.%${q}%`
        );
      }
    }

    if (statusFilter !== 'All') {
      dbQuery = dbQuery.ilike('op_auth_status', statusFilter);
    }

    const { data, error } = await dbQuery.limit(25);
    if (!error && data) {
      setResults(data as Carrier[]);
    } else if (error) {
      console.error('Supabase query error:', error.message);
    }
    setLoading(false);
  }

  const getBadgeStyle = (status: string | null) => {
    const s = status?.toLowerCase() || '';
    if (s === 'active') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (s === 'pending') return 'bg-amber-100 text-amber-800 border-amber-300';
    if (s === 'inactive' || s === 'withdrawn') return 'bg-rose-100 text-rose-800 border-rose-300';
    return 'bg-slate-100 text-slate-700 border-slate-300';
  };

  const formatInsuranceType = (code: string | null) => {
    if (!code || code === 'UNKNOWN') return 'Liability / General';
    const c = code.toUpperCase();
    if (c === '1' || c === 'BIPD' || c === 'PRMY') return 'BI&PD (Liability)';
    if (c === '2' || c === 'CARGO') return 'Cargo';
    if (c === '3' || c === 'BOND' || c === 'SURETY') return 'Bond / Trust Fund';
    return code;
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'N/A';
    const trueAmount = amount < 10000 ? amount * 1000 : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(trueAmount);
  };

  const formatAddress = (
    street: string | null,
    city: string | null,
    state: string | null,
    zip: string | null
  ) => {
    const parts = [street, [city, state].filter(Boolean).join(', '), zip].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Not on file';
  };

  const renderCargoTags = (cargo: CargoClassifications | null | undefined) => {
    if (!cargo) return null;
    const tags: string[] = [];
    if (cargo.general_freight === 'Y' || cargo.general_freight === 'X') tags.push('General Freight');
    if (cargo.refrigerated === 'Y' || cargo.refrigerated === 'X') tags.push('Refrigerated');
    if (cargo.fresh_produce === 'Y' || cargo.fresh_produce === 'X') tags.push('Produce');
    if (cargo.meat === 'Y' || cargo.meat === 'X') tags.push('Meat');
    if (cargo.hazmat === 'Y' || cargo.hazmat === 'X') tags.push('Hazmat');

    if (tags.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="px-2 py-0.5 text-[11px] font-medium bg-blue-50 text-blue-700 rounded border border-blue-200"
          >
            {tag}
          </span>
        ))}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-slate-100 py-10 px-4 sm:px-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Carrier Intelligence Platform
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Real-time entity census, verified insurance, fleet size, and operational filings.
          </p>
        </header>

        {/* Search Controls */}
        <form onSubmit={handleSearch} className="mb-8 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by USDOT, MC/Docket, or Legal Name..."
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
        <div className="space-y-6">
          {results.length === 0 && !loading && (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-400">
              Enter a search parameter to view carrier operational intelligence and filings.
            </div>
          )}

          {results.map((carrier) => (
            <div
              key={carrier.usdot_number}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 hover:shadow-md transition duration-150"
            >
              {/* Header: Name, IDs, Status */}
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-xl font-bold text-slate-900">
                      {carrier.legal_name || 'Legal Name Not Listed'}
                    </h2>
                    <span
                      className={`px-3 py-0.5 text-xs font-bold uppercase tracking-wider rounded-full border ${getBadgeStyle(
                        carrier.op_auth_status
                      )}`}
                    >
                      {carrier.op_auth_status || 'Unknown Status'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-600 mt-1">
                    <span>
                      <strong className="text-slate-900">USDOT:</strong> {carrier.usdot_number}
                    </span>
                    <span>
                      <strong className="text-slate-900">Docket:</strong> {carrier.docket_number || 'N/A'}
                    </span>
                    <span>
                      <strong className="text-slate-900">Phone:</strong>{' '}
                      {carrier.phone_number ? (
                        <a href={`tel:${carrier.phone_number}`} className="text-blue-600 hover:underline">
                          {carrier.phone_number}
                        </a>
                      ) : (
                        'None Listed'
                      )}
                    </span>
                    {carrier.email_address && (
                      <span>
                        <strong className="text-slate-900">Email:</strong>{' '}
                        <a href={`mailto:${carrier.email_address}`} className="text-blue-600 hover:underline">
                          {carrier.email_address}
                        </a>
                      </span>
                    )}
                  </div>
                </div>

                {/* Fleet Metrics Badges */}
                <div className="flex items-center gap-2 self-start">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-center">
                    <div className="text-[10px] uppercase font-bold text-slate-500">Power Units</div>
                    <div className="text-base font-extrabold text-slate-800">
                      {carrier.tot_pwr ?? '—'}
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-center">
                    <div className="text-[10px] uppercase font-bold text-slate-500">CDL Drivers</div>
                    <div className="text-base font-extrabold text-slate-800">
                      {carrier.tot_cdl ?? '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Middle Section: Addresses & Cargo Classification */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <div>
                  <span className="font-bold text-slate-700 block mb-0.5">Physical Address (PPOB):</span>
                  <p className="text-slate-900 font-medium">
                    {formatAddress(
                      carrier.phy_street,
                      carrier.phy_city,
                      carrier.phy_state,
                      carrier.phy_zip
                    )}
                  </p>
                  {carrier.mailing_street && (
                    <div className="mt-2 text-slate-500">
                      <span className="font-semibold text-slate-600">Mailing: </span>
                      {formatAddress(
                        carrier.mailing_street,
                        carrier.mailing_city,
                        carrier.mailing_state,
                        carrier.mailing_zip
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <span className="font-bold text-slate-700 block mb-0.5">Operating Scope:</span>
                  <p className="text-slate-800">
                    {carrier.op_auth_type || 'Standard Property'}
                    {carrier.mcs150_date && (
                      <span className="text-slate-500 block text-[11px] mt-0.5">
                        Last MCS-150 Filing: {carrier.mcs150_date}
                      </span>
                    )}
                  </p>
                  {renderCargoTags(carrier.cargo_classifications)}
                </div>
              </div>

              {/* Insurance Policies Section */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
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
                        <div
                          className="truncate text-slate-800 font-medium"
                          title={policy.insurance_company_name || undefined}
                        >
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