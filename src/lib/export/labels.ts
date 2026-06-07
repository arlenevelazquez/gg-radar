import type { ParentProfile, ConnectionType } from "@/lib/agent/types";
import type { MatchQuality } from "@/app/api/radar/route";

export const PARENT_TYPE_LABEL: Record<ParentProfile["type"], string> = {
  corporation: "Corporation",
  foundation: "Foundation",
  individual: "Individual donor",
  holding_company: "Holding company",
  other: "Other",
};

export const CONNECTION_LABEL: Record<ConnectionType, string> = {
  corporate_foundation: "Corporate foundation",
  family_foundation: "Family foundation",
  affiliated_nonprofit: "Affiliated nonprofit",
  other: "Tied nonprofit",
};

export const MATCH_QUALITY_LABEL: Record<MatchQuality, string> = {
  excellent: "Excellent",
  good: "Good",
  possible: "Possible",
  weak: "Weak",
};
