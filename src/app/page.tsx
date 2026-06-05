"use client";

import { useState } from "react";
import { GrantOpportunity } from "@/lib/grants-gov";

interface VettedGrant extends GrantOpportunity {
  relevanceReason: string;
  matchScore: number;
}

interface EntityResult {
  name: string;
  profile: {
    mission: string;
    location: string;
    estimatedBudget: string;
    programAreas: string[];
    ein?: string;
  };
  grants: VettedGrant[];
}

interface RadarResponse {
  type: "nonprofit" | "fund" | "investor" | "ambiguous";
  summary: string;
  entities: EntityResult[];
  totalPool: number;
}

export default function Home() {
  const [inputName, setInputName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RadarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputName.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/radar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: inputName.trim() }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data: RadarResponse = await res.json();
      setResult(data);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(amount: number) {
    if (!amount) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white font-display text-lg">
              G
            </div>
            <span className="text-xs text-gray-500 font-medium tracking-widest uppercase">
              GreatGrants.ai
            </span>
          </div>
          <h1 className="font-display text-5xl text-gray-900 tracking-tight mb-3">Grant Radar</h1>
          <p className="text-gray-600 text-lg max-w-2xl">
            Enter a nonprofit, fund, or funder — we research them, match relevant federal grants,
            and explain why each one fits.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 mb-12">
          <input
            type="text"
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
            placeholder="Enter a nonprofit, fund, or funder name"
            className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !inputName.trim()}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-6 py-3 rounded-lg transition-colors whitespace-nowrap"
          >
            Run Grant Radar
          </button>
        </form>

        {loading && (
          <div className="text-center py-20">
            <div className="inline-block w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-gray-500">Researching… (2–5 min)</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <span className="text-xs uppercase tracking-widest text-gray-500 mr-3">
                  Classified as
                </span>
                <span className="bg-brand-50 text-brand-700 text-sm font-medium px-3 py-1 rounded-full border border-brand-100 capitalize">
                  {result.type}
                </span>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">
                  Total Accessible Pool
                </p>
                <p className="font-display text-3xl text-brand-600">
                  {formatCurrency(result.totalPool)}
                </p>
              </div>
            </div>

            {result.summary && (
              <p className="text-gray-700 leading-relaxed mb-8 bg-gray-50 border border-gray-200 rounded-xl p-5">
                {result.summary}
              </p>
            )}

            <div className="space-y-10">
              {result.entities.map((entity, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <h2 className="font-display text-2xl text-gray-900 mb-1">{entity.name}</h2>
                  <p className="text-gray-600 text-sm mb-5">{entity.profile.mission}</p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">
                        Location
                      </p>
                      <p className="text-sm text-gray-700">{entity.profile.location}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">
                        Est. Budget
                      </p>
                      <p className="text-sm text-gray-700">{entity.profile.estimatedBudget}</p>
                    </div>
                    {entity.profile.ein && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">EIN</p>
                        <p className="text-sm text-gray-700">{entity.profile.ein}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">
                        Program Areas
                      </p>
                      <p className="text-sm text-gray-700">
                        {entity.profile.programAreas.slice(0, 3).join(", ")}
                      </p>
                    </div>
                  </div>

                  {entity.grants.length > 0 ? (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">
                        {entity.grants.length} Matched Grant
                        {entity.grants.length !== 1 ? "s" : ""}
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-500 text-xs uppercase tracking-widest border-b border-gray-200">
                              <th className="pb-3 pr-4 font-medium">Title</th>
                              <th className="pb-3 pr-4 font-medium">Why it matches</th>
                              <th className="pb-3 pr-4 font-medium">Agency</th>
                              <th className="pb-3 pr-4 font-medium text-right">Award Ceiling</th>
                              <th className="pb-3 font-medium">Close Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entity.grants.map((grant, j) => (
                              <tr
                                key={j}
                                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                              >
                                <td className="py-3 pr-4 text-gray-900 max-w-xs">
                                  <div className="flex items-start gap-2">
                                    <span
                                      className="mt-0.5 shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-100"
                                      title="Match score (1–5)"
                                    >
                                      {grant.matchScore}/5
                                    </span>
                                    <div>
                                      <p className="font-medium leading-snug">
                                        {grant.opportunityTitle}
                                      </p>
                                      {grant.opportunityNumber && (
                                        <p className="text-gray-500 text-xs mt-0.5">
                                          {grant.opportunityNumber}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 pr-4 text-gray-600 max-w-sm text-xs leading-snug">
                                  {grant.relevanceReason}
                                </td>
                                <td className="py-3 pr-4 text-gray-600">{grant.agencyName}</td>
                                <td className="py-3 pr-4 text-right text-brand-700 font-medium">
                                  {formatCurrency(grant.awardCeiling)}
                                </td>
                                <td className="py-3 text-gray-600">{grant.closeDate}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">
                      No active federal grants matched at this time.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
