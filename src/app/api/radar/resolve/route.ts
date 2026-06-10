import { NextRequest, NextResponse } from "next/server";
import { resolveEntities, type EntityCandidate } from "@/lib/agent/resolve";

export const runtime = "nodejs";
export const maxDuration = 60;

export interface ResolveResponse {
  candidates: EntityCandidate[];
}

export async function POST(req: NextRequest) {
  let input: string;
  try {
    const body = (await req.json()) as { parent?: unknown };
    if (typeof body.parent !== "string" || !body.parent.trim()) {
      return NextResponse.json({ error: "parent (string) is required" }, { status: 400 });
    }
    input = body.parent.trim();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const candidates = await resolveEntities(input);
    return NextResponse.json({ candidates } satisfies ResolveResponse);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "resolve failed" },
      { status: 500 }
    );
  }
}
