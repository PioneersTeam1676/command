import { CopyField } from "@/components/copy-field";

/** A link anyone can open to see how many places are taken (never who), so people can pass it on. */
export function ShareShifts({ url }: { url: string }) {
  return (
    <section aria-labelledby="share-h" className="space-y-2">
      <h2 id="share-h" className="text-sm font-medium">Share these shifts</h2>
      <p className="text-sm text-muted md:text-[13px]">Anyone with this link sees how many places are taken, not who. They sign in to sign up.</p>
      <CopyField value={url} label="Link to share" />
    </section>
  );
}
