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
  /**
   * What the parent organization itself does, framed for grant matching —
   * its programmatic / charitable mission, not its giving footprint. Used to
   * run a federal-grant search on the parent entity directly.
   */
  mission: string;
  /** 3-6 program / focus areas the parent operates, for grant matching. */
  programs: string[];
  /** Populations the parent serves, if applicable. */
  populations?: string[];
  /** Structured HQ location for the grant-search location filter. */
  location?: {
    city?: string;
    /** 2-letter US state code, e.g. "GA" — or null if national/unknown. */
    state?: string | null;
    /** ISO country, default "US". */
    country?: string;
  };
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
