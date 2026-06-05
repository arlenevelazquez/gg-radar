export interface GrantOpportunity {
  opportunityNumber: string;
  opportunityTitle: string;
  agencyName: string;
  closeDate: string;
  awardCeiling: number;
  awardFloor: number;
  description: string;
  cfda: string[];
}

export async function searchGrants(keyword: string, rows = 25): Promise<GrantOpportunity[]> {
  try {
    const response = await fetch("https://api.grants.gov/v1/api/search2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, oppStatuses: "posted", rows }),
    });

    if (!response.ok) {
      const fallback = await fetch("https://apply07.grants.gov/grantsws/rest/opportunities/search/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, oppStatuses: "posted", rows }),
      });
      if (!fallback.ok) return [];
      const data = await fallback.json();
      return parseOpportunities(data);
    }

    const data = await response.json();
    return parseOpportunities(data);
  } catch {
    return [];
  }
}

function parseOpportunities(data: Record<string, unknown>): GrantOpportunity[] {
  // grants.gov v1 API: data.oppHits
  // fallback shapes for older/alternate endpoints
  const inner = (data?.data as Record<string, unknown>) || data;
  const hits =
    (inner?.oppHits as Record<string, unknown>[] | undefined) ||
    (inner?.hits as Record<string, unknown>[] | undefined) ||
    (data?.opportunities as Record<string, unknown>[] | undefined) ||
    [];

  return hits.map((h: Record<string, unknown>) => ({
    opportunityNumber: String(h.number || h.opportunityNumber || h.oppNumber || ""),
    opportunityTitle: String(h.title || h.opportunityTitle || ""),
    agencyName: String(h.agency || h.agencyName || h.agencyCode || ""),
    closeDate: String(h.closeDate || h.closingDate || ""),
    awardCeiling: Number(h.awardCeiling || 0),
    awardFloor: Number(h.awardFloor || 0),
    description: String(h.synopsis || h.description || ""),
    cfda: Array.isArray(h.cfdaList)
      ? (h.cfdaList as (string | Record<string, unknown>)[]).map((c) =>
          typeof c === "string" ? c : String((c as Record<string, unknown>).programTitle || c)
        )
      : [],
  }));
}
