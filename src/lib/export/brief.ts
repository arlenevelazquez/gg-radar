import type { MatchQuality, RadarResponse, TopGrant } from "@/app/api/radar/route";
import type { NonprofitProfile } from "@/lib/grant-guru/prompt";
import { CONNECTION_LABEL, PARENT_TYPE_LABEL } from "./labels";

export interface BriefGrant {
  rank: number;
  programName: string;
  agency: string | null;
  fundingDisplay: string | null;
  closingDisplay: string | null;
  matchScore: number | null;
  matchQuality: MatchQuality | null;
  url: string | null;
}

export interface BriefNonprofit {
  name: string;
  connectionLabel: string;
  location: string;
  mission: string;
  relationship: string;
  programs: string[];
  populations: string[];
  qualifiedCount: number;
  grants: BriefGrant[];
  /** Set when grant lookup failed for this nonprofit; otherwise null. */
  grantsError: string | null;
}

export interface RadarBrief {
  /** ISO timestamp used in the footer; injected at derive time. */
  generatedAt: string;
  parent: {
    name: string;
    typeLabel: string;
    headquarters: string | null;
    description: string;
    givingPrograms: string[];
  };
  summary: string;
  totals: {
    nonprofitCount: number;
    qualifiedGrantCount: number;
  };
  nonprofits: BriefNonprofit[];
}

function locationText(loc: NonprofitProfile["location"]): string {
  if (!loc) return "—";
  const parts = [loc.city, loc.state].filter(Boolean);
  if (parts.length === 0) return loc.country?.toUpperCase() ?? "—";
  return parts.join(", ");
}

function pickClosing(g: TopGrant): string | null {
  return g.closingDateDisplay ?? g.closingInfo ?? null;
}

function mapGrant(g: TopGrant, idx: number): BriefGrant {
  return {
    rank: idx + 1,
    programName: g.programName,
    agency: g.agency,
    fundingDisplay: g.fundingDisplay,
    closingDisplay: pickClosing(g),
    matchScore: g.matchScore,
    matchQuality: g.matchQuality,
    url: g.url,
  };
}

export function deriveBrief(
  response: RadarResponse,
  generatedAt: string = new Date().toISOString()
): RadarBrief {
  const nonprofits: BriefNonprofit[] = response.nonprofits.map((np) => ({
    name: np.name,
    connectionLabel: CONNECTION_LABEL[np.connectionType],
    location: locationText(np.location ?? undefined),
    mission: np.mission,
    relationship: np.relationship,
    programs: np.programs,
    populations: np.populations ?? [],
    qualifiedCount: np.grants.status === "ok" ? np.grants.qualifiedCount : 0,
    grants: np.grants.status === "ok" ? np.grants.top.map(mapGrant) : [],
    grantsError: np.grants.status === "error" ? np.grants.error ?? "Grant lookup failed" : null,
  }));

  const qualifiedGrantCount = nonprofits.reduce((sum, np) => sum + np.qualifiedCount, 0);

  return {
    generatedAt,
    parent: {
      name: response.parent.name,
      typeLabel: PARENT_TYPE_LABEL[response.parent.type],
      headquarters: response.parent.headquarters ?? null,
      description: response.parent.description,
      givingPrograms: response.parent.givingPrograms,
    },
    summary: response.summary,
    totals: {
      nonprofitCount: nonprofits.length,
      qualifiedGrantCount,
    },
    nonprofits,
  };
}

const SLUG_FALLBACK = "result";

export function parentSlug(parentName: string): string {
  const slug = parentName
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || SLUG_FALLBACK;
}

export function defaultFilename(brief: RadarBrief, ext: "pdf" | "pptx"): string {
  const day = brief.generatedAt.slice(0, 10); // YYYY-MM-DD
  return `radar-${parentSlug(brief.parent.name)}-${day}.${ext}`;
}
