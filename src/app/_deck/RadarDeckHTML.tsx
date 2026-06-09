import type { BriefGrantsBlock, BriefNonprofit, RadarBrief } from "@/lib/export/brief";
import { MATCH_QUALITY_LABEL } from "@/lib/export/labels";

/**
 * The pure server-rendered HTML deck used by the export pipeline.
 *
 * - Renders one slide per <section className="slide">.
 * - Sized at the PowerPoint widescreen footprint (13.333" × 7.5") so it
 *   round-trips cleanly through Playwright's page.pdf() at print time.
 * - No client hooks, no event handlers — safe to renderToString() inside
 *   the PDF route in Phase 2.
 * - CSS is colocated as DECK_CSS (exported) so Phase 2 can drop it into a
 *   <style> tag inside the print-time HTML wrapper.
 */

const PRIMARY = "#0E9384";
const DARK = "#1C2B2A";
const PALE = "#E6F5F3";
const BG = "#F6FAFA";
const TEXT = "#1C2B2A";
const MUTED = "#6B7B7A";
const RULE = "#D5E0DE";

const QUALITY_FILL: Record<NonNullable<NonprofitGrant["matchQuality"]>, string> = {
  excellent: "#10B981",
  good: PRIMARY,
  possible: "#F59E0B",
  weak: "#9CA3AF",
};

type NonprofitGrant = BriefNonprofit["grants"][number];

