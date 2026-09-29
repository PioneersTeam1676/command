"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertTriangle } from "lucide-react";

/** Errors inside the app keep the navigation visible instead of blanking the whole screen. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert">
      <EmptyState icon={<AlertTriangle />} title="This page couldn't load" action={<Button onClick={reset}>Try again</Button>}>
        Check your connection and try again. If it keeps happening, tell a team admin{error.digest ? ` (reference ${error.digest})` : ""}.
      </EmptyState>
    </div>
  );
}
