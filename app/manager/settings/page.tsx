import { requireRole, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { ManagerShell } from "../manager-shell";
import { SettingsPanels } from "./settings-panels";

export default async function ManagerSettingsPage() {
  const ctx = await requireRole("manager");
  const [team, settings, distributor, user] = await Promise.all([
    data.listTeam(ctx),
    data.getSettings(ctx),
    data.getDistributorById(ctx.distributorId!),
    getCurrentUser(),
  ]);

  return (
    <ManagerShell
      brandName={distributor?.name ?? "Distributor"}
      primaryColor={distributor?.primaryColor}
      userEmail={user?.email}
      active="settings"
    >
      <SettingsPanels
        team={team.map((r) => ({
          id: r.id,
          email: r.email,
          dailyTarget: r.dailyTarget ?? 10,
          status: r.status as "active" | "paused" | "disabled",
          dailyEmailEnabled: r.dailyEmailEnabled,
          companyCount: r.companyCount,
          lastActive: r.lastActive ? new Date(r.lastActive).toISOString().slice(0, 10) : null,
        }))}
        settings={settings}
      />
    </ManagerShell>
  );
}
