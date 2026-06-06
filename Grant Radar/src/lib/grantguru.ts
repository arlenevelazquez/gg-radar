/**
 * GrantGuru Search Client
 *
 * Auth flow (4 steps, tokens cached for ~4 hours):
 *   1. POST /auth/token   → partner token
 *   2. POST /user/sso     → user GUID (lazy-register; NEVER set fundingSource/fundingType)
 *   3. POST /auth/session → session token + AES-256-GCM encryption key
 *   4. POST /grant/search → encrypted grant results
 *
 * Every string field in every response is encrypted as "ivHex:ciphertextHex".
 * We decrypt with AES-256-GCM but skip decipher.final() — GrantGuru omits the
 * auth tag, so calling final() throws.
 */

import crypto from "node:crypto";
import { generateText } from "ai";

const BASE_URL = (process.env.GRANTGURU_API_URL ?? "https://grantguru.com/api/v1").replace(/\/$/, "");
const API_KEY = process.env.GRANTGURU_API_KEY ?? "";
const DEMO_EMAIL = "grant-radar-search@greatgrants.ai";
const MODEL = "anthropic/claude-haiku-4.5";

// ── Types ─────────────────────────────────────────────────────────────────

export interface GuruGrant {
  guid: string;
  title: string;
  description: string;
  region: string;
  minFunding: number | null;
  maxFunding: number | null;
  totalFunding: number | null;
  status: string;
  closeDate: string;
  rerankScore: number | null;
}

// ── Token cache ───────────────────────────────────────────────────────────

interface SessionCache {
  sessionToken: string;
  encryptKeyHex: string;
  userGuid: string;
  expiresAt: number;
}
let _sessionCache: SessionCache | null = null;

// ── AES-256-GCM decryption ────────────────────────────────────────────────

function decryptField(encrypted: string, keyHex: string): string {
  const colon = encrypted.indexOf(":");
  if (colon === -1) return encrypted;
  const iv = Buffer.from(encrypted.slice(0, colon), "hex");
  const ct = Buffer.from(encrypted.slice(colon + 1), "hex");
  // Skip decipher.final() — GrantGuru omits the GCM auth tag.
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  return decipher.update(ct, undefined, "utf8");
}

function decryptResponse(value: unknown, keyHex: string): unknown {
  const HEX = /^[0-9a-fA-F]{32}:[0-9a-fA-F]+$/;
  if (typeof value === "string" && HEX.test(value)) {
    const d = decryptField(value, keyHex);
    try { return JSON.parse(d); } catch { return d; }
  }
  if (Array.isArray(value)) return value.map((v) => decryptResponse(v, keyHex));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, decryptResponse(v, keyHex)])
    );
  }
  return value;
}

// ── Auth helpers ──────────────────────────────────────────────────────────

function findGuid(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) { const f = findGuid(item); if (f) return f; }
    return null;
  }
  const obj = value as Record<string, unknown>;
  for (const k of ["guid", "userGuid", "id"]) {
    if (typeof obj[k] === "string" && /^[0-9a-fA-F-]{32,36}$/.test(obj[k] as string))
      return obj[k] as string;
  }
  for (const k of ["user", "data", "result"]) {
    const f = findGuid(obj[k]);
    if (f) return f;
  }
  return null;
}

async function getPartnerToken(): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: API_KEY, algorithm: "aes-256-gcm" }),
  });
  const body = await res.json();
  if (!body.status) throw new Error(`Partner token failed: ${body.error}`);
  return body.data.accessToken;
}

async function ssoRegisterUser(partnerToken: string): Promise<string> {
  // CRITICAL: Never include fundingSource or fundingType here.
  // They become permanently baked into the user profile and restrict all future searches.
  const res = await fetch(`${BASE_URL}/user/sso`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${partnerToken}` },
    body: JSON.stringify({
      firstName: "GrantRadar",
      lastName: "Search",
      email: DEMO_EMAIL,
      memberid: "grant-radar-search-v1",
      orgName: "GreatGrants.ai",
      fullAddress: "1 Main St, Washington, DC 20001",
      orgType: "Community",
      sector: "CommunityServices",
    }),
  });
  const body = await res.json();
  if (!body.status) throw new Error(`SSO failed: ${JSON.stringify(body)}`);
  const guid = findGuid(body);
  if (guid) return guid;
  // Fallback: look up by email
  const lu = await fetch(`${BASE_URL}/user/email/${encodeURIComponent(DEMO_EMAIL)}`, {
    headers: { Authorization: `Bearer ${partnerToken}` },
  });
  const luBody = await lu.json();
  const luGuid = findGuid(luBody);
  if (!luGuid) throw new Error("Could not resolve GrantGuru user GUID.");
  return luGuid;
}

async function getSessionToken(userGuid: string): Promise<{ accessToken: string; encryptKeyHex: string }> {
  const res = await fetch(`${BASE_URL}/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: API_KEY, algorithm: "aes-256-gcm", user: userGuid }),
  });
  const body = await res.json();
  if (!body.status) throw new Error(`Session token failed: ${body.error}`);
  return {
    accessToken: body.data.accessToken,
    encryptKeyHex: body.data.encryptKey?.key ?? "",
  };
}

async function getSession(): Promise<SessionCache> {
  if (_sessionCache && _sessionCache.expiresAt > Date.now() + 60_000) return _sessionCache;
  const partnerToken = await getPartnerToken();
  const userGuid = await ssoRegisterUser(partnerToken);
  const { accessToken, encryptKeyHex } = await getSessionToken(userGuid);
  _sessionCache = {
    sessionToken: accessToken,
    encryptKeyHex,
    userGuid,
    expiresAt: Date.now() + 4 * 60 * 60 * 1000,
  };
  return _sessionCache;
}

