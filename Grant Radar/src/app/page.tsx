"use client";

import { useState } from "react";
import { GrantOpportunity } from "@/lib/grants-gov";

interface OrgHierarchyNode {
  name: string;
  role: string;
  description: string;
  parentName?: string;
}

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
  type: "nonprofit" | "fund" | "investor" | "corporate" | "ambiguous";
  summary: string;
  orgHierarchy: OrgHierarchyNode[];
  entities: EntityResult[];
  totalPool: number;
}

// ─── Org Hierarchy Tree ───────────────────────────────────────────────────────

function OrgTree({
  nodes,
  entities,
  onSelect,
  selectedName,
}: {
  nodes: OrgHierarchyNode[];
  entities: EntityResult[];
  onSelect: (name: string) => void;
  selectedName: string | null;
}) {
  const grantCounts = new Map(entities.map((e) => [e.name, e.grants.length]));

  // Build child map from flat list.
  const childMap = new Map<string | undefined, OrgHierarchyNode[]>();
  for (const node of nodes) {
    const key = node.parentName;
    if (!childMap.has(key)) childMap.set(key, []);
    childMap.get(key)!.push(node);
  }

  // Root = nodes with no parentName.
  const roots = childMap.get(undefined) ?? [];

  function TreeNode({
    node,
    depth,
  }: {
    node: OrgHierarchyNode;
    depth: number;
  }) {
    const children = childMap.get(node.name) ?? [];
    const grantCount = grantCounts.get(node.name) ?? 0;
    const isSelected = selectedName === node.name;
    const hasGrants = grantCount > 0;

    return (
      <div>
        <button
          onClick={() => hasGrants && onSelect(node.name)}
          className={`w-full text-left group flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors ${
            isSelected
              ? "bg-brand-50 border border-brand-200"
              : hasGrants
              ? "hover:bg-gray-50 cursor-pointer"
              : "cursor-default"
          }`}
          style={{ paddingLeft: `${12 + depth * 24}px` }}
        >
          {/* Tree connector */}
          <div className="mt-1 shrink-0 flex flex-col items-center">
            <div
              className={`w-2 h-2 rounded-full border-2 ${
                isSelected
                  ? "border-brand-600 bg-brand-600"
                  : hasGrants
                  ? "border-brand-400 bg-brand-50"
                  : "border-gray-300 bg-white"
              }`}
            />
            {children.length > 0 && (
              <div className="w-px flex-1 bg-gray-200 mt-1 min-h-[8px]" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`font-medium text-sm ${
                  isSelected ? "text-brand-700" : "text-gray-900"
                }`}
              >
                {node.name}
              </span>
              <span className="text-xs text-gray-400 capitalize">{node.role}</span>
              {hasGrants && (
                <span className="grant-count-badge text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100">
                  {grantCount} grant{grantCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {node.description && (
              <p className="text-xs text-gray-500 mt-0.5 leading-snug">{node.description}</p>
            )}
          </div>
        </button>

        {children.map((child) => (
          <TreeNode key={child.name} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  if (nodes.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-gray-500 font-medium">
          Organization Hierarchy
        </p>
        <p className="text-xs text-gray-400">{nodes.length} org{nodes.length !== 1 ? "s" : ""} mapped</p>
      </div>
      <div className="p-3 space-y-0.5">
        {roots.map((root) => (
          <TreeNode key={root.name} node={root} depth={0} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [inputName, setInputName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RadarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputName.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setSelectedOrg(null);

    try {
      const res = await fetch("/api/radar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: inputName.trim() }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data: RadarResponse = await res.json();
      setResult(data);
      // Auto-select the first entity with grants.
      const first = data.entities.find((e) => e.grants.length > 0);
      if (first) setSelectedOrg(first.name);
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

  // Entities to show: if one is selected, show only that; otherwise show all.
  const visibleEntities = result
    ? selectedOrg
      ? result.entities.filter((e) => e.name === selectedOrg)
      : result.entities
    : [];

  // The root org is the hierarchy node with no parentName (the searched entity).
  const parentOrgName = result?.orgHierarchy?.find((n) => !n.parentName)?.name ?? null;

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="max-w-5xl mx-auto px-6 py-16">
        {/* Header */}
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
            Enter a nonprofit, fund, or funder — we map the organizational ecosystem, match
            federal grants for each org, and explain why each one fits.
          </p>
        </div>

        {/* Search form */}
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
          <div className="space-y-8">
            {/* Summary row */}
            <div className="flex items-center justify-between">
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

            {/* Summary text */}
            {result.summary && (
              <p className="text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-xl p-5">
                {result.summary}
              </p>
            )}

            {/* Two-column layout: tree + grants */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              {/* Org hierarchy tree */}
              {result.orgHierarchy.length > 0 && (
                <div className="w-full lg:w-72 shrink-0">
                  <OrgTree
                    nodes={result.orgHierarchy}
                    entities={result.entities}
                    onSelect={(name) =>
                      setSelectedOrg((prev) => (prev === name ? null : name))
                    }
                    selectedName={selectedOrg}
                  />
                  {selectedOrg && (
                    <button
                      onClick={() => setSelectedOrg(null)}
                      className="mt-2 w-full text-xs text-gray-500 hover:text-brand-600 transition-colors py-1"
                    >
                      Show all organizations ↓
                    </button>
                  )}
                </div>
              )}

              {/* Entity cards */}
              <div className="flex-1 space-y-8">
                {visibleEntities.length === 0 && (
                  <p className="text-gray-500 text-sm py-8 text-center">
                    Select an organization from the hierarchy to view its grants.
                  </p>
                )}

                {visibleEntities.map((entity, i) => {
                  const isParent = entity.name === parentOrgName;
                  return (
                  <div
                    key={i}
                    className={`rounded-xl p-6 shadow-sm border ${
                      isParent
                        ? "bg-brand-50 border-brand-100"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h2 className="font-display text-2xl text-gray-900">{entity.name}</h2>
                      {isParent && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-brand-600 text-white shrink-0">
                          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                            <circle cx="6" cy="3" r="2" />
                            <circle cx="2.5" cy="9" r="1.5" />
                            <circle cx="9.5" cy="9" r="1.5" />
                            <line x1="6" y1="5" x2="2.5" y2="7.5" stroke="currentColor" strokeWidth="1" />
                            <line x1="6" y1="5" x2="9.5" y2="7.5" stroke="currentColor" strokeWidth="1" />
                          </svg>
                          Parent Organization
                        </span>
                      )}
                    </div>
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
                          <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">
                            EIN
                          </p>
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
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
