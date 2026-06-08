import type { Browser } from "playwright-core";
import type { RadarBrief } from "./brief";

/**
 * Renders a RadarBrief to a 16:9 widescreen PDF (13.333" × 7.5" per page).
 *
 * We avoid react-dom/server entirely — Next 16 + React 19's RSC runtime
 * throws when it sees that import in the App Router dependency graph. So
 * instead we let Next render the deck via its normal SSR pipeline:
 *
 *  1. base64-encode the brief and stuff it in an `x-radar-brief` HTTP header
 *  2. launch chromium (Sparticuz on Vercel, system playwright in dev)
 *  3. page.goto(`${origin}/internal/deck`) with extraHTTPHeaders set
 *  4. that page reads the header, decodes the brief, renders the deck
 *  5. page.pdf({ width: 13.333in, height: 7.5in })
 *
 * Brief size note: HTTP servers cap header values around 16 KB (Node default).
 * A typical 3-nonprofit brief is well under that, but very large results
 * (lots of nonprofits or grants) may need compression or a stash endpoint.
 */

const HEADER_NAME = "x-radar-brief";

function encodeBrief(brief: RadarBrief): string {
  return Buffer.from(JSON.stringify(brief), "utf8").toString("base64");
}

/** True when running inside a Vercel/Lambda-style serverless function. */
function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function launchBrowser(): Promise<Browser> {
  if (isServerless()) {
    // @sparticuz/chromium decides whether to extract the system-library
    // tarball (al2023.tar.br — which contains libnss3, libxss, etc.) by
    // sniffing AWS_EXECUTION_ENV. Vercel runs on Lambda underneath but the
    // var isn't always set to a string the library's regex recognizes,
    // which leaves chromium itself extracted but its shared libs missing.
    // Set the value ourselves so the al2023 extraction always runs.
    process.env.AWS_EXECUTION_ENV = "AWS_Lambda_nodejs22.x";

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

export async function renderPdf(brief: RadarBrief, origin: string): Promise<Buffer> {
  const encoded = encodeBrief(brief);
  const deckUrl = `${origin}/internal/deck`;

  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 2,
      extraHTTPHeaders: { [HEADER_NAME]: encoded },
    });
    const page = await context.newPage();
    await page.goto(deckUrl, { waitUntil: "networkidle", timeout: 30000 });
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
