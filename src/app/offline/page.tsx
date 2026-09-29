import type { Metadata } from "next";
import Link from "next/link";
import { CloudOff } from "lucide-react";

export const metadata: Metadata = { title: "Offline" };

/** Precached by the service worker and shown when a page can't be loaded without a connection. */
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-sm space-y-3">
        <CloudOff className="mx-auto size-8 text-muted" aria-hidden />
        <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
        <p className="text-sm text-muted">
          This page needs a connection. If you tapped Clock in or Clock out on your Home screen, it&apos;s saved on this phone and will sync when you&apos;re back online.
        </p>
        <Link href="/" className="inline-flex min-h-[44px] items-center text-sm text-accent underline-offset-4 hover:underline">Try again</Link>
      </div>
    </main>
  );
}
