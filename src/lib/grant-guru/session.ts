import { tokenResponseSchema } from "./types";

// Recursive GUID finder — the SSO endpoint returns the user in several shapes
// (object, string, nested under `data`/`user`/`result`). The reference script
// uses the same walk pattern for the same reason.
function findGuid(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGuid(item);
      if (found) return found;
    }
    return null;
  }
  const obj = value as Record<string, unknown>;
  for (const key of ["guid", "userGuid", "id"]) {
    const candidate = obj[key];
    if (typeof candidate === "string" && /^[0-9a-fA-F-]{32,36}$/.test(candidate)) {
      return candidate;
    }
  }
  for (const key of ["user", "data", "result"]) {
    const found = findGuid(obj[key]);
    if (found) return found;
  }
  return null;
}

/**
 * Single-session GrantGuru auth manager for the public radar surface.
 *
 * Why: this is a stateless marketing tool — every visitor shares one
 * server-side GG session. We bootstrap once: partner token → SSO-register
 * a single "Radar Demo" user (or reuse one via GG_RADAR_USER_GUID) →
 * session token. Both tokens are cached in module scope and refreshed
 * on a 5-minute buffer before their stated expiry.
 *
 * GG quirks handled here:
 *  - `data` may be a base64-encoded JSON string on newer API versions —
 *    normalised before Zod validation.
 *  - SSO body must NOT include fundingSource/fundingType; those become
 *    permanent immutable filters on the user.
 */

const BASE_URL = process.env.GRANTGURU_API_URL ?? "https://sandbox.grantguru.com/api/v1";
const API_KEY = process.env.GRANTGURU_API_KEY;
const RADAR_USER_GUID = process.env.GG_RADAR_USER_GUID;

const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const PARTNER_TTL_MS = 4 * 60 * 60 * 1000;
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
  encryptKeyHex?: string;
}

let partnerToken: CachedToken | null = null;
let partnerInflight: Promise<string> | null = null;

let sessionToken: CachedToken | null = null;
let sessionInflight: Promise<string> | null = null;

let resolvedUserGuid: string | null = RADAR_USER_GUID ?? null;
let userGuidInflight: Promise<string> | null = null;

export interface Session {
  accessToken: string;
  encryptKeyHex?: string;
}

function ensureApiKey(): string {
  if (!API_KEY) {
    throw new Error("GRANTGURU_API_KEY is not set");
  }
  return API_KEY;
}

// GrantGuru ≥ 1.0.14 may wrap `data` as base64 JSON.
function normalizeAuthBody(body: unknown): unknown {
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !("data" in body) ||
    typeof (body as { data: unknown }).data !== "string"
  ) {
    return body;
  }
  try {
    const decoded = Buffer.from((body as { data: string }).data, "base64").toString("utf8");
    return { ...(body as object), data: JSON.parse(decoded) as unknown };
  } catch {
    return body;
  }
}

