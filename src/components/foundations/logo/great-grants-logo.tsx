"use client";

import type { HTMLAttributes } from "react";
import { cx } from "@/utils/cx";
import { GreatGrantsLogoMinimal } from "./great-grants-logo-minimal";

interface GreatGrantsLogoProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional Tailwind text size override, e.g. 'text-sm', 'text-[6px]' */
  textSize?: string;
  /** Optional tagline under the wordmark, e.g. 'Radar' */
  tagline?: string;
}

/**
 * GreatGrants wordmark + nib. Ported from
 * great-grants/apps/web/src/components/foundations/logo/great-grants-logo.tsx
 * with an optional `tagline` slot for sub-product naming ("Great Grants · Radar").
 */
export function GreatGrantsLogo({
  textSize,
  tagline,
  className,
  ...props
}: GreatGrantsLogoProps) {
  return (
    <div
      {...props}
      className={cx(
        "flex h-8 w-max items-center justify-start overflow-visible",
        className
      )}
    >
      <GreatGrantsLogoMinimal className="aspect-square h-full w-auto shrink-0" />
      <div className="aspect-[0.3] h-full" />
      <div className="flex items-baseline gap-1.5">
        <span className={cx(textSize ?? "text-2xl", "font-bold")}>Great Grants</span>
        {tagline && (
          <span className="text-xs uppercase tracking-widest text-gray-500 font-medium">
            {tagline}
          </span>
        )}
      </div>
    </div>
  );
}
