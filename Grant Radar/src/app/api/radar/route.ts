import { NextRequest, NextResponse } from "next/server";
import { runResearchAgent } from "@/lib/agent";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { name } = await req.json();

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const result = await runResearchAgent(name.trim());
  return NextResponse.json(result);
}
