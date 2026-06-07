import { NextRequest, NextResponse } from "next/server";
import type { RadarResponse } from "@/app/api/radar/route";
import { defaultFilename, deriveBrief } from "@/lib/export/brief";
import { renderPdf } from "@/lib/export/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let response: RadarResponse;
  try {
    response = (await req.json()) as RadarResponse;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!response?.parent?.name || !Array.isArray(response.nonprofits)) {
    return NextResponse.json(
      { error: "body must include parent.name and nonprofits[]" },
      { status: 400 }
    );
  }

  const brief = deriveBrief(response);

  try {
    const pdf = await renderPdf(brief);
    const filename = defaultFilename(brief, "pdf");
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[/api/radar/export/pdf] render failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PDF render failed" },
      { status: 500 }
    );
  }
}
