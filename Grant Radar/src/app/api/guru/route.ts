import { NextRequest, NextResponse } from "next/server";
import { searchGrantGuru } from "@/lib/grantguru";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { name, mission, location, programAreas, limit } = await req.json();
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const result = await searchGrantGuru({
    name,
    mission: mission ?? "",
    location: location ?? "",
    programAreas: Array.isArray(programAreas) ? programAreas : [],
    limit: typeof limit === "number" ? limit : 10,
  });
  return NextResponse.json(result);
}
