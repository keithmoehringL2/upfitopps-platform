// Derive the white-label accent ramp from a distributor's primary color (and,
// optionally, a secondary color for the accent-2 ramp), matching the design
// handoff. Uses CSS `color-mix(in oklch, ...)` so no color library is needed and
// the math matches the prototypes.
//
//   100 = primary 9% + white   200 = 18%   300 = 34%   400 = 62%
//   500 = primary
//   600 = primary 86% + black   700 = 72%   800 = 56%   900 = 40%
//
// Text in the accent color uses the 700 step (keeps 4.5:1 contrast on white);
// 500 is for fills, icons and large type only. A distributor's colors override
// the L2-default scheme defined in globals.css, throughout their account.
export const DEFAULT_PRIMARY = "#008e97"; // L2 Digital — Primary Teal

export function brandRampVars(
  primary: string = DEFAULT_PRIMARY,
  secondary?: string | null,
): Record<string, string> {
  const p = primary;
  const vars: Record<string, string> = {
    "--accent-100": `color-mix(in oklch, ${p} 9%, white)`,
    "--accent-200": `color-mix(in oklch, ${p} 18%, white)`,
    "--accent-300": `color-mix(in oklch, ${p} 34%, white)`,
    "--accent-400": `color-mix(in oklch, ${p} 62%, white)`,
    "--accent-500": p,
    "--accent-600": `color-mix(in oklch, ${p} 86%, black)`,
    "--accent-700": `color-mix(in oklch, ${p} 72%, black)`,
    "--accent-800": `color-mix(in oklch, ${p} 56%, black)`,
    "--accent-900": `color-mix(in oklch, ${p} 40%, black)`,
  };
  // A distributor secondary color overrides the default accent-2 (attention /
  // opportunity) ramp used by tag-accent-2 and the like.
  if (secondary) {
    const s = secondary;
    Object.assign(vars, {
      "--color-accent-2": s,
      "--color-accent-2-100": `color-mix(in oklch, ${s} 12%, white)`,
      "--color-accent-2-500": s,
      "--color-accent-2-700": `color-mix(in oklch, ${s} 72%, black)`,
      "--color-accent-2-800": `color-mix(in oklch, ${s} 56%, black)`,
      "--color-accent-2-900": `color-mix(in oklch, ${s} 40%, black)`,
    });
  }
  return vars;
}

/** Render the ramp as a CSS rule string for a scoped <style> tag. */
export function brandRampCss(
  primary: string = DEFAULT_PRIMARY,
  secondary?: string | null,
  selector = ":root",
): string {
  const vars = brandRampVars(primary, secondary);
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return `${selector}{${body}}`;
}
