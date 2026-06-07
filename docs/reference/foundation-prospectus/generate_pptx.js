#!/usr/bin/env node
/**
 * generate_pptx.js — convert a foundation prospectus brief (JSON) into a PowerPoint deck.
 *
 * Usage:
 *     node generate_pptx.js <brief.json> <output.pptx>
 *
 * The PPT is intentionally a simplified version of the HTML deck:
 *   - Brand palette preserved (#0E9384, #1C2B2A, #3BB5A6, #E6F5F3, #F6FAFA)
 *   - No exotic fonts (Cambria header / Calibri body — universal availability)
 *   - No accent lines under titles (per pptx skill guidance)
 *   - Status badges as small colored shapes, not pill HTML
 *   - Tables for slide 2 and prospectus rows on focus slides
 *   - GreatGrants logo embedded from same skill folder
 */

const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");

const SCRIPT_DIR = __dirname;

// Brand colors (no leading #)
const GG_PRIMARY = "0E9384";
const GG_DARK = "1C2B2A";
const GG_LIGHT = "3BB5A6";
const GG_PALE = "E6F5F3";
const GG_BG = "F6FAFA";
const GG_TEXT = "1C2B2A";
const GG_MUTED = "6B7B7A";
const GG_RULE = "D5E0DE";

// Status badge colors
const STATUS_COLORS = {
  Open:       { fill: GG_PRIMARY, text: "FFFFFF" },
  Forecasted: { fill: GG_LIGHT,   text: GG_DARK  },
  Formula:    { fill: GG_DARK,    text: "FFFFFF" },
  Watch:      { fill: GG_PALE,    text: GG_DARK  },
  Closed:     { fill: GG_PALE,    text: GG_MUTED },
};

const HEADER_FONT = "Cambria";
const BODY_FONT = "Calibri";

// Layout (LAYOUT_WIDE: 13.333" x 7.5")
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const MARGIN_X = 0.7;
const HEADER_Y = 0.35;
const FOOTER_Y = SLIDE_H - 0.45;
const CONTENT_TOP = 1.05;

// Logo file (PNG in skill folder, 360x64 transparent)
const LOGO_PATH = path.join(SCRIPT_DIR, "great_grants_logo.png");

// ----------------------------------------------------------------
// Helpers

function addHeader(slide, foundationName, opts = {}) {
  const isDark = opts.dark || false;
  const textColor = isDark ? "FFFFFF" : GG_TEXT;
  // Foundation name — left
  slide.addText(foundationName.toUpperCase(), {
    x: MARGIN_X, y: HEADER_Y, w: 8.0, h: 0.3,
    fontSize: 10, fontFace: BODY_FONT, color: textColor,
    bold: true, charSpacing: 2, valign: "middle", margin: 0,
  });
  // GG logo — right (124pt wide => about 1.4 inches at native ratio 5.6:1)
  const logoW = 1.4;
  const logoH = logoW / (360 / 64); // preserve aspect
  slide.addImage({
    path: LOGO_PATH,
    x: SLIDE_W - MARGIN_X - logoW,
    y: HEADER_Y,
    w: logoW,
    h: logoH,
  });
}

function addFooter(slide, dateStr, pageNum, totalPages, opts = {}) {
  const isDark = opts.dark || false;
  const textColor = isDark ? "D5D9D8" : GG_MUTED;
  slide.addText(dateStr, {
    x: MARGIN_X, y: FOOTER_Y, w: 4.0, h: 0.3,
    fontSize: 10, fontFace: BODY_FONT, color: textColor, margin: 0, valign: "middle",
  });
  const pad = (n) => String(n).padStart(2, "0");
  slide.addText(`${pad(pageNum)} / ${pad(totalPages)}`, {
    x: SLIDE_W - MARGIN_X - 2.0, y: FOOTER_Y, w: 2.0, h: 0.3,
    fontSize: 10, fontFace: BODY_FONT, color: textColor, align: "right",
    margin: 0, valign: "middle",
  });
}

function addEyebrow(slide, text, y, opts = {}) {
  const isDark = opts.dark || false;
  slide.addText(text.toUpperCase(), {
    x: MARGIN_X, y, w: 11.0, h: 0.3,
    fontSize: 11, fontFace: BODY_FONT, color: isDark ? GG_LIGHT : GG_PRIMARY,
    bold: true, charSpacing: 2, margin: 0, valign: "middle",
  });
}

