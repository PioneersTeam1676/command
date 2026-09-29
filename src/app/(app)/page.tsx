import { Clock } from "lucide-react";
import { GridBackground } from "@/components/ui/grid-background";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const first = user.name.split(" ")[0];
  return (
    <GridBackground className="-mx-4 -mt-6 px-4 pt-6 md:-mx-8 md:-mt-8 md:px-8 md:pt-8">
      <h1 className="text-[28px] font-semibold">Hi, {first}</h1>
      <p className="mt-1 text-muted">Your clock-in control and today&apos;s events will show up here.</p>
      <div className="mt-6">
        <EmptyState icon={<Clock />} title="Nothing scheduled yet">
          When your team adds events or the build season starts, you&apos;ll be able to clock in from this screen.
        </EmptyState>
      </div>
    </GridBackground>
  );
}
