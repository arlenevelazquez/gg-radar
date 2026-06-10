# Grant Radar

A standalone marketing surface for **[Great Grants](https://greatgrants.ai)**.
Enter a parent company (corporation, foundation, family office), and Radar:

1. Identifies the nonprofits that are **structurally tied** to that parent —
   the parent's corporate foundation, the founder family's foundation, and any
   affiliated nonprofits (e.g. Chick-fil-A → Chick-fil-A Foundation, WinShape
   Foundation, LifeShape Foundation).
2. Queries **GrantGuru** for the top federal grant matches for each tied
   nonprofit, with honest match-quality scoring.
3. Surfaces the results as a public marketing teaser, with a CTA to upgrade
   into Great Grants for higher-fidelity matches.

> Radar is a **discovery / lead-gen surface**. It runs on public web
> research, which is a thin signal. Great Grants users get dramatically
> better matches by feeding GrantGuru a full organization profile.

---

## Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** + Tailwind CSS 4
- **AI SDK v6** + Claude Haiku 4.5 (via Vercel AI Gateway or direct Anthropic)
- **GrantGuru** REST API (production, encrypted endpoints via AES-256-GCM)
- **Playwright** headless Chromium — renders the deck to PDF (`@sparticuz/chromium` on Vercel)
- **Supabase** (Postgres) — pre-staged for the shareable-link export feature
- **TypeScript** + ESLint

---

## Quick start

```bash
# 1. Install deps
npm install

# 2. Download the Chromium binary used by the PDF export (one-time, per machine)
npx playwright install chromium

# 3. Copy the env template and fill in real values
cp .env.local.example .env.local
# then edit .env.local — see "Environment" below

# 4. Run the dev server
npm run dev
```

Open <http://localhost:3000>, type a parent company name (try "Chick-fil-A",
"McDonald's", "Walmart"), and hit Run Grant Radar. Expect 30–60 seconds for
the agent to research + fan out GrantGuru queries.

> **PDF export (local dev):** the "Download PDF" button renders the deck with
> headless Chromium via Playwright. `npm install` pulls the Playwright package
> but **not** the browser binary, so step 2 above is required — otherwise the
> export fails with `browserType.launch: Executable doesn't exist …`. The
> binary lives in your user cache (`~/Library/Caches/ms-playwright`), not the
> repo, so each machine runs it once. On Vercel this is handled separately via
> `@sparticuz/chromium` and needs no extra step.

---

## Environment

See [`.env.local.example`](./.env.local.example) for the full annotated
template. Required to run the app:

| Variable             | What it is                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `GRANTGURU_API_URL`  | Base URL for the GrantGuru REST API (production: `https://grantguru.com/api/v1`).           |
| `GRANTGURU_API_KEY`  | Partner API key from GrantGuru. Treated like a password.                                    |
| `GG_RADAR_USER_GUID` | The shared GrantGuru user GUID we run all searches through. See the integration doc below.  |
| `AI_GATEWAY_API_KEY` _or_ `ANTHROPIC_API_KEY` | Pick one. Gateway is recommended on Vercel deployments. |

Supabase variables are pre-staged in the template for the
[shareable-link export feature](./docs/export-plan.md) but aren't read by
the current code.

---

## Architecture

```
                    ┌────────────────────────┐
   User input ─────▶│  POST /api/radar       │
   (parent name)    │  src/app/api/radar/    │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │  runResearch()         │
                    │  src/lib/agent/        │
                    │                        │
                    │  Phase A: free-text    │
                    │    web_search agent    │
                    │    (Haiku 4.5)         │
                    │                        │
                    │  Phase B: schema       │
                    │    coerce (generate-   │
                    │    Object)             │
                    └───────────┬────────────┘
                                │
                                ▼  ResearchResult
                    ┌────────────────────────┐
                    │  for each nonprofit    │
                    │  (parallel):           │
                    │    searchGrants(...)   │
                    │  src/lib/grant-guru/   │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │  enrich + score        │
                    │  (qualifiedCount,      │
                    │   matchQuality)        │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │  RadarResponse JSON    │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │  RadarResults (UI)     │
                    │  src/app/page.tsx      │
                    └────────────────────────┘
```

Two LLM steps and N parallel GrantGuru calls per radar search. Total
end-to-end latency: ~30–60s.

---

## How to verify the app is working

Run `npm run dev`, then:

| Test input | Expected output |
| ---------- | --------------- |
| `Chick-fil-A` | 3 tied nonprofits: Chick-fil-A Foundation (`corporate_foundation`), WinShape Foundation (`family_foundation`), LifeShape Foundation (`family_foundation`). The agent must NOT refuse on the for-profit parent. |
| `McDonald's` | Just RMHC, classified as `affiliated_nonprofit`. |
| `Walmart` | Walmart Foundation (corporate) + Walton Family Foundation (family). |

Each tied nonprofit's grant list should have **mission-aligned** matches
(food security orgs see food grants, veteran orgs see veteran grants). If
every nonprofit gets the same generic "Community Services" results, the
SSO user's category filter is poisoning the search — see
[`docs/grantguru-integration.md`](./docs/grantguru-integration.md#user-profile-biases-the-search-filter).

Also run:

```bash
npm run lint       # ESLint flat config — zero errors expected
npx tsc --noEmit   # TypeScript strict mode — zero errors expected
```

---

## Project layout

```
.
├── docs/
│   ├── export-plan.md           # design for shareable-link + PDF features
│   └── grantguru-integration.md # GrantGuru quirks + auth flow + filter gotchas
├── src/
│   ├── app/
│   │   ├── api/radar/route.ts   # main API endpoint
│   │   ├── page.tsx             # the marketing UI
│   │   ├── layout.tsx           # fonts, metadata
│   │   ├── globals.css          # Tailwind tokens + brand palette
│   │   └── favicon.ico
│   ├── components/
│   │   └── foundations/logo/    # Great Grants wordmark + nib SVGs
│   ├── lib/
│   │   ├── agent/               # research agent (parent → tied nonprofits)
│   │   │   ├── research.ts
│   │   │   └── types.ts
│   │   ├── grant-guru/          # slim GrantGuru client
│   │   │   ├── client.ts        # /grant/search with decryption + retry
│   │   │   ├── session.ts       # auth: partner token → SSO → session
│   │   │   ├── prompt.ts        # keyword-style prompt + filter builder
│   │   │   └── types.ts         # Zod schemas
│   │   └── supabase.ts          # not yet wired (reserved)
│   └── utils/
│       └── cx.ts                # className helper, no clsx dependency
├── supabase/
│   └── schema.sql               # reserved — run before shipping shareable links
├── .env.local.example
└── README.md
```

---

## Further reading

- [`docs/grantguru-integration.md`](./docs/grantguru-integration.md) — auth
  flow, encryption quirks, user-profile filter biasing, and other GG
  divergences we work around.
- [`docs/export-plan.md`](./docs/export-plan.md) — design for the shareable
  `/r/[id]` route and PDF download (not yet implemented).
- The sibling **great-grants** monorepo
  (`apps/web/src/lib/services/grant-guru/`) holds the production-grade
  GrantGuru client. Radar's client is a slim derivative; the vendor docs
  in `great-grants/.context/vendor/grant-guru/` are the source of truth
  for the underlying API.

---

## Brand

The wordmark, nib mark, color palette, and favicon are ported verbatim
from Great Grants. Source files live at
`src/components/foundations/logo/` and `src/app/globals.css`.