function addHeadline(slide, prefix, emphasis, suffix, y, opts = {}) {
  const isDark = opts.dark || false;
  const textColor = isDark ? "FFFFFF" : GG_DARK;
  const emphasisColor = isDark ? GG_LIGHT : GG_PRIMARY;
  const fontSize = opts.fontSize || 44;
  const richText = [
    { text: prefix, options: { color: textColor } },
    { text: emphasis, options: { color: emphasisColor, italic: true } },
    { text: suffix, options: { color: textColor } },
  ];
  slide.addText(richText, {
    x: MARGIN_X, y, w: SLIDE_W - 2 * MARGIN_X, h: 1.0,
    fontSize, fontFace: HEADER_FONT, bold: false, valign: "top", margin: 0,
  });
}

// ----------------------------------------------------------------
// Slide 1 — Foundation portfolio

function addSlide1(pres, brief) {
  const slide = pres.addSlide();
  slide.background = { color: GG_BG };

  addHeader(slide, brief.foundation.long_name);
  addEyebrow(slide, brief.foundation.eyebrow || "Your portfolio, by cause area", 0.95);

  // Headline: "What [Foundation] supports"
  addHeadline(slide, "What ", brief.foundation.short_name, " supports", 1.35);

  // Mission quote — italic
  slide.addText([
    { text: '"' + brief.foundation.mission_quote + '"', options: { italic: true, color: GG_DARK } },
  ], {
    x: MARGIN_X + 0.2, y: 2.55, w: SLIDE_W - 2 * MARGIN_X - 0.4, h: 0.7,
    fontSize: 17, fontFace: HEADER_FONT, valign: "top", margin: 0,
  });
  // Source attribution
  slide.addText((brief.foundation.mission_source || "").toUpperCase(), {
    x: MARGIN_X + 0.2, y: 3.25, w: 6.0, h: 0.25,
    fontSize: 9, fontFace: BODY_FONT, color: GG_MUTED,
    bold: true, charSpacing: 2, margin: 0,
  });

  // Subtle left-border marker for the quote (small rectangle)
  slide.addShape("rect", {
    x: MARGIN_X, y: 2.55, w: 0.03, h: 0.85,
    fill: { color: GG_PRIMARY }, line: { type: "none" },
  });

  // 5-column grid of cause areas
  const causes = brief.slide_1_cause_areas || [];
  const numCols = causes.length;
  const gridLeft = MARGIN_X;
  const gridWidth = SLIDE_W - 2 * MARGIN_X;
  const colGap = 0.18;
  const colWidth = (gridWidth - colGap * (numCols - 1)) / numCols;
  const gridTop = 3.85;
  const colTitleHeight = 0.4;
  const cardHeight = 0.7;
  const cardGap = 0.12;

  causes.forEach((cause, ci) => {
    const x = gridLeft + ci * (colWidth + colGap);
    // Column heading
    slide.addText(cause.name, {
      x, y: gridTop, w: colWidth, h: colTitleHeight,
      fontSize: 14, fontFace: HEADER_FONT, color: GG_PRIMARY, margin: 0,
      valign: "top", align: "left",
    });
    // Grantee cards
    (cause.grantees || []).forEach((grantee, gi) => {
      const cardY = gridTop + colTitleHeight + 0.1 + gi * (cardHeight + cardGap);
      // White card
      slide.addShape("roundRect", {
        x, y: cardY, w: colWidth, h: cardHeight,
        fill: { color: "FFFFFF" },
        line: { color: GG_RULE, width: 0.75 },
        rectRadius: 0.04,
      });
      // Grantee name (italic, centered)
      slide.addText(grantee, {
        x: x + 0.1, y: cardY, w: colWidth - 0.2, h: cardHeight,
        fontSize: 11, fontFace: HEADER_FONT, color: GG_DARK, italic: true,
        align: "center", valign: "middle", margin: 0,
      });
    });
  });

  addFooter(slide, brief.foundation.date, 1, brief.total_pages);
}

// ----------------------------------------------------------------
// Slide 2 — Federal landscape

