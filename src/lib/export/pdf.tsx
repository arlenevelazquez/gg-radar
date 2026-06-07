import { renderToStaticMarkup } from "react-dom/server";
import type { Browser } from "playwright-core";
import { RadarDeckHTML } from "@/app/_deck/RadarDeckHTML";
import type { RadarBrief } from "./brief";

/**
 * Renders a RadarBrief to a 16:9 widescreen PDF (13.333" × 7.5" per page).
 *
 * Strategy:
 *  1. renderToStaticMarkup(<RadarDeckHTML />) → inner HTML string
 *  2. wrap it in a complete <!DOCTYPE html> document with Google Fonts
 *  3. launch chromium (Sparticuz on Vercel, system playwright in dev)
 *  4. page.setContent(html, { waitUntil: "networkidle" }) so fonts load
 *  5. page.pdf({ width: 13.333in, height: 7.5in, printBackground: true })
 */

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Cabin:wght@400;500;600;700&family=Lustria&display=swap";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function wrapHtml(brief: RadarBrief, inner: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=1280" />
  <title>${escapeHtml(brief.parent.name)} — Grant Radar</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="${FONTS_HREF}" rel="stylesheet" />
</head>
<body>${inner}</body>
</html>`;
}

/** True when running inside a Vercel/Lambda-style serverless function. */
function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function launchBrowser(): Promise<Browser> {
  if (isServerless()) {
    const { default: chromium } = await import("@sparticuz/chromium");
    const { chromium: playwright } = await import("playwright-core");
    return playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  // Local dev — `playwright` is a devDep that ships its own chromium binary.
  // Dynamic import keeps this out of the production bundle.
  const { chromium: playwright } = await import("playwright");
  return playwright.launch({ headless: true });
}

export async function renderPdf(brief: RadarBrief): Promise<Buffer> {
  const inner = renderToStaticMarkup(<RadarDeckHTML brief={brief} />);
  const html = wrapHtml(brief, inner);

  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      width: "13.333in",
      height: "7.5in",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
