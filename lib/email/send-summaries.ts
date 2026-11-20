import { data } from "@/lib/db/gateway";
import type { AuthContext } from "@/lib/auth/context";
import { mergeSettings } from "@/lib/manager/settings";
import { tenantBaseUrl } from "@/lib/tenancy/resolve";
import { sendEmail, fromAddress } from "./client";
import {
  renderManagerSummary,
  managerSummarySubject,
  type ManagerSummaryTotal,
  type ManagerSummaryRep,
} from "./manager-summary";

// Builds and sends the manager "Team Summary" email. Honours each distributor's
// Manager-summary settings: frequency (daily, or weekly on a chosen weekday),
// recipients (explicit list, else the active managers), and the trend toggle.
// Time-of-day is advisory under the single daily cron.

const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const UTC = (opts: Intl.DateTimeFormatOptions) => ({ ...opts, timeZone: "UTC" as const });
const fmtLong = (dt: Date) =>
  dt.toLocaleDateString("en-US", UTC({ weekday: "long", month: "short", day: "numeric" }));
const fmtShortWd = (dt: Date) =>
  dt.toLocaleDateString("en-US", UTC({ weekday: "short", month: "short", day: "numeric" }));
const monthShort = (dt: Date) => dt.toLocaleDateString("en-US", UTC({ month: "short" }));
const dayNum = (dt: Date) => dt.getUTCDate();

export interface BuiltSummary {
  to: string[];
  from: string;
  subject: string;
  html: string;
}

export interface SummaryRunResult {
  sent: number;
  skipped: number;
  failed: number;
  details: { email: string; status: "sent" | "skipped" | "failed"; reason?: string }[];
}

export async function buildManagerSummaries(opts?: { force?: boolean; now?: Date }): Promise<BuiltSummary[]> {
  const now = opts?.now ?? new Date();
  const weekdayLong = WEEKDAY_LONG[now.getUTCDay()];
  const roster = await data.listManagerSummaryRoster();
  const out: BuiltSummary[] = [];

  for (const dist of roster) {
    const sum = mergeSettings(dist.settings).summary;
    if (!opts?.force && sum.frequency === "weekly" && sum.day !== weekdayLong) continue;

    const recipients = sum.recipients.length
      ? sum.recipients
      : dist.managers.map((m) => m.email);
    if (recipients.length === 0) continue;

    const weekly = sum.frequency === "weekly";
    const period = weekly ? "week" : "today";
    const ctx: AuthContext = {
      userId: dist.managers[0]?.id ?? dist.id,
      role: "manager",
      distributorId: dist.id,
      manufacturerId: null,
      programIds: [],
    };
    const o = await data.getManagerSummary(ctx, period, sum.compareTrend);
    const t = o.team;

    // Headline, date range, and subject per the design.
    const weekStart = new Date(now.getTime() - 7 * 86_400_000);
    const headline = weekly ? "Week to date" : "Today";
    const range = weekly
      ? `${fmtLong(weekStart)} to ${fmtLong(now)} · sent ${sum.day}s at ${sum.time}`
      : `${fmtLong(now)} · sent daily at ${sum.time}`;
    const subjectRange = weekly
      ? monthShort(weekStart) === monthShort(now)
        ? `${monthShort(weekStart)} ${dayNum(weekStart)}–${dayNum(now)}`
        : `${monthShort(weekStart)} ${dayNum(weekStart)} – ${monthShort(now)} ${dayNum(now)}`
      : fmtShortWd(now);
    const subjectPrefix = `${dist.name} ${weekly ? "weekly" : "daily"} summary`;

    // Trend only on the two time-bounded metrics (attempts, DM conversations);
    // the snapshot metrics (DMs identified, opportunities, quoted) carry none.
    const trendText = (delta: number) =>
      delta === 0 ? "Same as last period" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)} vs last ${weekly ? "week" : "day"}`;
    const attDelta = o.trend ? t.attempts - o.trend.prevAttempts : 0;
    const dmDelta = o.trend ? t.dm - o.trend.prevDm : 0;

    const totals: ManagerSummaryTotal[] = [
      { label: "Attempts", value: String(t.attempts), trend: o.trend ? trendText(attDelta) : "", positive: attDelta >= 0 },
      { label: "DMs identified", value: String(t.pdm), trend: "", positive: true },
      { label: "DM conversations", value: String(t.dm), trend: o.trend ? trendText(dmDelta) : "", positive: dmDelta >= 0 },
      { label: "Opportunities", value: String(t.opportunities), trend: "", positive: true },
      { label: "Companies quoted", value: String(t.quoted), trend: "", positive: true },
    ];

    const reps: ManagerSummaryRep[] = o.perRep.map((r) => ({
      name: r.email,
      attempts: r.attempts,
      pct: r.attainment != null ? `${r.attainment}%` : "—",
      dm: r.dm,
      opp: r.opportunities,
      quoted: r.quoted,
    }));

    const conv = `Opportunity yield: ${t.oppYield ?? 0}% (${t.opportunities} opportunit${t.opportunities === 1 ? "y" : "ies"} from ${t.dm} decision-maker conversation${t.dm === 1 ? "" : "s"}). Counts reflect activity reps recorded in Upfit Opps.`;

    out.push({
      to: recipients,
      from: fromAddress(dist.name),
      subject: managerSummarySubject(subjectPrefix, subjectRange),
      html: renderManagerSummary({
        distributorName: dist.name,
        brandColor: dist.primaryColor,
        headline,
        range,
        overviewUrl: `${tenantBaseUrl(dist.slug)}/manager`,
        totals,
        reps,
        conv,
      }),
    });
  }
  return out;
}

export async function sendManagerSummaries(opts?: { force?: boolean; now?: Date }): Promise<SummaryRunResult> {
  const summaries = await buildManagerSummaries(opts);
  const result: SummaryRunResult = { sent: 0, skipped: 0, failed: 0, details: [] };

  for (const s of summaries) {
    // One email per recipient so they don't see each other's addresses.
    for (const to of s.to) {
      const res = await sendEmail({ to, from: s.from, subject: s.subject, html: s.html });
      if (res.ok && res.skipped) {
        result.skipped++;
        result.details.push({ email: to, status: "skipped", reason: "no provider configured" });
      } else if (res.ok) {
        result.sent++;
        result.details.push({ email: to, status: "sent" });
      } else {
        result.failed++;
        result.details.push({ email: to, status: "failed", reason: res.error });
      }
    }
  }
  return result;
}
