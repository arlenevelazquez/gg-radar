"use client";

import { useState, useSyncExternalStore } from "react";
import { GreatGrantsLogo } from "@/components/foundations/logo/great-grants-logo";
import { ExportButtons } from "@/app/_components/ExportButtons";

interface ParentProfile {
  name: string;
  type: "corporation" | "foundation" | "individual" | "holding_company" | "other";
  description: string;
  givingPrograms: string[];
  headquarters?: string;
  mission: string;
  programs: string[];
  populations?: string[];
  location?: { city?: string; state?: string | null; country?: string };
}

interface GrantsBlock {
  status: "ok" | "error";
  qualifiedCount: number;
  qualifiedFundingTotal: number | null;
  rawCount: number;
  cappedAtLimit: boolean;
  top: TopGrant[];
  error?: string;
}

interface Ein990Candidate {
  ein: string;
  name: string;
  state: string | null;
}

interface Form990Block {
  status: "matched" | "unmatched" | "error";
  chosen: Ein990Candidate | null;
  candidates: Ein990Candidate[];
  financials: {
    fiscalYear: number | null;
    formType: "990" | "990-EZ" | "990-PF" | "other" | null;
    totalRevenue: number | null;
    totalExpenses: number | null;
    totalAssets: number | null;
    totalLiabilities: number | null;
    grantsPaid: number | null;
    pdfUrl: string | null;
  } | null;
  error?: string;
}

type MatchQuality = "excellent" | "good" | "possible" | "weak";

interface TopGrant {
  guid: string;
  programName: string;
  agency: string | null;
  fundingDisplay: string | null;
  closingDateDisplay: string | null;
  closingInfo: string | null;
  difficulty: string | null;
  competitive: boolean | null;
  url: string | null;
  matchScore: number | null;
  matchQuality: MatchQuality | null;
}

interface Nonprofit {
  name: string;
  mission: string;
  programs: string[];
  populations?: string[];
  location?: { city?: string; state?: string | null; country?: string };
  relationship: string;
  connectionType: "corporate_foundation" | "family_foundation" | "affiliated_nonprofit" | "other";
  grants: GrantsBlock;
  financials?: Form990Block;
}

