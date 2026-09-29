"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";

/** Persistent banner for people who don't have notifications working yet. Not dismissible on purpose. */
export function PushBanner() {
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    // Reading browser state after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIos(isIos && !standalone);
  }, []);
  return (
    <div role="region" aria-label="Turn on notifications" className="flex items-start gap-3 border-b bg-accent-subtle px-4 py-3 text-sm md:px-8">
      <BellRing className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        {ios ? "Add Command to your Home Screen to get reminders on your iPhone." : "Turn on notifications so you don't miss clock-in reminders and event updates."}{" "}
        <Link href="/me/notifications" className="font-medium underline underline-offset-4">
          {ios ? "Show me how" : "Turn them on"}
        </Link>
      </p>
    </div>
  );
}