export const DECK_CSS = `
:root {
  --primary: ${PRIMARY};
  --dark: ${DARK};
  --pale: ${PALE};
  --bg: ${BG};
  --text: ${TEXT};
  --muted: ${MUTED};
  --rule: ${RULE};
}

@page {
  size: 13.333in 7.5in;
  margin: 0;
}

html, body {
  margin: 0;
  padding: 0;
  background: #d9dee0;
  font-family: Cabin, "Helvetica Neue", Arial, sans-serif;
  color: var(--text);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.deck {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 24px 0;
}

.slide {
  width: 13.333in;
  height: 7.5in;
  background: var(--bg);
  color: var(--text);
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  page-break-after: always;
  break-after: page;
  box-shadow: 0 8px 32px rgba(28, 43, 42, 0.18);
  font-size: 16px;
  line-height: 1.4;
}
.slide:last-child {
  page-break-after: auto;
  break-after: auto;
}

@media print {
  html, body { background: white; }
  .deck { gap: 0; padding: 0; }
  .slide { box-shadow: none; margin: 0; }
}

.slide-display {
  font-family: Lustria, Georgia, serif;
  font-weight: 400;
  color: var(--text);
}

.slide-header,
.slide-footer {
  position: absolute;
  left: 0.7in;
  right: 0.7in;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.slide-header { top: 0.35in; }
.slide-footer { bottom: 0.4in; }

.brand-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  font-weight: 600;
  color: var(--primary);
  letter-spacing: 0.18em;
}
.brand-dot {
  width: 0.55em;
  height: 0.55em;
  border-radius: 50%;
  background: var(--primary);
}

.slide-body {
  position: absolute;
  top: 1.05in;
  bottom: 0.85in;
  left: 0.7in;
  right: 0.7in;
  display: flex;
  flex-direction: column;
}

/* ── Title slide ─────────────────────────────────────────────────────── */

.title-eyebrow {
  font-size: 12px;
  color: var(--muted);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-bottom: 18px;
}
.title-name {
  font-size: 56px;
  line-height: 1.1;
  margin: 0 0 14px;
}
.title-chip-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 24px;
}
.chip {
  display: inline-flex;
  align-items: center;
  background: var(--pale);
  color: var(--primary);
  border: 1px solid #B6E4DA;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
}
.chip-muted {
  background: white;
  color: var(--muted);
  border-color: var(--rule);
}
.title-description {
  font-size: 18px;
  line-height: 1.5;
  color: var(--text);
  max-width: 9in;
  margin: 0 0 24px;
}
.title-summary {
  font-size: 14px;
  line-height: 1.55;
  color: var(--muted);
  font-style: italic;
  max-width: 9in;
  margin: 0 0 24px;
  padding-top: 16px;
  border-top: 1px solid var(--rule);
}
.giving-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 24px;
}
.giving-label {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  margin-right: 4px;
}
.giving-pill {
  background: white;
  border: 1px solid var(--rule);
  color: var(--text);
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 999px;
}

.totals-row {
  display: flex;
  gap: 36px;
  margin-top: auto;
}
.total-stat {
  border-left: 3px solid var(--primary);
  padding: 4px 0 4px 14px;
}
.total-stat-label {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  margin-bottom: 4px;
}
.total-stat-value {
  font-family: Lustria, Georgia, serif;
  font-size: 36px;
  color: var(--primary);
  line-height: 1;
}

/* ── Nonprofit slide ─────────────────────────────────────────────────── */

.np-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 6px;
}
.np-name {
  font-size: 36px;
  margin: 0;
  line-height: 1.1;
}
.np-location {
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 14px;
}
.np-funding-stat {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0 0 16px;
}
.np-funding-amount {
  font-family: Lustria, Georgia, serif;
  font-size: 32px;
  color: var(--primary);
  line-height: 1;
}
.np-funding-caption {
  font-size: 12px;
  color: var(--muted);
}
.np-mission {
  font-size: 15px;
  line-height: 1.5;
  margin: 0 0 14px;
  max-width: 9in;
}
.np-relationship {
  font-size: 13px;
  color: var(--muted);
  font-style: italic;
  border-left: 2px solid var(--rule);
  padding-left: 10px;
  margin: 0 0 18px;
  max-width: 9in;
}

.np-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}
.np-tag {
  background: white;
  border: 1px solid var(--rule);
  color: var(--text);
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 4px;
}

.grants-block-label {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  margin-bottom: 10px;
}

.grants-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.grants-table thead th {
  text-align: left;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
  padding: 6px 8px 8px;
  border-bottom: 1px solid var(--rule);
  font-weight: 600;
}
.grants-table td {
  padding: 7px 8px;
  border-bottom: 1px solid var(--rule);
  vertical-align: top;
}
.grants-table tr:last-child td {
  border-bottom: none;
}
.col-rank { width: 28px; color: var(--muted); }
.col-program { font-weight: 500; }
.col-agency { color: var(--muted); }
.col-funding { color: var(--primary); font-weight: 500; white-space: nowrap; }
.col-closing { color: var(--muted); white-space: nowrap; }
.col-match { width: 88px; }

.match-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  color: white;
}

.grants-empty {
  color: var(--muted);
  font-size: 13px;
  padding: 10px 0;
}

/* ── CTA slide ───────────────────────────────────────────────────────── */

.cta-slide {
  background: linear-gradient(135deg, ${PALE} 0%, white 100%);
}
.cta-eyebrow {
  font-size: 12px;
  color: var(--primary);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  margin-bottom: 18px;
  font-weight: 600;
}
.cta-headline {
  font-size: 44px;
  line-height: 1.15;
  margin: 0 0 22px;
  max-width: 9in;
}
.cta-body {
  font-size: 16px;
  line-height: 1.55;
  color: var(--text);
  max-width: 9in;
  margin: 0 0 28px;
}
.cta-legend {
  display: flex;
  gap: 28px;
  margin-bottom: 28px;
  padding-top: 18px;
  border-top: 1px solid var(--rule);
}
.legend-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.legend-swatch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}
.legend-swatch-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.legend-detail {
  font-size: 11px;
  color: var(--muted);
}
.cta-link {
  display: inline-block;
  background: var(--primary);
  color: white;
  font-weight: 500;
  font-size: 16px;
  padding: 14px 26px;
  border-radius: 8px;
  text-decoration: none;
  align-self: flex-start;
  margin-top: auto;
}
`;

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatCurrencyShort(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (amount >= 1_000) {
    return `$${Math.round(amount / 1_000)}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function SlideHeader({ label }: { label: string }) {
  return (
    <div className="slide-header">
      <span className="brand-tag">
        <span className="brand-dot" /> GreatGrants Radar
      </span>
      <span>{label}</span>
    </div>
  );
}

function TitleFooter({ brief }: { brief: RadarBrief }) {
  return (
    <div className="slide-footer">
      <span>{formatDateLong(brief.generatedAt)}</span>
    </div>
  );
}

function TitleSlide({ brief }: { brief: RadarBrief }) {
  return (
    <section className="slide">
      <SlideHeader label={`Parent · ${brief.parent.typeLabel}`} />
      <div className="slide-body">
        <p className="title-eyebrow">Grant Radar report</p>
        <h1 className="title-name slide-display">{brief.parent.name}</h1>
        <div className="title-chip-row">
          <span className="chip">{brief.parent.typeLabel}</span>
          {brief.parent.headquarters && (
            <span className="chip chip-muted">{brief.parent.headquarters}</span>
          )}
        </div>
        <p className="title-description">{brief.parent.description}</p>
        {brief.parent.givingPrograms.length > 0 && (
          <div className="giving-row">
            <span className="giving-label">Giving programs</span>
            {brief.parent.givingPrograms.map((p) => (
              <span key={p} className="giving-pill">
                {p}
              </span>
            ))}
          </div>
        )}
        {brief.summary && <p className="title-summary">{brief.summary}</p>}
        <div className="totals-row">
          <div className="total-stat">
            <p className="total-stat-label">Tied nonprofits</p>
            <p className="total-stat-value">{brief.totals.nonprofitCount}</p>
          </div>
          <div className="total-stat">
            <p className="total-stat-label">Qualified federal grants</p>
            <p className="total-stat-value">{brief.totals.qualifiedGrantCount}</p>
          </div>
        </div>
      </div>
      <TitleFooter brief={brief} />
    </section>
  );
}

function MatchBadge({ grant }: { grant: NonprofitGrant }) {
  if (!grant.matchQuality || grant.matchScore === null) return <span>—</span>;
  const fill = QUALITY_FILL[grant.matchQuality];
  return (
    <span className="match-badge" style={{ background: fill }}>
      {grant.matchScore}% · {MATCH_QUALITY_LABEL[grant.matchQuality]}
    </span>
  );
}

/** Funding headline ($X possible · N qualified grants). */
function FundingStat({ block }: { block: BriefGrantsBlock }) {
  if (block.qualifiedFundingTotal === null) return null;
  return (
    <p className="np-funding-stat">
      <span className="np-funding-amount">{formatCurrencyShort(block.qualifiedFundingTotal)}</span>
      <span className="np-funding-caption">
        possible · {block.qualifiedCount} qualified grant
        {block.qualifiedCount === 1 ? "" : "s"}
      </span>
    </p>
  );
}

/** "Top N federal grants" label + table. Shared by parent + nonprofit slides. */
function GrantsSection({ block }: { block: BriefGrantsBlock }) {
  return (
    <>
      <p className="grants-block-label">
        {block.grantsError
          ? "Grant lookup failed"
          : `Top ${block.grants.length} federal grants · ${block.qualifiedCount} qualified (≥50%)`}
      </p>
      {block.grantsError ? (
        <p className="grants-empty">{block.grantsError}</p>
      ) : block.grants.length === 0 ? (
        <p className="grants-empty">No grant matches returned.</p>
      ) : (
        <table className="grants-table">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th className="col-program">Program</th>
              <th className="col-agency">Agency</th>
              <th className="col-funding">Funding</th>
              <th className="col-closing">Closes</th>
              <th className="col-match">Match</th>
            </tr>
          </thead>
          <tbody>
            {block.grants.map((g) => (
              <tr key={`${g.rank}-${g.programName}`}>
                <td className="col-rank">{g.rank}</td>
                <td className="col-program">{g.programName}</td>
                <td className="col-agency">{g.agency ?? "—"}</td>
                <td className="col-funding">{g.fundingDisplay ?? "—"}</td>
                <td className="col-closing">{g.closingDisplay ?? "—"}</td>
                <td className="col-match">
                  <MatchBadge grant={g} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/** Grant results for the parent entity itself. */
function ParentGrantsSlide({ brief }: { brief: RadarBrief }) {
  const p = brief.parent;
  return (
    <section className="slide">
      <SlideHeader label={`${p.name} · Parent entity`} />
      <div className="slide-body">
        <div className="np-header">
          <h2 className="np-name slide-display">{p.name}</h2>
          <span className="chip">{p.typeLabel}</span>
        </div>
        {p.location !== "—" && <p className="np-location">{p.location}</p>}
        <FundingStat block={p.grants} />
        <p className="np-mission">{p.mission}</p>
        {p.programs.length > 0 && (
          <div className="np-tags">
            {p.programs.slice(0, 6).map((pr) => (
              <span key={pr} className="np-tag">
                {pr}
              </span>
            ))}
          </div>
        )}
        <GrantsSection block={p.grants} />
      </div>
    </section>
  );
}

function NonprofitSlide({ brief, np }: { brief: RadarBrief; np: BriefNonprofit }) {
  return (
    <section className="slide">
      <SlideHeader label={`${brief.parent.name} · ${np.connectionLabel}`} />
      <div className="slide-body">
        <div className="np-header">
          <h2 className="np-name slide-display">{np.name}</h2>
          <span className="chip">{np.connectionLabel}</span>
        </div>
        <p className="np-location">{np.location}</p>
        <FundingStat block={np} />
        <p className="np-mission">{np.mission}</p>
        <p className="np-relationship">{np.relationship}</p>
        {np.programs.length > 0 && (
          <div className="np-tags">
            {np.programs.slice(0, 6).map((p) => (
              <span key={p} className="np-tag">
                {p}
              </span>
            ))}
          </div>
        )}
        <GrantsSection block={np} />
      </div>
    </section>
  );
}

function CtaSlide() {
  return (
    <section className="slide cta-slide">
      <SlideHeader label="Methodology + next step" />
      <div className="slide-body">
        <p className="cta-eyebrow">Radar uses public research</p>
        <h2 className="cta-headline slide-display">
          Great Grants finds the matches Radar can&apos;t.
        </h2>
        <p className="cta-body">
          Match scores reflect the thin signal of public web data. When a nonprofit connects a
          full organization profile inside Great Grants — real program narratives, target
          populations, and geography — match quality improves substantially, and grants Radar
          can&apos;t see come into view.
        </p>
        <div className="cta-legend">
          <div className="legend-item">
            <span className="legend-swatch">
              <span className="legend-swatch-dot" style={{ background: QUALITY_FILL.excellent }} />
              Excellent
            </span>
            <span className="legend-detail">Match score ≥ 80</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch">
              <span className="legend-swatch-dot" style={{ background: QUALITY_FILL.good }} />
              Good
            </span>
            <span className="legend-detail">Match score ≥ 65</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch">
              <span className="legend-swatch-dot" style={{ background: QUALITY_FILL.possible }} />
              Possible
            </span>
            <span className="legend-detail">Match score ≥ 50</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch">
              <span className="legend-swatch-dot" style={{ background: QUALITY_FILL.weak }} />
              Weak
            </span>
            <span className="legend-detail">Below 50</span>
          </div>
        </div>
        <a className="cta-link" href="https://greatgrants.ai">
          Check out Great Grants →
        </a>
      </div>
    </section>
  );
}

export function RadarDeckHTML({ brief }: { brief: RadarBrief }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DECK_CSS }} />
      <div className="deck">
        <TitleSlide brief={brief} />
        <ParentGrantsSlide brief={brief} />
        {brief.nonprofits.map((np) => (
          <NonprofitSlide key={np.name} brief={brief} np={np} />
        ))}
        <CtaSlide />
      </div>
    </>
  );
}
