// The rep daily email — a compact morning summary: how many Follow Ups,
// Prospects and Customers need contact today, each linking straight to that
// card, plus an "Open Queue" button. Table-based, inline-styled HTML for broad
// email-client support; the distributor's brand color drives the accents. Every
// link is a magic-link that verifies the device on first tap (app/rep/auth).

export interface DailyEmailData {
  distributorName: string;
  brandColor: string;
  weekday: string;
  counts: { followUps: number; prospects: number; customers: number };
  links: { followUps: string; prospects: string; customers: string; queue: string };
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

const SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif";
const TEXT = "#1f1d1b";
const MUTED = "#6b6560";
const BG = "#f5f4f2";

export function dailyEmailSubject(total: number, weekday: string): string {
  if (total === 0) return `Your queue is clear for ${weekday}`;
  return `${total} contact${total === 1 ? "" : "s"} to make ${weekday}`;
}

export function renderDailyEmail(d: DailyEmailData): string {
  const accent = /^#[0-9a-fA-F]{6}$/.test(d.brandColor) ? d.brandColor : "#1d4ed8";
  const total = d.counts.followUps + d.counts.prospects + d.counts.customers;
  const intro =
    total === 0
      ? `Nothing is due for ${esc(d.weekday)} — new prospects appear here once assigned.`
      : `Here's what needs your attention for ${esc(d.weekday)}. Tap a list to jump right in.`;

  const row = (label: string, desc: string, count: number, href: string) => `
      <tr><td style="padding:8px 0;">
        <a href="${esc(href)}" style="display:block;text-decoration:none;color:${TEXT};border:1px solid ${accent}22;border-radius:6px;padding:16px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;">
                <div style="font-size:18px;font-weight:600;color:${accent};">${esc(label)}</div>
                <div style="font-size:13px;color:${MUTED};margin-top:2px;">${esc(desc)}</div>
              </td>
              <td align="right" style="vertical-align:middle;white-space:nowrap;">
                <span style="font-size:34px;font-weight:600;color:${TEXT};">${count}</span>
              </td>
            </tr>
          </table>
        </a>
      </td></tr>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>Your daily queue</title>
</head>
<body style="margin:0;padding:0;background:${BG};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${total} contact${total === 1 ? "" : "s"} to make for ${esc(d.weekday)}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};border-collapse:collapse;">
    <tr><td align="center" style="padding:20px 12px 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border-collapse:collapse;font-family:${SERIF};color:${TEXT};">
        <tr><td style="padding:24px 20px 0;">
          <div style="font-size:20px;font-weight:600;color:${accent};">${esc(d.distributorName)}</div>
          <div style="font-size:26px;font-weight:600;margin-top:22px;line-height:1.15;">Your queue for ${esc(d.weekday)}</div>
          <div style="font-size:16px;color:${MUTED};margin-top:6px;line-height:1.5;">${intro}</div>
        </td></tr>

        <tr><td style="padding:14px 20px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${row("Follow Ups", "Follow up on previous attempts or conversations", d.counts.followUps, d.links.followUps)}
            ${row("Prospects", "Connect with these prospective customers", d.counts.prospects, d.links.prospects)}
            ${row("Customers", "Check in with these past customers", d.counts.customers, d.links.customers)}
          </table>
        </td></tr>

        <tr><td style="padding:18px 20px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr><td align="center" bgcolor="${accent}" style="border-radius:4px;">
              <a href="${esc(d.links.queue)}" style="display:block;padding:16px 24px;font-family:${SERIF};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Open Queue</a>
            </td></tr>
          </table>
        </td></tr>

        <tr><td align="center" style="padding:22px 20px 28px;">
          <a href="https://upfitoutreach.com" style="font-size:14px;color:${accent};text-decoration:none;">Open UpfitOutreach.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