function addSlide2(pres, brief) {
  const slide = pres.addSlide();
  slide.background = { color: GG_BG };

  addHeader(slide, brief.foundation.long_name);
  addEyebrow(slide, "Where public dollars flow", 0.95);

  slide.addText("Federal opportunity, mapped to your causes", {
    x: MARGIN_X, y: 1.2, w: SLIDE_W - 2 * MARGIN_X, h: 0.7,
    fontSize: 36, fontFace: HEADER_FONT, color: GG_DARK, valign: "top", margin: 0,
  });

  // Lede
  slide.addText(brief.slide_2.lede || "", {
    x: MARGIN_X, y: 1.95, w: SLIDE_W - 2 * MARGIN_X - 3, h: 0.55,
    fontSize: 12, fontFace: BODY_FONT, color: GG_TEXT, valign: "top", margin: 0,
  });

  // Table
  const causeAreas = brief.slide_2.cause_areas || [];
  const rows = [];

  // Header row
  rows.push([
    { text: "CAUSE AREA", options: { bold: true, color: GG_MUTED, fontSize: 9, fontFace: BODY_FONT, fill: { color: GG_BG } } },
    { text: "TOTAL FUNDING AVAILABLE", options: { bold: true, color: GG_MUTED, fontSize: 9, fontFace: BODY_FONT, fill: { color: GG_BG } } },
    { text: "FEDERAL PROGRAM", options: { bold: true, color: GG_MUTED, fontSize: 9, fontFace: BODY_FONT, fill: { color: GG_BG } } },
    { text: "PROGRAM TOTAL", options: { bold: true, color: GG_MUTED, fontSize: 9, fontFace: BODY_FONT, fill: { color: GG_BG }, align: "right" } },
  ]);

  causeAreas.forEach((cause) => {
    const programs = cause.programs || [];
    if (programs.length === 0) return;

    // First program row carries cause name + total funding
    programs.forEach((prog, idx) => {
      if (idx === 0) {
        rows.push([
          {
            text: cause.name,
            options: {
              color: GG_PRIMARY, fontSize: 12, fontFace: HEADER_FONT,
              fill: { color: "FFFFFF" }, valign: "middle",
              rowspan: programs.length,
            },
          },
          {
            text: [
              { text: cause.total_funding, options: { fontSize: 15, fontFace: HEADER_FONT, color: GG_DARK } },
              { text: "  " + (cause.total_funding_label || "est. annual"), options: { fontSize: 8, fontFace: BODY_FONT, color: GG_MUTED } },
            ],
            options: {
              fill: { color: "FFFFFF" }, valign: "middle",
              rowspan: programs.length,
            },
          },
          {
            text: [
              { text: prog.name, options: { fontSize: 10, fontFace: BODY_FONT, color: GG_DARK } },
              { text: "  " + prog.agency, options: { fontSize: 8, fontFace: BODY_FONT, color: GG_MUTED } },
            ],
            options: { fill: { color: "FFFFFF" }, valign: "middle" },
          },
          {
            text: prog.total,
            options: {
              fontSize: 10, fontFace: BODY_FONT, color: GG_DARK,
              fill: { color: "FFFFFF" }, valign: "middle", align: "right",
            },
          },
        ]);
      } else {
        rows.push([
          {
            text: [
              { text: prog.name, options: { fontSize: 10, fontFace: BODY_FONT, color: GG_DARK } },
              { text: "  " + prog.agency, options: { fontSize: 8, fontFace: BODY_FONT, color: GG_MUTED } },
            ],
            options: { fill: { color: "FFFFFF" }, valign: "middle" },
          },
          {
            text: prog.total,
            options: {
              fontSize: 10, fontFace: BODY_FONT, color: GG_DARK,
              fill: { color: "FFFFFF" }, valign: "middle", align: "right",
            },
          },
        ]);
      }
    });
  });

  slide.addTable(rows, {
    x: MARGIN_X, y: 2.7, w: SLIDE_W - 2 * MARGIN_X,
    colW: [2.2, 2.0, 5.4, 2.333],
    border: { type: "solid", pt: 0.5, color: GG_RULE },
    fontFace: BODY_FONT,
    rowH: 0.30,
  });

  addFooter(slide, brief.foundation.date, 2, brief.total_pages);
}

// ----------------------------------------------------------------
// Slide 3 — Focus org

