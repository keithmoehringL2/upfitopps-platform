// The rep "Morning Prospect List" daily email, matching the design handoff's
// screen 01. Table-based, inline-styled HTML for broad email-client support;
// the distributor's brand color drives the accents. Every link is a magic-link
// that verifies the device on first tap (see app/rep/auth/route.ts).

export interface DailyEmailProspect {
  name: string;
  city: string | null;
  vehicles: number | null;
  score: string | null;
  url: string;
}

export interface DailyEmailFollowUp {
  name: string;
  kind: string; // "Follow-up" | "Customer"
  reason: string;
  url: string;
}

export interface DailyEmailData {
  distributorName: string;
  brandColor: string;
  weekday: string;
  target: number;
  queueUrl: string;
  prospects: DailyEmailProspect[];
  followUps: DailyEmailFollowUp[];
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

const SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif";
const TEXT = "#1f1d1b";
const MUTED = "#6b6560";
const BG = "#f5f4f2";
const UL = "text-decoration:underline;text-underline-offset:3px";

export function dailyEmailSubject(target: number, weekday: string): string {
  return `Your ${target} prospect${target === 1 ? "" : "s"} for ${weekday}`;
}

export function renderDailyEmail(d: DailyEmailData): string {
  const accent = /^#[0-9a-fA-F]{6}$/.test(d.brandColor) ? d.brandColor : "#1d4ed8";
  const goal =
    d.prospects.length === 0
      ? `Your queue is clear for ${esc(d.weekday)} — new prospects appear here once assigned.`
      : d.target > 0
        ? `Today's goal is outreach to <strong>${d.target} cold prospect${d.target === 1 ? "" : "s"}</strong>. Here's where to start.`
        : `Here are your top prospects for ${esc(d.weekday)}.`;

  const prospectRows = d.prospects
    .map((p, i) => {
      const sub = [p.city, p.vehicles != null ? `${p.vehicles} vehicles` : null]
        .filter(Boolean)
        .join(" · ");
      return `
      <tr>
        <td width="22" style="padding:7px 0;font-size:14px;color:${MUTED};vertical-align:top;">${i + 1}</td>
        <td style="padding:7px 0;vertical-align:top;">
          <a href="${esc(p.url)}" style="font-size:16px;font-weight:600;color:${accent};${UL};">${esc(p.name)}</a>
          ${sub ? `<div style="font-size:13px;color:${MUTED};margin-top:2px;">${esc(sub)}</div>` : ""}
        </td>
        <td align="right" style="padding:7px 0;font-size:15px;font-weight:600;color:${TEXT};vertical-align:top;white-space:nowrap;">${p.score != null ? esc(p.score) : "—"}</td>
      </tr>`;
    })
    .join("");

  const followUpBlock =
    d.followUps.length === 0
      ? ""
      : `
      <tr><td style="padding:22px 0 0;">
        <div style="font-size:20px;font-weight:600;line-height:1.2;color:${TEXT};">Follow Up Reminders</div>
      </td></tr>
      ${d.followUps
        .map(
          (f) => `
      <tr><td style="padding:10px 0 0;">
        <a href="${esc(f.url)}" style="font-size:15px;font-weight:600;color:${accent};${UL};">${esc(f.name)}</a>
        <div style="font-size:13px;color:${MUTED};margin-top:2px;">${esc(f.kind)} · ${esc(f.reason)}</div>
      </td></tr>`,
        )
        .join("")}`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>Morning Prospect List</title>
</head>
<body style="margin:0;padding:0;background:${BG};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${d.target} prospect${d.target === 1 ? "" : "s"} queued for ${esc(d.weekday)}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};border-collapse:collapse;">
    <tr><td align="center" style="padding:20px 12px 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border-collapse:collapse;font-family:${SERIF};color:${TEXT};">
        <tr><td style="padding:24px 20px 0;">
          <div style="font-size:20px;font-weight:600;color:${accent};">${esc(d.distributorName)}</div>
          <div style="font-size:26px;font-weight:600;margin-top:22px;line-height:1.15;">Morning Prospect List</div>
          <div style="font-size:16px;color:${MUTED};margin-top:6px;line-height:1.5;">${goal}</div>
        </td></tr>

        <tr><td style="padding:0 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${followUpBlock}
          </table>
        </td></tr>

        <tr><td style="padding:22px 20px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${prospectRows || `<tr><td style="font-size:14px;color:${MUTED};padding:7px 0;">No prospects queued.</td></tr>`}
          </table>
        </td></tr>

        <tr><td style="padding:22px 20px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr><td align="center" bgcolor="${accent}" style="border-radius:4px;">
              <a href="${esc(d.queueUrl)}" style="display:block;padding:16px 24px;font-family:${SERIF};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Open My Queue</a>
            </td></tr>
          </table>
        </td></tr>

        <tr><td align="center" style="padding:22px 20px 28px;">
          <a href="https://upfitopps.com" style="font-size:14px;color:${accent};text-decoration:none;">Open UpfitOpps.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
