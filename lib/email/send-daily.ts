import { data } from "@/lib/db/gateway";
import type { AuthContext } from "@/lib/auth/context";
import { createRepLoginToken } from "@/lib/auth/rep-token";
import { mergeSettings } from "@/lib/manager/settings";
import { tenantBaseUrl } from "@/lib/tenancy/resolve";
import { sendEmail, fromAddress } from "./client";
import {
  renderDailyEmail,
  dailyEmailSubject,
  type DailyEmailProspect,
  type DailyEmailFollowUp,
} from "./daily-prospects";

// Builds and sends the rep "Morning Prospect List" daily email. Rosters each
// active distributor's email-enabled reps, honours the per-distributor send
// switch + enabled weekdays (unless `force`), and builds each rep's top
// prospects and due follow-ups through the tenant-scoped gateway with that
// rep's own context.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface BuiltEmail {
  to: string;
  from: string;
  subject: string;
  html: string;
  distributorName: string;
}

export interface DailyRunResult {
  sent: number;
  skipped: number;
  failed: number;
  details: { email: string; status: "sent" | "skipped" | "failed"; reason?: string }[];
}

function dueLabel(dueDate: string, today: string): string {
  if (dueDate >= today) return "Due today";
  const days = Math.round(
    (Date.parse(today + "T00:00:00Z") - Date.parse(dueDate + "T00:00:00Z")) / 86_400_000,
  );
  return `${days} day${days === 1 ? "" : "s"} overdue`;
}

/** Build the emails that should go out for `now` (ignores the schedule when forced). */
export async function buildDailyEmails(opts?: { force?: boolean; now?: Date }): Promise<BuiltEmail[]> {
  const now = opts?.now ?? new Date();
  const weekday = WEEKDAYS[now.getUTCDay()];
  const weekdayLong = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const today = now.toISOString().slice(0, 10);
  const roster = await data.listDailyEmailRoster();
  const out: BuiltEmail[] = [];

  for (const dist of roster) {
    const re = mergeSettings(dist.settings).repEmail;
    if (!opts?.force && (!re.send || !re.days.includes(weekday))) continue;
    const starter = re.starterLength ?? 5;
    const from = fromAddress(dist.name);
    // Links must land on this distributor's own subdomain so the host-only
    // session cookie set by the magic link applies there.
    const base = tenantBaseUrl(dist.slug);

    for (const rep of dist.reps) {
      const ctx: AuthContext = {
        userId: rep.id,
        role: "rep",
        distributorId: dist.id,
        manufacturerId: null,
        programIds: [],
      };
      const [queue, followUps] = await Promise.all([
        data.listRepQueue(ctx),
        data.listFollowUps(ctx),
      ]);
      // The queue is already ordered due-first then by score, so the top
      // `starterLength` are the prospects to start the day on.
      const picked = queue.slice(0, starter);
      const target = rep.dailyTarget ?? picked.length;

      // One single-use token per email; the first tapped link verifies the
      // device and every link lands on its destination via /rep/auth.
      const token = await createRepLoginToken(rep.id);
      const link = (next: string) =>
        `${base}/rep/auth?token=${token}&next=${encodeURIComponent(next)}`;

      const prospects: DailyEmailProspect[] = picked.map((c) => ({
        name: c.name,
        city: c.city,
        vehicles: c.totalVehicles ?? (((c.truckCount ?? 0) + (c.vanCount ?? 0)) || null),
        score: c.priorityScore,
        url: link(`/rep/company/${c.id}`),
      }));
      const fus: DailyEmailFollowUp[] = followUps.due.map((f) => ({
        name: f.name,
        meta: [f.city, f.kind === "touch_base" ? "Customer" : f.industryPrimary]
          .filter(Boolean)
          .join(" · "),
        dueLabel: dueLabel(f.dueDate, today),
        note: f.note,
        url: link(`/rep/company/${f.id}`),
      }));

      out.push({
        to: rep.email,
        from,
        subject: dailyEmailSubject(target, weekdayLong),
        distributorName: dist.name,
        html: renderDailyEmail({
          distributorName: dist.name,
          brandColor: dist.primaryColor,
          weekday: weekdayLong,
          target,
          queueUrl: link("/rep"),
          prospects,
          followUps: fus,
        }),
      });
    }
  }
  return out;
}

/** Build and send the daily emails, returning a per-recipient summary. */
export async function sendDailyEmails(opts?: { force?: boolean; now?: Date }): Promise<DailyRunResult> {
  const emails = await buildDailyEmails(opts);
  const result: DailyRunResult = { sent: 0, skipped: 0, failed: 0, details: [] };

  for (const e of emails) {
    const res = await sendEmail({ to: e.to, from: e.from, subject: e.subject, html: e.html });
    if (res.ok && res.skipped) {
      result.skipped++;
      result.details.push({ email: e.to, status: "skipped", reason: "no provider configured" });
    } else if (res.ok) {
      result.sent++;
      result.details.push({ email: e.to, status: "sent" });
    } else {
      result.failed++;
      result.details.push({ email: e.to, status: "failed", reason: res.error });
    }
  }
  return result;
}
