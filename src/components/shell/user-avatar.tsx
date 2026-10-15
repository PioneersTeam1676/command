"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/initials";

/**
 * Profile photo with a neutral initials circle as the fallback (no photo, or the photo fails to load).
 * The image is server-rendered, so a load error can fire before React attaches `onError`; the ref callback
 * catches that case by checking the element once it is mounted.
 */
function AvatarImage({ src, onFail }: { src: string; onFail: () => void }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={onFail}
      ref={(el) => {
        if (el && el.complete && el.naturalWidth === 0) onFail();
      }}
      className="size-full object-cover"
    />
  );
}

export function UserAvatar({ name, avatarUrl, className }: { name: string; avatarUrl: string | null; className?: string }) {
  // Remember which URL failed, so a new photo gets a fresh try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(avatarUrl) && failedUrl !== avatarUrl;
  return (
    <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border bg-hover text-[12px] font-medium text-foreground", className)}>
      {showImage ? <AvatarImage src={avatarUrl!} onFail={() => setFailedUrl(avatarUrl)} /> : initialsOf(name)}
    </span>
  );
}
