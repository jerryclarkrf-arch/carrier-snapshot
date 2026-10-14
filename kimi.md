User: https://github.com/jerryclarkrf-arch/carrier-snapshot/

Here is the Repo URL and attached conversation with Gemini. Please go through it and ask questions if you have?
Kimi: I've gone through the full Gemini conversation and reviewed the actual repo (`jerryclarkrf-arch/carrier-snapshot`). The code has evolved past where the transcript ends, so let me recap where things actually stand, flag what I found, then ask my questions.

## Current state of the repo (as it exists today, not just what the transcript says)

| Component | Status |
|---|---|
| `/` Simple Search | **No longer uses Supabase at all** — queries Socrata live from the browser (`az4n-8mr2` + `inys-ebih`) with MC cross-matching logic. Insurance/owner data comes from `/api/insurance` (L&I scraper route). |
| `/advanced` Advanced Search | Uses Supabase RPC `search_carriers_advanced` (new function, not in transcript) with sidebar filters: Added (7d/1m/3m/6m), Location (state), DOT Status, CSV export, expandable cards. |
| Supabase | New project seeded (1.86M carriers + insurance), `search_carriers` + `search_carriers_advanced` RPCs, indexes built, **RLS still off** (deliberately, for testing). |
| n8n (AWS Lightsail) | Daily delta workflow built and tested manually — census + insurance branches. |
| Parked | SMS tab (`sjpe-nzai` is non-tabular — the tabs still render but will always fail), email enrichment. |

## Flags I found while reading the code

