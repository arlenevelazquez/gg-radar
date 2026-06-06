import crypto from "node:crypto";
import { getSession, invalidateSession, getBaseUrl } from "./session";
import { searchResponseSchema, SearchBody, SearchResult } from "./types";

const HEX_COLON_HEX = /^[0-9a-f]{32}:[0-9a-f]+$/;

/**
 * GrantGuru encrypts every string field in API responses when the partner
 * token was obtained with `algorithm: 'aes-256-gcm'`. Fields arrive as
 * `ivHex:ciphertextHex`. The server does NOT include a GCM auth tag, so
 * we decrypt with `update()` only — `final()` would throw.
 */
function decryptField(encrypted: string, keyHex: string): string {
  const colon = encrypted.indexOf(":");
  if (colon === -1) return encrypted;
  const iv = Buffer.from(encrypted.slice(0, colon), "hex");
  const ciphertext = Buffer.from(encrypted.slice(colon + 1), "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  return decipher.update(ciphertext, undefined, "utf8");
}

function decryptDeep(value: unknown, keyHex: string): unknown {
  if (typeof value === "string" && HEX_COLON_HEX.test(value)) {
    const decrypted = decryptField(value, keyHex);
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  }
  if (Array.isArray(value)) {
    return value.map((v) => decryptDeep(v, keyHex));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, decryptDeep(v, keyHex)])
    );
  }
  return value;
}

async function postSearch(body: SearchBody): Promise<Response> {
  const session = await getSession();
  return fetch(`${getBaseUrl()}/grant/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
      "Cache-Control": "no-cache, no-store, max-age=0",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

export async function searchGrants(body: SearchBody): Promise<SearchResult> {
  let res = await postSearch(body);
  if (res.status === 401) {
    invalidateSession();
    res = await postSearch(body);
  }
  if (!res.ok) {
    throw new Error(`GrantGuru /grant/search failed: ${res.status}`);
  }
  const session = await getSession();
  let raw = (await res.json()) as unknown;
  if (session.encryptKeyHex) {
    raw = decryptDeep(raw, session.encryptKeyHex);
  }
  const parsed = searchResponseSchema.parse(raw);
  const grants = parsed.grants ?? parsed.data ?? [];
  const total = parsed.total ?? parsed.count ?? grants.length;
  return { total, grants };
}
