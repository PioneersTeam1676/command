"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Registers the service worker (production only) and clears cached pages when the user is signed out. */
export function RegisterSW() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "synced") router.refresh();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  useEffect(() => {
    if (pathname.startsWith("/login") && "serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((r) => r.active?.postMessage({ type: "clear-caches" })).catch(() => undefined);
    }
  }, [pathname]);

  return null;
}
