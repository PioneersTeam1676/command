const HOST = "lh3.googleusercontent.com";
const MAX = 2000;

/** Only a plain https Google profile photo is stored or rendered. Anything else is dropped. */
export function safeAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.hostname !== HOST || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}
