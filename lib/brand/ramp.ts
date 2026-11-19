// Derive the white-label accent ramp from a single distributor primary color,
// matching the design handoff exactly. Uses CSS `color-mix(in oklch, ...)` so
// no color library is needed and the math matches the prototypes.
//
//   100 = primary 9% + white   200 = 18%   300 = 34%   400 = 62%
//   500 = primary
//   600 = primary 86% + black   700 = 72%   800 = 56%   900 = 40%
//
// Text in the accent color uses the 700 step (keeps 4.5:1 contrast on white);
// 500 is for fills, icons and large type only.
export const DEFAULT_PRIMARY = "#c8102e";

export function brandRampVars(primary: string = DEFAULT_PRIMARY): Record<string, string> {
  const p = primary;
  return {
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
}

/** Render the ramp as a CSS rule string for a scoped <style> tag. */
export function brandRampCss(primary: string = DEFAULT_PRIMARY, selector = ":root"): string {
  const vars = brandRampVars(primary);
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return `${selector}{${body}}`;
}
