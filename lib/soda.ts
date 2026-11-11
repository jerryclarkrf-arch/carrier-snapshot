/**
 * Resilient client for data.transportation.gov (Socrata / SODA).
 *
 * The FMCSA "Company Census File" is a federated dataset: Socrata proxies each
 * query to the origin, which throttles aggressively (HTTP 429) and occasionally
 * hangs. Every route that reads it needs the same timeout + retry behaviour, so
 * it lives here instead of being re-implemented per route.
 */

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_ATTEMPTS = 3;
const BASE_DELAY_MS = 300;
const MAX_DELAY_MS = 2500;

export interface SodaErrorInit {
  status?: number;
  retryable?: boolean;
  requestId?: string | null;
  body?: unknown;
}

export class SodaError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly requestId: string | null;
  readonly body: unknown;

  constructor(message: string, init: SodaErrorInit = {}) {
    super(message);
    this.name = 'SodaError';
    this.status = init.status ?? 0;
    this.retryable = init.retryable ?? false;
    this.requestId = init.requestId ?? null;
    this.body = init.body ?? null;
  }
}

export function asSodaError(e: unknown): SodaError {
  if (e instanceof SodaError) return e;
  if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
    return new SodaError('The FMCSA data service did not respond in time.', {
      status: 504,
      retryable: true,
    });
  }
  if (e instanceof Error) {
    return new SodaError(e.message, { status: 0, retryable: true });
  }
  return new SodaError(String(e), { status: 0, retryable: true });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const backoff = (attempt: number) =>
  Math.min(BASE_DELAY_MS * 4 ** (attempt - 1), MAX_DELAY_MS) + Math.random() * 150;

function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(raw);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

export interface SodaOptions {
  timeoutMs?: number;
  attempts?: number;
}

/**
 * GET a SODA resource and parse it as JSON, retrying throttled (429), gateway
 * (5xx), network and timeout failures with exponential backoff + jitter.
 */
export async function sodaJson<T>(
  resource: string,
  params: Record<string, string> = {},
  opts: SodaOptions = {}
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attempts = Math.max(1, opts.attempts ?? DEFAULT_ATTEMPTS);

  const url = new URL(resource);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const token = process.env.DOT_APP_TOKEN;
  const headers: Record<string, string> = { Accept: 'application/json' };
  // An empty X-App-Token header is treated as anonymous by Socrata, which puts
  // the request in the (much smaller) shared per-IP bucket. Only send it when set.
  if (token) headers['X-App-Token'] = token;

  let lastError: SodaError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });

      const requestId = res.headers.get('x-socrata-requestid');
      const text = await res.text();
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text.slice(0, 500);
        }
      }

      if (res.ok) return body as T;

      const throttled = res.status === 429;
      const retryable = throttled || res.status >= 500;
      lastError = new SodaError(
        throttled
          ? 'The FMCSA census feed is rate-limiting requests (HTTP 429).'
          : `FMCSA census request failed (HTTP ${res.status}).`,
        { status: res.status, retryable, requestId, body }
      );

      if (!retryable || attempt === attempts) throw lastError;

      const hinted = retryAfterMs(res);
      await sleep(hinted === null ? backoff(attempt) : Math.min(hinted, MAX_DELAY_MS));
    } catch (e) {
      const err = asSodaError(e);
      lastError = err;
      if (!err.retryable || attempt === attempts) throw err;
      await sleep(backoff(attempt));
    }
  }

  throw lastError ?? new SodaError('FMCSA census request failed.');
}
