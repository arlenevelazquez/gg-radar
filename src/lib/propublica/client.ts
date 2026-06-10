/**
 * ProPublica Nonprofit Explorer API client — free, public, no API key.
 *
 * https://projects.propublica.org/nonprofits/api
 *
 * Enriches a nonprofit (by name) with the financials from its most recent
 * IRS Form 990. Matching strategy (per product decision):
 *   - Search by name; ProPublica returns candidates ranked by relevance.
 *   - Reference ALL EINs found (kept in `candidates` for transparency).
 *   - Use the FIRST/best match for the financials.
 *   - Zero results -> "unmatched", never fabricate data.
 *
 * The API is unauthenticated and has no SLA; we set a short timeout and fail
 * soft (status "error") so a slow/unavailable lookup never blocks a radar run.
 */

const BASE = "https://projects.propublica.org/nonprofits/api/v2";
const TIMEOUT_MS = 8000;
const MAX_CANDIDATES = 5;

export interface Ein990Candidate {
  /** Formatted EIN, e.g. "26-2343206". */
  ein: string;
  name: string;
  state: string | null;
}

export interface Form990Financials {
  /** Tax period year of the filing these numbers come from. */
  fiscalYear: number | null;
  formType: "990" | "990-EZ" | "990-PF" | "other" | null;
  totalRevenue: number | null;
  totalExpenses: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  /** Grants/contributions paid — only populated for 990-PF (foundations). */
  grantsPaid: number | null;
  /** Direct link to the source 990 PDF on ProPublica, when available. */
  pdfUrl: string | null;
}

export interface Form990Block {
  status: "matched" | "unmatched" | "error";
  /** The first/best match used for the financials. Null when unmatched. */
  chosen: Ein990Candidate | null;
  /** Every EIN ProPublica returned for the name, for reference. */
  candidates: Ein990Candidate[];
  financials: Form990Financials | null;
  error?: string;
}

interface SearchOrg {
  ein?: number;
  name?: string;
  state?: string | null;
}

interface FilingWithData {
  tax_prd_yr?: number;
  formtype?: number;
  pdf_url?: string | null;
  totrevenue?: number | null;
  totfuncexpns?: number | null;
  totassetsend?: number | null;
  totliabend?: number | null;
  /** 990-PF: contributions, gifts, grants paid (per books). */
  contrpdpbks?: number | null;
}

function formatEin(ein: number | string): string {
  const digits = String(ein).replace(/\D/g, "").padStart(9, "0");
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

function mapFormType(formtype: number | undefined): Form990Financials["formType"] {
  switch (formtype) {
    case 0:
      return "990";
    case 1:
      return "990-EZ";
    case 2:
      return "990-PF";
    default:
      return formtype === undefined ? null : "other";
  }
}

function numOrNull(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Be a polite citizen on a free public API.
        "User-Agent": "GreatGrants-Radar/1.0 (+https://greatgrants.ai)",
      },
    });
    if (!res.ok) throw new Error(`ProPublica ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function searchOrganizations(name: string): Promise<Ein990Candidate[]> {
  const url = `${BASE}/search.json?q=${encodeURIComponent(name)}`;
  const data = await fetchJson<{ organizations?: SearchOrg[] }>(url);
  return (data.organizations ?? [])
    .filter((o): o is SearchOrg & { ein: number } => typeof o.ein === "number")
    .slice(0, MAX_CANDIDATES)
    .map((o) => ({
      ein: formatEin(o.ein),
      name: o.name ?? "",
      state: o.state ?? null,
    }));
}

/** Pick the most recent filing that has financial data. */
function latestFiling(filings: FilingWithData[]): FilingWithData | null {
  if (filings.length === 0) return null;
  return [...filings].sort((a, b) => (b.tax_prd_yr ?? 0) - (a.tax_prd_yr ?? 0))[0];
}

async function getFinancials(einFormatted: string): Promise<Form990Financials | null> {
  const einDigits = einFormatted.replace(/\D/g, "");
  const url = `${BASE}/organizations/${einDigits}.json`;
  const data = await fetchJson<{ filings_with_data?: FilingWithData[] }>(url);
  const filing = latestFiling(data.filings_with_data ?? []);
  if (!filing) return null;
  const formType = mapFormType(filing.formtype);
  return {
    fiscalYear: numOrNull(filing.tax_prd_yr),
    formType,
    totalRevenue: numOrNull(filing.totrevenue),
    totalExpenses: numOrNull(filing.totfuncexpns),
    totalAssets: numOrNull(filing.totassetsend),
    totalLiabilities: numOrNull(filing.totliabend),
    grantsPaid: formType === "990-PF" ? numOrNull(filing.contrpdpbks) : null,
    pdfUrl: filing.pdf_url ?? null,
  };
}

/**
 * Look up a nonprofit by name and return its latest-990 financials, the chosen
 * EIN, and all candidate EINs. Never throws — failures map to status "error".
 */
export async function enrich990(name: string): Promise<Form990Block> {
  try {
    const candidates = await searchOrganizations(name);
    if (candidates.length === 0) {
      return { status: "unmatched", chosen: null, candidates: [], financials: null };
    }
    const chosen = candidates[0];
    const financials = await getFinancials(chosen.ein);
    return { status: "matched", chosen, candidates, financials };
  } catch (err) {
    return {
      status: "error",
      chosen: null,
      candidates: [],
      financials: null,
      error: err instanceof Error ? err.message : "ProPublica lookup failed",
    };
  }
}
