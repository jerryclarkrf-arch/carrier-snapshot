import type { Carrier } from '@/components/CarrierCard';

export type SearchPayload = {
  results?: Carrier[];
  total?: number;
  page?: number;
  pages?: number;
  notice?: string;
  source?: 'census' | 'safer';
};

type RetryableError = Error & { retryable?: boolean };

/** Call /api/search with a client-side timeout and a typed retryable error. */
export async function requestSearch(params: URLSearchParams): Promise<SearchPayload> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch('/api/search?' + params.toString(), { signal: controller.signal });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error: RetryableError = new Error(
        typeof json?.error === 'string' ? json.error : 'Search failed'
      );
      error.retryable = json?.retryable === true;
      throw error;
    }
    return json as SearchPayload;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry once when the API reports a throttled feed. The server already retries
 * internally; this covers bursts that outlast that retry loop.
 */
export async function searchWithRetry(params: URLSearchParams): Promise<SearchPayload> {
  try {
    return await requestSearch(params);
  } catch (e) {
    if (isRetryable(e)) {
      await sleep(1500);
      return requestSearch(params);
    }
    throw e;
  }
}

export function isRetryable(e: unknown): boolean {
  return e instanceof Error && (e as RetryableError).retryable === true;
}