// ── State code derivation ─────────────────────────────────────────────────

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC", "washington dc": "DC",
};
const STATE_ABBRS = new Set(Object.values(STATE_NAMES));

function deriveStateCode(location: string): string | null {
  const lower = location.toLowerCase();
  for (const [name, code] of Object.entries(STATE_NAMES)) {
    if (lower.includes(name)) return `US${code}`;
  }
  for (const part of location.split(/[\s,]+/)) {
    const upper = part.toUpperCase();
    if (STATE_ABBRS.has(upper)) return `US${upper}`;
  }
  return null;
}

// ── LLM search query construction ────────────────────────────────────────

const QUERY_SYSTEM_PROMPT = `You are a grant-matching search query writer. Convert nonprofit organization data into a keyword-optimized search prompt for a grant database search engine.

RULES:
1. Start with "Federal grants for" followed by the organization's core activity areas using grant-corpus vocabulary.
2. Keep output under 800 characters. A focused 500-char prompt outperforms a sprawling 1000-char one.
3. Use grant-funding terminology, not program narrative. "workforce development" not "helping people find jobs". "STEM education" not "teaching kids about science".
4. Include: activity areas, population served, geographic location (state), and measurable outcome categories.
5. Do NOT include: organization name, founding year, staff count, budget figures, or boilerplate mission language.
6. Include the US state near the beginning of the prompt.
7. Output ONLY the search prompt text. No explanations, no preamble.`;

async function buildSearchQuery(org: {
  name: string;
  mission: string;
  location: string;
  programAreas: string[];
}): Promise<string> {
  const { text } = await generateText({
    model: MODEL,
    system: QUERY_SYSTEM_PROMPT,
    prompt: `Name: ${org.name}\nMission: ${org.mission}\nLocation: ${org.location}\nProgram areas: ${org.programAreas.join(", ")}`,
  });
  return text.trim().slice(0, 800);
}

// ── Grant normalization ───────────────────────────────────────────────────

function coerceNum(v: unknown): number | null {
  if (typeof v === "number" && !isNaN(v)) return v;
  if (typeof v === "string") { const n = parseFloat(v); return isNaN(n) ? null : n; }
  return null;
}

function coerceStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function extractRawGrants(body: Record<string, unknown>): Record<string, unknown>[] {
  for (const path of [
    body.grants,
    body.data,
    (body.data as Record<string, unknown> | undefined)?.grants,
    (body.result as Record<string, unknown> | undefined)?.grants,
  ]) {
    if (Array.isArray(path)) return path as Record<string, unknown>[];
  }
  return [];
}

function normalizeGrant(g: Record<string, unknown>): GuruGrant {
  return {
    guid: coerceStr(g.guid ?? g.id ?? ""),
    title: coerceStr(g.programName ?? g.title ?? g.name ?? g.grantName ?? "Untitled"),
    description: coerceStr(g.description ?? g.synopsis ?? g.summary ?? g.overview ?? g.purpose ?? ""),
    region: coerceStr(g.eligibleGeography ?? g.geography ?? g.region ?? g.state ?? g.location ?? g.eligibleStates ?? ""),
    minFunding: coerceNum(g.minFunding ?? g.minAward ?? g.awardFloor ?? g.minimumAward ?? null),
    maxFunding: coerceNum(g.maxFunding ?? g.maxAward ?? g.awardCeiling ?? g.maximumAward ?? g.ceiling ?? null),
    totalFunding: coerceNum(g.totalFunding ?? g.totalFundingAvailable ?? g.totalPool ?? g.programBudget ?? null),
    status: coerceStr(g.status ?? g.grantStatus ?? g.opportunityStatus ?? ""),
    closeDate: coerceStr(g.closeDate ?? g.closingDate ?? g.deadline ?? g.applicationDeadline ?? g.dueDate ?? ""),
    rerankScore: coerceNum(g.rerankScore ?? null),
  };
}

// ── Public API ────────────────────────────────────────────────────────────

export async function searchGrantGuru(org: {
  name: string;
  mission: string;
  location: string;
  programAreas: string[];
  limit?: number;
}): Promise<{ grants: GuruGrant[]; total: number; error: string | null }> {
  if (!API_KEY) {
    return { grants: [], total: 0, error: "GRANTGURU_API_KEY is not configured in .env.local." };
  }

  // Build query and get session in parallel
  const [session, prompt] = await Promise.all([
    getSession(),
    buildSearchQuery(org),
  ]);

  const stateCode = deriveStateCode(org.location);
  const filter = {
    fundingSource: ["Federal"],
    fundingType: ["Grant"],
    loc: { country: ["US"], state: [stateCode ?? "US-NA"] },
  };

  const res = await fetch(`${BASE_URL}/grant/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.sessionToken}`,
    },
    body: JSON.stringify({ prompt, filter, limit: org.limit ?? 10 }),
  });

  let body = (await res.json()) as Record<string, unknown>;
  if (session.encryptKeyHex) {
    body = decryptResponse(body, session.encryptKeyHex) as Record<string, unknown>;
  }

  if (!body.status) {
    return { grants: [], total: 0, error: coerceStr(body.error ?? "GrantGuru search failed.") };
  }

  const raw = extractRawGrants(body);
  const grants = raw.map(normalizeGrant);
  const total = coerceNum(body.total) ?? grants.length;

  return { grants, total, error: null };
}
