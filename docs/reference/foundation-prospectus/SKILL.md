---
name: foundation-prospectus
description: Generate per-foundation prospectus HTML decks for GreatGrants.ai foundation meetings (Grace and Mercy, Green Family, Bradley, Eagle Venture, and others). Produces a polished 16:9 HTML deck with foundation portfolio, federal landscape, one or more focus-org prospectus slides, and a live demo intro. Use whenever Harrison says "create a foundation prospectus", "draft a deck for [foundation]", "build the [foundation] prospectus", "make me a foundation pitch deck", or any request to assemble a foundation-facing meeting deck. The skill takes a structured brief, fetches mission statements and logos from org websites, and outputs a self-contained HTML file. Reads context.md for branding, confidentiality conventions, and federal program references.
---

# Foundation Prospectus Skill

You are generating a per-foundation prospectus HTML deck for GreatGrants.ai. Harrison uses these decks in foundation meetings — typically Sam Yoon or an exec presents them. The output is a self-contained HTML file (one foundation per file) at 16:9 with brand styling.

**Before doing anything: read `context.md` in this same directory.** It contains brand tokens, confidentiality rules, and federal program references. These details change; the context file is the source of truth.

## Core principle

Harrison's iteration style is align-before-build. Read the brief → confirm assumptions and surface gaps → fetch any web data needed → generate the deck. Do not assemble the HTML until the brief is complete (whether one-shot or filled in conversationally).

The skill is **pure substitution by default** — fill the templates with what Harrison provides. **Never invent data** (program totals, award sizes, mission language, prospectus rows). If a field is missing, ask Harrison before proceeding. The one exception is automated web fetching for mission statements and logos, both of which are explicitly opt-in below.

## Deck structure

Every deck follows this pattern:

- **Slide 1** — Foundation portfolio. 5 cause-area columns with grantee logo cards + foundation's verbatim mission quote.
- **Slide 2** — Federal landscape. 5 cause-area rows showing Total Funding Available and grouped Federal Program list with per-program totals.
- **Slides 3a..3n** — One focus-org prospectus per organization Harrison wants to feature. Each shows 4 org stats, a federal-program prospectus table, and a combined accessible pool figure with caveat.
- **Final slide** — Live demo intro. One shared slide at the end regardless of how many focus orgs were included.

Total pages = 3 + N where N is the number of focus orgs.

## Playbook

### Step 1 — Receive or solicit the brief

Harrison may invoke the skill in two ways:

**One-shot:** He paste/attaches a filled-in copy of `brief_template.md` (or a similar markdown file with the same sections). Read it and skip to Step 2.

**Conversational:** He says "create a deck for [foundation]" without a brief. In that case, walk him through the brief section by section. Use `brief_template.md` as the structure. Ask one section at a time, not all at once.

Either way, before moving on, do a completeness pass: list any fields you don't have values for, and ask Harrison to either provide them or confirm he'd like you to research them. **Always ask before researching.** Research mode means web search / web fetch for federal program totals, award ranges, application windows, or anything Harrison hasn't provided directly.

### Step 2 — Resolve mission statements and logos from URLs

For each organization in the brief that has a website URL but no explicit mission statement:

