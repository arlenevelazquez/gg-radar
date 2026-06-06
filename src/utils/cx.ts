/**
 * Slim className concatenator. Mirrors great-grants' `cx` helper without
 * pulling in clsx as a dependency.
 */
export function cx(
  ...args: Array<string | number | false | null | undefined>
): string {
  return args.filter(Boolean).join(" ");
}
