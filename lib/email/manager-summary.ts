// The manager "Team Summary" email, matching the design handoff's Summary
// email: period headline + range, five team totals with optional trend, a
// per-rep performance table, an opportunity-yield line, and a link to the
// Overview. Table-based, inline styles, brand-colored. Managers sign in with a
// password, so the Overview link carries no magic-link token.

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

const SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif";
const TEXT = "#1f1d1b";
const MUTED = "#6b6560";
const DIVIDER = "#e7e4e0";
const BG = "#f5f4f2";
const NEG = "#b42318";

export interface ManagerSummaryTotal {
  label: string;
  value: string;
  trend: string; // "" when no trend
  positive: boolean;
}

export interface ManagerSummaryRep {
  name: string;
  attempts: number;
  pct: string;
  dm: number;
  opp: number;
  quoted: number;
}

export interface ManagerSummaryData {
  distributorName: string;
  brandColor: string;
  headline: string; // "Week to date" | "Today"
  range: string;
  overviewUrl: string;
  totals: ManagerSummaryTotal[];
  reps: ManagerSummaryRep[];
  conv: string;
}

export function managerSummarySubject(prefix: string, range: string): string {
  return `${prefix} · ${range}`;
}

function totalCell(accent: string, t: ManagerSummaryTotal | null): string {
  if (!t) return `<td width="33%" style="padding:12px 10px 12px 0;"></td>`;
  return `
    <td width="33%" style="padding:12px 10px 12px 0;vertical-align:top;">
      <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">${esc(t.label)}</div>
      <div style="font-size:32px;font-weight:600;line-height:1.05;color:${TEXT};margin-top:2px;">${esc(t.value)}</div>
      <div style="font-size:13px;color:${t.positive ? accent : NEG};height:16px;margin-top:2px;">${t.trend ? esc(t.trend) : ""}</div>
    </td>`;
}

export function renderManagerSummary(d: ManagerSummaryData): string {
  const accent = /^#[0-9a-fA-F]{6}$/.test(d.brandColor) ? d.brandColor : "#008e97";

  const totalRows: string[] = [];
  for (let i = 0; i < d.totals.length; i += 3) {
    totalRows.push(
      `<tr>${totalCell(accent, d.totals[i] ?? null)}${totalCell(accent, d.totals[i + 1] ?? null)}${totalCell(accent, d.totals[i + 2] ?? null)}</tr>`,
    );
  }

  const th = (label: string, right = false) =>
    `<td ${right ? 'align="right"' : ""} style="padding:8px 10px;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};border-bottom:2px solid ${DIVIDER};">${label}</td>`;
  const td = (v: string, right = false, muted = false) =>
    `<td ${right ? 'align="right"' : ""} style="padding:10px;font-size:14px;color:${muted ? MUTED : TEXT};border-bottom:1px solid ${DIVIDER};">${v}</td>`;

  const repRows = d.reps
    .map(
      (r) =>
        `<tr>${td(esc(r.name))}${td(String(r.attempts), true)}${td(r.pct, true, true)}${td(String(r.dm), true)}${td(String(r.opp), true)}${td(String(r.quoted), true)}</tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>Team Summary</title>
</head>
<body style="margin:0;padding:0;background:${BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};border-collapse:collapse;">
    <tr><td align="center" style="padding:24px 16px 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.10);border-collapse:collapse;font-family:${SERIF};color:${TEXT};">
        <tr><td style="padding:32px 32px 0;">
          <div style="font-size:22px;font-weight:600;color:${accent};">${esc(d.distributorName)}</div>
          <div style="font-size:25px;font-weight:600;margin-top:24px;line-height:1.15;">${esc(d.headline)}</div>
          <div style="font-size:15px;color:${MUTED};margin-top:4px;">${esc(d.range)}</div>
        </td></tr>

        <tr><td style="padding:22px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${totalRows.join("")}
          </table>
        </td></tr>

        <tr><td style="padding:24px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              ${th("Rep")}${th("Attempts", true)}${th("Of target", true)}${th("DM conv.", true)}${th("Opps", true)}${th("Quoted", true)}
            </tr>
            ${repRows || `<tr><td colspan="6" style="padding:12px 10px;font-size:14px;color:${MUTED};">No active reps.</td></tr>`}
          </table>
        </td></tr>

        <tr><td style="padding:20px 32px 0;">
          <div style="font-size:14px;line-height:1.5;color:${MUTED};">${esc(d.conv)}</div>
        </td></tr>

        <tr><td style="padding:24px 32px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr><td bgcolor="${accent}" style="border-radius:4px;">
              <a href="${esc(d.overviewUrl)}" style="display:block;padding:14px 28px;font-family:${SERIF};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Open Manager Overview</a>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