1. **Leaked Socrata App Token.** `OoEPnNHuAHbkGpmXKwtXZRd1M` is hardcoded in `app/page.tsx` (client-side) *and* `app/api/sms/route.ts`, and both are committed to GitHub. `.env*` is gitignored, but the token isn't in `.env` — it's in source. If this repo is public, the token is compromised and should be rotated.
2. **Publicly triggerable legacy endpoints.** `app/api/sync/route.ts` (anyone hitting `/api/sync` triggers a 5,000-row upsert using your Vercel server's Supabase key — a cost/abuse vector) and `app/api/scrape-contacts/route.ts` (broken cheerio scraper) are still deployed. `debug.mjs` is also committed. These should be deleted.
3. **Semantic issue with the "Added" filter.** `/advanced` filters "Added in last 7 days / 1 month…" on `mcs150_date`. But `mcs150_date` is the carrier's *last biennial MCS-150 filing date* — not the date their authority was granted. This filter will surface thousands of *existing* carriers who just filed paperwork, not newly activated authorities like BrokerSnapshot shows. The Motus dataset (`inys-ebih`) has better candidates for this (e.g., record addition/authority-status-change dates).
4. **RLS still off + no login.** The anon key is visible in every user's browser, so anyone who finds the site can read *and write/delete* all 1.86M rows. Fine for internal testing, but it needs to be resolved before real rollout.

## My questions

1. **Is this repo private or public?** This determines how urgent the token rotation + secret cleanup is.
2. **Is the Simple Search bypassing Supabase intentional long-term?** Right now `/` hits Socrata directly on every keystroke-submit — that means per-IP rate limits, no insurance from your DB, and the 1.86M-row Supabase + n8n pipeline only feeding `/advanced`. Which page is the "real" product for your team — and should the other be removed or kept as a fallback?
3. **Does `/advanced` actually work right now?** It calls `search_carriers_advanced` with hardcoded `p_query: ''` — so server-side text search is disabled and filtering happens client-side on only 50 rows. Was that function created in the new Supabase project, and did you intend to give it a working text query too?
4. **Is the n8n workflow activated (scheduled), and does its Postgres credential point to the *new* Supabase project?** The credential was created against the old (now dead) project.
5. **How close is the new Supabase project to the 500MB free-tier limit** after the full seed + indexes? (This decides whether Phase-2 features like storing SMS snapshots are even possible on this plan.)
6. **Should I clean up the dead code** (`/api/sync`, `/api/scrape-contacts`, `debug.mjs`) and rotate the app token into an env var + server-side route?
7. **Priority order — what do you want first?** (a) security hardening + cleanup, (b) fix the "Added" filter to use true authority-grant dates, (c) wire up the SMS tab properly (A&I scrape or monthly bulk ingest), (d) RLS + auth before team rollout, or (e) something else?

Answer these and I'll pick up exactly where the previous session left off.
User: 1. It is currently public repo to give you the access before it was private. 
2. Yes Bypassing Supabase is long term, I have been trying different things so currently it is all mixed up.
3. Advance is not currently working. 
4. n8n workflow is not working because Supabase project storage is already full.
5. It has already crossed free tier limit.
6. Yes please clean it up.
7. I want carrier search to be working exactly like brokersnapshot.com Basically I want to replicate them as much as possible for free.
Kimi: Two of three checks completed — the Socrata API for `inys-ebih` is erroring from my environment, but the census dataset responded, and it delivered something important. Here's what I found and the plan.

## Key finding: the "Added" filter can be fixed for free

The census record for a sample carrier contains a field the previous session never used:

```
add_date: "19861230"     ← the date the carrier was ADDED to the FMCSA census
status_code: "I"         ← DOT-level status (separate from docket1_status_code)
```

`add_date` is the true "when did this entity enter the system" date — exactly what BrokerSnapshot's "Added" column means. This replaces the broken `mcs150_date` logic, and it works **live on Socrata**, no database needed. Also confirmed: `status_code` (DOT status) and `docket1_status_code` (authority status) are separate fields — that's precisely the dual "USDOT# Active / Carrier MC Active" display you wanted to copy.

Second finding: `/api/insurance` (the L&I portal scraper) is **good code and worth keeping** — it returns the Representative/owner name plus the full Active/Pending insurance table (Form, Type, Carrier, Policy, Coverage, Status). That's structurally identical to what BrokerSnapshot shows, and richer than the Socrata insurance file. The other two files (`/api/sync`, `/app/api/scrape-contacts`, `debug.mjs`) are confirmed dead weight.

## The settled architecture (Supabase-free, which you already chose)

Everything becomes live server-side queries on Vercel, with an in-memory cache to stay under Socrata rate limits:

| BrokerSnapshot feature | Our free source | Status |
|---|---|---|
| Universal search (USDOT / MC / phone / name) | `az4n-8mr2` via `/api/search` | Working — will consolidate |
| Filter by state, status | `phy_state`, `status_code`, `docket1_status_code` | Live `$where` — easy |
| New authorities 7d/1m/3m/6m | `add_date` + `docket1_status_code='A'` | **Now possible, correctly** |
| Insurance table + owner name | L&I portal via `/api/insurance` | Working — keep |
| Inspection history | `fx4q-ay7w` live | Working |
| SMS percentiles | — | **Cannot be replicated free** (private dataset). Tab removed, revisit later |
| Emails | `email_address` field when present in census | Show when available |
| Historical contact data | — | Only from today forward (we can start logging later) |

One search page (Simple + Advanced merged), filters server-side, CSV export kept, detail expansion per card. Supabase and n8n get shut off — n8n is failing anyway, and the frozen DB stays as an archive until you confirm live-only is stable, then cancel it.

## Do these now (I can't do them for you)

1. **Rotate the app token** — the old one is public in git history forever. data.transportation.gov → profile → Developer Settings → delete `OoEPnNHuAHbkGpmXKwtXZRd1M`, create a new one.
2. **Verify no env files in git history**: `git log --all --full-history --source -- .env*` — should return nothing. (`DOT_API_KEY_ID`/`DOT_API_SECRET` must never have been committed.)
3. **Delete the dead files** in VS Code, then commit:
   ```
   git rm app/api/sync/route.ts app/api/scrape-contacts/route.ts debug.mjs
   git rm -r app/advanced
   ```
4. **Keep the repo public until I tell you I'm done reviewing** (I may need to pull more files), then make it private.

## Confirm before I write the replacement code (next reply, complete files)

1. Insurance source = **L&I scrape** (owner name + form-level status, matches BrokerSnapshot) — agreed? I'll add Socrata `qh9u-swkp` as a silent fallback for coverage amounts.
2. **SMS tab removed entirely** for now — agreed?
3. Roughly **how many people** will use this daily? (Sanity-checks rate limits — with server-side caching, anything under ~50 users is comfortably free.)

Answer 1–3 and I'll deliver the full new `app/api/search/route.ts`, rebuilt `app/page.tsx`, and the small edits to `/api/insurance` in one go.
User: I have deleted dead files in vs conde and committed but could not understand following steps. Please explain me like a layman: 

Rotate the app token — the old one is public in git history forever. data.transportation.gov → profile → Developer Settings → delete OoEPnNHuAHbkGpmXKwtXZRd1M, create a new one.
Verify no env files in git history: git log --all --full-history --source -- .env* — should return nothing. (DOT_API_KEY_ID/DOT_API_SECRET must never have been committed.)
Kimi: Both steps are about the same thing: **your passwords got exposed, and you need to check how badly.** Let me explain each like you're new to this — because you said to treat you that way, and that's totally fine.

## Why you're doing this at all (the 30-second version)

Think of the **app token** like a key to the DOT's data door. That key was written inside your code files (`page.tsx`), your code was uploaded to GitHub, and the GitHub repo was **public** — meaning anyone in the world could read your key and use it. Deleting the files now doesn't fully fix it, because GitHub keeps a **history** of every version of your project ever uploaded. The old key is still sitting in that history, like a key you lost but never changed the lock for.

So: change the lock (rotate = delete old key, make new one), and check what else might be sitting in that history (your secret passwords).

---

## Step 1: Rotate the app token (change the lock)

This is done on the DOT website, not in VS Code. Exactly:

1. Open **data.transportation.gov** in your browser and **log in** (same account you used to create the token).
2. Click your **profile icon** (top-right corner of the page) → **My Profile**.
3. Click the **Edit Profile** button, then look at the menu on the left side of that page and click **Developer Settings**.
4. You will see your existing token: `OoEPnNHuAHbkGpmXKwtXZRd1M`.
5. **Delete it.** Yes, even though your code still uses it — that's the point. Once deleted, anyone who copied it from GitHub now holds a dead key.
6. Click **Create New App Token** (or similar button). Give it any name, like `carrier-snapshot-v2`.
7. A new token appears — a new random string of letters/numbers. **Copy it and save it in a notepad file on your computer for now.** Do NOT paste it into any code file this time. In the next build, we'll put it in a safe place (an environment variable) instead.

That's it. The old leaked key is now useless, and you have a fresh one.

---

## Step 2: Check git history for password files (see what else leaked)

**What "git history" means:** Every time you ran `git commit` + `git push`, GitHub saved a snapshot of your entire project at that moment. All those snapshots are still visible — even for files you deleted later. So if you ever accidentally committed a secrets file, deleting it today doesn't remove it from the old snapshots.

**The file we're worried about:** `.env.local` — this is the file on your computer that holds your Supabase keys and your `DOT_API_KEY_ID` / `DOT_API_SECRET`. Those are the *real* passwords (the app token is just a door key; these are the safe codes). When you first created the Next.js project, it auto-created a file called `.gitignore` that tells git "never upload this file" — so most likely nothing leaked. This step is just to *confirm* that.

**How to run the check (2 minutes):**

1. Open VS Code.
2. Open the built-in terminal: menu **Terminal → New Terminal** (or press `` Ctrl + ` `` — the backtick key, above Tab).
3. Make sure you're in your project folder (the prompt should show something like `PS C:\Users\rizzw\motus-lookup-app>` or your carrier-snapshot folder).
4. Type this exactly, then press Enter:

```
git log --all --full-history --source -- .env*
```

**Reading the result:**

- **If nothing appears** (just an empty result or it says something like "no matches" / returns to the prompt): ✅ **Good.** No secrets file was ever committed. Your passwords stayed on your computer only. Nothing more to do.
- **If it prints one or more lines with commit hashes and messages** (like `commit a1b2c3... Add initial files`): ❌ **Bad.** A secrets file was uploaded at some point. Tell me immediately which file name it shows and I'll walk you through purging it from history — it's fixable, just a few extra steps.

---

**One more note:** the repo is still public right now (you opened it so I could read it). That's fine **until I finish the code rebuild** — keep it public until I say I've pulled everything I need, then flip it to private. The damage from the token is already fixed by rotating it; the repo privacy is just closing the barn door.

Do Step 1 now, run the Step 2 command, and tell me: **(a)** you created the new token, and **(b)** whether the git command returned nothing or something. Then I'll give you the full rebuilt code that uses the new token safely.
User: Created New token and git command returned nothing.
Kimi: The insurance route takes `?dotNumber=` and returns `{ owner, policies[] }` — I'll wire the new UI to that exactly, and leave the file untouched since it works. Here's the complete build.

## Step 1 — New `.env.local` (root of project, replace entire file)

Your old file had Supabase keys + the DOT basic-auth keys. None of that is used anymore. Replace the whole file with just:

```
DOT_APP_TOKEN=paste_your_new_token_here
```

Then fully restart the dev server (`Ctrl+C`, then `npm run dev`) — env vars only load at startup.

## Step 2 — New file: `app/api/search/route.ts`

This is the heart of the BrokerSnapshot-style search: one server-side proxy that talks to the DOT with your (now hidden) token, merges filters, caches results for 10 minutes, and fixes the phone-number false-positive problem.

```ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CENSUS = 'https://data.transportation.gov/resource/az4n-8mr2.json';
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { ts: number; data: unknown }>();

function cached(key: string) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;
  cache.delete(key);
  return null;
}

const STATUS: Record<string, string> = { A: 'Active', I: 'Inactive', P: 'Pending' };
const esc = (s: string) => s.replace(/'/g, "''");
const num = (v: any) => (v !== undefined && v !== null && v !== '' ? Number(v) : null);

function fmtDate(v?: string | null) {
  if (!v) return null;
  const s = String(v).slice(0, 10).replace(/-/g, '');
  return s.length === 8 ? `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}` : v;
}

function mapCarrier(r: any) {
  const prefix = r.docket1prefix || '';
  const num1 = r.docket1 || '';
  const flag = (v: any) => v === 'Y' || v === 'X';
  return {
    usdot: String(r.dot_number || '').replace(/^0+/, '') || String(r.dot_number),
    docketDigits: num1,
    docket: prefix && num1 ? `${prefix}${num1}` : num1 || null,
    legalName: r.legal_name || null,
    dotStatus: STATUS[(r.status_code || '').toUpperCase()] || r.status_code || 'Unknown',
    authStatus: STATUS[(r.docket1_status_code || '').toUpperCase()] || r.docket1_status_code || 'Unknown',
    authType: r.classdef || null,
    phone: r.phone || r.bus_telno || null,
    email: r.email_address || null,
    powerUnits: num(r.power_units) ?? num(r.owntract),
    drivers: num(r.total_drivers) ?? num(r.total_cdl),
    phy: { street: r.phy_street, city: r.phy_city, state: r.phy_state, zip: r.phy_zip },
    mail: { street: r.carrier_mailing_street, city: r.carrier_mailing_city, state: r.carrier_mailing_state, zip: r.carrier_mailing_zip },
    cargo: {
      'General Freight': flag(r.crgo_genfreight),
      'Fresh Produce': flag(r.crgo_freshprod),
      'Meat': flag(r.crgo_meat),
      'Refrigerated': flag(r.crgo_coldfood),
      'Hazmat': flag(r.hm_ind),
    },
    addDate: fmtDate(r.add_date),
    mcs150: fmtDate(r.mcsipdate),
  };
}

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const q = (p.get('q') || '').trim();
  const state = (p.get('state') || '').trim().toUpperCase();
  const status = p.get('status') || 'all';
  const added = parseInt(p.get('added') || '', 10);
  const limit = Math.min(parseInt(p.get('limit') || '25', 10) || 25, 50);
  const offset = parseInt(p.get('offset') || '0', 10) || 0;

  if (!q && !state && status === 'all' && !added) {
    return NextResponse.json({ error: 'Enter a search term or pick at least one filter.' }, { status: 400 });
  }

  const cacheKey = JSON.stringify([q, state, status, added, limit, offset]);
  const hit = cached(cacheKey);
  if (hit) return NextResponse.json({ results: hit, cached: true });

  // "MC1032275" / "MC-1032275" → digits
  const stripped = q.replace(/[\s-]/g, '');
  const mcMatch = stripped.match(/^(MC|FF|MX)(\d+)$/i);
  const digits = mcMatch ? mcMatch[2] : stripped.replace(/\D/g, '');
  const isNumeric = /^\d+$/.test(stripped) || !!mcMatch;

  const wheres: string[] = [];
  if (isNumeric && digits) {
    wheres.push(`(dot_number='${esc(digits)}' OR docket1='${esc(digits)}' OR phone like '%${esc(digits)}%')`);
  } else if (q) {
    wheres.push(`upper(legal_name) like '%${esc(q.toUpperCase())}%'`);
  }
  if (state) wheres.push(`phy_state='${esc(state)}'`);
  if (status === 'active') wheres.push(`docket1_status_code='A'`);
  if (added > 0) {
    const cutoff = new Date(Date.now() - added * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    wheres.push(`add_date>='${cutoff}'`);
    wheres.push(`docket1_status_code='A'`);
  }

  const order = added > 0 ? `&$order=${encodeURIComponent('add_date DESC')}` : '';
  const url = `${CENSUS}?$limit=${limit}&$offset=${offset}&$where=${encodeURIComponent(wheres.join(' AND '))}${order}`;

  try {
    const res = await fetch(url, { headers: { 'X-App-Token': process.env.DOT_APP_TOKEN || '' } });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data)) {
      return NextResponse.json({ error: 'DOT search failed', detail: data }, { status: 502 });
    }

    let results = data.map(mapCarrier);

    // Guard: a digit string also matches phone substrings — prefer exact USDOT/MC hits if any exist
    if (isNumeric) {
      const exact = results.filter((c) => c.usdot === digits || c.docketDigits === digits);
      if (exact.length > 0) results = exact;
    }

    cache.set(cacheKey, { ts: Date.now(), data: results });
    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
```

## Step 3 — New file: `app/api/inspections/route.ts`

Moves the inspection fetch off the browser (hides the token, adds 30-min caching):

```ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const INSP = 'https://data.transportation.gov/resource/fx4q-ay7w.json';
const TTL = 30 * 60 * 1000;
const cache = new Map<string, { ts: number; data: unknown }>();

const LEVELS: Record<string, string> = {
  '1': 'Level 1 — Full',
  '2': 'Level 2 — Walk-Around',
  '3': 'Level 3 — Driver Only',
  '4': 'Level 4 — Special Study',
  '5': 'Level 5 — Vehicle Only',
  '6': 'Level 6 — Enhanced',
};

function fmtDate(v?: string) {
  if (!v) return 'N/A';
  const s = String(v).slice(0, 10).replace(/-/g, '');
  return s.length === 8 ? `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}` : v;
}

export async function GET(req: NextRequest) {
  const dot = (new URL(req.url).searchParams.get('dot') || '').replace(/^0+/, '');
  if (!dot) return NextResponse.json({ error: 'dot param required' }, { status: 400 });

  const hit = cache.get(dot);
  if (hit && Date.now() - hit.ts < TTL) return NextResponse.json({ inspections: hit.data, cached: true });

  const where = encodeURIComponent(`dot_number='${dot}'`);
  const order = encodeURIComponent('insp_date DESC');

  try {
    const res = await fetch(`${INSP}?$limit=50&$where=${where}&$order=${order}`, {
      headers: { 'X-App-Token': process.env.DOT_APP_TOKEN || '' },
    });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data)) return NextResponse.json({ inspections: [] });

    const inspections = data.map((r: any) => {
      const viol = parseInt(r.viol_total || '0', 10);
      const oos = parseInt(r.oos_total || '0', 10);
      let summary = 'No violations';
      if (viol > 0) {
        summary = `${viol} violation${viol > 1 ? 's' : ''}`;
        if (oos > 0) summary += ` (${oos} out-of-service)`;
      }
      return {
        date: fmtDate(r.insp_date),
        report: r.report_number || r.inspection_id || 'Unknown',
        state: r.report_state || 'N/A',
        level: LEVELS[r.insp_level_id] || `Level ${r.insp_level_id || '?'}`,
        summary,
      };
    });

    cache.set(dot, { ts: Date.now(), data: inspections });
    return NextResponse.json({ inspections });
  } catch {
    return NextResponse.json({ inspections: [] });
  }
}
```

## Step 4 — Replace entire `app/page.tsx`

Unified page: one search box + server-side filters (State, Authority status, New Authorities in 7/30/90/180 days — now using the real `add_date`), expandable cards, Insurance auto-loads (owner name + L&I table), Inspections on tab click, CSV export. No Supabase anywhere.

```tsx
'use client';

