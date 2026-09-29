import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, isPrivateAddress, UnsafeUrlError } from "./url-guard";

describe("isPrivateAddress", () => {
  it("flags private, loopback and link-local ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.16.0.1", "172.31.255.255", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "142.250.80.46", "172.32.0.1", "2607:f8b0:4004::1"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe("assertPublicHttpUrl", () => {
  it("rejects non-http schemes, credentials and garbage", async () => {
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicHttpUrl("ftp://example.com/x.ics")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicHttpUrl("https://user:pw@example.com/x.ics")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicHttpUrl("not a url")).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it("rejects IP literals in private ranges without a DNS lookup", async () => {
    await expect(assertPublicHttpUrl("http://127.0.0.1/x.ics")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicHttpUrl("http://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicHttpUrl("http://[::1]/x.ics")).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it("accepts a public IP literal, and private ones only when explicitly allowed (tests)", async () => {
    await expect(assertPublicHttpUrl("https://8.8.8.8/x.ics")).resolves.toBeInstanceOf(URL);
    await expect(assertPublicHttpUrl("http://127.0.0.1:9/x.ics", { allowPrivate: true })).resolves.toBeInstanceOf(URL);
  });
});
