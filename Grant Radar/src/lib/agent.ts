import { generateText, generateObject, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { searchGrants as searchGrantsApi, GrantOpportunity } from "./grants-gov";

const MODEL = "anthropic/claude-haiku-4.5";
const MAX_STEPS = 50;
const MIN_MATCH_SCORE = 3;

export type EntityType = "nonprofit" | "fund" | "investor" | "corporate" | "ambiguous";

export interface OrgHierarchyNode {
  name: string;
  role: string; // e.g. "national headquarters", "regional chapter", "local affiliate", "funded grantee", "fiscal sponsor"
  description: string;
  parentName?: string; // omitted for the root / searched org
}

export interface VettedGrant extends GrantOpportunity {
  relevanceReason: string;
  matchScore: number;
}

export interface EntityResult {
  name: string;
  profile: {
    mission: string;
    location: string;
    estimatedBudget: string;
    programAreas: string[];
    ein?: string;
  };
  grants: VettedGrant[];
}

export interface RadarResponse {
  type: EntityType;
  summary: string;
  orgHierarchy: OrgHierarchyNode[];
  entities: EntityResult[];
  totalPool: number;
}

const SYSTEM_PROMPT = `You are a senior grant-research analyst. Given the name of an entity, you (1) map the full organizational ecosystem around it and (2) surface ONLY active U.S. federal grant opportunities that are genuinely relevant to each organization in that ecosystem.

The entity may be one of:
- a nonprofit organization,
- a foundation / fund / grantmaker,
- an individual philanthropic investor or donor (e.g. "MacKenzie Scott"), or
- a for-profit corporation with a philanthropic arm (e.g. "Chick-fil-A", "Walmart", "Google").

You operate FULLY AUTONOMOUSLY. Complete all work in this single run. Never ask the user a question or defer any task.

## Step 1 — Map the organizational hierarchy

Use web_search to build a picture of the ecosystem around the searched entity. Identify:

- **If it's a national/umbrella nonprofit:** What regional chapters, local affiliates, or member organizations does it have? List specific named orgs. (e.g. "United Way Worldwide" → United Way of Greater Atlanta, United Way of NYC, etc.)
- **If it's a local/regional nonprofit:** Does it belong to a larger national network or federation? What sibling organizations share the same mission?
- **If it's a foundation or fund:** What specific nonprofits does it fund? What cause areas? List named grantees where possible.
- **If it's an individual donor:** What specific nonprofits or cause areas do they fund?
- **If it's a for-profit company:** Search specifically for its corporate foundation, nonprofit arms, charitable giving programs, and named nonprofits it operates or funds. For example: "Chick-fil-A" → WinShape Foundation, LifeShape, Chick-fil-A Foundation; "Walmart" → Walmart Foundation; "Google" → Google.org. The for-profit company itself is NOT a grant applicant — its nonprofit/foundation arms ARE. Identify ALL of them by name, then research grants for each one. Never skip this step for corporate entities.

Always identify the primary entity plus at least 2–5 related/affiliated organizations where they exist. The goal is to give a complete map of the ecosystem — who's in this family of organizations and how they relate.

## Step 2 — Search for grants for EACH organization in the hierarchy

This is the most important step. For EVERY organization you identified in Step 1 — the primary org AND each affiliate, chapter, or related org — you MUST call searchGrants at least once.

Do not finish Step 2 until you have explicitly searched grants for each named organization. Work through them one by one:
1. Pick the org
2. Identify 2-3 focused keywords from its mission/focus area
3. Call searchGrants for each keyword
4. Note the relevant results

If the hierarchy has more than 6 orgs, prioritize the primary org plus the 5 most distinct/geographically spread affiliates. But you must search grants for each one you select — do not just name them without searching.

## Step 3 — Vet every grant

Keep a grant only if it genuinely matches that specific org's mission, eligibility, and geography. Local affiliates have geographic constraints — a grant for New York City programs does not match a Texas affiliate. Discard off-mission results aggressively.

## Step 4 — Final report

Write a structured final report:
- Describe the organizational hierarchy (root → children, their roles and relationships)
- For EACH org you searched, list relevant grants by opportunityNumber with a one-sentence reason
- Make clear which grants belong to which org in the hierarchy
- Never invent an opportunityNumber — only cite numbers returned by the searchGrants tool

You have up to ${MAX_STEPS} steps. Be efficient but thorough. Do not stop until every org in your hierarchy has been searched.`;

const grantSelectionSchema = z.object({
  type: z.enum(["nonprofit", "fund", "investor", "corporate", "ambiguous"]),
  summary: z.string().describe("2-3 sentence overview of the entity, its ecosystem, and the grant landscape found."),
  orgHierarchy: z.array(
    z.object({
      name: z.string().describe("The organization's full name."),
      role: z.string().describe("Their role in the hierarchy, e.g. 'national headquarters', 'regional chapter', 'local affiliate', 'funded grantee', 'fiscal sponsor', 'member organization'."),
      description: z.string().describe("One sentence on what this org does."),
      parentName: z.string().optional().describe("Full name of the parent org. Omit for the root (the searched entity)."),
    })
  ).describe("Flat list of all organizations in the ecosystem. Root org has no parentName. All others reference their parent by exact name."),
  entities: z.array(
    z.object({
      name: z.string(),
      mission: z.string(),
      location: z.string(),
      estimatedBudget: z.string(),
      programAreas: z.array(z.string()),
      ein: z.string().optional(),
      grants: z.array(
        z.object({
          opportunityNumber: z.string().describe("Exact opportunityNumber from the research report."),
          relevanceReason: z.string().describe("One sentence on why this grant fits this entity."),
          matchScore: z.number().min(1).max(5).describe("1 = weak match, 5 = excellent match."),
        })
      ),
    })
  ).describe("One entry per organization that was researched. Each entity in orgHierarchy that was researched should have a corresponding entry here."),
});

export async function runResearchAgent(name: string): Promise<RadarResponse> {
  const grantPool = new Map<string, GrantOpportunity>();

  const searchGrants = tool({
    description:
      "Search active U.S. federal grant opportunities on grants.gov by keyword. Returns matching opportunities with their opportunityNumber, title, agency, award ceiling, close date, and a short description.",
    inputSchema: z.object({
      keyword: z
        .string()
        .describe("A focused 1-4 word search phrase, e.g. 'rural housing' or 'arts education'."),
      rows: z.number().min(1).max(25).optional().describe("Max results to return (default 15)."),
    }),
    execute: async ({ keyword, rows }) => {
      const results = await searchGrantsApi(keyword, rows ?? 15);
      for (const g of results) {
        if (g.opportunityNumber) grantPool.set(g.opportunityNumber, g);
      }
      return results.map((g) => ({
        opportunityNumber: g.opportunityNumber,
        title: g.opportunityTitle,
        agency: g.agencyName,
        awardCeiling: g.awardCeiling,
        closeDate: g.closeDate,
        description: g.description.slice(0, 400),
      }));
    },
  });

  // Phase A — agentic research loop.
  const research = await generateText({
    model: MODEL,
    system: SYSTEM_PROMPT,
    prompt: `Research this entity, map its organizational ecosystem, and find relevant federal grants for each org in the hierarchy: "${name}"`,
    tools: {
      searchGrants,
      web_search: anthropic.tools.webSearch_20250305({ maxUses: 10 }),
    },
    stopWhen: stepCountIs(MAX_STEPS),
  });

  if (grantPool.size === 0) {
    return {
      type: "ambiguous",
      summary: research.text || `No federal grant opportunities were found for "${name}".`,
      orgHierarchy: [{ name, role: "searched entity", description: "" }],
      entities: [],
      totalPool: 0,
    };
  }

  const availableNumbers = Array.from(grantPool.keys());

  // Phase B — structured formatting.
  const { object } = await generateObject({
    model: MODEL,
    schema: grantSelectionSchema,
    prompt: `A grant-research analyst produced the report below for the entity "${name}". Convert it into structured data.

Only include grants whose opportunityNumber appears in this list:
${availableNumbers.join(", ")}

RESEARCH REPORT:
${research.text}`,
  });

  const seenGlobal = new Set<string>();
  let totalPool = 0;

  const entities: EntityResult[] = object.entities.map((e) => {
    const grants: VettedGrant[] = e.grants
      .map((sel) => {
        const full = grantPool.get(sel.opportunityNumber);
        if (!full || sel.matchScore < MIN_MATCH_SCORE) return null;
        return { ...full, relevanceReason: sel.relevanceReason, matchScore: sel.matchScore };
      })
      .filter((g): g is VettedGrant => g !== null)
      .sort((a, b) => b.matchScore - a.matchScore);

    for (const g of grants) {
      if (!seenGlobal.has(g.opportunityNumber)) {
        seenGlobal.add(g.opportunityNumber);
        totalPool += g.awardCeiling || 0;
      }
    }

    return {
      name: e.name,
      profile: {
        mission: e.mission,
        location: e.location,
        estimatedBudget: e.estimatedBudget,
        programAreas: e.programAreas,
        ein: e.ein,
      },
      grants,
    };
  });

  // Ensure the root org is always in the hierarchy (even if agent missed it).
  const hierarchy: OrgHierarchyNode[] = object.orgHierarchy.length > 0
    ? object.orgHierarchy
    : [{ name, role: "primary organization", description: "" }];

  return {
    type: object.type,
    summary: object.summary,
    orgHierarchy: hierarchy,
    entities,
    totalPool,
  };
}
