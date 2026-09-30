export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">Loading</span>
      <div className="h-6 w-40 animate-pulse rounded-[6px] bg-surface" />
      <div className="h-24 w-full animate-pulse rounded-[6px] bg-surface" />
      <div className="h-24 w-full animate-pulse rounded-[6px] bg-surface" />
    </div>
  );
}
