# Export Plan: Shareable Link + PDF Download

Status: **planned, not yet implemented**.
Created: 2026-06-06.

This document captures the design for letting users export Grant Radar results
in two formats so a sales rep can share them with prospects or attach them to
emails.

## Goals

1. Sales rep generates a radar result, sends a **link** to a prospect, prospect
   sees the live results page (no auth wall).
2. Sales rep can **download a PDF** of the same result for email attachments
   or formal hand-offs.

## Non-goals

- Editable decks (PowerPoint, Google Slides) — defer.
- User accounts / saved search history — defer; the share link is the
  persistence mechanism.
- Analytics on shared link views — defer.
- Branded subdomains per customer — defer.

---

## Architecture — Shareable Link

### Data model (Supabase)

Single table, `radar_results`:

| Column        | Type          | Notes                                        |
| ------------- | ------------- | -------------------------------------------- |
| `id`          | `text` (PK)   | 10-char nanoid slug, used in URL `/r/<id>`   |
| `parent_name` | `text`        | for indexing / display                       |
| `result`      | `jsonb`       | full `RadarResponse` payload                 |
| `created_at`  | `timestamptz` | for cleanup + freshness display on the page  |

RLS:

- Public read for `anon` role (anyone with the URL can view).
- No insert policy needed; the API route writes using `SUPABASE_SERVICE_ROLE_KEY`,
  which bypasses RLS.

SQL is committed at [`supabase/schema.sql`](../supabase/schema.sql) — run it
once in the Supabase SQL editor before shipping this feature.

### Flow

```
1. User runs search at /
2. POST /api/radar
3. Server: run agent → fan-out GG → assemble RadarResponse
4. Server: generate nanoid → INSERT into radar_results (service-role key)
5. Server: return { ...result, shareId: "<10-char>" }
6. UI: shows result + "Copy link" button → https://<host>/r/<shareId>

Visitor opens /r/<id>:
1. Server component fetches row from radar_results (anon key + RLS)
2. 404 if missing
3. Renders <RadarResults> with the stored payload (same component as /)
```

### File changes

- `supabase/schema.sql` — already committed, you run it in the SQL editor.
- `src/lib/supabase.ts` — keep, add a server-side helper that uses the
  service-role key for writes.
- `src/app/_components/RadarResults.tsx` — **new**, extracted from `page.tsx`.
- `src/app/page.tsx` — keeps form + loading + error state, delegates result
  rendering to `<RadarResults>`, adds "Copy link" button.
- `src/app/r/[id]/page.tsx` — **new**, server component, fetches by id, renders
  `<RadarResults>`.
- `src/app/api/radar/route.ts` — adds Supabase insert after research+search,
  returns `shareId`.

### Snapshot vs. live: snapshot wins

A shared link must show **exactly what the sales rep saw**. We store the full
result and serve it. We do NOT re-run the agent when the link is opened —
expensive, slow, and the recipient would see different results than were
promised. The `created_at` timestamp surfaces on the page so the recipient
knows when the snapshot was taken.

---

## Architecture — PDF Download

### Two viable approaches

|                       | **A. Client-side (jsPDF + html2canvas)** | **B. Server-side (Playwright)**          |
| --------------------- | ---------------------------------------- | ---------------------------------------- |
| Implementation        | Capture DOM node → image → embed in PDF  | Headless browser → /r/<id> → print to PDF |
| Text quality          | Raster (blurry on zoom)                  | Vector (sharp at any zoom)               |
| Bundle impact         | +~250 KB to browser                      | None on browser                          |
| Build complexity      | Low                                      | Medium (deps + serverless runtime)       |
| Hosting concerns      | None                                     | Vercel free tier may struggle            |
| Used by Great Grants? | **Yes** (`jsPDF` + `html2canvas`)        | No                                       |

**Recommendation: A** — matches the Great Grants pattern, ships fast, quality
is good enough for a marketing PDF. We can upgrade to B later if quality
becomes a complaint.

### Flow

```
1. User clicks "Download PDF" on results page
2. Client: html2canvas captures the results container at 2x scale
3. Client: jsPDF places the image across one or more A4 pages
4. Browser downloads radar-<parent-slug>-<yyyy-mm-dd>.pdf
```

### What's IN the PDF

- Header strip: GreatGrants.ai logo + "Grant Radar Report" + date
- Parent hero
- Methodology note
- Nonprofit cards (each with top 10 grants)
- Great Grants CTA panel

### What's NOT in the PDF

- The search form (irrelevant in a static doc)
- Any future site navigation chrome

### File changes

- `package.json` — add `jspdf`, `html2canvas`, `nanoid`.
- `src/app/_components/DownloadPdfButton.tsx` — **new**, client component,
  owns the capture + download logic.
- `src/app/_components/RadarResults.tsx` — wraps content in a
  `<div ref={pdfRef}>` so the button can target it.

---

## Implementation phases

Each phase is independently shippable.

### Phase 1 — Refactor only (no behavior change)

1. Extract `<RadarResults>` from `src/app/page.tsx`.
2. Verify the current page still works.

### Phase 2 — Supabase wiring

1. Run `supabase/schema.sql` in the Supabase SQL editor.
2. Update `/api/radar` to insert the result with a nanoid, return `shareId`.
3. Build `src/app/r/[id]/page.tsx`.
4. Add "Copy link" button to the results header.

### Phase 3 — PDF download

1. Install `jsPDF` + `html2canvas`.
2. Build `<DownloadPdfButton>`.
3. Test on a few result shapes (1 nonprofit, 3 nonprofits, 0 nonprofits).

If we run out of time, **Phase 1 + 2 alone delivers the shareable link** — the
higher-value of the two exports.

---

## Open questions (resolve before Phase 2)

1. **Link privacy** — shared links are public by default. Anyone with the URL
   can view. Assumption: that's what we want for a marketing tool (no auth wall
   to discourage forwarding).
2. **Link expiration** — do shared links live forever, or expire after 30/90
   days? Forever is simpler; expiration is nicer for privacy.
3. **Same-parent re-runs** — running "Chick-fil-A" today and again next week:
   different short IDs (two independent immutable snapshots) or update the
   existing one? Independent snapshots = simpler + each link is immutable.
4. **PDF chrome** — strip the search form from the PDF (it's irrelevant) OR
   make the PDF look exactly like the web page?
5. **PDF filename** — proposed pattern: `radar-chick-fil-a-2026-06-06.pdf`.
6. **PDF CTA panel** — include the Great Grants CTA (keeps the funnel intact)
   or strip it (more neutral-feeling report)?

---

## What's needed to start

- Run `supabase/schema.sql` in the Supabase project's SQL editor.
- Resolve the open questions above (or grant me defaults).
- Then I can execute Phase 1 → 2 → 3 sequentially.
