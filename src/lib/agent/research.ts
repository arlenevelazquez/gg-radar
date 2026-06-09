import { generateText, generateObject, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { ResearchResult } from "./types";

const MODEL = "anthropic/claude-haiku-4.5";
const MAX_STEPS = 20;
const MAX_WEB_SEARCHES = 6;

// --- System prompt ----------------------------------------------------------
// Written defensively for Haiku 4.5. The model has a strong reflex toward
// "this entity is ineligible for federal grants" when it sees for-profit
// corporate names (e.g. Chick-fil-A), which historically caused the agent to
// refuse without doing any research. The wording below explicitly defangs
// that reflex and pins the task to the NONPROFITS the parent is connected to.

const SYSTEM_PROMPT = `You are a research analyst for Grant Radar, a marketing intelligence tool. The user gives you the name of a PARENT entity. Your job is to identify nonprofits that are STRUCTURALLY TIED to that parent — i.e. organizational siblings, not grant recipients — so we can later look up federal grants for those sibling nonprofits.

# Valid parent types
You MUST accept any of these as valid input — never refuse based on the parent's tax status, sector, or grant eligibility:
- For-profit corporations (e.g. Chick-fil-A, Walmart, McDonald's, The Home Depot)
- Foundations and grantmakers
- Individual donors / philanthropists
- Holding companies and family offices

The parent's own eligibility for grants is irrelevant.

# Forbidden behaviors
Do NOT respond with any of the following:
- "This entity is ineligible for federal grants, so I cannot help."
- "If you can provide the name of a specific nonprofit, I can research it."
- "Federal grants are not available to commercial businesses."
- Any deferral that hands work back to the user.

# What counts as a "structurally-tied nonprofit"

You are looking for nonprofits that are EXTENSIONS OF the parent's organization — same family, same brand, same leadership, same name. There are exactly three valid connection types:

1. **Corporate foundation** — the parent's own foundation, usually named "[Parent] Foundation".
   - The Home Depot → The Home Depot Foundation
   - Walmart → Walmart Foundation
   - Target → Target Foundation
   - Bank of America → Bank of America Charitable Foundation

2. **Family foundation** — a nonprofit named after the founder or founding family that operates as their philanthropic vehicle.
   - Walmart / the Waltons → Walton Family Foundation
   - Chick-fil-A / the Cathys → LifeShape, WinShape Foundation
   - The Gates family → Bill & Melinda Gates Foundation
   - The Rockefellers → Rockefeller Foundation

3. **Affiliated nonprofit** — a separately-branded but operationally tied nonprofit founded by the parent or with shared board / leadership ties.
   - McDonald's → Ronald McDonald House Charities (RMHC)
   - State Farm → State Farm Neighborhood Assist program (as a 501(c)(3))
   - Coca-Cola → The Coca-Cola Foundation (and historically The Coca-Cola Scholars Foundation)

# What you must EXCLUDE

Do NOT include any of these — they are explicitly off-task:
- **Grant recipients of the parent's giving program.** If the parent runs an awards program (e.g. Chick-fil-A True Inspiration Awards, Newman's Own Awards), the WINNERS of those awards are NOT what we want. They are downstream grantees, not siblings.
- **Official charity partners** the parent merely sponsors or runs round-up fundraising for, unless that partner was founded by the parent.
- **Industry trade associations** the parent is a member of.
- **Speculation** ("companies in this sector often fund education").

The bright line: was this nonprofit FOUNDED, BRANDED, or STAFFED by the parent organization or its founding family? If yes, include. If no, exclude — even if the parent gave them a lot of money.

# Process
1. Use web_search to find the parent's structurally-tied nonprofits. Useful queries:
   - "[parent name] foundation"
   - "[parent name] charitable arm"
   - "[founder family name] family foundation"
   - "[parent name] nonprofit subsidiary"
   - "[parent name] 501c3"
2. For each nonprofit you confidently identify, gather: official name, brief mission, headquarters (city + US state if applicable), 3-6 programs/activities, populations served, and a one-sentence statement of HOW it's structurally tied to the parent (who founded it, when, shared leadership, etc.).
3. Most parents have 1-3 tied nonprofits. Some larger families have up to 6. If you can only confidently identify ONE, return only one — quality over quantity.
4. **If after thorough searching you cannot identify ANY structurally-tied nonprofit, that is a valid outcome.** Write a report explaining what the parent's philanthropic structure looks like (e.g. "donates through a donor-advised fund", "no public foundation") and return an empty list.

# Parent grant profile (REQUIRED)
Separately from the tied nonprofits, also build a grant-search profile for the PARENT entity ITSELF, because we now run a federal-grant search on the parent too. Regardless of the parent's tax status, capture:
- **mission**: what the parent organization actually does, programmatically — its charitable / community / service mission framed the way a grant reviewer would read it. For a for-profit, describe its community-investment and social-impact work, not its commercial products.
- **programs**: 3-6 concrete program or focus areas (e.g. "youth education", "hunger relief", "disaster response", "workforce development").
- **populations**: the populations or communities the parent's giving and programs serve, if identifiable.
- **headquarters / location**: city and 2-letter US state.

Do this even when no tied nonprofit is found.

# Output
Write a free-text report:
- Short profile of the PARENT (what they are, HQ, who founded them, who runs the family's philanthropy)
- A PARENT GRANT PROFILE block: the parent's own mission, 3-6 program/focus areas, populations served, and HQ city + state — as described above
- For EACH tied nonprofit: name, location, mission, programs, populations, structural connection, and which of the three connection types it is (corporate_foundation / family_foundation / affiliated_nonprofit)
- If no nonprofits found, explain why — but STILL provide the parent grant profile

You have up to ${MAX_STEPS} reasoning steps and ${MAX_WEB_SEARCHES} web_search calls. Be efficient and rigorous.`;

// --- Phase B schema --------------------------------------------------------

const researchSchema = z.object({
  parent: z.object({
    name: z.string(),
    type: z.enum(["corporation", "foundation", "individual", "holding_company", "other"]),
    description: z.string(),
    givingPrograms: z.array(z.string()).describe("Named philanthropic programs the parent operates, for context only. Empty if none."),
    headquarters: z.string().optional(),
    mission: z
      .string()
      .describe(
        "What the parent organization itself does, programmatically, framed for grant matching (its charitable / community / service mission). Used to run a federal-grant search on the parent directly. Never empty — describe the parent's social-impact work even for a for-profit."
      ),
    programs: z
      .array(z.string())
      .describe("3-6 concrete program / focus areas the parent operates (e.g. 'youth education', 'hunger relief')."),
    populations: z
      .array(z.string())
      .describe("Populations / communities the parent's giving and programs serve. Empty if unknown.")
      .optional(),
    location: z
      .object({
        city: z.string().optional(),
        state: z
          .string()
          .describe('2-letter US state code, e.g. "GA". Use null if national or unknown.')
          .nullable(),
        country: z.string().describe('ISO country code, default "US".').optional(),
      })
      .optional(),
  }),
  summary: z
    .string()
    .describe(
      "2-3 sentences describing the parent's philanthropic structure and the nonprofits structurally tied to it. If no tied nonprofits were found, explain why."
    ),
  nonprofits: z
    .array(
      z.object({
        name: z.string(),
        mission: z.string(),
        programs: z.array(z.string()),
        populations: z.array(z.string()).optional(),
        location: z
          .object({
            city: z.string().optional(),
            state: z
              .string()
              .describe('2-letter US state code, e.g. "GA". Use null if national or unknown.')
              .nullable(),
            country: z.string().describe('ISO country code, default "US".').optional(),
          })
          .optional(),
        relationship: z
          .string()
          .describe(
            "One sentence describing the STRUCTURAL tie — who founded it, when, shared leadership / family / branding. NOT 'they gave a grant'."
          ),
        connectionType: z
          .enum(["corporate_foundation", "family_foundation", "affiliated_nonprofit", "other"])
          .describe(
            "corporate_foundation: parent's own foundation ([Parent] Foundation). family_foundation: founder/family-named nonprofit. affiliated_nonprofit: separately branded but operationally tied (e.g. RMHC). other: only if it's clearly structurally tied but doesn't fit the first three."
          ),
      })
    )
    .min(0)
    .max(6),
});

// --- Phase A: free-text research --------------------------------------------

export async function runResearch(parentName: string): Promise<ResearchResult> {
  const research = await generateText({
    model: MODEL,
    system: SYSTEM_PROMPT,
    prompt: `Research this parent entity and identify its funded / brand-aligned nonprofit connections: "${parentName}"`,
    tools: {
      web_search: anthropic.tools.webSearch_20250305({ maxUses: MAX_WEB_SEARCHES }),
    },
    stopWhen: stepCountIs(MAX_STEPS),
  });

  // --- Phase B: schema coerce -----------------------------------------------
  const { object } = await generateObject({
    model: MODEL,
    schema: researchSchema,
    prompt: `A research analyst produced the report below for the parent entity "${parentName}". Convert it into structured JSON matching the schema.

Rules:
- For the PARENT, also populate its grant-search fields from the report's parent grant profile: "mission" (what the parent does programmatically, for grant matching — never leave empty), "programs" (3-6 focus areas), "populations" (communities served, if any), and "location" (HQ city + 2-letter state). If the report only gives a giving description, derive a reasonable mission and program list from it.
- Include ONLY nonprofits that are STRUCTURALLY TIED to the parent — founded by, branded by, named after, or operationally tied (shared board, founder family) to the parent.
- EXCLUDE grant recipients, award winners, sponsored partners, and any nonprofit that is merely a beneficiary of the parent's giving rather than a sibling organization.
- For US locations, prefer 2-letter state codes ("GA" not "Georgia"). If unknown, set state to null.
- "connectionType":
  - "corporate_foundation" — the parent's own foundation, often named "[Parent] Foundation"
  - "family_foundation" — a founder- or family-named nonprofit (e.g. Walton Family Foundation, WinShape Foundation)
  - "affiliated_nonprofit" — separately branded but operationally tied (e.g. Ronald McDonald House Charities)
  - "other" — only if clearly structurally tied but none of the three above fit
- If the analyst could not identify any structurally-tied nonprofits, return an empty nonprofits array and explain why in summary.

REPORT:
${research.text}`,
  });

  return object as ResearchResult;
}
