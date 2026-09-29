"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-sm space-y-3" role="alert">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted">It&apos;s not you. Try again, and if it keeps happening, tell a team admin{error.digest ? ` (reference ${error.digest})` : ""}.</p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