function formatCurrencyShort(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (amount >= 1_000) {
    return `$${Math.round(amount / 1_000)}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

const QUALITY_BADGE: Record<MatchQuality, { label: string; className: string }> = {
  excellent: {
    label: "Excellent",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  good: {
    label: "Good",
    className: "bg-brand-50 text-brand-700 border-brand-100",
  },
  possible: {
    label: "Possible",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  weak: {
    label: "Weak",
    className: "bg-gray-100 text-gray-500 border-gray-200",
  },
};

interface RadarResponse {
  parent: ParentProfile & { grants: GrantsBlock; financials?: Form990Block };
  summary: string;
  nonprofits: Nonprofit[];
}

interface EntityCandidate {
  label: string;
  detail: string;
  query: string;
  kind: "corporation" | "foundation" | "individual" | "family" | "holding_company" | "other";
}

const PARENT_TYPE_LABEL: Record<ParentProfile["type"], string> = {
  corporation: "Corporation",
  foundation: "Foundation",
  individual: "Individual donor",
  holding_company: "Holding company",
  other: "Other",
};

const CONNECTION_LABEL: Record<Nonprofit["connectionType"], string> = {
  corporate_foundation: "Corporate foundation",
  family_foundation: "Family foundation",
  affiliated_nonprofit: "Affiliated nonprofit",
  other: "Tied nonprofit",
};

function locationText(loc?: Nonprofit["location"]): string {
  if (!loc) return "—";
  const parts = [loc.city, loc.state].filter(Boolean);
  if (parts.length === 0) return loc.country?.toUpperCase() ?? "—";
  return parts.join(", ");
}

function nonprofitAnchorId(name: string): string {
  return `np-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export default function Home() {
  const [parentName, setParentName] = useState("");
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [candidates, setCandidates] = useState<EntityCandidate[] | null>(null);
  const [result, setResult] = useState<RadarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Defer empty-input gating until after mount so SSR/CSR render the same
  // initial `disabled` value (Turbopack + extensions can otherwise diverge here).
  const hasMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  /** Run the full radar pipeline on an (already disambiguated) entity query. */
  async function runRadar(query: string) {
    setCandidates(null);
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/radar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent: query }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      setResult((await res.json()) as RadarResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = parentName.trim();
    if (!q) return;
    setResult(null);
    setError(null);
    setCandidates(null);
    setResolving(true);

    // "Did you mean?" pre-step: resolve the query into candidate entities.
    // 1 candidate → research it directly. >1 → let the user pick. On any
    // failure, fall back to researching the raw input so we never block.
    let chosen = q;
    try {
      const res = await fetch("/api/radar/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent: q }),
      });
      if (res.ok) {
        const data = (await res.json()) as { candidates?: EntityCandidate[] };
        const cands = data.candidates ?? [];
        if (cands.length > 1) {
          setCandidates(cands);
          setResolving(false);
          return;
        }
        if (cands.length === 1) chosen = cands[0].query;
      }
    } catch {
      // fall through and research the raw input
    }
    setResolving(false);
    await runRadar(chosen);
  }

  const totalQualified =
    result?.nonprofits.reduce(
      (sum, np) => sum + (np.grants.status === "ok" ? np.grants.qualifiedCount : 0),
      0
    ) ?? 0;

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <header className="mb-12">
          <GreatGrantsLogo tagline="Radar" className="text-brand-700 h-9 mb-6" />
          <h1 className="font-display text-5xl text-gray-900 tracking-tight mb-3">Grant Radar</h1>
          <p className="text-gray-600 text-lg max-w-2xl">
            Enter a parent company. We&apos;ll surface the nonprofits they founded or are structurally
            tied to, including their corporate and family foundations, and show the top federal
            grants each one is currently eligible for.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 mb-12">
          <input
            type="text"
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
            placeholder="Enter a parent company, foundation, or family office"
            className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors"
            disabled={loading || resolving}
          />
          <button
            type="submit"
            disabled={loading || resolving || (hasMounted && !parentName.trim())}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-6 py-3 rounded-lg transition-colors whitespace-nowrap"
          >
            Run Grant Radar
          </button>
        </form>

        {resolving && (
          <div className="text-center py-20">
            <div className="inline-block w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-gray-500">Identifying the entity…</p>
          </div>
        )}

        {candidates && !loading && !resolving && (
          <DisambiguationPicker candidates={candidates} onPick={runRadar} />
        )}

        {loading && (
          <div className="text-center py-20">
            <div className="inline-block w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-gray-500">Researching the parent and its nonprofit network… (1–3 min)</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-10">
            {/* Parent hero */}
            <section className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                  <span className="text-xs uppercase tracking-widest text-gray-500 mb-1 block">
                    Parent entity
                  </span>
                  <h2 className="font-display text-3xl text-gray-900 mb-1">{result.parent.name}</h2>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-brand-50 text-brand-700 text-xs font-medium px-2.5 py-1 rounded-full border border-brand-100">
                      {PARENT_TYPE_LABEL[result.parent.type]}
                    </span>
                    {result.parent.headquarters && (
                      <span className="text-xs text-gray-500">📍 {result.parent.headquarters}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-6">
                  {result.nonprofits.length > 0 && (
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">
                        Connected nonprofits
                      </p>
                      <p className="font-display text-4xl text-brand-600">
                        {result.nonprofits.length}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {totalQualified.toLocaleString("en-US")} qualified federal grant
                        {totalQualified === 1 ? "" : "s"}
                      </p>
                    </div>
                  )}
                  <ExportButtons response={result} />
                </div>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">{result.parent.description}</p>
              {result.parent.givingPrograms.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs text-gray-500 self-center mr-1">Giving programs:</span>
                  {result.parent.givingPrograms.map((p) => (
                    <span
                      key={p}
                      className="bg-white text-gray-700 text-xs font-medium px-2.5 py-1 rounded-full border border-gray-200"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              )}
              {result.summary && (
                <p className="text-sm text-gray-600 italic mt-4 pt-4 border-t border-gray-200">
                  {result.summary}
                </p>
              )}
            </section>

            {/* Ecosystem map */}
            {result.nonprofits.length > 0 && (
              <EcosystemMap parent={result.parent} nonprofits={result.nonprofits} />
            )}

            {/* Parent grant results — the parent entity searched directly */}
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">
                Parent organization grants
              </p>
              <ParentCard parent={result.parent} />
            </div>

            {/* Nonprofit cards */}
            {result.nonprofits.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 border border-gray-200 rounded-xl">
                <p className="text-gray-600 font-medium mb-1">
                  No structurally-tied nonprofits identified.
                </p>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                  This parent doesn&apos;t appear to operate its own foundation or affiliated
                  nonprofit. See the summary above for what we found about their philanthropic
                  structure.
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 italic leading-relaxed -mt-4">
                  Radar uses AI to scan public information about each nonprofit, so match scores
                  reflect that thin signal. With a full organization profile inside Great Grants,
                  match quality improves substantially.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {result.nonprofits.map((np) => (
                    <NonprofitCard key={np.name} np={np} />
                  ))}
                </div>

                <section className="bg-gradient-to-br from-brand-50 to-white border border-brand-100 rounded-2xl p-8 text-center">
                  <GreatGrantsLogo className="text-brand-700 h-10 mx-auto mb-5" />
                  <p className="text-xs uppercase tracking-widest text-brand-700 mb-2 font-medium">
                    These are public-research matches
                  </p>
                  <h3 className="font-display text-2xl text-gray-900 mb-3">
                    Great Grants finds the matches Radar can&apos;t
                  </h3>
                  <p className="text-gray-600 max-w-xl mx-auto mb-6 leading-relaxed">
                    Radar runs on public web data, which is a thin signal. When a nonprofit
                    connects their full organization profile with real program narratives, target
                    populations, and geography, Great Grants surfaces dramatically higher-confidence
                    matches and grants Radar can&apos;t see.
                  </p>
                  <a
                    href="https://greatgrants.ai"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block bg-brand-600 hover:bg-brand-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
                  >
                    Check out Great Grants →
                  </a>
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function DisambiguationPicker({
  candidates,
  onPick,
}: {
  candidates: EntityCandidate[];
  onPick: (query: string) => void;
}) {
  return (
    <div className="mb-12">
      <p className="text-sm text-gray-700 mb-1 font-medium">
        More than one entity matches that name — which did you mean?
      </p>
      <p className="text-xs text-gray-500 mb-4">
        Pick one to run Grant Radar on the right organization.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {candidates.map((c) => (
          <button
            key={c.query}
            type="button"
            onClick={() => onPick(c.query)}
            className="text-left bg-white border border-gray-200 hover:border-brand-300 hover:bg-brand-50/60 rounded-lg p-4 transition-colors"
          >
            <p className="font-medium text-gray-900 leading-snug">{c.label}</p>
            <p className="text-xs text-gray-500 mt-1 leading-snug">{c.detail}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function EcosystemMap({
  parent,
  nonprofits,
}: {
  parent: ParentProfile;
  nonprofits: Nonprofit[];
}) {
  const n = nonprofits.length;
  // With flex-1 children, the center of the leftmost child sits at 1/(2n)
  // of the row width, and the rightmost at (2n-1)/(2n). So the horizontal
  // connector spans the row inset by 50/n % on each side.
  const sideInset = `${50 / n}%`;
  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-6">
      <p className="text-xs uppercase tracking-widest text-gray-500 mb-5 text-center">
        Ecosystem map
      </p>
      <div className="overflow-x-auto">
        <div className="flex flex-col items-stretch min-w-[480px]">
          {/* Parent node */}
          <div className="flex justify-center">
            <div className="bg-brand-50 border border-brand-200 rounded-lg px-4 py-2 text-center max-w-xs">
              <p className="text-[10px] uppercase tracking-widest text-brand-700 font-medium mb-0.5">
                {PARENT_TYPE_LABEL[parent.type]}
              </p>
              <p className="font-display text-base text-gray-900 leading-snug">{parent.name}</p>
            </div>
          </div>
          {/* Stem from parent down to the horizontal connector */}
          <div className="h-4 w-px bg-gray-300 mx-auto" aria-hidden />
          {/* Horizontal connector between first and last child centers (skipped for n=1) */}
          {n > 1 && (
            <div
              className="h-px bg-gray-300"
              style={{ marginLeft: sideInset, marginRight: sideInset }}
              aria-hidden
            />
          )}
          {/* Children row */}
          <div className="flex items-stretch">
            {nonprofits.map((np) => (
              <div key={np.name} className="flex-1 flex flex-col items-center px-1.5">
                <div className="h-4 w-px bg-gray-300" aria-hidden />
                <a
                  href={`#${nonprofitAnchorId(np.name)}`}
                  className="block w-full max-w-[200px] bg-white border border-gray-200 hover:border-brand-300 hover:bg-brand-50/60 rounded-lg px-3 py-2 text-center transition-colors"
                >
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
                    {CONNECTION_LABEL[np.connectionType]}
                  </p>
                  <p className="text-xs font-medium text-gray-900 leading-snug line-clamp-2">
                    {np.name}
                  </p>
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Funding headline ($X possible · N qualified grants). Shared by parent + nonprofit cards. */
function FundingHeadline({ grants }: { grants: GrantsBlock }) {
  if (grants.status !== "ok" || grants.qualifiedFundingTotal === null) return null;
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <span className="font-display text-2xl text-brand-700 leading-none">
        {formatCurrencyShort(grants.qualifiedFundingTotal)}
      </span>
      <span className="text-[11px] text-gray-500 leading-tight">
        possible · {grants.qualifiedCount} qualified grant
        {grants.qualifiedCount === 1 ? "" : "s"}
      </span>
    </div>
  );
}

/** "Top N federal grants" list. Shared by parent + nonprofit cards. */
function GrantsDetail({ grants }: { grants: GrantsBlock }) {
  if (grants.status === "error") {
    return <div className="text-xs text-red-600">Grant lookup failed: {grants.error}</div>;
  }
  return (
    <>
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs uppercase tracking-widest text-gray-500">
          Top {grants.top.length} federal grant{grants.top.length === 1 ? "" : "s"}
        </p>
        <p className="text-xs text-gray-600">
          <span className="font-semibold text-brand-700">{grants.qualifiedCount}</span>{" "}
          qualified <span className="text-gray-400">(≥50%)</span>
        </p>
      </div>
      {grants.top.length === 0 ? (
        <p className="text-xs text-gray-500">No grant matches returned.</p>
      ) : (
        <ol className="space-y-3">
          {grants.top.map((g, i) => {
            const badge = g.matchQuality ? QUALITY_BADGE[g.matchQuality] : null;
            const meta: string[] = [];
            if (g.fundingDisplay) meta.push(g.fundingDisplay);
            if (g.closingDateDisplay) meta.push(`closes ${g.closingDateDisplay}`);
            else if (g.closingInfo) meta.push(g.closingInfo);
            if (g.difficulty) meta.push(g.difficulty);
            if (g.competitive === true) meta.push("Competitive");
            return (
              <li key={g.guid} className="text-xs flex items-start gap-2">
                <span className="shrink-0 w-4 text-right text-gray-400 mt-0.5 font-medium">
                  {i + 1}.
                </span>
                {badge && (
                  <span
                    className={`shrink-0 mt-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded border ${badge.className}`}
                  >
                    {g.matchScore}%
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 leading-snug">{g.programName}</p>
                  {g.agency && (
                    <p className="text-gray-500 text-[11px] mt-0.5 truncate">{g.agency}</p>
                  )}
                  {meta.length > 0 && (
                    <p className="text-gray-500 text-[11px] mt-0.5">{meta.join(" · ")}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

/** Latest-990 financials from ProPublica. Shared by parent + nonprofit cards. */
function Financials990({ data }: { data?: Form990Block }) {
  if (!data || data.status !== "matched" || !data.financials || !data.chosen) return null;
  const f = data.financials;
  const stats: Array<[string, number | null]> = [
    ["Revenue", f.totalRevenue],
    ["Expenses", f.totalExpenses],
    ["Assets", f.totalAssets],
  ];
  if (f.grantsPaid !== null) stats.push(["Grants paid", f.grantsPaid]);
  const otherCount = data.candidates.length - 1;

  return (
    <div className="pt-4 border-t border-gray-100">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-xs uppercase tracking-widest text-gray-500">
          Financials{f.fiscalYear ? ` · FY ${f.fiscalYear}` : ""}
        </p>
        {f.formType && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-gray-50 text-gray-600 border-gray-200">
            Form {f.formType}
          </span>
        )}
      </div>
      <dl className={`grid gap-2 mb-2 ${stats.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
        {stats.map(([label, value]) => (
          <div key={label} className="text-center">
            <dd className="font-display text-base text-gray-900 leading-none">
              {value === null ? "—" : formatCurrencyShort(value)}
            </dd>
            <dt className="text-[10px] uppercase tracking-wider text-gray-400 mt-1">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="text-[10px] text-gray-400 leading-snug">
        EIN {data.chosen.ein}
        {otherCount > 0 && ` · +${otherCount} other candidate${otherCount === 1 ? "" : "s"}`}
        {f.pdfUrl && (
          <>
            {" · "}
            <a
              href={f.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 hover:text-brand-700 underline"
            >
              View 990 ↗
            </a>
          </>
        )}
        {" · via ProPublica"}
      </p>
    </div>
  );
}

/** Grant results for the parent entity itself, rendered as its own distinct card. */
function ParentCard({
  parent,
}: {
  parent: ParentProfile & { grants: GrantsBlock; financials?: Form990Block };
}) {
  const programs = parent.programs ?? [];
  return (
    <article
      id="parent-org"
      className="bg-white border-2 border-brand-200 rounded-xl p-6 shadow-sm scroll-mt-8 target:ring-2 target:ring-brand-400 target:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-brand-700 font-medium block mb-0.5">
            Parent entity
          </span>
          <h3 className="font-display text-xl text-gray-900 leading-tight">{parent.name}</h3>
        </div>
        <span className="shrink-0 bg-brand-50 text-brand-700 text-[10px] font-medium px-2 py-0.5 rounded-full border border-brand-100 uppercase tracking-wider">
          {PARENT_TYPE_LABEL[parent.type]}
        </span>
      </div>
      <FundingHeadline grants={parent.grants} />
      {parent.headquarters && (
        <p className="text-xs text-gray-500 mb-3">📍 {parent.headquarters}</p>
      )}
      <p className="text-sm text-gray-600 leading-relaxed mb-3">
        {parent.mission?.trim() || parent.description}
      </p>

      {programs.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {programs.slice(0, 6).map((p) => (
            <span
              key={p}
              className="bg-gray-100 text-gray-700 text-[10px] font-medium px-2 py-0.5 rounded"
            >
              {p}
            </span>
          ))}
        </div>
      )}

      <div className="pt-4 border-t border-gray-100">
        <GrantsDetail grants={parent.grants} />
      </div>
      <Financials990 data={parent.financials} />
    </article>
  );
}

function NonprofitCard({ np }: { np: Nonprofit }) {
  return (
    <article
      id={nonprofitAnchorId(np.name)}
      className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col scroll-mt-8 target:ring-2 target:ring-brand-400 target:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-display text-lg text-gray-900 leading-tight">{np.name}</h3>
        <span className="shrink-0 bg-brand-50 text-brand-700 text-[10px] font-medium px-2 py-0.5 rounded-full border border-brand-100 uppercase tracking-wider">
          {CONNECTION_LABEL[np.connectionType]}
        </span>
      </div>
      <FundingHeadline grants={np.grants} />
      <p className="text-xs text-gray-500 mb-3">{locationText(np.location)}</p>
      <p className="text-sm text-gray-600 leading-relaxed mb-3 line-clamp-3">{np.mission}</p>
      <p className="text-xs text-gray-500 italic mb-4 border-l-2 border-gray-200 pl-2">
        {np.relationship}
      </p>

      {np.programs.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {np.programs.slice(0, 4).map((p) => (
            <span
              key={p}
              className="bg-gray-100 text-gray-700 text-[10px] font-medium px-2 py-0.5 rounded"
            >
              {p}
            </span>
          ))}
        </div>
      )}

      <div className="pt-4 border-t border-gray-100">
        <GrantsDetail grants={np.grants} />
      </div>
      <Financials990 data={np.financials} />
    </article>
  );
}
