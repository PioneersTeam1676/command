import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Build integrity (spec 9.4). At build time `scripts/build-manifest.ts` records SHA-256 hashes of the
 * files in this folder. At startup we hash them again and compare. The hash we send in each heartbeat is
 * the one computed from the files actually on disk, so the registry sees what is really running.
 *
 * Be honest about what this is: a license-compliance check on the source files shipped in the image. It
 * cannot make a source-available app unmodifiable, and the license is the real protection.
 */

export type FileHashes = Record<string, string>;
export type Manifest = { files: FileHashes; buildHash: string };

const SKIP = new Set(["manifest.json"]);

export const registryDir = () => path.join(process.cwd(), "src", "lib", "registry");

export function hashFiles(dir: string): Manifest {
  const files: FileHashes = {};
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith(".") || SKIP.has(name) || name.endsWith(".test.ts")) continue;
      files[name] = createHash("sha256").update(readFileSync(path.join(dir, name))).digest("hex");
    }
  }
  return { files, buildHash: createHash("sha256").update(JSON.stringify(files)).digest("hex") };
}

export function readManifest(dir: string): Manifest | null {
  try {
    const parsed = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as Partial<Manifest>;
    if (parsed && typeof parsed.buildHash === "string" && parsed.files && typeof parsed.files === "object") return parsed as Manifest;
    return null;
  } catch {
    return null;
  }
}

export type IntegrityResult =
  | { status: "ok"; actualHash: string }
  | { status: "mismatch"; actualHash: string; changed: string[] }
  /** No manifest is not tampering: it just means this isn't a release build. Admins are told, and it's reported. */
  | { status: "manifest_missing"; actualHash: string };

export function checkIntegrity(dir: string = registryDir()): IntegrityResult {
  const actual = hashFiles(dir);
  const manifest = readManifest(dir);
  if (!manifest) return { status: "manifest_missing", actualHash: actual.buildHash };
  if (manifest.buildHash === actual.buildHash) return { status: "ok", actualHash: actual.buildHash };
  const names = new Set([...Object.keys(manifest.files), ...Object.keys(actual.files)]);
  const changed = [...names].filter((n) => manifest.files[n] !== actual.files[n]).sort();
  return { status: "mismatch", actualHash: actual.buildHash, changed };
}

/** What goes in the heartbeat's integrity field. A missing manifest is reported so the registry knows. */
export const integrityForHeartbeat = (r: IntegrityResult) => (r.status === "manifest_missing" ? `manifest-missing:${r.actualHash}` : r.actualHash);