function addFocusOrgSlide(pres, brief, focusOrg, pageNum) {
  const slide = pres.addSlide();
  slide.background = { color: GG_BG };

  addHeader(slide, brief.foundation.long_name);
  addEyebrow(slide, focusOrg.eyebrow, 0.95);

  // Headline — slightly smaller to leave room for stats + table + band
  addHeadline(slide, focusOrg.headline_prefix, focusOrg.headline_emphasis, focusOrg.headline_suffix || "", 1.2, { fontSize: 36 });

  // Mission statement
  slide.addText(focusOrg.mission_statement || "", {
    x: MARGIN_X, y: 1.95, w: SLIDE_W - 2 * MARGIN_X, h: 0.7,
    fontSize: 12, fontFace: BODY_FONT, color: GG_TEXT, valign: "top", margin: 0,
  });

  // Stats row — 4 stats
  const stats = focusOrg.stats || [];
  const statsTop = 2.8;
  const statWidth = (SLIDE_W - 2 * MARGIN_X) / stats.length;
  stats.forEach((stat, si) => {
    const x = MARGIN_X + si * statWidth;
    slide.addText(stat.label.toUpperCase(), {
      x, y: statsTop, w: statWidth - 0.15, h: 0.22,
      fontSize: 9, fontFace: BODY_FONT, color: GG_MUTED, bold: true, charSpacing: 2,
      margin: 0, valign: "top",
    });
    slide.addText(stat.value, {
      x, y: statsTop + 0.22, w: statWidth - 0.15, h: 0.4,
      fontSize: 20, fontFace: HEADER_FONT, color: GG_DARK,
      margin: 0, valign: "top",
    });
    slide.addText(stat.sublabel || "", {
      x, y: statsTop + 0.62, w: statWidth - 0.15, h: 0.22,
      fontSize: 9.5, fontFace: BODY_FONT, color: GG_MUTED,
      margin: 0, valign: "top",
    });
  });

  // Prospectus table
  const prospectusRows = focusOrg.prospectus_rows || [];
  const tableRows = [];
  tableRows.push([
    { text: "FEDERAL PROGRAM", options: { bold: true, color: GG_MUTED, fontSize: 9, fontFace: BODY_FONT, fill: { color: GG_BG } } },
    { text: "AGENCY", options: { bold: true, color: GG_MUTED, fontSize: 9, fontFace: BODY_FONT, fill: { color: GG_BG } } },
    { text: "AWARD SIZE", options: { bold: true, color: GG_MUTED, fontSize: 9, fontFace: BODY_FONT, fill: { color: GG_BG } } },
    { text: "APPLICATION WINDOW", options: { bold: true, color: GG_MUTED, fontSize: 9, fontFace: BODY_FONT, fill: { color: GG_BG } } },
    { text: "STATUS", options: { bold: true, color: GG_MUTED, fontSize: 9, fontFace: BODY_FONT, fill: { color: GG_BG }, align: "center" } },
  ]);
  prospectusRows.forEach((row) => {
    const statusKey = row.status || "Open";
    const statusStyle = STATUS_COLORS[statusKey] || STATUS_COLORS.Open;
    tableRows.push([
      { text: row.program, options: { fontSize: 10, fontFace: BODY_FONT, color: GG_DARK, fill: { color: "FFFFFF" } } },
      { text: row.agency, options: { fontSize: 10, fontFace: BODY_FONT, color: GG_MUTED, fill: { color: "FFFFFF" } } },
      { text: row.award_size, options: { fontSize: 10, fontFace: BODY_FONT, color: GG_DARK, fill: { color: "FFFFFF" } } },
      { text: row.window, options: { fontSize: 10, fontFace: BODY_FONT, color: GG_DARK, fill: { color: "FFFFFF" } } },
      {
        text: statusKey.toUpperCase(),
        options: {
          fontSize: 9, fontFace: BODY_FONT, bold: true,
          color: statusStyle.text, fill: { color: statusStyle.fill },
          align: "center", charSpacing: 1,
        },
      },
    ]);
  });

  // Compute dynamic row height to fit n rows between table top and band top
  const tableTop = 3.85;
  const numRows = tableRows.length; // header + data rows
  // Reserve 0.65" for band + small gap above
  const bandTop = SLIDE_H - 0.45 - 0.15 - 0.65; // footer + margin + band height
  const availableTableHeight = bandTop - 0.15 - tableTop;
  const rowH = Math.max(0.24, Math.min(0.32, availableTableHeight / numRows));

  slide.addTable(tableRows, {
    x: MARGIN_X, y: tableTop, w: SLIDE_W - 2 * MARGIN_X,
    colW: [4.3, 1.5, 1.8, 2.2, 2.133],
    border: { type: "solid", pt: 0.5, color: GG_RULE },
    fontFace: BODY_FONT,
    rowH: rowH,
  });

  // Dark band — fixed position above footer
  const bandY = bandTop;
  const bandH = 0.65;
  slide.addShape("rect", {
    x: MARGIN_X, y: bandY, w: SLIDE_W - 2 * MARGIN_X, h: bandH,
    fill: { color: GG_DARK }, line: { type: "none" },
  });
  slide.addText("COMBINED ACCESSIBLE POOL", {
    x: MARGIN_X + 0.25, y: bandY + 0.08, w: 3.5, h: 0.2,
    fontSize: 9, fontFace: BODY_FONT, color: "BBC0BF", bold: true, charSpacing: 2,
    margin: 0, valign: "top",
  });
  slide.addText(focusOrg.pool_value || "", {
    x: MARGIN_X + 0.25, y: bandY + 0.27, w: 3.5, h: 0.4,
    fontSize: 20, fontFace: HEADER_FONT, color: "FFFFFF",
    margin: 0, valign: "top",
  });
  slide.addText(focusOrg.pool_caveat || "", {
    x: MARGIN_X + 4.0, y: bandY + 0.1, w: SLIDE_W - 2 * MARGIN_X - 4.25, h: 0.5,
    fontSize: 9, fontFace: BODY_FONT, color: "D5D9D8",
    margin: 0, valign: "top",
  });

  addFooter(slide, brief.foundation.date, pageNum, brief.total_pages);
}

