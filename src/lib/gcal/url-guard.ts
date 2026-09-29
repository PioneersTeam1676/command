import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** True for loopback, private, link-local, carrier-grade NAT and other non-public addresses (IPv4 and IPv6). */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb");
}

export class UnsafeUrlError extends Error {}

/**
 * The ICS address is typed in by an admin and fetched by the server, so refuse anything that isn't a
 * public http(s) address: no file:, no localhost, no private network ranges (blocks SSRF into the host's LAN).
 */
export async function assertPublicHttpUrl(raw: string, opts: { allowPrivate?: boolean } = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("That doesn't look like a web address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnsafeUrlError("The calendar address must start with https://");
  if (url.username || url.password) throw new UnsafeUrlError("The calendar address can't contain a username or password.");
  if (opts.allowPrivate) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new UnsafeUrlError("We couldn't find that address. Check for typos.");
  if (addresses.some(isPrivateAddress)) throw new UnsafeUrlError("That address points inside a private network, so it can't be used.");
  return url;
}