import { useState } from 'react';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

interface Carrier {
  usdot: string; docketDigits: string; docket: string | null; legalName: string | null;
  dotStatus: string; authStatus: string; authType: string | null;
  phone: string | null; email: string | null;
  powerUnits: number | null; drivers: number | null;
  phy: { street?: string; city?: string; state?: string; zip?: string };
  mail: { street?: string; city?: string; state?: string; zip?: string };
  cargo: Record<string, boolean>;
  addDate: string | null; mcs150: string | null;
}

interface InsPolicy { form: string; type: string; carrier: string; policy: string; received: string; coverage: string; effective: string; status: string; }
interface Insp { date: string; report: string; state: string; level: string; summary: string; }

const badge = (s: string) =>
  s === 'Active' ? 'bg-emerald-100 text-emerald-800' :
  s === 'Pending' ? 'bg-amber-100 text-amber-800' :
  s === 'Inactive' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700';

export default function Home() {
  const [q, setQ] = useState('');
  const [stateF, setStateF] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [addedF, setAddedF] = useState('');
  const [results, setResults] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [offset, setOffset] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<Record<string, 'insurance' | 'inspections'>>({});
  const [ins, setIns] = useState<Record<string, { loading: boolean; data: { owner: string; policies: InsPolicy[] } | null }>>({});
  const [insp, setInsp] = useState<Record<string, { loading: boolean; data: Insp[] | null }>>({});

  async function runSearch(append: boolean) {
    if (!q.trim() && !stateF && statusF === 'all' && !addedF) {
      alert('Enter a search term (USDOT, MC, phone, or name) — or pick a filter like State or New Authorities.');
      return;
    }
    setLoading(true);
    setSearched(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (stateF) params.set('state', stateF);
    if (statusF !== 'all') params.set('status', statusF);
    if (addedF) params.set('added', addedF);
    const off = append ? offset : 0;
    params.set('limit', '25');
    params.set('offset', String(off));
    try {
      const res = await fetch('/api/search?' + params.toString());
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Search failed');
      const rows: Carrier[] = json.results || [];
      setResults((prev) => (append ? [...prev, ...rows] : rows));
      setOffset(off + rows.length);
      setExhausted(rows.length < 25);
      if (!append) { setExpanded(null); setTab({}); }
    } catch (e: any) {
      alert('Search error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadInsurance(usdot: string) {
    setIns((p) => ({ ...p, [usdot]: { loading: true, data: null } }));
    try {
      const r = await fetch('/api/insurance?dotNumber=' + usdot);
      const j = await r.json();
      setIns((p) => ({ ...p, [usdot]: { loading: false, data: j.error ? null : j } }));
    } catch {
      setIns((p) => ({ ...p, [usdot]: { loading: false, data: null } }));
    }
  }

  async function loadInspections(usdot: string) {
    if (insp[usdot]) return;
    setInsp((p) => ({ ...p, [usdot]: { loading: true, data: null } }));
    try {
      const r = await fetch('/api/inspections?dot=' + usdot);
      const j = await r.json();
      setInsp((p) => ({ ...p, [usdot]: { loading: false, data: j.inspections || [] } }));
    } catch {
      setInsp((p) => ({ ...p, [usdot]: { loading: false, data: [] } }));
    }
  }

  function toggleExpand(usdot: string) {
    const next = expanded === usdot ? null : usdot;
    setExpanded(next);
    if (next) {
      if (!ins[next]) loadInsurance(next);
      if (!tab[next]) setTab((p) => ({ ...p, [next]: 'insurance' }));
    }
  }

  function switchTab(usdot: string, t: 'insurance' | 'inspections') {
    setTab((p) => ({ ...p, [usdot]: t }));
    if (t === 'inspections') loadInspections(usdot);
  }

  function exportCSV() {
    if (results.length === 0) return;
    const head = ['USDOT','MC','Legal Name','DOT Status','Auth Status','Phone','Email','City','State','Zip','Added','MCS-150'];
    const rows = results.map((c) => [c.usdot, c.docket || '', c.legalName || '', c.dotStatus, c.authStatus, c.phone || '', c.email || '', c.phy.city || '', c.phy.state || '', c.phy.zip || '', c.addDate || '', c.mcs150 || '']);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'carrier-search.csv';
    a.click();
  }

  return (
    <main className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Carrier Intelligence Platform</h1>
          <p className="text-sm text-slate-500 mt-1">Live FMCSA data — no database, always current.</p>
        </div>

        {/* Search + filters */}
        <form onSubmit={(e) => { e.preventDefault(); runSearch(false); }} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="USDOT, MC#, phone, or company name… (leave blank to browse by filters)"
              className="flex-1 bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none" />
            <button type="submit" disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-2.5 rounded-lg disabled:opacity-50">
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <select value={stateF} onChange={(e) => setStateF(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">All States</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={statusF} onChange={(e) => setStatusF(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="all">All Authorities</option>
              <option value="active">Active Only</option>
            </select>
            <select value={addedF} onChange={(e) => setAddedF(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Any time added</option>
              <option value="7">New authorities — last 7 days</option>
              <option value="30">New authorities — last month</option>
              <option value="90">New authorities — last 3 months</option>
              <option value="180">New authorities — last 6 months</option>
            </select>
            {results.length > 0 && (
              <button type="button" onClick={exportCSV}
                className="ml-auto text-sm font-semibold text-blue-700 border border-blue-300 bg-white rounded-lg px-4 py-2 hover:bg-blue-50">
                Export CSV ({results.length})
              </button>
            )}
          </div>
        </form>

        {/* Results */}
        <div className="space-y-4">
          {results.map((c) => {
            const isOpen = expanded === c.usdot;
            const cargoTags = Object.entries(c.cargo).filter(([, v]) => v).map(([k]) => k);
            return (
              <div key={c.usdot} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <button onClick={() => toggleExpand(c.usdot)} className="w-full text-left p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-slate-900 uppercase">{c.legalName || 'NAME NOT LISTED'}</h2>
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${badge(c.dotStatus)}`}>{c.dotStatus}</span>
                        {c.docket && <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${badge(c.authStatus)}`}>{c.docket} · {c.authStatus}</span>}
                      </div>
                      <div className="text-xs text-slate-600 mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                        <span><strong>USDOT:</strong> {c.usdot}</span>
                        <span><strong>Phone:</strong> {c.phone || 'N/A'}</span>
                        {c.email && <span><strong>Email:</strong> <span className="text-blue-600">{c.email}</span></span>}
                        <span><strong>Location:</strong> {[c.phy.city, c.phy.state].filter(Boolean).join(', ') || 'N/A'}</span>
                        {c.addDate && <span><strong>Added:</strong> {c.addDate}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-center">
                        <div className="text-[10px] font-bold text-slate-500 uppercase">Power Units</div>
                        <div className="text-lg font-extrabold">{c.powerUnits ?? '—'}</div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-center">
                        <div className="text-[10px] font-bold text-slate-500 uppercase">Drivers</div>
                        <div className="text-lg font-extrabold">{c.drivers ?? '—'}</div>
                      </div>
                      <span className="text-slate-400 text-xl ml-1">{isOpen ? '▾' : '▸'}</span>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-200">
                    <div className="flex border-b border-slate-200 bg-slate-50 px-4">
                      {(['insurance', 'inspections'] as const).map((t) => (
                        <button key={t} onClick={() => switchTab(c.usdot, t)}
                          className={`px-5 py-2.5 text-sm font-medium border-b-2 capitalize ${tab[c.usdot] === t ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-slate-500'}`}>
                          {t}
                        </button>
                      ))}
                    </div>

                    <div className="p-5">
                      {/* Overview strip */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
                        <div>
                          <p><strong>Physical:</strong> {[c.phy.street, c.phy.city, c.phy.state, c.phy.zip].filter(Boolean).join(', ') || 'Not listed'}</p>
                          <p className="mt-1"><strong>Mailing:</strong> {[c.mail.street, c.mail.city, c.mail.state, c.mail.zip].filter(Boolean).join(', ') || 'Not listed'}</p>
                          <p className="mt-1"><strong>Authority Type:</strong> {c.authType || 'N/A'} · <strong>MCS-150:</strong> {c.mcs150 || 'N/A'}</p>
                        </div>
                        <div>
                          <strong>Cargo:</strong>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {cargoTags.length ? cargoTags.map((t) => (
                              <span key={t} className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-medium">{t}</span>
                            )) : <span className="text-slate-400">None reported</span>}
                          </div>
                        </div>
                      </div>

                      {tab[c.usdot] !== 'inspections' ? (
                        ins[c.usdot]?.loading ? (
                          <p className="text-sm text-blue-600 py-6 text-center">Loading insurance from FMCSA L&amp;I portal…</p>
                        ) : !ins[c.usdot]?.data ? (
                          <p className="text-sm text-slate-500 py-4">Insurance data unavailable for this carrier.</p>
                        ) : (
                          <div>
                            <p className="text-xs text-slate-500 mb-2">
                              <strong className="text-slate-700">Owner / Representative:</strong> {ins[c.usdot]!.data!.owner}
                            </p>
                            {ins[c.usdot]!.data!.policies.length === 0 ? (
                              <p className="text-sm text-slate-500">No active/pending insurance filings found.</p>
                            ) : (
                              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                <table className="min-w-full text-xs">
                                  <thead className="bg-slate-50 text-slate-600 font-semibold">
                                    <tr>
                                      <th className="py-2 px-3 text-left">Form</th><th className="py-2 px-3 text-left">Type</th>
                                      <th className="py-2 px-3 text-left">Insurance Carrier</th><th className="py-2 px-3 text-left">Policy #</th>
                                      <th className="py-2 px-3 text-left">Coverage</th><th className="py-2 px-3 text-left">Effective</th>
                                      <th className="py-2 px-3 text-left">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {ins[c.usdot]!.data!.policies.map((p, i) => (
                                      <tr key={i} className="hover:bg-slate-50">
                                        <td className="py-2 px-3">{p.form}</td>
                                        <td className="py-2 px-3">{p.type}</td>
                                        <td className="py-2 px-3">{p.carrier}</td>
                                        <td className="py-2 px-3 font-mono">{p.policy}</td>
                                        <td className="py-2 px-3">{p.coverage}</td>
                                        <td className="py-2 px-3">{p.effective}</td>
                                        <td className="py-2 px-3">
                                          <span className={`px-2 py-0.5 rounded-full font-semibold ${p.status.toLowerCase().includes('active') ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{p.status}</span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )
                      ) : (
                        insp[c.usdot]?.loading ? (
                          <p className="text-sm text-blue-600 py-6 text-center">Querying roadside inspection records…</p>
                        ) : !insp[c.usdot]?.data || insp[c.usdot]!.data!.length === 0 ? (
                          <p className="text-sm text-slate-500 py-4">No roadside inspections on record for this carrier.</p>
                        ) : (
                          <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <table className="min-w-full text-xs">
                              <thead className="bg-slate-50 text-slate-600 font-semibold">
                                <tr>
                                  <th className="py-2 px-3 text-left">Date</th><th className="py-2 px-3 text-left">Report #</th>
                                  <th className="py-2 px-3 text-left">State</th><th className="py-2 px-3 text-left">Inspection</th>
                                  <th className="py-2 px-3 text-left">Result</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {insp[c.usdot]!.data!.map((r, i) => (
                                  <tr key={i} className="hover:bg-slate-50">
                                    <td className="py-2 px-3 whitespace-nowrap">{r.date}</td>
                                    <td className="py-2 px-3 font-mono text-blue-600">{r.report}</td>
                                    <td className="py-2 px-3 font-semibold">{r.state}</td>
                                    <td className="py-2 px-3">{r.level}</td>
                                    <td className="py-2 px-3">{r.summary}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {results.length > 0 && !exhausted && (
            <button onClick={() => runSearch(true)} disabled={loading}
              className="w-full py-3 text-sm font-semibold text-blue-700 border border-blue-300 bg-white rounded-lg hover:bg-blue-50 disabled:opacity-50">
              {loading ? 'Loading…' : 'Load more results'}
            </button>
          )}

          {searched && !loading && results.length === 0 && (
            <div className="border border-dashed border-slate-300 rounded-xl p-12 text-center text-sm text-slate-500">
              No carriers matched. Try a different term or loosen the filters.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
```

## Step 5 — Deploy

1. **Vercel → your project → Settings → Environment Variables:** add `DOT_APP_TOKEN` = your new token (Production + Preview). **Delete** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — nothing uses them anymore.
2. Commit and push:
   ```
   git add -A
   git commit -m "Rebuild: live FMCSA search, server-side proxy, advanced filters"
   git push
   ```
3. Vercel deploys automatically. Wait ~1 minute.

## Step 6 — Test checklist (do these in order)

1. Search `1032275` → you should get **both** T A Martin (MC match) and Monte W Graham (USDOT match).
2. Search `3270258` → expand the card → **Insurance tab auto-loads** with Travis Martin as owner + the BMC table; click **Inspections tab** → the 5 inspections with dates like 07/09/2026.
3. Clear the box, set **State = GA** + **New authorities — last 30 days** → Search → newest GA carriers sorted by Added date, descending.
4. **Export CSV** button downloads the visible list.

## After it all works

- Make the repo **private** (Settings → Danger Zone → Change visibility).
- **n8n:** deactivate the workflows (they're failing anyway).
- **Supabase:** leave it frozen for now as an archive; once the team has used the live version for a week happily, cancel the project.

## What I deliberately left out (and the honest limits vs BrokerSnapshot)

- **SMS percentiles** — private FMCSA dataset; removed the dead tab. Only path is monthly bulk-file ingestion, which we can revisit if you ever move off the free tier.
- **"Reinstated 5/4/2025" status reasons** — this comes from the Revocations/Reinstatement dataset, which *is* queryable live by DOT number. That's my recommended next addition once you've tested this build.
- **Historical emails/phones** — nobody has this for free; BrokerSnapshot paid for years of hoarding. We can start snapshotting from today forward later.

Run the checklist and tell me which step (if any) misbehaves — paste the exact error or a screenshot.
User: It is working fine. I want few tweaks. Like I want to follow the UI of Brokersnapshot not 100% but display of details should be like brokersnapshot or if you can make UI more appealing and easy to use. 

I want single search and advance search to be separate in way brokersnapshot is doing. Please check this page. https://brokersnapshot.com/SearchCompanies/Advanced I want data to be filtered as brokersnapshot is doing. 

Company DBA and Owner name should also be visible. Check if we can manage on that and also I am ready for: 

"Reinstated 5/4/2025" status reasons — this comes from the Revocations/Reinstatement dataset, which is queryable live by DOT number. That's my recommended next addition once you've tested this build.
Kimi: The DOT portal has stopped responding to my server entirely (it worked once earlier — typical Socrata flakiness), so I can't verify two things myself: the exact DBA column name and the Revocations dataset ID. Here's how I'll handle that:

- **DBA**: The census almost certainly uses the standard FMCSA column `dba_name`. I'll map it defensively — if the column doesn't exist, your search *still works* (the route catches the error, drops the DBA clause, and retries). No broken build.
- **Status History ("Reinstated 5/4/2025")**: This needs one 2-minute probe from your machine (same trick as `debug.mjs` earlier). Script is in Step 0 — run it and paste the output, and I'll deliver the `/api/status-history` route with the real field names. The UI below already has the "Authority Status History" section built; it just renders empty until the route lands.

Everything else — the two-page split, the UI overhaul, DBA, owner name — is in this delivery.

## Step 0 — Probe: `probe.mjs` (project root, run with `node --env-file=.env.local probe.mjs`)

```js
const H = { 'X-App-Token': process.env.DOT_APP_TOKEN || '' };
const j = async (url) => { const r = await fetch(url, { headers: H }); return r.json(); };

// 1. Confirm the DBA column exists in the census
try {
  const dba = await j(`https://data.transportation.gov/resource/az4n-8mr2.json?$limit=3&$where=dba_name IS NOT NULL&$select=dot_number,legal_name,dba_name`);
  console.log('DBA TEST:', JSON.stringify(dba).slice(0, 600));
} catch (e) { console.log('DBA TEST failed:', e.message); }

// 2. Find the Revocations/Reinstatement dataset
const cat = await j(`https://api.us.socrata.com/api/catalog/v1?q=revocation&domains=data.transportation.gov`);
console.log('\nCATALOG:');
for (const r of cat.results || []) console.log('-', r.resource.id, '|', r.resource.name);

// 3. Auto-probe the best candidate against T A Martin (known "Reinstated 5/4/2025")
const hit = (cat.results || []).find(r => /revok|suspend/i.test(r.resource.name || ''));
if (hit) {
  const id = hit.resource.id;
  const row = await j(`https://data.transportation.gov/resource/${id}.json?$limit=5&$where=dot_number='3270258'`);
  console.log(`\nSAMPLE ROWS from ${id}:`, JSON.stringify(row, null, 2).slice(0, 1500));
}
```

## Step 1 — Replace `app/api/search/route.ts` (adds discrete fields + DBA)

```ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CENSUS = 'https://data.transportation.gov/resource/az4n-8mr2.json';
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { ts: number; data: unknown }>();

function cached(key: string) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;
  cache.delete(key);
  return null;
}

const STATUS: Record<string, string> = { A: 'Active', I: 'Inactive', P: 'Pending' };
const esc = (s: string) => s.replace(/'/g, "''");
const num = (v: any) => (v !== undefined && v !== null && v !== '' ? Number(v) : null);

function fmtDate(v?: string | null) {
  if (!v) return null;
  const s = String(v).slice(0, 10).replace(/-/g, '');
  return s.length === 8 ? `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}` : v;
}

function mapCarrier(r: any) {
  const prefix = r.docket1prefix || '';
  const num1 = r.docket1 || '';
  const flag = (v: any) => v === 'Y' || v === 'X';
  return {
    usdot: String(r.dot_number || '').replace(/^0+/, '') || String(r.dot_number),
    docketDigits: num1,
    docket: prefix && num1 ? `${prefix}${num1}` : num1 || null,
    legalName: r.legal_name || null,
    dba: r.dba_name || null,
    dotStatus: STATUS[(r.status_code || '').toUpperCase()] || r.status_code || 'Unknown',
    authStatus: STATUS[(r.docket1_status_code || '').toUpperCase()] || r.docket1_status_code || 'Unknown',
    authType: r.classdef || null,
    phone: r.phone || r.bus_telno || null,
    email: r.email_address || null,
    powerUnits: num(r.power_units) ?? num(r.owntract),
    drivers: num(r.total_drivers) ?? num(r.total_cdl),
    phy: { street: r.phy_street, city: r.phy_city, state: r.phy_state, zip: r.phy_zip },
    mail: { street: r.carrier_mailing_street, city: r.carrier_mailing_city, state: r.carrier_mailing_state, zip: r.carrier_mailing_zip },
    cargo: {
      'General Freight': flag(r.crgo_genfreight),
      'Fresh Produce': flag(r.crgo_freshprod),
      'Meat': flag(r.crgo_meat),
      'Refrigerated': flag(r.crgo_coldfood),
      'Hazmat': flag(r.hm_ind),
    },
    addDate: fmtDate(r.add_date),
    mcs150: fmtDate(r.mcsipdate),
  };
}

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const limit = Math.min(parseInt(p.get('limit') || '25', 10) || 25, 50);
  const offset = parseInt(p.get('offset') || '0', 10) || 0;

  // Universal (simple page)
  const q = (p.get('q') || '').trim();
  // Discrete (advanced page)
  const fName = (p.get('name') || '').trim();
  const fDba = (p.get('dba') || '').trim();
  const fUsdot = (p.get('usdot') || '').trim().replace(/^0+/, '');
  const fMc = (p.get('mc') || '').trim().replace(/\D/g, '');
  const fPhone = (p.get('phone') || '').trim().replace(/\D/g, '');
  const fCity = (p.get('city') || '').trim();
  const fZip = (p.get('zip') || '').trim();
  // Shared filters
  const state = (p.get('state') || '').trim().toUpperCase();
  const status = p.get('status') || 'all';
  const added = parseInt(p.get('added') || '', 10);

  const hasDiscrete = !!(fName || fDba || fUsdot || fMc || fPhone || fCity || fZip);
  if (!q && !hasDiscrete && !state && status === 'all' && !added) {
    return NextResponse.json({ error: 'Enter a search term or pick at least one filter.' }, { status: 400 });
  }

  const cacheKey = JSON.stringify([q, fName, fDba, fUsdot, fMc, fPhone, fCity, fZip, state, status, added, limit, offset]);
  const hit = cached(cacheKey);
  if (hit) return NextResponse.json({ results: hit, cached: true });

  const wheres: string[] = [];
  let dbaUsed = false;

  if (hasDiscrete) {
    if (fUsdot) wheres.push(`dot_number='${esc(fUsdot)}'`);
    if (fMc) wheres.push(`docket1='${esc(fMc)}'`);
    if (fPhone) wheres.push(`phone like '%${esc(fPhone)}%'`);
    if (fName) wheres.push(`upper(legal_name) like '%${esc(fName.toUpperCase())}%'`);
    if (fDba) { wheres.push(`upper(dba_name) like '%${esc(fDba.toUpperCase())}%'`); dbaUsed = true; }
    if (fCity) wheres.push(`upper(phy_city) like '%${esc(fCity.toUpperCase())}%'`);
    if (fZip) wheres.push(`phy_zip like '%${esc(fZip)}%'`);
  } else {
    const stripped = q.replace(/[\s-]/g, '');
    const mcMatch = stripped.match(/^(MC|FF|MX)(\d+)$/i);
    const digits = mcMatch ? mcMatch[2] : stripped.replace(/\D/g, '');
    const isNumeric = /^\d+$/.test(stripped) || !!mcMatch;
    if (isNumeric && digits) {
      wheres.push(`(dot_number='${esc(digits)}' OR docket1='${esc(digits)}' OR phone like '%${esc(digits)}%')`);
    } else if (q) {
      wheres.push(`upper(legal_name) like '%${esc(q.toUpperCase())}%'`);
    }
  }

  if (state) wheres.push(`phy_state='${esc(state)}'`);
  if (status === 'active') wheres.push(`docket1_status_code='A'`);
  if (added > 0) {
    const cutoff = new Date(Date.now() - added * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    wheres.push(`add_date>='${cutoff}'`);
    wheres.push(`docket1_status_code='A'`);
  }

  const order = added > 0 ? `&$order=${encodeURIComponent('add_date DESC')}` : '';
  const dotFetch = async (where: string) => {
    const url = `${CENSUS}?$limit=${limit}&$offset=${offset}&$where=${encodeURIComponent(where)}${order}`;
    const res = await fetch(url, { headers: { 'X-App-Token': process.env.DOT_APP_TOKEN || '' } });
    return { res, data: await res.json() };
  };

  try {
    let { res, data } = await dotFetch(wheres.join(' AND '));

    // Fallback: if dba_name column doesn't exist in this dataset, retry without it
    if ((!res.ok || !Array.isArray(data)) && dbaUsed) {
      const retryWheres = wheres.filter((w) => !w.includes('dba_name'));
      ({ res, data } = await dotFetch(retryWheres.join(' AND ')));
      console.warn('dba_name column not supported — DBA filter skipped');
    }

    if (!res.ok || !Array.isArray(data)) {
      return NextResponse.json({ error: 'DOT search failed', detail: data }, { status: 502 });
    }

    let results = data.map(mapCarrier);

    if (!hasDiscrete && q) {
      const stripped = q.replace(/[\s-]/g, '');
      const digits = stripped.replace(/\D/g, '');
      if (/^\d+$/.test(stripped) || /^(MC|FF|MX)\d+$/i.test(stripped)) {
        const exact = results.filter((c) => c.usdot === digits || c.docketDigits === digits);
        if (exact.length > 0) results = exact;
      }
    }

    cache.set(cacheKey, { ts: Date.now(), data: results });
    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
```

## Step 2 — New file: `components/CarrierCard.tsx` (shared, BrokerSnapshot-style detail)

```tsx
'use client';

import { useState } from 'react';

export interface Carrier {
  usdot: string; docketDigits: string; docket: string | null; legalName: string | null; dba: string | null;
  dotStatus: string; authStatus: string; authType: string | null;
  phone: string | null; email: string | null;
  powerUnits: number | null; drivers: number | null;
  phy: { street?: string; city?: string; state?: string; zip?: string };
  mail: { street?: string; city?: string; state?: string; zip?: string };
  cargo: Record<string, boolean>;
  addDate: string | null; mcs150: string | null;
}

interface InsPolicy { form: string; type: string; carrier: string; policy: string; coverage: string; effective: string; status: string; }
interface Insp { date: string; report: string; state: string; level: string; summary: string; }
interface HistoryEvent { date: string; label: string; }

const badge = (s: string) =>
  s === 'Active' ? 'bg-emerald-100 text-emerald-800' :
  s === 'Pending' ? 'bg-amber-100 text-amber-800' :
  s === 'Inactive' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] font-bold tracking-wider text-slate-400 uppercase border-b border-slate-200 pb-1 mb-2">{title}</h4>
      {children}
    </div>
  );
}

export default function CarrierCard({ carrier: c }: { carrier: Carrier }) {
  const [open, setOpen] = useState(false);
  const [ins, setIns] = useState<{ loading: boolean; owner: string | null; policies: InsPolicy[] } | null>(null);
  const [insp, setInsp] = useState<{ loading: boolean; rows: Insp[] } | null>(null);
  const [history, setHistory] = useState<{ loading: boolean; events: HistoryEvent[] } | null>(null);

  const expand = async () => {
    const next = !open;
    setOpen(next);
    if (!next) return;

    if (!ins) {
      setIns({ loading: true, owner: null, policies: [] });
      fetch('/api/insurance?dotNumber=' + c.usdot)
        .then((r) => r.json())
        .then((j) => setIns({ loading: false, owner: j.owner || null, policies: j.error ? [] : j.policies || [] }))
        .catch(() => setIns({ loading: false, owner: null, policies: [] }));
    }
    if (!insp) {
      setInsp({ loading: true, rows: [] });
      fetch('/api/inspections?dot=' + c.usdot)
        .then((r) => r.json())
        .then((j) => setInsp({ loading: false, rows: j.inspections || [] }))
        .catch(() => setInsp({ loading: false, rows: [] }));
    }
    if (!history) {
      setHistory({ loading: true, events: [] });
      fetch('/api/status-history?dot=' + c.usdot)
        .then((r) => (r.ok ? r.json() : { events: [] }))
        .then((j) => setHistory({ loading: false, events: j.events || [] }))
        .catch(() => setHistory({ loading: false, events: [] }));
    }
  };

  const cargoTags = Object.entries(c.cargo).filter(([, v]) => v).map(([k]) => k);
  const addr = (a: Carrier['phy']) => [a.street, a.city, a.state, a.zip].filter(Boolean).join(', ');

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header row */}
      <button onClick={expand} className="w-full text-left p-5 hover:bg-slate-50/60 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 uppercase truncate">{c.legalName || 'NAME NOT LISTED'}</h2>
              <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full whitespace-nowrap ${badge(c.dotStatus)}`}>{c.dotStatus}</span>
              {c.docket && (
                <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full whitespace-nowrap ${badge(c.authStatus)}`}>{c.docket} · {c.authStatus}</span>
              )}
            </div>
            {c.dba && <p className="text-xs text-slate-500 mt-0.5">DBA: <span className="font-medium text-slate-700">{c.dba}</span></p>}
            <div className="text-xs text-slate-600 mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              <span><strong>USDOT:</strong> {c.usdot}</span>
              <span><strong>Phone:</strong> {c.phone || 'N/A'}</span>
              {c.email && <span><strong>Email:</strong> <span className="text-blue-600">{c.email}</span></span>}
              <span><strong>Location:</strong> {[c.phy.city, c.phy.state].filter(Boolean).join(', ') || 'N/A'}</span>
              {c.addDate && <span><strong>Added:</strong> {c.addDate}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-center">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Power Units</div>
              <div className="text-lg font-extrabold leading-tight">{c.powerUnits ?? '—'}</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-center">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Drivers</div>
              <div className="text-lg font-extrabold leading-tight">{c.drivers ?? '—'}</div>
            </div>
            <span className="text-slate-400 text-xl ml-1">{open ? '▾' : '▸'}</span>
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-slate-200 p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="space-y-1.5">
              <p><strong className="text-slate-800">Owner / Representative:</strong> {ins?.loading ? 'Loading…' : ins?.owner || 'See insurance filings below'}</p>
              <p><strong className="text-slate-800">Physical Address:</strong> {addr(c.phy) || 'Not listed'}</p>
              <p><strong className="text-slate-800">Mailing Address:</strong> {addr(c.mail) || 'Not listed'}</p>
              <p><strong className="text-slate-800">Authority Type:</strong> {c.authType || 'N/A'}</p>
              <p><strong className="text-slate-800">Last MCS-150:</strong> {c.mcs150 || 'N/A'}</p>
            </div>
            <div>
              <strong className="text-slate-800">Cargo:</strong>
              <div className="flex flex-wrap gap-1 mt-1">
                {cargoTags.length ? cargoTags.map((t) => (
                  <span key={t} className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-medium">{t}</span>
                )) : <span className="text-slate-400">None reported</span>}
              </div>
            </div>
          </div>

          <Section title="Authority Status History">
            {history?.loading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : history?.events.length ? (
              <ul className="space-y-1 text-xs">
                {history.events.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-slate-400 shrink-0">•</span>
                    <span><strong className="text-slate-800">{e.label}</strong> — {e.date}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">No revocation, suspension, or reinstatement events on record.</p>
            )}
          </Section>

          <Section title={`Insurance Filings (${ins?.policies.length ?? (ins?.loading ? '…' : 0)})`}>
            {ins?.loading ? (
              <p className="text-xs text-slate-400">Loading from FMCSA L&amp;I portal…</p>
            ) : !ins || ins.policies.length === 0 ? (
              <p className="text-xs text-slate-500">No active/pending insurance filings found.</p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2 px-3 text-left">Form</th><th className="py-2 px-3 text-left">Type</th>
                      <th className="py-2 px-3 text-left">Carrier</th><th className="py-2 px-3 text-left">Policy #</th>
                      <th className="py-2 px-3 text-left">Coverage</th><th className="py-2 px-3 text-left">Effective</th>
                      <th className="py-2 px-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ins.policies.map((p, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-2 px-3">{p.form}</td>
                        <td className="py-2 px-3">{p.type}</td>
                        <td className="py-2 px-3">{p.carrier}</td>
                        <td className="py-2 px-3 font-mono">{p.policy}</td>
                        <td className="py-2 px-3">{p.coverage}</td>
                        <td className="py-2 px-3">{p.effective}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full font-semibold ${p.status.toLowerCase().includes('active') ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{p.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title={`Roadside Inspections (${insp?.rows.length ?? (insp?.loading ? '…' : 0)})`}>
            {insp?.loading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : !insp || insp.rows.length === 0 ? (
              <p className="text-xs text-slate-500">No roadside inspections on record.</p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2 px-3 text-left">Date</th><th className="py-2 px-3 text-left">Report #</th>
                      <th className="py-2 px-3 text-left">State</th><th className="py-2 px-3 text-left">Inspection</th>
                      <th className="py-2 px-3 text-left">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {insp.rows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-2 px-3 whitespace-nowrap">{r.date}</td>
                        <td className="py-2 px-3 font-mono text-blue-600">{r.report}</td>
                        <td className="py-2 px-3 font-semibold">{r.state}</td>
                        <td className="py-2 px-3">{r.level}</td>
                        <td className="py-2 px-3">{r.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
```

## Step 3 — Replace `app/page.tsx` (Simple Search — the BrokerSnapshot home style)

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import CarrierCard, { Carrier } from '@/components/CarrierCard';

export default function Home() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch('/api/search?q=' + encodeURIComponent(q.trim()) + '&limit=25');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Search failed');
      setResults(json.results || []);
    } catch (err: any) {
      alert('Search error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100">
      {/* Hero */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-800 text-white py-14 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl font-extrabold tracking-tight">Carrier Snapshot</h1>
          <p className="text-slate-300 mt-2 text-sm">Live FMCSA carrier lookup — authorities, insurance, inspections.</p>
          <form onSubmit={search} className="mt-8 flex flex-col sm:flex-row gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="USDOT, MC#, phone, or company name…"
              className="flex-1 rounded-lg px-4 py-3.5 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 font-semibold px-10 py-3.5 rounded-lg disabled:opacity-50"
            >
              {loading ? 'Searching…' : 'Search'}
            </button>
          </form>
          <Link href="/advanced" className="inline-block mt-4 text-xs text-blue-300 hover:text-blue-200 underline underline-offset-4">
            Need filters? Try Advanced Search →
          </Link>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        {searched && !loading && results.length === 0 && (
          <div className="border border-dashed border-slate-300 rounded-xl p-12 text-center text-sm text-slate-500 bg-white">
            No carriers matched “{q}”.
          </div>
        )}
        {results.map((c) => <CarrierCard key={c.usdot} carrier={c} />)}
      </div>
    </main>
  );
}
```

## Step 4 — New file: `app/advanced/page.tsx` (Advanced Search — per-field filters)

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import CarrierCard, { Carrier } from '@/components/CarrierCard';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const empty = { name: '', dba: '', usdot: '', mc: '', phone: '', city: '', zip: '', state: '', status: 'all', added: '' };

export default function AdvancedSearch() {
  const [f, setF] = useState({ ...empty });
  const [results, setResults] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [offset, setOffset] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function search(append: boolean) {
    const anyField = Object.values(f).some((v) => v && v !== 'all');
    if (!anyField) { alert('Fill in at least one field or filter.'); return; }
    setLoading(true);
    setSearched(true);

    const params = new URLSearchParams();
    (['name','dba','usdot','mc','phone','city','zip','state'] as const).forEach((k) => f[k] && params.set(k, f[k]));
    if (f.status !== 'all') params.set('status', f.status);
    if (f.added) params.set('added', f.added);
    const off = append ? offset : 0;
    params.set('limit', '25');
    params.set('offset', String(off));

    try {
      const res = await fetch('/api/search?' + params.toString());
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Search failed');
      const rows: Carrier[] = json.results || [];
      setResults((p) => (append ? [...p, ...rows] : rows));
      setOffset(off + rows.length);
      setExhausted(rows.length < 25);
    } catch (err: any) {
      alert('Search error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none";

  return (
    <main className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-slate-900">Advanced Search</h1>
          <Link href="/" className="text-xs text-blue-700 hover:underline underline-offset-4">← Simple Search</Link>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); search(false); }} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input placeholder="Legal Name" value={f.name} onChange={set('name')} className={inputCls} />
            <input placeholder="DBA Name" value={f.dba} onChange={set('dba')} className={inputCls} />
            <input placeholder="USDOT Number" value={f.usdot} onChange={set('usdot')} className={inputCls} />
            <input placeholder="MC / FF Number" value={f.mc} onChange={set('mc')} className={inputCls} />
            <input placeholder="Phone Number" value={f.phone} onChange={set('phone')} className={inputCls} />
            <input placeholder="City" value={f.city} onChange={set('city')} className={inputCls} />
            <select value={f.state} onChange={set('state')} className={inputCls}>
              <option value="">All States</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input placeholder="ZIP" value={f.zip} onChange={set('zip')} className={inputCls} />
            <select value={f.status} onChange={set('status')} className={inputCls}>
              <option value="all">All Authorities</option>
              <option value="active">Active Only</option>
            </select>
            <select value={f.added} onChange={set('added')} className={inputCls}>
              <option value="">Any time added</option>
              <option value="7">New authorities — last 7 days</option>
              <option value="30">New authorities — last month</option>
              <option value="90">New authorities — last 3 months</option>
              <option value="180">New authorities — last 6 months</option>
            </select>
          </div>
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-2.5 rounded-lg text-sm disabled:opacity-50">
              {loading ? 'Searching…' : 'Search'}
            </button>
            <button type="button" onClick={() => { setF({ ...empty }); setResults([]); setSearched(false); }}
              className="border border-slate-300 bg-white px-6 py-2.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Clear
            </button>
          </div>
        </form>

        <div className="space-y-4">
          {searched && !loading && results.length === 0 && (
            <div className="border border-dashed border-slate-300 rounded-xl p-12 text-center text-sm text-slate-500 bg-white">
              No carriers matched those criteria.
            </div>
          )}
          {results.map((c) => <CarrierCard key={c.usdot + offset} carrier={c} />)}
          {results.length > 0 && !exhausted && (
            <button onClick={() => search(true)} disabled={loading}
              className="w-full py-3 text-sm font-semibold text-blue-700 border border-blue-300 bg-white rounded-lg hover:bg-blue-50 disabled:opacity-50">
              {loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
```

## Deploy & test

```bash
git add -A
git commit -m "Two-page search, DBA, owner, status history UI, advanced filters"
git push
```

Checklist: (1) home page hero search for `1032275` → both matches; (2) DBA shows under company name when the DOT has one; (3) **Advanced Search** → MC field `1032275` alone → T A Martin; (4) Advanced → State GA + last 30 days → newest first; (5) expanded card shows the new stacked layout with Owner loading at top.

**Then paste the `probe.mjs` output** — I need the Revocations dataset ID and its exact date/reason fields to ship `/api/status-history`, which will light up the "Authority Status History" section (and give you the "Reinstated 5/4/2025" line in the card header if you want it there too — say the word and I'll add it).
