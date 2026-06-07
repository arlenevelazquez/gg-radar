# Foundation Prospectus Context

This file contains the reference info the skill needs to produce decks correctly. Treat it as the source of truth — these conventions are non-negotiable.

## Output location

All generated decks go to `/mnt/user-data/outputs/foundation_prospectus_{slug}.html` where `{slug}` is the foundation's short name in lowercase with underscores (e.g., `grace_mercy`, `green_family`, `bradley`, `eagle_venture`).

## Brand tokens

These are already baked into the templates' CSS variables — don't edit the templates' colors or fonts unless explicitly asked. Listed here for reference:

- Primary green: `#0E9384`
- Dark green: `#1C2B2A`
- Light green: `#3BB5A6`
- Pale green: `#E6F5F3`
- Background: `#F6FAFA`
- Display font: Lustria (serif)
- Body font: Cabin (sans-serif)

## GreatGrants logo

The GreatGrants logo (teal G mark + wordmark) is embedded directly in the shell template as a base64-encoded PNG, applied as a background image on the `.gg-mark` class in the slide-header. This keeps every generated deck a single self-contained file. The reference PNG is in this skill folder as `great_grants_logo.png` (360 × 64, transparent background).

**To update the logo:** replace `great_grants_logo.png` with the new file, then regenerate the data URI:

```python
import base64
with open('great_grants_logo.png', 'rb') as f:
    uri = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')
```

Then replace the `url('data:image/png;base64,...')` string inside the `.slide-header .gg-mark` CSS block in `shell_template.html`.

## Confidentiality guardrails

These apply to every deck, regardless of audience:

1. **Never name** Ziklag, TiGR, or any specific funding organization in slide content.
2. **Never name** foundation partners in decks (the deck is for a single foundation; do not reference others).
3. **Never reveal billing mechanics** — no markup, rate methodology, billed-vs-raw figures, or hourly costs. Post-award servicing is presented as tiered flat fees, never as a percentage of award.
4. **No judgment language** on slide 3 lede or anywhere else. Mission statements are pulled verbatim from org websites. Do not editorialize the landscape or any organization's posture (e.g., do not say "private support has protected their independence" or "the landscape has shifted" or "deliberate posture"). Just the mission statement.
5. **Exclude CCF (Christian Community Foundation)** from any logo grid — DAF sponsor relationship would confuse the narrative.

## Federal program reference data

The skill should rely on Harrison's brief for federal program totals, award sizes, and application windows. If Harrison hasn't provided them and gives permission to research, these sources are reliable:

