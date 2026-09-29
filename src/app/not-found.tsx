import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GridBackground } from "@/components/ui/grid-background";

export default function NotFound() {
  return (
    <GridBackground className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-sm space-y-3">
        <p className="font-mono text-sm text-muted">404</p>
        <h1 className="text-2xl font-semibold">We can&apos;t find that page</h1>
        <p className="text-sm text-muted">The link may be old, or you might not have access to it.</p>
        <Button asChild><Link href="/">Go to Home</Link></Button>
      </div>
    </GridBackground>
  );
}
