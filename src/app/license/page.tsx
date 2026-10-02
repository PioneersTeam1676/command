import type { Metadata } from "next";
import Link from "next/link";
import { LICENSE_TEXT } from "@/lib/legal/license-text";

export const metadata: Metadata = { title: "License" };

export default function LicensePage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-10 md:py-16">
      <Link href="/" className="text-sm md:text-[13px] text-muted underline-offset-4 hover:underline">← Back</Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">License</h1>
      <p className="mt-2 text-sm text-muted">Command is source-available, not open source.</p>
      <pre className="mt-6 overflow-x-auto whitespace-pre-wrap rounded-lg border bg-surface p-4 font-mono text-sm md:text-[13px] leading-relaxed">{LICENSE_TEXT}</pre>
    </article>
  );
}