- **Project knowledge files** (in the active conversation's project): `greatgrants_market_research_20260513.pdf`, `greatgrants_weekly_update_20260513.pdf`, and any newer market research PDFs the team has uploaded. Search these first with `project_knowledge_search`.
- **SAM.gov** for current NOFO listings and forecasted opportunities.
- **Agency websites** (HUD.gov/cpd, hhs.gov/acf, doj.gov/ovc, usda.gov/fns) for program-level annual totals.

Common federal programs by cause area (for reference — do not assume these apply to every foundation; only include what's relevant to the foundation's specific portfolio):

| Cause area | Common programs | Agency |
|------------|-----------------|--------|
| Homelessness | Continuum of Care (CoC), Emergency Solutions Grants (ESG), Health Care for the Homeless, SAMHSA PATH, HUD-VASH | HUD CPD, HHS HRSA, HHS SAMHSA, VA |
| Trafficking survivors | OVC Trafficking Victim Services, OVC Task Force, OVC Housing Assistance, OVC Minor Victim | DOJ OVC |
| Refugees | ORR Refugee Support Services, ORR Survivors of Torture, ORR Preferred Communities | HHS ACF ORR |
| Working poor / poverty | Community Services Block Grant (CSBG), Office of Family Assistance programs (OFA) | HHS ACF |
| Justice-involved / reentry | Second Chance Act Reentry, OJJDP Mentoring, BJA Justice Reinvestment | DOJ OJP |
| Food access | Summer Food Service Program (SFSP), TEFAP, CSFP, CACFP | USDA FNS |
| Housing (broader) | Section 4 Capacity Building, HOME Investment Partnerships, NSP | HUD |
| Veterans | HPGPDP, SSVF, Veterans Justice Outreach | VA |

Agency short names used in templates: `HUD CPD`, `HHS HRSA`, `HHS SAMHSA`, `HHS ACF`, `HHS ACF ORR`, `HHS ACF OFA`, `DOJ OVC`, `DOJ OJP`, `DOJ OJJDP`, `USDA FNS`, `VA`, `State`, `USAID`.

## Status badge values

The slide 3 prospectus table uses these status values (case-sensitive — they map to CSS classes):

- **Open** — `.open` (primary green) — application is currently accepting submissions
- **Forecasted** — `.forecasted` (light green) — known upcoming, dates posted on SAM.gov or agency site
- **Formula** — `.formula` (dark) — state pass-through or annual allocation, no competitive cycle
- **Watch** — `.watch` (muted) — likely but not yet confirmed for the next cycle
- **Closed** — `.closed` (muted) — past cycle, included for context

## Logo handling

Use Clearbit's free logo API: `https://logo.clearbit.com/{domain}`. Examples that work reliably:

- `bowery.org` → renders
- `salvationarmy.org` → renders
- `nominetwork.org` → may not render (smaller orgs sometimes don't have Clearbit coverage)

When inserting an `<img>` tag, always include the `onerror="this.style.display='none'"` handler so the text label shows when Clearbit doesn't have the logo. The fallback styling is already in the template CSS.

**Use bare domains only.** Strip `https://`, `www.`, trailing slashes, and any path. Example: `https://www.bowery.org/about` → `bowery.org`.

## Page numbering

The skill computes page numbers based on the count of focus orgs:

- Slide 1: page 1
- Slide 2: page 2
- Focus org N: page `2 + N`
- Final demo slide: page `3 + N`

Total pages = `3 + N`. Format as zero-padded two-digit strings (e.g., `03 / 05`).

## File output naming convention

`foundation_prospectus_{slug}.html`, `foundation_prospectus_{slug}.pdf`, and (after approval) `foundation_prospectus_{slug}.pptx` — all in `/mnt/user-data/outputs/`. Slug is lowercase, underscores between words.

Examples: `foundation_prospectus_grace_mercy.html`, `foundation_prospectus_green_family.pdf`, `foundation_prospectus_bradley.pptx`.

## Export pipeline

Two scripts in this skill folder handle the non-HTML outputs:

- `generate_pdf.py` — Playwright-based HTML → 16:9 PDF. Requires `playwright` + `chromium`. Always runs, ships alongside the HTML.
- `generate_pptx.js` — pptxgenjs-based brief JSON → PPTX. Requires Node.js + `pptxgenjs`. Runs only after Harrison explicitly approves the HTML/PDF.

The PPTX is intentionally design-simplified. Differences from the HTML:
- Cambria (header) + Calibri (body) instead of Lustria + Cabin
- No accent rule under titles (per pptx skill guidance — "NEVER use accent lines under titles")
- Native PPT tables for slide 2 + slide 3 prospectus, not CSS grids
- Status badges as colored table cells instead of pill shapes
- Brand colors, dark final slide, GG logo, status semantics, and content fidelity all preserved

If pptxgenjs isn't installed globally: `npm install -g pptxgenjs`.

## Iteration style

Harrison's preference is align-before-build. Don't generate the HTML until the brief is complete and any open questions are resolved. After generating, surface any open issues (missing data Harrison declined to research, mission statements you had to pick from multiple candidates, logos that didn't load).

Don't include excessive bolding, emoji, exclamation points, or peppy language in any slide content. Tone is professional, measured, faith-aware.
