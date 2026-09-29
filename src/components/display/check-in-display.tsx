"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type Payload = { code: string; refreshAt: string; serverNow: string; qr: string };

export function CheckInDisplay({ eventId, title, whenLabel, mode }: { eventId: string; title: string; whenLabel: string; mode: "code" | "none" }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(60);
  const offset = useRef(0); // server clock minus device clock, so the countdown is right even if the tablet's clock is off

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/display/${eventId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 403 ? "Only leads and admins can show this screen." : "Couldn't load the code.");
      const json = (await res.json()) as Payload;
      offset.current = new Date(json.serverNow).getTime() - Date.now();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the code.");
    }
  }, [eventId]);

  useEffect(() => {
    if (mode !== "code") return;
    // Fetching on mount and on a timer is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, mode]);

  useEffect(() => {
    if (!data) return;
    const tick = () => {
      const ms = new Date(data.refreshAt).getTime() - (Date.now() + offset.current);
      setLeft(Math.max(0, Math.ceil(ms / 1000)));
      if (ms <= 0) void load();
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [data, load]);

  // Keep the screen awake while the display is up (not supported everywhere; failure is fine).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | undefined;
    (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock?.request("screen").then((l) => (lock = l)).catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, []);

  return (
    <main className="grid-bg flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-8 text-center">
      <Link href={`/calendar/${eventId}`} className="absolute left-4 top-4 inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Exit
      </Link>
      <div>
        <h1 className="text-2xl font-semibold md:text-4xl">{title}</h1>
        <p className="mt-1 font-mono text-sm text-muted">{whenLabel}</p>
      </div>

      {mode === "none" ? (
        <div className="max-w-md rounded-[8px] border bg-background p-6">
          <p className="text-lg font-medium">This event uses one-tap check-in</p>
          <p className="mt-2 text-sm text-muted">Members just tap Check in on their Home screen. To require a code, edit the event and choose “Rotating code shown on a screen”, then start this display again.</p>
        </div>
      ) : error ? (
        <p role="alert" className="rounded-[8px] border bg-error-subtle p-4 text-error">{error}</p>
      ) : !data ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <>
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="QR code for checking in" src={`data:image/svg+xml;utf8,${encodeURIComponent(data.qr)}`} className="mx-auto aspect-square w-[min(70vw,46vh)] rounded-[8px] border bg-white p-2" />
            <div>
              <p className="text-sm text-muted">Or type this code</p>
              <p data-testid="checkin-code" aria-live="off" className="font-mono text-[15vw] font-semibold leading-none tracking-[0.08em] md:text-[9vw]">
                {data.code.slice(0, 3)} {data.code.slice(3)}
              </p>
              <div className="mx-auto mt-5 h-1.5 w-64 overflow-hidden rounded-full bg-border" role="progressbar" aria-label="Time until the code changes" aria-valuemin={0} aria-valuemax={60} aria-valuenow={left}>
                <div className="h-full bg-accent transition-[width] duration-500 ease-linear" style={{ width: `${(left / 60) * 100}%` }} />
              </div>
              <p className="mt-2 font-mono text-xs text-muted">New code in {left}s</p>
            </div>
          </div>
          <p className="max-w-lg text-base text-muted">Members scan this with their phone camera, or type the code into Command.</p>
        </>
      )}
    </main>
  );
}
