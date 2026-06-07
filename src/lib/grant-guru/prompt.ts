import type { SearchBody, SearchFilter } from "./types";

/**
 * Build a GrantGuru search request for one nonprofit.
 *
 * Ported from the keyword-style variant of the prompt A/B test
 * (gg-prompt-ab-test.mjs): "Federal grants for X, Y, Z in [State]. The
 * organization serves [populations] through [programs]." Keyword framing
 * outperformed raw descriptive prose in GG's reranker.
 *
 * Wire constraints:
 *  - `prompt` ≤ 1000 chars (hard limit on prod)
 *  - `project` ≤ 4000 chars
 *  - `filter.loc` MUST use nested shape; flat `loc.country` 500s on prod
 */

const PROMPT_LIMIT = 1000;
const PROJECT_LIMIT = 4000;

export interface NonprofitProfile {
  name: string;
  mission: string;
  programs: string[];
  populations?: string[];
  location?: {
    city?: string;
    /** 2-letter US state code, e.g. "GA" — or null if national/unknown */
    state?: string | null;
    /** ISO country, default "US" */
    country?: string;
  };
}

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

function joinList(items: string[]): string {
  const trimmed = items.map((s) => s.trim()).filter(Boolean);
  if (trimmed.length === 0) return "";
  if (trimmed.length === 1) return trimmed[0];
  if (trimmed.length === 2) return `${trimmed[0]} and ${trimmed[1]}`;
  return `${trimmed.slice(0, -1).join(", ")}, and ${trimmed.at(-1)}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function buildPromptText(np: NonprofitProfile): string {
  const stateCode = np.location?.state?.toUpperCase();
  const stateName = stateCode ? US_STATE_NAMES[stateCode] : undefined;
  const country = (np.location?.country ?? "US").toUpperCase();
  const isUS = country === "US" || country === "USA";

  const programs = np.programs.length > 0 ? joinList(np.programs.slice(0, 6)) : "";
  const populations =
    np.populations && np.populations.length > 0
      ? joinList(np.populations.slice(0, 5))
      : "";

  const where = isUS && stateName ? ` in ${stateName}` : isUS ? "" : ` in ${country}`;

  const lead = programs
    ? `Federal grants for ${programs}${where}.`
    : `Federal grants${where}.`;

  const detail =
    np.mission && populations
      ? `The organization (${truncate(np.name, 80)}) serves ${populations}. ${truncate(np.mission, 300)}`
      : np.mission
        ? `The organization (${truncate(np.name, 80)}). ${truncate(np.mission, 400)}`
        : populations
          ? `The organization serves ${populations}.`
          : "";

  const combined = detail ? `${lead} ${detail}` : lead;
  return truncate(combined, PROMPT_LIMIT);
}

function buildProjectText(np: NonprofitProfile): string {
  const parts = [np.name.trim(), np.mission.trim()];
  if (np.programs.length > 0) parts.push(`Programs: ${np.programs.join("; ")}`);
  if (np.populations && np.populations.length > 0) {
    parts.push(`Populations served: ${np.populations.join("; ")}`);
  }
  return truncate(parts.filter(Boolean).join("\n\n"), PROJECT_LIMIT);
}

function buildFilter(np: NonprofitProfile): SearchFilter {
  const country = (np.location?.country ?? "US").toUpperCase();
  const isUS = country === "US" || country === "USA";
  const base: SearchFilter = {
    fundingSource: ["Federal"],
    fundingType: ["Grant"],
  };
  if (!isUS) return base;
  const stateCode = np.location?.state?.toUpperCase();
  // GG state filter uses `US{XX}` form, or `US-NA` for unspecified.
  const state = stateCode && US_STATE_NAMES[stateCode] ? `US${stateCode}` : "US-NA";
  return { ...base, loc: { country: ["US"], state: [state] } };
}

export function buildSearchBody(np: NonprofitProfile, limit = 10): SearchBody {
  return {
    prompt: buildPromptText(np),
    project: buildProjectText(np),
    filter: buildFilter(np),
    limit,
  };
}
