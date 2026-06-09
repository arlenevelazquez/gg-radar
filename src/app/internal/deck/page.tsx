import { gunzipSync } from "node:zlib";
import { headers } from "next/headers";
import { RadarDeckHTML } from "@/app/_deck/RadarDeckHTML";
import type { RadarBrief } from "@/lib/export/brief";

/**
 * Internal-use page rendered by the PDF export pipeline.
 *
 * Playwright (launched by /api/radar/export/pdf) navigates here with the
 * brief in an `x-radar-brief` request header (gzip + base64 JSON — gzip
 * is required because raw JSON exceeds Node's 16 KB header cap for real
 * briefs). The page reads the header, decodes, and renders the deck via
 * Next's normal server-side pipeline — no react-dom/server required.
 *
 * Reachable to humans, but useless without the header — it just shows a
 * short notice.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADER_NAME = "x-radar-brief";

function MissingBrief({ note }: { note: string }) {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "48px",
        color: "#475467",
      }}
    >
      <h1 style={{ fontSize: "20px", marginBottom: "8px" }}>Internal: Grant Radar deck</h1>
      <p>{note}</p>
    </main>
  );
}

export default async function InternalDeckPage() {
  const h = await headers();
  const encoded = h.get(HEADER_NAME);
  if (!encoded) {
    return (
      <MissingBrief
        note={`This route is rendered by the PDF export pipeline. It needs an "${HEADER_NAME}" request header containing a base64-encoded RadarBrief JSON.`}
      />
    );
  }

  let brief: RadarBrief;
  try {
    const gzipped = Buffer.from(encoded, "base64");
    const decoded = gunzipSync(gzipped).toString("utf8");
    brief = JSON.parse(decoded) as RadarBrief;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not parse brief.";
    return <MissingBrief note={`Failed to decode brief: ${msg}`} />;
  }

  return <RadarDeckHTML brief={brief} />;
}
