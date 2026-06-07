# Export Plan: PowerPoint + PDF Download

Status: **planned, not yet implemented**.
Created: 2026-06-06.
Updated: 2026-06-07 — replaces the older jsPDF/html2canvas recommendation with
Playwright PDF + `pptxgenjs` PPTX, based on patterns vendored from a coworker's
`foundation-prospectus` skill (see `docs/reference/foundation-prospectus/`).

This document captures the design for letting a sales rep export a Grant Radar
result as a **PowerPoint deck** (editable) and a **PDF** (email attachment),
both rendered from the same in-memory `RadarResponse` payload.

## Goals

1. From a successful radar result, the user can download a **`.pptx`** that
   they can open in PowerPoint / Keynote / Google Slides and edit.
2. From the same result, the user can download a **`.pdf`** suitable for
   email attachments and formal hand-offs.
3. Both formats share a **single brief data model** derived from
   `RadarResponse` so they stay in sync as the underlying agent evolves.

## Non-goals

- Shareable links / Supabase persistence — moved to a separate later phase.
  The current export flow operates on the in-memory result the user just
  generated (POST the payload to the export route, get the file back).
- User accounts or saved-search history.
- Real-time deck editing in the browser.
- Branded customer subdomains.

---

## Reference: foundation-prospectus skill

A vendored copy lives at `docs/reference/foundation-prospectus/`. It is a
sibling project's HTML/PDF/PPTX generator for a different domain (foundation
meeting decks), but the rendering patterns are directly portable:

- `generate_pdf.py` — Playwright headless → 16in × 9in PDF, `prefer_css_page_size: true`,
  `device_scale_factor: 2`. Sharp vector text.
- `generate_pptx.js` — `pptxgenjs` slide builder. Brand palette, Cambria/Calibri
  fonts, native PPT tables, status badges as colored shapes. Design-simplified
  vs. the HTML — PowerPoint can't match HTML fidelity, so we don't pretend.
- `shell_template.html` + `focus_org_template.html` — 16:9 deck shell with
  `{{VARIABLE}}` substitution. Title slides, content slides, demo slide.
