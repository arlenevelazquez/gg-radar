import type {
  MatchQuality,
  NonprofitGrantsBlock,
  RadarResponse,
  TopGrant,
} from "@/app/api/radar/route";
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

/** Grant-search results shared by the parent entity and each tied nonprofit. */
export interface BriefGrantsBlock {
  qualifiedCount: number;
  /** Sum of fundingMax across qualified grants; null when no numeric data. */
  qualifiedFundingTotal: number | null;
  grants: BriefGrant[];
  /** Set when the grant lookup failed; otherwise null. */
  grantsError: string | null;
}

export interface BriefNonprofit extends BriefGrantsBlock {
  name: string;
  connectionLabel: string;
  location: string;
  mission: string;
  relationship: string;
  programs: string[];
  populations: string[];
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
    /** Parent's own programmatic mission, used for its grant search. */
    mission: string;
    /** Parent's own program / focus areas. */
    programs: string[];
    /** Formatted HQ location for the parent grants slide. */
    location: string;
    /** Federal-grant results for the parent entity itself. */
    grants: BriefGrantsBlock;
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

function mapGrantsBlock(grants: NonprofitGrantsBlock): BriefGrantsBlock {
  return {
    qualifiedCount: grants.status === "ok" ? grants.qualifiedCount : 0,
    qualifiedFundingTotal: grants.status === "ok" ? grants.qualifiedFundingTotal : null,
    grants: grants.status === "ok" ? grants.top.map(mapGrant) : [],
    grantsError: grants.status === "error" ? grants.error ?? "Grant lookup failed" : null,
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
    ...mapGrantsBlock(np.grants),
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
      mission: response.parent.mission?.trim() || response.parent.description,
      programs: response.parent.programs?.length
        ? response.parent.programs
        : response.parent.givingPrograms,
      location: locationText(response.parent.location ?? undefined),
      grants: mapGrantsBlock(response.parent.grants),
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