// ----------------------------------------------------------------
// Final slide — Live demo intro

function addDemoSlide(pres, brief, pageNum) {
  const slide = pres.addSlide();
  slide.background = { color: GG_DARK };

  addHeader(slide, brief.foundation.long_name, { dark: true });
  addEyebrow(slide, "From opportunity to application", 0.95, { dark: true });

  // Headline
  const demo = brief.demo || {};
  addHeadline(slide,
    demo.headline_prefix || "A working ",
    demo.headline_emphasis || "example",
    demo.headline_suffix || "",
    1.5,
    { dark: true, fontSize: 56 }
  );

  // Lede
  slide.addText(demo.lede || "", {
    x: MARGIN_X, y: 3.4, w: SLIDE_W - 2 * MARGIN_X, h: 1.6,
    fontSize: 14, fontFace: BODY_FONT, color: "E5E8E7",
    valign: "top", margin: 0,
  });

  // Live demo indicator — top right above demo meta row
  slide.addShape("ellipse", {
    x: SLIDE_W - MARGIN_X - 0.25, y: 4.85, w: 0.14, h: 0.14,
    fill: { color: GG_LIGHT }, line: { type: "none" },
  });
  slide.addText("LIVE DEMO", {
    x: SLIDE_W - MARGIN_X - 1.5, y: 4.82, w: 1.2, h: 0.2,
    fontSize: 9, fontFace: BODY_FONT, color: "BBC0BF", bold: true, charSpacing: 2,
    align: "right", margin: 0, valign: "middle",
  });

  // Divider line above demo meta
  slide.addShape("line", {
    x: MARGIN_X, y: 5.45, w: SLIDE_W - 2 * MARGIN_X, h: 0,
    line: { color: "3F4C4B", width: 0.5 },
  });

  // Demo meta row — 3 columns
  const metaTop = 5.65;
  const metaWidth = (SLIDE_W - 2 * MARGIN_X) / 3;
  const metaCols = [
    { label: "FEATURED ORGANIZATION", value: demo.featured_grantee || "" },
    { label: "DEMO GRANT", value: demo.demo_grant || "" },
    { label: "FEDERAL AGENCY", value: demo.agency || "" },
  ];
  metaCols.forEach((col, i) => {
    const x = MARGIN_X + i * metaWidth;
    slide.addText(col.label, {
      x, y: metaTop, w: metaWidth - 0.2, h: 0.25,
      fontSize: 9, fontFace: BODY_FONT, color: GG_LIGHT, bold: true, charSpacing: 2,
      margin: 0, valign: "top",
    });
    slide.addText(col.value, {
      x, y: metaTop + 0.3, w: metaWidth - 0.2, h: 0.5,
      fontSize: 14, fontFace: HEADER_FONT, color: "FFFFFF",
      margin: 0, valign: "top",
    });
  });

  addFooter(slide, brief.foundation.date, pageNum, brief.total_pages, { dark: true });
}

// ----------------------------------------------------------------
// Main

function build(briefPath, outPath) {
  const brief = JSON.parse(fs.readFileSync(briefPath, "utf8"));

  // Compute total pages (1 + 1 + N + 1)
  const numFocusOrgs = (brief.focus_orgs || []).length;
  brief.total_pages = 3 + numFocusOrgs;

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
  pres.title = `${brief.foundation.long_name} × GreatGrants`;
  pres.author = "GreatGrants";

  addSlide1(pres, brief);
  addSlide2(pres, brief);
  (brief.focus_orgs || []).forEach((org, idx) => {
    addFocusOrgSlide(pres, brief, org, 3 + idx);
  });
  addDemoSlide(pres, brief, brief.total_pages);

  return pres.writeFile({ fileName: outPath }).then((file) => {
    console.log(`PPTX exported: ${file}`);
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error("Usage: node generate_pptx.js <brief.json> <output.pptx>");
    process.exit(1);
  }
  build(args[0], args[1]).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { build };