- `SKILL.md` — full playbook including empty-slot cleanup, confidentiality
  guardrails (don't apply to us), and brief schema.

We're porting these to TypeScript/Node and adapting the slide structure to
Radar's data shape (1 parent + N tied nonprofits + top grants per nonprofit).

---

## Architecture

### Single source of truth: `RadarBrief`

We derive a `RadarBrief` from the `RadarResponse` returned by `/api/radar`.
Both generators consume the brief — never the raw response — so the slide
structure is decoupled from the agent's output schema.

```ts
// src/lib/export/brief.ts
export interface RadarBrief {
  generatedAt: string;      // ISO timestamp, shown in footer
  parent: {
    name: string;
    typeLabel: string;      // e.g. "Corporation"
    headquarters: string | null;
    description: string;
    givingPrograms: string[];
  };
  summary: string;          // narrative tying picture together
  totals: {
    nonprofitCount: number;
    qualifiedGrantCount: number;  // sum of qualified across all nonprofits
  };
  nonprofits: Array<{
    name: string;
    connectionLabel: string;      // e.g. "Corporate foundation"
    location: string;
    mission: string;
    relationship: string;
    programs: string[];
    populations: string[];
    grants: {
      qualifiedCount: number;
      top: Array<{
        rank: number;              // 1-indexed
        programName: string;
        agency: string | null;
        fundingDisplay: string | null;
        closingDateDisplay: string | null;
        matchScore: number | null; // 0-100
        matchQuality: "excellent" | "good" | "possible" | "weak" | null;
        url: string | null;
      }>;
    };
  }>;
}
```

`deriveBrief(response: RadarResponse): RadarBrief` lives in
`src/lib/export/brief.ts` and is the only place display-formatting logic
should live (label mapping, location formatting, rank computation).

### Deck structure

Total pages: `2 + N` where N is the number of tied nonprofits.

| # | Slide | Content |
| -- | --- | --- |
| 1 | **Title + parent overview** | GreatGrants Radar header, parent name, type, HQ, description, giving programs, totals |
| 2..N+1 | **Nonprofit detail** (one per tied nonprofit) | Name + connection-type chip, mission, relationship, top 10 grants table (rank, program, agency, funding, closing, match %) |
| N+2 | **Methodology + CTA** | Match-quality legend, "Radar runs on public research…" caveat, Great Grants CTA |

Both PDF and PPTX render this same structure, with formatting differences:

| | **PDF** | **PPTX** |
| --- | --- | --- |
| Fonts | Lustria (display) + Cabin (body) — embedded via web fonts | Cambria + Calibri (universal availability) |
| Layout | Pixel-perfect to the brand HTML template | Native PPT tables, simpler grids |
| Editable | No | Yes |
| Source | Render HTML via Playwright | Build slide-by-slide via `pptxgenjs` |

---

## PDF generator

**Approach:** server-side Playwright headless render → print to PDF.
**Why:** matches the coworker's pattern, produces sharp vector text, no client
bundle bloat. The previous plan recommended `jsPDF + html2canvas` because
great-grants does that — we're upgrading to the better path.

### Flow

```
1. Client: user clicks "Download PDF" on results page
2. Client: POST /api/radar/export/pdf with the RadarResponse body
3. Server: deriveBrief(response) → RadarBrief
4. Server: render <RadarDeckHTML brief={brief} /> to an HTML string
   (React server-rendered, dedicated component tree under
    src/app/_deck/, NOT reused from the live page)
5. Server: launch headless chromium, setContent(html), page.pdf({
     width: "16in", height: "9in", printBackground: true,
     preferCSSPageSize: true,
   })
6. Server: return application/pdf with Content-Disposition: attachment
   filename="radar-<parent-slug>-<yyyy-mm-dd>.pdf"
7. Browser: downloads file
```

### Vercel deployment caveat

Stock `playwright` doesn't fit in a Vercel function's filesystem budget
(>200 MB). Standard workarounds:

- **`@sparticuz/chromium` + `playwright-core`** — a Vercel-friendly chromium
  build. Adds ~50 MB. Requires `experimental.serverComponentsExternalPackages`
  config plus a route-level `maxDuration` bump. This is the recommended path.
- **External worker** (e.g. a separate Render/Fly.io service) — defer.
- **Browserless.io / similar SaaS** — defer; adds cost + latency.

We'll start with `@sparticuz/chromium` and only escalate if it doesn't pan
out on Vercel's free/hobby tier.

### Files

- `src/lib/export/brief.ts` — `deriveBrief()` (shared with PPTX)
- `src/lib/export/pdf.ts` — `renderPdf(brief): Promise<Buffer>` —
  HTML render + Playwright print
- `src/app/_deck/RadarDeckHTML.tsx` — server-renderable deck component
  (no `"use client"`, no event handlers, no useState — RSC-compatible)
- `src/app/_deck/deck.css` — print-targeted CSS, 16:9 page sizing
- `src/app/api/radar/export/pdf/route.ts` — POST endpoint, returns
  `application/pdf`

---

## PPTX generator

**Approach:** `pptxgenjs` slide builder, ported from
`docs/reference/foundation-prospectus/generate_pptx.js`.

### Flow

```
1. Client: user clicks "Download PPTX" on results page
2. Client: POST /api/radar/export/pptx with the RadarResponse body
3. Server: deriveBrief(response) → RadarBrief
4. Server: build pptx via pptxgenjs (LAYOUT_WIDE 13.333" x 7.5"):
   - addTitleSlide(brief)
   - for each np in brief.nonprofits: addNonprofitSlide(brief, np)
   - addCtaSlide(brief)
5. Server: pptx.write({ outputType: "nodebuffer" })
6. Server: return application/vnd.openxmlformats-officedocument.presentationml.presentation
   with Content-Disposition: attachment
   filename="radar-<parent-slug>-<yyyy-mm-dd>.pptx"
7. Browser: downloads file
```

### Brand fidelity

PPTX export is intentionally design-simplified vs. the live UI:

- **Fonts:** Cambria (header) + Calibri (body). Lustria/Cabin don't embed
  reliably in PPT.
- **Layout:** native PPT tables for the grants list, not CSS grids.
- **Status badges:** colored rectangles with text, not gradient pills.
- **Brand palette preserved:** `#0E9384` primary, `#1C2B2A` dark,
  `#3BB5A6` light, `#E6F5F3` pale, `#F6FAFA` background.
- **Logo:** embedded from `public/great-grants-logo.png` (need to add).

### Files

- `src/lib/export/brief.ts` — shared with PDF
- `src/lib/export/pptx.ts` — `renderPptx(brief): Promise<Buffer>` —
  pptxgenjs slide builder, one function per slide type
- `src/lib/export/pptx-helpers.ts` — header/footer, status badge,
  grants-table helpers (kept short and explicit, not over-abstracted)
- `public/great-grants-logo.png` — PNG export of the wordmark, used by
  PPTX (PPT can't render SVG natively)
- `src/app/api/radar/export/pptx/route.ts` — POST endpoint, returns
  `application/vnd.openxmlformats-officedocument.presentationml.presentation`

---

## UI integration

After a successful radar run, the results header gets two new buttons:

```
[ Download PDF ]   [ Download PPTX ]
```

Each button POSTs the in-memory `RadarResponse` to its respective export
route. While the request is in flight, the button shows a spinner and is
disabled. Errors render inline in the same place the search error appears.

### Files

- `src/app/_components/ExportButtons.tsx` — new client component, owns
  the fetch + download trigger via blob URL
- `src/app/page.tsx` — render `<ExportButtons response={result} />` in
  the results header next to the totals

---

## Dependencies to add

```json
{
  "pptxgenjs": "^3.x",
  "playwright-core": "^1.x",
  "@sparticuz/chromium": "^130.x"
}
```

Approximate bundle impact: **zero on the browser** (all server-side).
Approximate Vercel function size impact: ~50 MB (chromium).

---

## Implementation phases

Each phase is independently testable; we can ship in order.

### Phase 1 — Brief + HTML deck component (no export yet)

1. Implement `deriveBrief(response): RadarBrief` with unit-style sanity
   checks against a fixture response (e.g. Chick-fil-A result).
2. Build `<RadarDeckHTML brief={brief} />` as a pure server component.
3. Visual check: temporarily render it at `/dev/deck-preview` to verify
   16:9 layout, fonts, brand colors.

### Phase 2 — PDF export

1. Add `playwright-core` + `@sparticuz/chromium`.
2. Implement `renderPdf(brief): Promise<Buffer>`.
3. Build `/api/radar/export/pdf` route.
4. Add "Download PDF" button to the results header.
5. Test on Vercel preview deploy (the place chromium pain shows up).

### Phase 3 — PPTX export

1. Add `pptxgenjs`.
2. Export the Great Grants wordmark to `public/great-grants-logo.png`.
3. Port `generate_pptx.js` slide patterns to TypeScript:
   `addTitleSlide`, `addNonprofitSlide`, `addCtaSlide`.
4. Build `/api/radar/export/pptx` route.
5. Add "Download PPTX" button.
6. Open the output in PowerPoint, Keynote, and Google Slides to spot-check
   that fonts, tables, and badges all survive the round trip.

---

## Open questions (resolve before Phase 2)

1. **Where the parent slug comes from for the filename** — proposed:
   slugify `parent.name`. E.g. `"Chick-fil-A"` → `chick-fil-a` →
   `radar-chick-fil-a-2026-06-07.pdf`.
2. **Do we include the agent's summary on the title slide or its own slide?**
   Title slide is more compact; separate slide gives it breathing room.
3. **Page size: 16:9 (13.333" × 7.5", widescreen) or letter (8.5" × 11")
   for the PDF?** Coworker's deck is widescreen; that's fine for screen
   viewing but awkward for printed handouts. Suggest 16:9 to match the PPT.
4. **What goes in the methodology slide?** The current results page has a
   one-line italic disclaimer. Sliding into a dedicated slide gives room
   for the match-quality legend (excellent ≥80, good ≥65, possible ≥50,
   weak <50) plus the "thin signal" caveat.
5. **Should the PPTX include the agent's summary as speaker notes** on
   the title slide, or only on the slide itself?
6. **Logo PNG dimensions** — coworker uses 360 × 64. Confirm we have a
   PNG export of the Great Grants wordmark at usable resolution (or
   render one from the SVG).

---

## What's needed to start

- Approval to install the three deps above.
- Decision on the open questions (or leave defaults to be resolved as we
  build).
- A fixture `RadarResponse` (e.g. Chick-fil-A) saved to
  `tests/fixtures/radar-response-chick-fil-a.json` for offline iteration
  without burning agent tokens on every UI tweak.

Once we have those, Phase 1 → 2 → 3 can ship sequentially over ~2.5–3 days.
