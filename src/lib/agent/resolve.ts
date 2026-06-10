import { generateObject } from "ai";
import { z } from "zod";

/**
 * Entity disambiguation — the "Did you mean?" pre-step.
 *
 * A short user query like "the Green family" can refer to many distinct
 * real-world entities. Before we spend a full research + GrantGuru + 990 run
 * on the wrong one, we resolve the query into the prominent candidate entities
 * it could mean, each anchored with a disambiguating detail and an unambiguous
 * `query` string the downstream research agent can't misread.
 *
 * Fast + cheap: a single schema-constrained Haiku call, no web search.
 */

const MODEL = "anthropic/claude-haiku-4.5";

export type EntityKind =
  | "corporation"
  | "foundation"
  | "individual"
  | "family"
  | "holding_company"
  | "other";

export interface EntityCandidate {
  /** Short display name, e.g. "The Green family (Hobby Lobby)". */
  label: string;
  /** One line that distinguishes this entity from same-named ones. */
  detail: string;
  /** Unambiguous string to hand the research agent (anchored to company/place). */
  query: string;
  kind: EntityKind;
}

const schema = z.object({
  candidates: z
    .array(
      z.object({
        label: z
          .string()
          .describe('Short display name, e.g. "The Green family (Hobby Lobby)".'),
        detail: z
          .string()
          .describe(
            "One line that distinguishes this entity: associated company, location, and what it's best known for (incl. a flagship nonprofit if relevant)."
          ),
        query: z
          .string()
          .describe(
            "An unambiguous search string for this exact entity, anchored with its company and/or location so a researcher can't confuse it with a same-named entity."
          ),
        kind: z.enum([
          "corporation",
          "foundation",
          "individual",
          "family",
          "holding_company",
          "other",
        ]),
      })
    )
    .min(1)
    .max(5),
});

const SYSTEM_PROMPT = `You disambiguate a user's entity query for a grant-research tool. Given a short query (a company, foundation, individual, or family name), return the distinct, prominent, REAL-WORLD entities it could plausibly refer to.

Rules:
- If the query clearly identifies ONE well-known entity, return EXACTLY ONE candidate.
- If it is ambiguous — a common surname / family name, or a name shared by multiple notable entities — return 2-5 of the MOST PROMINENT distinct candidates, ordered by prominence.
- For each candidate provide:
  - "label": a short display name (include the anchor, e.g. "The Green family (Hobby Lobby)").
  - "detail": one line that disambiguates it — associated company, location, what they're best known for, and a flagship nonprofit if relevant.
  - "query": an unambiguous research string anchored with the company and/or location (e.g. "the Green family, founders of Hobby Lobby in Oklahoma City") so a downstream researcher cannot confuse it with a same-named entity.
  - "kind": the entity type.
- Only include REAL, verifiable entities. NEVER invent candidates to pad the list — fewer accurate candidates is better than padded guesses.
- Prefer entities with a notable philanthropic / nonprofit footprint, since that's what the tool researches.`;

/**
 * Resolve a raw query into candidate entities. Returns at least one candidate;
 * for a clearly-specific query that's a single passthrough candidate.
 */
export async function resolveEntities(input: string): Promise<EntityCandidate[]> {
  const { object } = await generateObject({
    model: MODEL,
    schema,
    system: SYSTEM_PROMPT,
    prompt: `User query: "${input}"\n\nList the distinct, prominent real-world entities this could refer to, following the rules.`,
  });
  return object.candidates;
}
