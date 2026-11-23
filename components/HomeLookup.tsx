'use client';

import { useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import CarrierCard, { Carrier } from '@/components/CarrierCard';
import StatusStamp from '@/components/StatusStamp';
import { UsdotPlate } from '@/components/Plate';
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  DownloadIcon,
  InfoIcon,
  LockIcon,
  SearchIcon,
  SlidersIcon,
  XIcon,
} from '@/components/icons';
import { authClient } from '@/lib/auth/client';
import { isRetryable, searchWithRetry } from '@/lib/search-client';

const SOURCE_LABELS = {
  census: 'FMCSA census',
  safer: 'SAFER',
  index: 'Carrier index',
} as const;

const EXAMPLES = ['3985749', '1493741', 'FALCON TRUCKING'];

export default function HomeLookup() {
  const { data: session } = authClient.useSession();
  const loggedIn = !!session?.user;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Carrier[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [source, setSource] = useState<'census' | 'safer' | 'index' | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [lastQuery, setLastQuery] = useState('');

  async function run(targetPage = 1) {
    const query = q.trim();
    if (!query) {
      setError('Enter a USDOT, MC/FF number, phone, or company name.');
      return;
    }
    setLoading(true);
    setSearched(true);
    setError(null);
    setNotice(null);
    setCanRetry(false);
    setLastQuery(query);
    const params = new URLSearchParams();
    params.set('q', query);
    params.set('page', String(targetPage));
    params.set('limit', '50');
    try {
      const json = await searchWithRetry(params);
      setResults(json.results || []);
      setTotal(json.total || 0);
      setPage(json.page || 1);
      setPages(json.pages || 0);
      setNotice(json.notice || null);
      setSource(json.source || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setCanRetry(isRetryable(e));
      setResults([]);
      setTotal(0);
      setPages(0);
    } finally {
      setLoading(false);
    }
  }

  function exportCSV() {
    if (results.length === 0) return;
    const head = ['USDOT','MC','Legal Name','DBA','DOT Status','Auth Status','Phone','Email','City','State','Zip','Added','MCS-150'];
    const rows = results.map((c) => [c.usdot, c.docket || '', c.legalName || '', c.dba || '', c.dotStatus, c.authStatus, c.phone || '', c.email || '', c.phy.city || '', c.phy.state || '', c.phy.zip || '', c.addDate || '', c.mcs150 || '']);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'carrier-search.csv';
    a.click();
  }

  function clearSearch() {
    setQ('');
    setResults([]);
    setTotal(0);
    setPage(1);
    setPages(0);
    setSearched(false);
    setError(null);
    setNotice(null);
    setSource(null);
    setCanRetry(false);
    setLastQuery('');
  }

  const sourceLabel = source ? SOURCE_LABELS[source] : null;
  const countLabel =
    searched && !loading
      ? `${total.toLocaleString()} ${total === 1 ? 'carrier' : 'carriers'}${
          lastQuery ? ` · ${lastQuery}` : ''
        }${pages > 1 ? ` · page ${page} of ${pages}` : ''}`
      : 'Search the FMCSA census';

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Nav />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
          <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
            <section aria-labelledby="lookup-heading" className="lg:col-span-4">
              <div className="lg:sticky lg:top-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-steel">
                  FMCSA carrier lookup
                </p>
                <h1
                  id="lookup-heading"
                  className="mt-2 font-display text-4xl font-semibold leading-[0.95] sm:text-5xl"
                >
                  Run a carrier check
                </h1>
                <p className="mt-3 max-w-md text-sm leading-6 text-steel">
                  USDOT, MC/FF, phone, or legal name. One snapshot covers
                  authority, insurance, inspections, crashes, and fleet.
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(1);
                  }}
                  className="mt-5"
                >
                  <label htmlFor="carrier-search" className="sr-only">
                    Search carriers by USDOT, MC, phone, or legal name
                  </label>
                  <div className="rounded-[2px] border-2 border-ink bg-safety p-2 shadow-hard">
                    <div className="flex items-center justify-between gap-3 border-b border-ink/25 px-1 pb-1.5">
                      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink">
                        Carrier lookup
                      </span>
                      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink/70">
                        DOT · MC · Phone · Name
                      </span>
                    </div>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <div className="relative flex-1 border-2 border-ink bg-white">
                        <SearchIcon
                          size={18}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel"
                        />
                        <input
                          id="carrier-search"
                          value={q}
                          onChange={(e) => {
                            setQ(e.target.value);
                            if (error) setError(null);
                          }}
                          placeholder="USDOT, MC, phone"
                          autoComplete="off"
                          className="h-12 w-full bg-transparent pl-10 pr-12 text-base text-ink placeholder:text-steel/70 focus:outline-none"
                        />
                        {q && (
                          <button
                            type="button"
                            onClick={clearSearch}
                            aria-label="Clear search"
                            className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-steel transition-colors hover:text-ink"
                          >
                            <XIcon size={18} />
                          </button>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-ink min-h-12 w-full shrink-0 px-5 sm:w-auto"
                      >
                        {loading ? (
                          <>
                            <span
                              className="h-2 w-2 animate-pulse bg-safety"
                              aria-hidden="true"
                            />
                            Checking
                          </>
                        ) : (
                          <>
                            Check
                            <ArrowRightIcon size={16} />
                          </>
                        )}
                      </button>
                    </div>
                    <div
                      className={`mt-2 h-0.5 ${loading ? 'loading-rule' : ''}`}
                      aria-hidden="true"
                    />
                  </div>
                </form>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-steel">
                    Try
                  </span>
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setQ(example)}
                      className="inline-flex min-h-11 items-center border-b border-ink/30 font-mono text-[11px] text-ink transition-colors hover:border-ink"
                    >
                      {example}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink/15 pt-3">
                  <Link
                    href="/advanced"
                    className="inline-flex min-h-11 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink hover:underline"
                  >
                    <SlidersIcon size={16} />
                    Advanced filters
                  </Link>
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-steel">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-authority"
                      aria-hidden="true"
                    />
                    Census + daily index
                  </span>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="mt-4 flex flex-col gap-3 border border-alert/30 bg-alert/5 p-3 text-sm leading-5 text-alert sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p className="flex items-start gap-2">
                      <AlertIcon size={16} className="mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </p>
                    {canRetry && (
                      <button
                        type="button"
                        onClick={() => run(page)}
                        disabled={loading}
                        className="btn btn-danger shrink-0 self-start sm:self-auto"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink/15 pt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-steel">
                  <div>2.25M carriers</div>
                  <div aria-hidden="true">·</div>
                  <div>24 mo inspections</div>
                  <div aria-hidden="true">·</div>
                  <div>5 BASICs</div>
                </div>
              </div>
            </section>
            <section aria-labelledby="ledger-heading" className="lg:col-span-8">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-3">
                <div className="min-w-0">
                  <h2
                    id="ledger-heading"
                    className="font-display text-2xl font-semibold leading-none"
                  >
                    Carrier ledger
                  </h2>
                  <p
                    aria-live="polite"
                    className="mt-1 break-words font-mono text-[10px] uppercase tracking-[0.12em] text-steel"
                  >
                    {countLabel}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {sourceLabel && (
                    <span className="border border-ink/20 bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
                      Source: {sourceLabel}
                    </span>
                  )}
                  {results.length > 0 &&
                    (loggedIn ? (
                      <button
                        type="button"
                        onClick={exportCSV}
                        className="btn btn-secondary"
                      >
                        <DownloadIcon size={14} />
                        Export CSV
                      </button>
                    ) : (
                      <Link href="/auth/sign-up" className="btn btn-secondary">
                        <LockIcon size={14} />
                        Sign in to export
                      </Link>
                    ))}
                </div>
              </div>

              {notice && !loading && (
                <div
                  role="status"
                  className="mt-3 flex flex-col gap-2 border border-ink/20 bg-white px-3 py-2 text-sm leading-5 text-steel sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="flex items-start gap-2">
                    <InfoIcon size={16} className="mt-0.5 shrink-0" />
                    <span>{notice}</span>
                  </p>
                  {source === 'safer' && (
                    <button
                      type="button"
                      onClick={() => run(page)}
                      disabled={loading}
                      className="btn btn-secondary shrink-0 self-start sm:self-auto"
                    >
                      {loading ? 'Trying…' : 'Try full census'}
                    </button>
                  )}
                </div>
              )}

              {loading && (
                <div
                  className="mt-4"
                  aria-busy="true"
                  aria-live="polite"
                >
                  <span className="sr-only">Loading carriers</span>
                  <LoadingRows />
                </div>
              )}

              {!loading && results.length > 0 && (
                <div className="result-list mt-4 border-2 border-ink bg-white">
                  {results.map((c) => (
                    <CarrierCard key={c.usdot} carrier={c} />
                  ))}
                </div>
              )}

              {searched && !loading && !error && results.length === 0 && (
                <div className="mt-4 border-2 border-ink bg-white p-5 sm:p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-alert">
                    No match
                  </p>
                  <h3 className="mt-1 font-display text-2xl font-semibold leading-tight">
                    No carriers matched
                    {lastQuery ? ` “${lastQuery}”` : ' that lookup'}.
                  </h3>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-steel">
                    Try a USDOT for an exact match, check the spelling, or
                    combine a name with a state in advanced filters.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href="/advanced" className="btn btn-secondary">
                      Open advanced search
                    </Link>
                    <button
                      type="button"
                      onClick={clearSearch}
                      className="btn btn-ghost"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {!searched && (
                <div className="mt-4">
                  <EmptyDesk onExample={(value) => setQ(value)} />
                </div>
              )}

              {pages > 1 && !loading && (
                <div className="mt-4 flex flex-col gap-3 border-t border-ink/15 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-steel">
                    Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of{' '}
                    {total.toLocaleString()}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => run(page - 1)}
                      disabled={page <= 1 || loading}
                      aria-label="Previous page"
                      className="btn btn-secondary px-3"
                    >
                      <ArrowLeftIcon size={16} />
                      Prev
                    </button>
                    <span className="font-mono text-[11px] text-steel">
                      {page} / {pages}
                    </span>
                    <button
                      type="button"
                      onClick={() => run(page + 1)}
                      disabled={page >= pages || loading}
                      aria-label="Next page"
                      className="btn btn-secondary px-3"
                    >
                      Next
                      <ArrowRightIcon size={16} />
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Fact({
  label,
  value,
  locked = false,
}: {
  label: string;
  value: string;
  locked?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-steel">
        {label}
      </dt>
      <dd className="mt-0.5 flex items-center gap-1 text-sm font-medium text-ink">
        {locked && <LockIcon size={12} className="shrink-0 text-steel" />}
        {value}
      </dd>
    </div>
  );
}

function EmptyDesk({ onExample }: { onExample: (value: string) => void }) {
  return (
    <div>
      <div className="border-2 border-ink bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink bg-paper px-4 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-steel">
            Sample snapshot
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-steel">
            Example · not a search result
          </span>
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusStamp status="Active" label="DOT Active" />
                <StatusStamp status="Active" label="Authority Active" />
                <span className="inline-flex min-h-6 items-center rounded-[2px] border border-ink/20 bg-paper px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
                  MC 1493741
                </span>
              </div>
              <h3 className="mt-2 font-display text-3xl font-semibold leading-none">
                FALCON TRUCKING
              </h3>
              <p className="mt-1 font-mono text-[11px] text-steel">
                Active carrier index · sample record
              </p>
            </div>
            <UsdotPlate usdot="3985749" />
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-ink/15 pt-3 sm:grid-cols-4">
            <Fact label="USDOT" value="3985749" />
            <Fact label="MC" value="1493741" />
            <Fact label="Email" value="Sign in to view" locked />
            <Fact label="Source" value="Carrier index" />
          </dl>

          <button
            type="button"
            onClick={() => onExample('3985749')}
            className="btn btn-secondary mt-4"
          >
            Use sample USDOT
          </button>
        </div>
      </div>

      <dl className="mt-4 grid border border-ink/15 bg-white sm:grid-cols-3 sm:divide-x sm:divide-ink/15">
        {[
          ['01', 'Plate = USDOT', 'The yellow plate anchors the carrier identity.'],
          ['02', 'Stamp = standing', 'Authority and DOT status are text, not color alone.'],
          ['03', 'Row = one carrier', 'Open a row for the full carrier snapshot.'],
        ].map(([number, label, copy]) => (
          <div
            key={number}
            className="border-b border-ink/15 p-3 last:border-b-0 sm:border-b-0"
          >
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-steel">
              <span className="mr-2 text-ink">{number}</span>
              {label}
            </dt>
            <dd className="mt-1 text-xs leading-5 text-steel">{copy}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="border-2 border-ink bg-white">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="border-b border-ink/15 p-4 last:border-b-0 sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="w-full max-w-md space-y-2">
              <div className="h-5 w-28 animate-pulse bg-ink/10" />
              <div className="h-7 w-2/3 animate-pulse bg-ink/10" />
              <div className="h-3 w-1/2 animate-pulse bg-ink/5" />
            </div>
            <div className="h-10 w-24 animate-pulse border border-ink/10 bg-ink/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
