import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkIntegrity, hashFiles, integrityForHeartbeat } from "./integrity";

const dirs: string[] = [];
const mk = (files: Record<string, string>) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "reg-"));
  dirs.push(dir);
  for (const [n, c] of Object.entries(files)) writeFileSync(path.join(dir, n), c);
  return dir;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const writeManifest = (dir: string) => writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(hashFiles(dir)));

describe("integrity", () => {
  it("matches when nothing changed", () => {
    const dir = mk({ "a.ts": "one", "b.ts": "two" });
    writeManifest(dir);
    expect(checkIntegrity(dir)).toMatchObject({ status: "ok" });
  });
  it("a missing manifest is reported as missing, never as a mismatch", () => {
    const dir = mk({ "a.ts": "one" });
    const r = checkIntegrity(dir);
    expect(r.status).toBe("manifest_missing");
    expect(integrityForHeartbeat(r)).toMatch(/^manifest-missing:[0-9a-f]{64}$/);
  });
  it("detects a modified, added or removed file", () => {
    const dir = mk({ "a.ts": "one", "b.ts": "two" });
    writeManifest(dir);
    writeFileSync(path.join(dir, "a.ts"), "changed");
    expect(checkIntegrity(dir)).toMatchObject({ status: "mismatch", changed: ["a.ts"] });
    writeFileSync(path.join(dir, "a.ts"), "one");
    writeFileSync(path.join(dir, "c.ts"), "new");
    expect(checkIntegrity(dir)).toMatchObject({ status: "mismatch", changed: ["c.ts"] });
  });
  it("ignores the manifest itself, dotfiles and test files", () => {
    const dir = mk({ "a.ts": "one" });
    writeManifest(dir);
    writeFileSync(path.join(dir, "a.test.ts"), "tests are not shipped logic");
    writeFileSync(path.join(dir, ".gitkeep"), "");
    expect(checkIntegrity(dir).status).toBe("ok");
  });
  it("the heartbeat reports the hash of the files on disk, so edits can't hide behind the manifest", () => {
    const dir = mk({ "a.ts": "one" });
    writeManifest(dir);
    const claimed = hashFiles(dir).buildHash;
    writeFileSync(path.join(dir, "a.ts"), "tampered");
    const r = checkIntegrity(dir);
    expect(integrityForHeartbeat(r)).not.toBe(claimed);
    expect(integrityForHeartbeat(r)).toBe(hashFiles(dir).buildHash);
  });
  it("the real registry folder hashes deterministically", () => {
    const a = hashFiles(path.join(process.cwd(), "src/lib/registry"));
    const b = hashFiles(path.join(process.cwd(), "src/lib/registry"));
    expect(a.buildHash).toBe(b.buildHash);
    expect(Object.keys(a.files)).toContain("protocol.ts");
  });
});
