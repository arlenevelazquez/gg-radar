import { generateText, generateObject, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { searchGrants as searchGrantsApi, GrantOpportunity } from "./grants-gov";

const MODEL = "anthropic/claude-haiku-4.5";
const MAX_STEPS = 50;
const MIN_MATCH_SCORE = 3;

export type EntityType = "nonprofit" | "fund" | "investor" | "ambiguous";

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
  entities: EntityResult[];
  totalPool: number;
}

const SYSTEM_PROMPT = `You are a senior grant-research analyst. Given the name of an entity, you research it and surface ONLY active U.S. federal grant opportunities that are genuinely relevant to it.

The entity may be one of:
- a nonprofit organization,
- a foundation / fund / grantmaker, or
- an individual philanthropic investor or donor (e.g. "MacKenzie Scott", "Steve Green").

You operate FULLY AUTONOMOUSLY. You must complete the entire research in this single run. NEVER ask the user a question, NEVER defer work back to the user (do not say "if you have a specific nonprofit, I can…"), and NEVER end with a plan you haven't executed. If you are unsure which organizations or causes to target, decide yourself and proceed.

Reason about which type the entity is — do not assume. Then:

1. Use the web_search tool to ground yourself in current facts about the entity: its mission, location, approximate annual budget, and program/focus areas. For a foundation, fund, or individual investor/donor, identify the specific nonprofits and/or cause areas they actually fund — those funded organizations and causes are what you research grants for, NOT the funder itself (funders rarely apply for federal grants). If you cannot pin down specific named grantees, pick 2-4 of the funder's clearest cause areas and treat EACH as an entity to research.

2. You MUST call the searchGrants tool — multiple times — before finishing. Never conclude "there are no grants" without having actually searched. Search with FOCUSED, specific keyword phrases drawn from the actual mission/program/cause areas (e.g. "rural broadband", "youth workforce development", "historic preservation") — not generic terms like "research" or "nonprofit". Run MULTIPLE searches across the distinct program areas. If a search returns mostly irrelevant results, REFINE the keywords and search again.

3. Critically VET every candidate grant. Keep a grant only if it plausibly matches the entity's mission, eligibility, and geography. Aggressively discard grants that are off-mission, for ineligible applicant types, or in unrelated fields. It is far better to return 5 highly relevant grants than 30 noisy ones.

4. When done, write a brief final report. Organize it by entity (the nonprofit, or — for a funder — each funded organization or cause area you researched). For each relevant grant include its exact opportunityNumber and a one-sentence reason it matches. Never invent an opportunityNumber — only cite numbers returned by the searchGrants tool.

You have up to ${MAX_STEPS} steps. Be efficient but thorough, and do not stop until you have searched for and vetted grants.`;

const grantSelectionSchema = z.object({
  type: z.enum(["nonprofit", "fund", "investor", "ambiguous"]),
  summary: z.string().describe("2-3 sentence overview of the entity and the grant landscape found."),
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
  ),
});

export async function runResearchAgent(name: string): Promise<RadarResponse> {
  // Ground-truth pool of every grant the agent has actually seen, keyed by
  // opportunityNumber. We hydrate from this map so award amounts / dates are
  // never paraphrased by the model.
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
      // Token-trimmed view for the model.
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
    prompt: `Research this entity and find relevant federal grants: "${name}"`,
    tools: {
      searchGrants,
      web_search: anthropic.tools.webSearch_20250305({ maxUses: 8 }),
    },
    stopWhen: stepCountIs(MAX_STEPS),
  });

  // If the agent surfaced no grants at all, short-circuit.
  if (grantPool.size === 0) {
    return {
      type: "ambiguous",
      summary: research.text || `No federal grant opportunities were found for "${name}".`,
      entities: [],
      totalPool: 0,
    };
  }

  const availableNumbers = Array.from(grantPool.keys());

  // Phase B — structured formatting (no tools → no structured-output conflict).
  const { object } = await generateObject({
    model: MODEL,
    schema: grantSelectionSchema,
    prompt: `A grant-research analyst produced the report below for the entity "${name}". Convert it into structured data.

Only include grants whose opportunityNumber appears in this list of researched opportunities:
${availableNumbers.join(", ")}

For each entity the analyst identified, list the relevant grants with a relevanceReason and a matchScore (1-5). Omit grants that are weak or off-mission.

RESEARCH REPORT:
${research.text}`,
  });

  // Hydrate selected grants from the ground-truth pool; drop hallucinated /
  // weak matches; compute the pool from vetted grants only.
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

  return {
    type: object.type,
    summary: object.summary,
    entities,
    totalPool,
  };
}