async function fetchPartnerToken(): Promise<CachedToken> {
  const apiKey = ensureApiKey();
  // Intentionally NO `algorithm` here: with it, GG encrypts every user/SSO
  // response, which breaks the GUID lookup. The encryption is only useful on
  // the session token (it scopes to /grant/search results).
  const res = await fetch(`${BASE_URL}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  if (!res.ok) {
    throw new Error(`GrantGuru /auth/token failed: ${res.status}`);
  }
  const parsed = tokenResponseSchema.parse(normalizeAuthBody(await res.json()));
  if (!parsed.status || !parsed.data) {
    throw new Error(`GrantGuru /auth/token returned status=false`);
  }
  const expiresAt = parsed.data.exp ? parsed.data.exp * 1000 : Date.now() + PARTNER_TTL_MS;
  return {
    accessToken: parsed.data.accessToken,
    expiresAt,
    encryptKeyHex: parsed.data.encryptKey?.key,
  };
}

async function getPartnerAccessToken(): Promise<string> {
  const now = Date.now();
  if (partnerToken && now < partnerToken.expiresAt - REFRESH_BUFFER_MS) {
    return partnerToken.accessToken;
  }
  if (partnerInflight) return partnerInflight;
  partnerInflight = (async () => {
    try {
      partnerToken = await fetchPartnerToken();
      return partnerToken.accessToken;
    } finally {
      partnerInflight = null;
    }
  })();
  return partnerInflight;
}

async function ssoRegisterRadarUser(partnerAccessToken: string): Promise<string> {
  // CRITICAL: do NOT include fundingSource/fundingType — they become permanent
  // immutable user-level filters and would silently restrict every search.
  const email = `radar-shared@leadfunnel.greatgrants.ai`;
  const payload = {
    firstName: "Radar",
    lastName: "Shared",
    email,
    memberid: "radar-shared",
    orgName: "Grant Radar Demo",
    fullAddress: "1 Main St, Washington, DC 20001",
    orgType: "Community",
    sector: "CommunityServices",
  };

  const res = await fetch(`${BASE_URL}/user/sso`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${partnerAccessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`GrantGuru /user/sso failed: ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  const ssoGuid = findGuid(body);
  if (ssoGuid) return ssoGuid;

  // Fallback: look up by email (user may already exist from a prior boot)
  const lookupRes = await fetch(
    `${BASE_URL}/user/email/${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${partnerAccessToken}` } }
  );
  if (lookupRes.ok) {
    const lookupGuid = findGuid(await lookupRes.json());
    if (lookupGuid) return lookupGuid;
  }
  throw new Error(
    `Could not resolve a GrantGuru user GUID — set GG_RADAR_USER_GUID in .env.local`
  );
}

async function getRadarUserGuid(): Promise<string> {
  if (resolvedUserGuid) return resolvedUserGuid;
  if (userGuidInflight) return userGuidInflight;
  userGuidInflight = (async () => {
    try {
      const partner = await getPartnerAccessToken();
      const guid = await ssoRegisterRadarUser(partner);
      resolvedUserGuid = guid;
      // Loudly surface the GUID once so the operator can pin it via env.
      console.info(
        `[grant-guru] resolved radar user GUID — set GG_RADAR_USER_GUID=${guid} to skip lazy SSO`
      );
      return guid;
    } finally {
      userGuidInflight = null;
    }
  })();
  return userGuidInflight;
}

async function fetchSessionToken(userGuid: string): Promise<CachedToken> {
  const apiKey = ensureApiKey();
  const res = await fetch(`${BASE_URL}/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, algorithm: "aes-256-gcm", user: userGuid }),
  });
  if (!res.ok) {
    throw new Error(`GrantGuru /auth/session failed: ${res.status}`);
  }
  const parsed = tokenResponseSchema.parse(normalizeAuthBody(await res.json()));
  if (!parsed.status || !parsed.data) {
    throw new Error(`GrantGuru /auth/session returned status=false`);
  }
  const expiresAt = parsed.data.exp ? parsed.data.exp * 1000 : Date.now() + SESSION_TTL_MS;
  return {
    accessToken: parsed.data.accessToken,
    expiresAt,
    encryptKeyHex: parsed.data.encryptKey?.key,
  };
}

export async function getSession(): Promise<Session> {
  const now = Date.now();
  if (sessionToken && now < sessionToken.expiresAt - REFRESH_BUFFER_MS) {
    return {
      accessToken: sessionToken.accessToken,
      encryptKeyHex: sessionToken.encryptKeyHex,
    };
  }
  if (sessionInflight) {
    const accessToken = await sessionInflight;
    return { accessToken, encryptKeyHex: sessionToken?.encryptKeyHex };
  }
  sessionInflight = (async () => {
    try {
      const userGuid = await getRadarUserGuid();
      sessionToken = await fetchSessionToken(userGuid);
      return sessionToken.accessToken;
    } finally {
      sessionInflight = null;
    }
  })();
  const accessToken = await sessionInflight;
  return { accessToken, encryptKeyHex: sessionToken?.encryptKeyHex };
}

/** Force a fresh session on the next call. Used for 401 retry. */
export function invalidateSession(): void {
  sessionToken = null;
}

export function getBaseUrl(): string {
  return BASE_URL;
}
