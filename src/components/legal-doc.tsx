import Link from "next/link";
import type { LegalDoc } from "@/lib/legal/types";

export function LegalDocView({ doc }: { doc: LegalDoc }) {
  return (
    <article className="mx-auto max-w-2xl px-4 py-10 md:py-16">
      <Link href="/" className="text-sm md:text-[13px] text-muted underline-offset-4 hover:underline">← Back</Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{doc.title}</h1>
      <p className="mt-1 font-mono text-sm md:text-[13px] text-muted">Last updated {doc.updated}</p>
      <p className="mt-6 text-[15px] leading-relaxed">{doc.intro}</p>
      {doc.sections.map((s) => (
        <section key={s.heading} className="mt-8">
          <h2 className="text-base font-semibold tracking-tight">{s.heading}</h2>
          {s.paragraphs?.map((p) => (
            <p key={p} className="mt-2 text-[15px] leading-relaxed text-foreground/90">{p}</p>
          ))}
          {s.bullets ? (
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-foreground/90">
              {s.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </article>
  );
}

export function LegalLinks({ className }: { className?: string }) {
  return (
    <p className={className}>
      <Link href="/terms" className="underline-offset-4 hover:underline">Terms</Link>
      {" · "}
      <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy</Link>
    </p>
  );
}
