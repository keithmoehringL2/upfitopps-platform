import { sendEmail, fromAddress } from "./client";

// Operational alert to L2 Digital's services desk when a rep flags a wrong
// number, so the contact record can be reviewed and corrected. Best-effort:
// callers should not let a send failure break the interaction log.
const L2_SERVICES_EMAIL = "services@l2-digital.com";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

export interface WrongNumberAlert {
  distributorName: string;
  companyName: string;
  city: string | null;
  phone: string | null;
  repEmail: string | null;
}

export async function sendWrongNumberAlert(a: WrongNumberAlert): Promise<void> {
  const where = [a.city].filter(Boolean).join(", ");
  const subject = `Wrong number flagged — ${a.companyName} (${a.distributorName})`;
  const html = `<!doctype html><html><body style="font-family:Georgia,serif;color:#1f1d1b;font-size:15px;line-height:1.5;">
    <p>A rep flagged a wrong number during outreach. Please review and correct the contact.</p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:15px;">
      <tr><td style="padding:3px 16px 3px 0;color:#6b6560;">Distributor</td><td style="padding:3px 0;">${esc(a.distributorName)}</td></tr>
      <tr><td style="padding:3px 16px 3px 0;color:#6b6560;">Company</td><td style="padding:3px 0;font-weight:600;">${esc(a.companyName)}</td></tr>
      ${where ? `<tr><td style="padding:3px 16px 3px 0;color:#6b6560;">Location</td><td style="padding:3px 0;">${esc(where)}</td></tr>` : ""}
      <tr><td style="padding:3px 16px 3px 0;color:#6b6560;">Number on file</td><td style="padding:3px 0;">${a.phone ? esc(a.phone) : "—"}</td></tr>
      ${a.repEmail ? `<tr><td style="padding:3px 16px 3px 0;color:#6b6560;">Flagged by</td><td style="padding:3px 0;">${esc(a.repEmail)}</td></tr>` : ""}
    </table>
  </body></html>`;

  await sendEmail({
    to: L2_SERVICES_EMAIL,
    from: fromAddress(a.distributorName),
    subject,
    html,
  });
}
