import { NextRequest, NextResponse } from "next/server";
import { runResearch } from "@/lib/agent/research";
import { searchGrants } from "@/lib/grant-guru/client";
import { buildSearchBody, type NonprofitProfile } from "@/lib/grant-guru/prompt";
import type { ConnectedNonprofit, ParentProfile } from "@/lib/agent/types";
import type { GrantGuruGrant } from "@/lib/grant-guru/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export type MatchQuality = "excellent" | "good" | "possible" | "weak";

export interface TopGrant {
  guid: string;
  programName: string;
  /** Funding agency / federal department, e.g. "U.S. Department of Education". */
  agency: string | null;
  /** Pre-formatted funding amount string (GG provides this) or null. */
  fundingDisplay: string | null;
  /** Human-readable closing date "Oct 1, 2025" or null. */
  closingDateDisplay: string | null;
  /** Optional natural-language closing info when there's no firm date. */
  closingInfo: string | null;
  /** Self-reported difficulty label, e.g. "Doable", "Might Need Help". */
  difficulty: string | null;
  /** True when GG flags this as a competitive grant. */
  competitive: boolean | null;
  /** GG-hosted detail page URL. */
  url: string | null;
  /** 0-100 match score derived from rerankScore. */
  matchScore: number | null;
  matchQuality: MatchQuality | null;
}

interface NonprofitGrantsBlock {
  status: "ok" | "error";
  /** Count of returned grants with matchScore >= QUALIFIED_THRESHOLD (50). */
  qualifiedCount: number;
  /** Total grants returned by GG (capped at SEARCH_LIMIT). */
  rawCount: number;
  /** True when rawCount === SEARCH_LIMIT, suggesting more results exist beyond the cap. */
  cappedAtLimit: boolean;
  top: TopGrant[];
  error?: string;
}

interface RadarResponse {
  parent: ParentProfile;
  summary: string;
  nonprofits: Array<ConnectedNonprofit & { grants: NonprofitGrantsBlock }>;
}

const TOP_PER_NONPROFIT = 10;
// GG enforces a low max on `limit` (400s above ~25). We ask for 25 — GG pads
// the response to the limit regardless of match quality, so the raw count is
// not a real signal. We filter by rerankScore-derived matchQuality.
const SEARCH_LIMIT = 25;

// Match quality thresholds — mirror great-grants' DEFAULT_MATCH_THRESHOLDS.
const EXCELLENT_THRESHOLD = 80;
const GOOD_THRESHOLD = 65;
const QUALIFIED_THRESHOLD = 50; // anything below this is "weak" / forced fit

function classifyMatch(matchScore: number | null): MatchQuality | null {
  if (matchScore === null) return null;
  if (matchScore >= EXCELLENT_THRESHOLD) return "excellent";
  if (matchScore >= GOOD_THRESHOLD) return "good";
  if (matchScore >= QUALIFIED_THRESHOLD) return "possible";
  return "weak";
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatClosingDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return DATE_FORMATTER.format(parsed);
}

function formatFunding(g: GrantGuruGrant): string | null {
  if (g.fundingMaxResult && g.fundingMaxResult.trim()) return g.fundingMaxResult.trim();
  const amount = g.fundingMax ?? g.fundingWorth ?? null;
  if (!amount) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function coerceCompetitive(value: GrantGuruGrant["competitive"]): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "yes" || lower === "true") return true;
    if (lower === "no" || lower === "false") return false;
  }
  return null;
}

function pickTop(grants: GrantGuruGrant[]): TopGrant[] {
  return grants.slice(0, TOP_PER_NONPROFIT).map((g): TopGrant => {
    const matchScore =
      typeof g.rerankScore === "number" ? Math.round(g.rerankScore * 100) : null;
    return {
      guid: g.guid,
      programName: g.programName,
      agency: g.departmentName ?? null,
      fundingDisplay: formatFunding(g),
      closingDateDisplay: formatClosingDate(g.closingDate ?? g.deadline ?? null),
      closingInfo: g.closingInfo ?? null,
      difficulty: g.difficultyRating ?? null,
      competitive: coerceCompetitive(g.competitive),
      url: g.url ?? null,
      matchScore,
      matchQuality: classifyMatch(matchScore),
    };
  });
}

function countQualified(grants: GrantGuruGrant[]): number {
  return grants.filter(
    (g) =>
      typeof g.rerankScore === "number" &&
      Math.round(g.rerankScore * 100) >= QUALIFIED_THRESHOLD
  ).length;
}

async function lookupGrantsFor(np: ConnectedNonprofit): Promise<NonprofitGrantsBlock> {
  try {
    const profile: NonprofitProfile = {
      name: np.name,
      mission: np.mission,
      programs: np.programs,
      populations: np.populations,
      location: np.location ?? undefined,
    };
    const body = buildSearchBody(profile, SEARCH_LIMIT);
    const { grants } = await searchGrants(body);
    return {
      status: "ok",
      qualifiedCount: countQualified(grants),
      rawCount: grants.length,
      cappedAtLimit: grants.length >= SEARCH_LIMIT,
      top: pickTop(grants),
    };
  } catch (err) {
    return {
      status: "error",
      qualifiedCount: 0,
      rawCount: 0,
      cappedAtLimit: false,
      top: [],
      error: err instanceof Error ? err.message : "GrantGuru search failed",
    };
  }
}

export async function POST(req: NextRequest) {
  let parentName: string;
  try {
    const body = (await req.json()) as { parent?: unknown };
    if (typeof body.parent !== "string" || !body.parent.trim()) {
      return NextResponse.json({ error: "parent (string) is required" }, { status: 400 });
    }
    parentName = body.parent.trim();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  let research;
  try {
    research = await runResearch(parentName);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "research failed" },
      { status: 500 }
    );
  }

  // Fan out GG searches in parallel — one failure must not kill the rest.
  const enriched = await Promise.all(
    research.nonprofits.map(async (np) => ({
      ...np,
      grants: await lookupGrantsFor(np),
    }))
  );

  const response: RadarResponse = {
    parent: research.parent,
    summary: research.summary,
    nonprofits: enriched,
  };

  return NextResponse.json(response);
}
