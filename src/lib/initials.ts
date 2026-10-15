/** One or two characters for an avatar. Uses code points so emoji and CJK are never split. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = (w: string) => Array.from(w)[0]!.toUpperCase();
  return words.length === 1 ? first(words[0]!) : first(words[0]!) + first(words[words.length - 1]!);
}
