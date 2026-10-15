"use client";
import { useState } from "react";
import { linkify, shortUrl } from "@/lib/linkify";
import { cn } from "@/lib/utils";

const LONG_CHARS = 320;
const LONG_LINES = 7;

/** Event details text: links are clickable and shortened, long words never push the page sideways, long text collapses. */
export function EventDescription({ text }: { text: string }) {
  const long = text.length > LONG_CHARS || text.split("\n").length > LONG_LINES;
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p className={cn("whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground/90 [overflow-wrap:anywhere]", long && !open && "line-clamp-6")}>
        {linkify(text).map((s, i) =>
          s.type === "url" ? (
            <a key={i} href={s.value} target="_blank" rel="noopener noreferrer" title={s.value} className="text-accent underline underline-offset-4">
              {shortUrl(s.value)}
            </a>
          ) : (
            s.value
          ),
        )}
      </p>
      {long ? (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline md:min-h-0 md:text-[13px]">
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