1. `web_fetch` the URL (or the org's `/about` page)
2. Extract the mission statement verbatim — look for sentences after "Our mission is" / "We exist to" / "[Org name] meets" / similar phrasings, or a clearly-labeled mission statement block
3. If extraction is ambiguous (multiple candidates), show the candidates to Harrison and let him pick

For logos, the skill uses Clearbit's free logo API: `https://logo.clearbit.com/{domain}`. The template's `.cause-logo-card` CSS already supports both `<img>` and a text-span fallback. **Use this exact pattern** when injecting:

```html
<div class="cause-logo-card">
  <img src="https://logo.clearbit.com/{domain}"
       alt="{org_name}"
       onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
  <span class="cause-logo-text" style="display:none">{org_name}</span>
</div>
```

This pattern shows the image when Clearbit has it and falls back to the italic text label when it doesn't.

**Use bare domains only.** Strip `https://`, `www.`, trailing slashes, and any path. Example: `https://www.bowery.org/about` → `bowery.org`.

If Harrison didn't provide a domain for a grantee, render the text-label version (skip the `<img>`):

```html
<div class="cause-logo-card"><span class="cause-logo-text">{org_name}</span></div>
```

For the foundation's own mission statement on slide 1: same fetch pattern — pull verbatim from the URL if not provided.

### Step 3 — Handle variable counts (empty-slot cleanup)

The current templates have fixed-count slots that need cleanup when the brief provides fewer items:

- **Slide 1 grantee cards:** Each cause-area column has 3 slots (`{{GRANTEE_C1_1}}`, `{{GRANTEE_C1_2}}`, `{{GRANTEE_C1_3}}` etc.). If a column has only 2 grantees, the 3rd card slot must be **removed entirely** from the HTML (don't leave an empty card).
- **Slide 2 federal programs:** Cause area rows have 2-3 program slots (e.g., `{{C1_PROGRAM_1_*}}`, `{{C1_PROGRAM_2_*}}`, `{{C1_PROGRAM_3_*}}`). Remove the entire `<div class="opp-program">` block for any program slot the brief didn't fill.
- **Slide 3 prospectus rows:** The template has 8 rows. Remove any `<div class="prospectus-row">` blocks the brief didn't fill.

The cleanest way: substitute provided values first, then run a regex pass to strip any `<div>` whose remaining content has unsubstituted `{{...}}` placeholders.

If the brief contains MORE items than the template has slots (e.g., 4 grantees in one column, or 4 programs in one cause area, or 10+ prospectus rows), notify Harrison — the templates currently cap at 3 grantees / 3 programs / 8 rows. Don't silently truncate.

### Step 4 — Assemble the HTML

The skill uses two template files in this directory:

- `shell_template.html` — Slides 1, 2, and demo (final). Contains a `<!-- FOCUS_ORGS_HERE -->` marker between slide 2 and the demo slide.
- `focus_org_template.html` — A single slide-3 block.

**Assembly steps:**

1. Read `shell_template.html` into a string.
2. For each focus org `i` (1-indexed) in the brief:
   - Read `focus_org_template.html` into a string
   - Substitute all `{{VARIABLE}}` placeholders for that org's data (use the variable index at the top of the file as a reference)
   - Set `{{FOCUS_PAGE}}` to `i + 2` (focus orgs start at page 3)
3. Concatenate all populated focus-org blocks (separated by a newline).
4. Replace `<!-- FOCUS_ORGS_HERE -->` in the shell with the concatenated string.
5. In the shell, substitute:
   - `{{S1_PAGE}}` → `01`
   - `{{S2_PAGE}}` → `02`
   - `{{DEMO_PAGE}}` → final page number (3 + N, zero-padded to 2 digits)
   - `{{TOTAL_PAGES}}` → 3 + N (zero-padded to 2 digits)
6. Substitute all other variables in the shell from the brief.
7. Verify no `{{VARIABLE}}` placeholders remain (search the output for `{{` — the only acceptable remnant is the literal `{{VARIABLE}}` in the CSS header comment line).
8. Write to `/mnt/user-data/outputs/foundation_prospectus_{slug}.html` where `{slug}` is the foundation's short name in lowercase with underscores (e.g., `grace_mercy`, `green_family`).

### Step 5 — Verify visually

Optional but recommended: take a screenshot pass via Playwright to confirm slides render cleanly. The existing pattern in the project's working directory uses chromium at 1600x900 viewport with `device_scale_factor=1.5` and scrolls by `i * 900` pixels per slide.

If you do this, screenshot each slide and view the result. Common issues to check:
- Slide 1: logo cards renderable, columns balanced (3-2-2-2-3 layout acceptable; ask if Harrison wants symmetric)
- Slide 2: cause + total on left, programs on right, no truncation
- Slide 3: org stats row, prospectus table, dark band all visible without footer cut-off
- Final slide: demo meta row legible

### Step 6 — Export PDF (always)

Every deck ships with both HTML and a 16:9 PDF. Run the PDF export script from the skill folder:

```bash
python3 /path/to/skills/foundation-prospectus/generate_pdf.py \
  /mnt/user-data/outputs/foundation_prospectus_{slug}.html \
  /mnt/user-data/outputs/foundation_prospectus_{slug}.pdf
```

The script uses Playwright to render at 16in × 9in print size with `prefer_css_page_size: true`. If Playwright isn't installed, install with `pip install --break-system-packages playwright && playwright install chromium`.

### Step 7 — Present HTML + PDF, ask about PowerPoint

Call `present_files` with both the HTML and PDF outputs. Then ask Harrison explicitly:

> "The HTML and PDF are ready. Take a look — does the deck look right? If you also want a PowerPoint version for someone to edit, let me know and I'll generate one. (The PPT is design-simplified — same content, cleaner tables, no fancy column layouts or italics-on-italics — since PowerPoint can't match the HTML's design fidelity.)"

**Do not generate the PPT yet.** Wait for Harrison to explicitly approve. If he says yes — or any clear affirmative — proceed to Step 8. If he wants changes to the HTML/PDF first, iterate on those before offering the PPT again.

### Step 8 — Generate PowerPoint (only after approval)

Once Harrison approves, save the populated brief data to a JSON file and run the PPT script:

1. Build the JSON brief object from the substituted data (use the structure documented in `brief_template.md` — see the JSON schema reference below).
2. Save it to a temp path, e.g., `/home/claude/{slug}_brief.json`.
3. Run the script:

```bash
node /path/to/skills/foundation-prospectus/generate_pptx.js \
  /home/claude/{slug}_brief.json \
  /mnt/user-data/outputs/foundation_prospectus_{slug}.pptx
```

4. Call `present_files` with the PPTX output.

**JSON brief schema** (consumed by `generate_pptx.js`):

```json
{
  "foundation": {
    "long_name": "string",
    "short_name": "string",
    "slug": "string",
    "date": "string",
    "eyebrow": "string",
    "mission_quote": "string (verbatim)",
    "mission_source": "string"
  },
  "slide_1_cause_areas": [
    { "name": "string", "grantees": ["string", ...] }
  ],
  "slide_2": {
    "lede": "string",
    "cause_areas": [
      {
        "name": "string",
        "total_funding": "string",
        "total_funding_label": "string (e.g., 'est. annual')",
        "programs": [
          { "name": "string", "agency": "string", "total": "string" }
        ]
      }
    ]
  },
  "focus_orgs": [
    {
      "name": "string",
      "eyebrow": "string",
      "headline_prefix": "string",
      "headline_emphasis": "string (the italicized word)",
      "headline_suffix": "string (optional)",
      "mission_statement": "string (verbatim from website)",
      "stats": [
        { "label": "string", "value": "string", "sublabel": "string" }
      ],
      "prospectus_rows": [
        {
          "program": "string",
          "agency": "string",
          "award_size": "string",
          "window": "string",
          "status": "Open | Forecasted | Formula | Watch | Closed"
        }
      ],
      "pool_value": "string",
      "pool_caveat": "string"
    }
  ],
  "demo": {
    "featured_grantee": "string",
    "demo_grant": "string",
    "agency": "string",
    "headline_prefix": "string",
    "headline_emphasis": "string",
    "headline_suffix": "string (optional)",
    "lede": "string"
  }
}
```

The PPT is intentionally design-simplified vs. the HTML: Cambria/Calibri instead of Lustria/Cabin (PPT can't reliably embed Lustria), no accent lines under titles (per pptx skill guidance), and tables rendered as native PPT tables rather than CSS grids. Brand colors, status badge fills, dark final slide, and the GG logo are preserved.

### Step 9 — Present the file (final)

This step only applies if Harrison skipped or declined the PPT. Confirm everything is in `/mnt/user-data/outputs/` and surface any open issues (missing data Harrison declined to research, ambiguous mission statements you had to pick, logos that failed to fetch). Keep the message brief.

## Confidentiality guardrails

These must hold in every deck without exception (also documented in `context.md`):

- **Never reference Ziklag, TiGR, or specific funding organizations by name** in any slide.
- **No named foundation partners** in decks.
- **No internal billing mechanics** — never reveal markup, rate methodology, or billed-vs-raw references. Post-award servicing is tiered flat fees, never a percentage of award.
- **No judgment language** on slide 3 lede. Mission statements only, verbatim from the org's website. Do not commentary the landscape or the organization's posture.
- **No CCF (Christian Community Foundation)** in logo grids — DAF sponsor relationship would confuse the narrative.

## Variables reference

The full variable list lives in the comment headers of `shell_template.html` and `focus_org_template.html`. Read those before writing substitution code.

## Brief template

See `brief_template.md` for the structured input Harrison fills in. The file maps 1:1 to the variables in the HTML templates.
