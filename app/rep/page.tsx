import { requireRep, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { RepHome, type PanelKey } from "./rep-home";

const PANELS = ["followups", "prospects", "customers", "zip", "leaders"];

// Rep home — three category cards (Follow Ups / Prospects / Customers) over a
// floating bottom nav, each card opening a full-screen panel. The daily email
// deep-links to a card via ?panel=.
export default async function RepQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string }>;
}) {
  const ctx = await requireRep();
  const [queue, progress, distributor, user, followUps, doneIds, board] = await Promise.all([
    data.listRepQueue(ctx),
    data.getRepDayProgress(ctx),
    data.getDistributorById(ctx.distributorId!),
    getCurrentUser(),
    data.listFollowUps(ctx),
    data.listCompaniesWorkedToday(ctx),
    data.getLeaderboard(ctx, "week"),
  ]);

  const { panel } = await searchParams;
  const initialPanel = (PANELS.includes(panel ?? "") ? panel : null) as PanelKey | null;

  const today = new Date().toISOString().slice(0, 10);
  const isDue = (next: string | null) => !next || next <= today;
  // Start opens the first open (not-worked-today) prospect, due ones first.
  const firstOpen =
    queue.find((c) => isDue(c.nextEligibleDate) && !doneIds.includes(c.id)) ??
    queue.find((c) => !doneIds.includes(c.id)) ??
    queue[0];

  const dateLine = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Split the follow-up queue: rep/system follow-ups vs. customer check-ins.
  const followUpsDue = followUps.due.filter((r) => r.kind !== "touch_base");
  const followUpsUpcoming = followUps.upcoming.filter((r) => r.kind !== "touch_base");
  const customersDue = followUps.due
    .filter((r) => r.kind === "touch_base")
    .map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      industryPrimary: r.industryPrimary,
      lastTouchDate: r.lastTouchDate,
      dueDate: r.dueDate,
      intervalDays: r.intervalDays,
      note: r.note,
    }));

  return (
    <RepHome
      distributorName={distributor?.name ?? "UpfitOutreach"}
      primaryColor={distributor?.primaryColor ?? null}
      userEmail={user?.email ?? ""}
      repName={user?.name ?? user?.email?.split("@")[0] ?? "you"}
      dateLine={dateLine}
      progress={progress}
      queue={queue.map((c) => ({
        id: c.id,
        name: c.name,
        city: c.city,
        industryPrimary: c.industryPrimary,
        priorityScore: c.priorityScore,
      }))}
      doneIds={doneIds}
      firstOpenId={firstOpen?.id ?? null}
      followUpsDue={followUpsDue}
      followUpsUpcoming={followUpsUpcoming}
      customersDue={customersDue}
      leaderboardEnabled={board !== null}
      initialBoard={board}
      zipApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
      initialPanel={initialPanel}
    />
  );
}
