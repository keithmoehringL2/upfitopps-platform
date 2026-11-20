// The rep's "Morning Prospect List" daily email, matching the design handoff's
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
  meta: string;
  dueLabel: string;
  note: string | null;
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
const DIVIDER = "#e7e4e0";
const BG = "#f5f4f2";

export function dailyEmailSubject(target: number, weekday: string): string {
  return `Your ${target} prospect${target === 1 ? "" : "s"} for ${weekday}`;
}

export function renderDailyEmail(d: DailyEmailData): string {
  const accent = /^#[0-9a-fA-F]{6}$/.test(d.brandColor) ? d.brandColor : "#1d4ed8";
  const goal =
    d.prospects.length === 0
      ? `Your queue is clear for ${esc(d.weekday)} — new prospects appear here once assigned.`
      : d.target > 0
        ? `Your goal for ${esc(d.weekday)} is ${d.target} call${d.target === 1 ? "" : "s"}. Here are your top prospects to get started.`
        : `Here are your top prospects for ${esc(d.weekday)}.`;

  const prospectRows = d.prospects
    .map((p, i) => {
      const sub = [p.city, p.vehicles != null ? `${p.vehicles} vehicles` : null]
        .filter(Boolean)
        .join(" · ");
      return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid ${DIVIDER};vertical-align:top;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td width="24" style="font-size:15px;color:${MUTED};vertical-align:top;padding-top:2px;">${i + 1}</td>
              <td style="vertical-align:top;">
                <a href="${esc(p.url)}" style="font-size:16px;font-weight:600;color:${accent};text-decoration:none;">${esc(p.name)}</a>
                ${sub ? `<div style="font-size:13px;color:${MUTED};margin-top:2px;">${esc(sub)}</div>` : ""}
              </td>
              <td align="right" style="font-size:17px;font-weight:600;color:${TEXT};vertical-align:top;white-space:nowrap;">${p.score != null ? esc(p.score) : "—"}</td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join("");

  const followUpBlock =
    d.followUps.length === 0
      ? ""
      : `
      <tr><td style="padding:28px 0 6px;">
        <div style="font-size:18px;font-weight:600;color:${accent};">Follow-ups due</div>
      </td></tr>
      ${d.followUps
        .map(
          (f) => `
      <tr><td style="padding:10px 0;border-bottom:1px solid ${DIVIDER};">
        <a href="${esc(f.url)}" style="font-size:15px;font-weight:600;color:${accent};text-decoration:none;">${esc(f.name)}</a>
        <span style="font-size:12px;color:${MUTED};"> · ${esc(f.dueLabel)}</span>
        <div style="font-size:13px;color:${MUTED};margin-top:2px;">${esc(f.meta)}</div>
        ${f.note ? `<div style="font-size:13px;color:${MUTED};font-style:italic;margin-top:2px;">${esc(f.note)}</div>` : ""}
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
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border-collapse:collapse;font-family:${SERIF};color:${TEXT};">
        <tr><td style="padding:28px 24px 0;">
          <div style="font-size:20px;font-weight:600;color:${accent};">${esc(d.distributorName)}</div>
          <div style="font-size:26px;font-weight:600;margin-top:12px;line-height:1.15;">Morning Prospect List</div>
          <div style="font-size:15px;color:${MUTED};margin-top:10px;line-height:1.5;">${goal}</div>
        </td></tr>

        <tr><td style="padding:20px 24px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${prospectRows || `<tr><td style="font-size:14px;color:${MUTED};padding:12px 0;">No prospects queued.</td></tr>`}
          </table>
        </td></tr>

        <tr><td style="padding:24px 24px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr><td align="center" bgcolor="${accent}" style="border-radius:4px;">
              <a href="${esc(d.queueUrl)}" style="display:block;padding:16px 24px;font-family:${SERIF};font-size:17px;font-weight:600;color:#ffffff;text-decoration:none;">Open My Queue</a>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${followUpBlock}
          </table>
        </td></tr>

        <tr><td style="padding:28px 24px 28px;border-top:1px solid ${DIVIDER};">
          <div style="font-size:12px;color:${MUTED};line-height:1.5;">
            Sent by ${esc(d.distributorName)} via Upfit Opps. The first tap from this email signs you in on this device for 30 days.
          </div>
          <div style="font-size:12px;margin-top:8px;">
            <a href="https://upfitopps.com" style="color:${accent};text-decoration:none;">UpfitOpps.com</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
