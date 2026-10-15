export type Segment = { type: "text" | "url"; value: string };

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const TRAILING = /[.,;:!?)\]}]+$/;

/** Split text into plain and http(s) URL segments. Trailing punctuation stays outside the link; other schemes are never linked. */
export function linkify(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  const push = (type: Segment["type"], value: string) => {
    if (value) out.push({ type, value });
  };
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    const trail = TRAILING.exec(url)?.[0] ?? "";
    if (trail) url = url.slice(0, -trail.length);
    push("text", text.slice(last, m.index));
    push("url", url);
    last = m.index + url.length;
  }
  push("text", text.slice(last));
  return out;
}

/** A readable label for a link: host and path, no scheme or www, trimmed. */
export function shortUrl(url: string, max = 40): string {
  const bare = url.replace(/^https?:\/\/(www\.)?/i, "");
  return bare.length > max ? `${bare.slice(0, max)}…` : bare;
}
