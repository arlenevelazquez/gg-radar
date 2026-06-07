import type { NonprofitProfile } from "@/lib/grant-guru/prompt";

export interface ParentProfile {
  name: string;
  type: "corporation" | "foundation" | "individual" | "holding_company" | "other";
  /** One- or two-sentence description of the parent and its giving footprint. */
  description: string;
  /**
   * Named giving programs the parent runs (e.g. "True Inspiration Awards",
   * "Walmart Foundation Spark Good"). Empty if none identified.
   */
  givingPrograms: string[];
  /** Best-effort headquarters location, e.g. "Atlanta, GA". */
  headquarters?: string;
}

export type ConnectionType =
  /** The parent's own corporate foundation (e.g. The Home Depot Foundation, Walmart Foundation). */
  | "corporate_foundation"
  /** A founder/family nonprofit (e.g. Walton Family Foundation, WinShape Foundation). */
  | "family_foundation"
  /** Operationally tied nonprofit with separate branding (e.g. RMHC for McDonald's). */
  | "affiliated_nonprofit"
  | "other";

export interface ConnectedNonprofit extends NonprofitProfile {
  /**
   * One-sentence justification of the structural connection — e.g.
   * "The Cathy family's nonprofit umbrella, founded by S. Truett Cathy"
   * or "McDonald's-branded charity founded in 1974 with shared board ties".
   */
  relationship: string;
  connectionType: ConnectionType;
}

export interface ResearchResult {
  parent: ParentProfile;
  nonprofits: ConnectedNonprofit[];
  /** Two- to three-sentence narrative tying the picture together for the UI. */
  summary: string;
}
