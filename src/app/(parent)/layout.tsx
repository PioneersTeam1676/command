import { AppShell } from "@/components/shell/app-shell";
import { requireParent } from "@/lib/auth/current-user";
import { getSettings } from "@/lib/settings";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  await requireParent();
  const settings = await getSettings();
  return (
    <AppShell teamName={settings.name} logoUrl={settings.logoPath ? "/api/logo" : null} leaderboardEnabled={false} isStaff={false} isParent>
      {children}
    </AppShell>
  );
}
