import { GridBackground } from "@/components/ui/grid-background";
import { LegalLinks } from "@/components/legal-doc";
import { getSettings } from "@/lib/settings";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { name, logoPath } = await getSettings();
  return (
    <GridBackground className="min-h-dvh px-4 py-10 md:py-20">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2.5 text-[15px] font-semibold tracking-tight">
          {logoPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/api/logo" alt="" className="size-8 rounded-[6px] object-cover" />
          ) : (
            <span aria-hidden className="grid size-8 place-items-center rounded-[6px] bg-accent text-sm text-accent-fg">
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
          {name}
        </div>
        {children}
        <LegalLinks className="mt-6 text-center text-[13px] text-muted" />
      </div>
    </GridBackground>
  );
}
