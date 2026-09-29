import { AppShell } from "@/components/shell/app-shell";
import { GridBackground } from "@/components/ui/grid-background";
import { EmptyState } from "@/components/ui/empty-state";
import { ThemeToggle } from "@/components/theme-toggle";
import { Home } from "lucide-react";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell teamName="Command" leaderboardEnabled isStaff={false}>
      <GridBackground className="-mx-4 -mt-6 px-4 pt-6 md:-mx-8 md:-mt-8 md:px-8 md:pt-8">
        <h1 className="text-[28px] font-semibold">Command</h1>
        <p className="mt-1 text-muted">Scaffold running. Setup arrives in the next phase.</p>
        <div className="mt-6">
          <EmptyState icon={<Home />} title="Nothing here yet">
            Once setup completes, your clock-in control and today&apos;s events appear here.
          </EmptyState>
        </div>
        <div className="mt-6">
          <ThemeToggle />
        </div>
      </GridBackground>
    </AppShell>
  );
}
