# GrantGuru Integration Notes

This document captures the non-obvious things we had to discover or work
around when wiring GrantGuru into Grant Radar. It supplements the
authoritative vendor docs in the sibling great-grants repo at
`great-grants/.context/vendor/grant-guru/` — read those FIRST if you're
about to touch the GG client.

This doc is the **Radar-specific** layer: how we use the client, why we
made the choices we did, and which gotchas matter for a stateless
marketing surface (vs. great-grants' multi-tenant product).

---

## Where the code lives

```
src/lib/grant-guru/
├── session.ts   # auth lifecycle: partner token → SSO → session token
├── client.ts    # /grant/search with decryption + 401-retry
├── prompt.ts    # keyword-style prompt + nested-loc filter builder
└── types.ts     # Zod schemas (intentionally loose for shape drift)
```

---

## Auth flow

GrantGuru has a four-step authentication dance:

```
1. Partner token  — POST /auth/token       (API key → partner JWT)
2. SSO register   — POST /user/sso         (lazy-creates / finds the user)
3. Session token  — POST /auth/session     (user-scoped JWT + encrypt key)
4. Search         — POST /grant/search     (encrypted grant results)
```

For Radar we share a **single user** across every visitor (one server-side
session, refreshed on a 5-minute buffer before expiry). That user is
provisioned once via the GG admin UI, not via lazy SSO, because we want
control over its profile filters. The GUID is pinned via
`GG_RADAR_USER_GUID` so we skip the SSO step entirely on every cold start.

If `GG_RADAR_USER_GUID` is unset, the server lazy-registers a user via SSO
on the first request and logs the resolved GUID to stdout. Paste it into
`.env.local` and move on.

---

## The `algorithm` gotcha

The GG `/auth/token` endpoint has two divergent behaviors documented in
[`api-divergences.md` #11](https://github.com/servant-io/great-grants/blob/main/apps/web/src/lib/services/grant-guru/.context/vendor/grant-guru/api-divergences.md)
and #10:

- If you pass `algorithm: 'aes-256-gcm'` to `/auth/token`, every
  subsequent response from the partner token (including SSO and email
  lookup) returns string fields as `hex:hex` ciphertext. You then have to
  decrypt those fields before parsing.
- If you OMIT `algorithm` entirely, GG returns `500 Internal Server Error`
  per the documented divergence... but in our testing against production,
  it actually succeeds with clear-text responses.

**Radar's choice today**: omit `algorithm` on `/auth/token`. SSO + lookup
responses come back in clear text and our `findGuid()` walk works without
a decryption step. This is fragile and contradicts the documented
divergence — see "Hardening to-do" below.

**Where we DO use the algorithm**: on `/auth/session`. The session token's
`encryptKey.key` is what decrypts `/grant/search` responses. Search
responses are always encrypted.

---

## AES-256-GCM without an auth tag

GG's "AES-256-GCM" encryption is misleading — they omit the GCM
authentication tag. Node's `crypto.createDecipheriv('aes-256-gcm')` only
works if we call `decipher.update()` and skip `decipher.final()`. Calling
`final()` throws because there's no tag to verify.

This means we get confidentiality (effectively AES-256-CTR) without
integrity verification, but the TLS layer covers integrity for us in
transit. Workaround lives in `client.ts:decryptField`.

---

## User-profile biases the search filter

This is the single non-obvious failure mode that cost us the most time
during the rebuild.

When you call `POST /grant/search`, GG **enriches your filter** with the
SSO user's profile defaults:

- `sector` → becomes a `category` filter
- Location info → becomes `regions` / `loc` filters
- `fundingSource` / `fundingType` set on SSO → become permanent immutable
  filters

If your SSO user has `sector: "CommunityServices"`, every search will
silently filter to community-services grants, even for a veteran-services
or arts-education nonprofit. Top results look superficially fine but are
actually the same generic federal grants for every nonprofit you query.

**How we avoided it**: the production GG user for Radar (`GG_RADAR_USER_GUID`)
was provisioned with:

- A broad category set: `["Business", "Community", "Government", "Individual"]`
- US-wide state coverage: `["US-NA", "USAL", ..., "USWY"]`
- No `fundingSource` / `fundingType` baked in
- A neutral `orgType` ("Community" — required by GG but the filter that
  matters is `category`)

We verify the user profile is broad by calling `GET /user/email/{email}`
during initial setup and inspecting `user.filter.category` / `loc`.

**If results suddenly all look the same across nonprofits**, the user
profile got reset. Re-check it via the email-lookup probe.

---

## fundingSource / fundingType are poison on SSO

Per [`api-divergences.md` #8](https://github.com/servant-io/great-grants/blob/main/apps/web/src/lib/services/grant-guru/.context/vendor/grant-guru/api-divergences.md):
if you pass `fundingSource` or `fundingType` to `/user/sso`, GG persists
them as permanent immutable user-level search filters. `PATCH /user`
won't clear them, and `GET /user/email/{email}` will keep finding the
same poisoned user. The only remediation is GG team intervention.

**Radar's choice**: NEVER include those fields on `/user/sso`. We pass
them per-search in the `filter` payload instead, which is fine because
GG merges per-request filters with user-level filters.

---

## `loc` filter must use nested shape

Per [`api-divergences.md` #20](https://github.com/servant-io/great-grants/blob/main/apps/web/src/lib/services/grant-guru/.context/vendor/grant-guru/api-divergences.md):
sending flat dotted keys like `"loc.country": ["US"]` returns 500 for
authenticated users with any real state code. Use the nested shape:

```ts
filter: {
  loc: {
    country: ["US"],
    state: ["USGA"],   // or ["US-NA"] for nationally-scoped
  },
  fundingSource: ["Federal"],
  fundingType: ["Grant"],
}
```

Our `prompt.ts:buildFilter` always emits the nested form.

---

## There is no real "total grant count"

`POST /grant/search` does not return a true count of matching grants. The
response includes `count: <limit>`, which is just the page-size echoed
back. Even with a tiny query, GG pads the response to the requested
limit with progressively worse matches.

**How Radar deals with this**: we ask for `limit: 25`, score every
returned grant via `rerankScore`, and treat anything with a derived
`matchScore < 50` as "weak / forced fit." The headline number per
nonprofit is `qualifiedCount` (matches ≥ 50%), not the raw count. We
also show all top 10 in the UI with explicit quality badges so users can
see why the count might be lower than expected.

**Why 25 specifically**: trying `limit: 100` returns 400. The cap is
somewhere around 25 on production.

---

## Match quality thresholds

Mirrors great-grants' `DEFAULT_MATCH_THRESHOLDS`:

| Tier        | matchScore range  | Meaning                                  |
| ----------- | ----------------- | ---------------------------------------- |
| `excellent` | ≥ 80              | Strong fit, defensible to show           |
| `good`      | ≥ 65              | Solid fit                                |
| `possible`  | ≥ 50              | Plausible but worth a human review       |
| `weak`      | < 50              | Probably a forced fit due to padding     |

`matchScore = round(rerankScore * 100)`. `rerankScore` is GG's re-ranked
relevance signal; their raw `score` is base similarity and is less useful.

---

## Prompt shape matters

Per our AB testing (`gg-prompt-ab-test.mjs` in the source folder),
**keyword-style prompts outperform raw narrative**. We build prompts as:

```
"Federal grants for {programs} in {state}. The organization
({nonprofit_name}) serves {populations}. {mission}"
```

with a ≤1000-char hard limit on `prompt` and a ≤4000-char limit on the
companion `project` field (which carries the longer mission narrative).
See `prompt.ts:buildPromptText`.

---

## Hardening to-do (deferred)

There's one open hardening task that's tracked but not yet implemented:

- **Restore `algorithm: 'aes-256-gcm'` on `/auth/token` and add
  `decryptDeep()` to the SSO + email-lookup response paths.** This is
  the documented "correct" pattern; our current omit-the-algorithm
  workaround happens to work on prod today but contradicts api-divergences
  #11 and could break on a GG update.

When you tackle this, the relevant great-grants code is at
`apps/web/src/lib/services/grant-guru/client.ts` — specifically
`normalizeAuthResponseBody` + `decryptResponseFields`.
