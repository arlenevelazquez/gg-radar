import { z } from "zod";

// --- Auth ---

const encryptKeySchema = z
  .object({
    key: z.string(),
    hash: z.string().optional(),
    algorithm: z.string().optional(),
  })
  .loose();

export const tokenResponseSchema = z.object({
  status: z.boolean(),
  message: z.string().optional(),
  data: z
    .object({
      accessToken: z.string(),
      refreshToken: z.string().optional(),
      exp: z.number().optional(),
      encryptKey: encryptKeySchema.optional(),
    })
    .nullable(),
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;

// --- Grant ---
// Minimal radar-facing slice. GrantGuru's full schema has 40+ fields; we only
// need what the marketing UI renders.

export const grantSchema = z
  .object({
    guid: z.string(),
    programName: z.string(),
    /** Funding agency, e.g. "U.S. Department of Health and Human Services". */
    departmentName: z.string().optional(),
    summary: z.string().optional(),
    description: z.string().optional(),
    fundingMax: z.number().nullable().optional(),
    fundingMin: z.number().nullable().optional(),
    fundingWorth: z.number().nullable().optional(),
    /** Pre-formatted funding string from GG, e.g. "$100,000". */
    fundingMaxResult: z.string().optional(),
    closingDate: z.string().nullable().optional(),
    closingInfo: z.string().nullable().optional(),
    deadline: z.string().nullable().optional(),
    /** Self-reported difficulty label, e.g. "Doable", "Might Need Help". */
    difficultyRating: z.string().optional(),
    competitive: z.union([z.string(), z.boolean()]).nullable().optional(),
    status: z.string().optional(),
    /** GG-hosted grant detail page URL. */
    url: z.string().nullable().optional(),
    score: z.number().optional(),
    rerankScore: z.number().optional(),
    locationAbbr: z.array(z.string()).optional(),
  })
  .loose();

export type GrantGuruGrant = z.infer<typeof grantSchema>;

export const searchResponseSchema = z
  .object({
    status: z.boolean(),
    message: z.string().optional(),
    grants: z.array(grantSchema).optional(),
    data: z.array(grantSchema).optional(),
    total: z.number().optional(),
    count: z.number().optional(),
  })
  .loose();

// --- Search request shape ---

export interface SearchFilter {
  fundingSource?: string[];
  fundingType?: string[];
  loc?: { country?: string[]; state?: string[] };
}

export interface SearchBody {
  prompt: string;
  project?: string;
  filter?: SearchFilter;
  limit?: number;
}

export interface SearchResult {
  total: number;
  grants: GrantGuruGrant[];
}
