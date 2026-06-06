"use client";

import { useState } from "react";
import { GreatGrantsLogo } from "@/components/foundations/logo/great-grants-logo";

interface ParentProfile {
  name: string;
  type: "corporation" | "foundation" | "individual" | "holding_company" | "other";
  description: string;
  givingPrograms: string[];
  headquarters?: string;
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
  grants: {
    status: "ok" | "error";
    qualifiedCount: number;
    rawCount: number;
    cappedAtLimit: boolean;
    top: TopGrant[];
    error?: string;
  };
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
  parent: ParentProfile;
  summary: string;
  nonprofits: Nonprofit[];
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

export default function Home() {
  const [parentName, setParentName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RadarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parentName.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/radar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent: parentName.trim() }),
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

  const totalQualified =
    result?.nonprofits.reduce(
      (sum, np) => sum + (np.grants.status === "ok" ? np.grants.qualifiedCount : 0),
      0
    ) ?? 0;

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <header className="mb-12">
          <GreatGrantsLogo className="text-brand-700 h-9 mb-6" />
          <h1 className="font-display text-5xl text-gray-900 tracking-tight mb-3">Grant Radar</h1>
          <p className="text-gray-600 text-lg max-w-2xl">
            Enter a parent company. We&apos;ll surface the nonprofits they founded or are structurally
            tied to — their corporate and family foundations — and show the top federal grants each
            one is currently eligible for.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 mb-12">
          <input
            type="text"
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
            placeholder="Enter a parent company, foundation, or family office"
            className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !parentName.trim()}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-6 py-3 rounded-lg transition-colors whitespace-nowrap"
          >
            Run Grant Radar
          </button>
        </form>

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
                <div className="text-right">
                  <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">
                    Connected nonprofits
                  </p>
                  <p className="font-display text-4xl text-brand-600">{result.nonprofits.length}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {totalQualified.toLocaleString("en-US")} qualified federal grant
                    {totalQualified === 1 ? "" : "s"}
                  </p>
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
                  Radar uses AI to scan public information about each nonprofit — match scores
                  reflect that thin signal. With a full organization profile inside Great Grants,
                  match quality improves substantially.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {result.nonprofits.map((np) => (
                    <NonprofitCard key={np.name} np={np} />
                  ))}
                </div>

                <section className="bg-gradient-to-br from-brand-50 to-white border border-brand-100 rounded-2xl p-8 text-center">
                  <p className="text-xs uppercase tracking-widest text-brand-700 mb-2 font-medium">
                    These are public-research matches
                  </p>
                  <h3 className="font-display text-2xl text-gray-900 mb-3">
                    Great Grants finds the matches Radar can&apos;t
                  </h3>
                  <p className="text-gray-600 max-w-xl mx-auto mb-6 leading-relaxed">
                    Radar runs on public web data — a thin signal. When a nonprofit connects their
                    full organization profile, real program narratives, target populations, and
                    geography, Great Grants surfaces dramatically higher-confidence matches and
                    grants Radar can&apos;t see.
                  </p>
                  <a
                    href="https://greatgrants.ai"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block bg-brand-600 hover:bg-brand-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
                  >
                    See it in Great Grants →
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

function NonprofitCard({ np }: { np: Nonprofit }) {
  return (
    <article className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-display text-lg text-gray-900 leading-tight">{np.name}</h3>
        <span className="shrink-0 bg-brand-50 text-brand-700 text-[10px] font-medium px-2 py-0.5 rounded-full border border-brand-100 uppercase tracking-wider">
          {CONNECTION_LABEL[np.connectionType]}
        </span>
      </div>
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
        {np.grants.status === "error" ? (
          <div className="text-xs text-red-600">Grant lookup failed: {np.grants.error}</div>
        ) : (
          <>
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-xs uppercase tracking-widest text-gray-500">
                Top {np.grants.top.length} federal grant{np.grants.top.length === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-gray-600">
                <span className="font-semibold text-brand-700">{np.grants.qualifiedCount}</span>{" "}
                qualified <span className="text-gray-400">(≥50%)</span>
              </p>
            </div>
            {np.grants.top.length === 0 ? (
              <p className="text-xs text-gray-500">No grant matches returned.</p>
            ) : (
              <ol className="space-y-3">
                {np.grants.top.map((g, i) => {
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
                        {g.url ? (
                          <a
                            href={g.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-gray-900 hover:text-brand-700 leading-snug block"
                          >
                            {g.programName}
                          </a>
                        ) : (
                          <p className="font-medium text-gray-900 leading-snug">{g.programName}</p>
                        )}
                        {g.agency && (
                          <p className="text-gray-500 text-[11px] mt-0.5 truncate">{g.agency}</p>
                        )}
                        {meta.length > 0 && (
                          <p className="text-gray-500 text-[11px] mt-0.5">
                            {meta.join(" · ")}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </div>
    </article>
  );
}
