/**
 * Build step: writes src/lib/registry/manifest.json containing SHA-256 hashes of the files in
 * src/lib/registry/. The registry client compares the files on disk to this manifest at startup
 * (see src/lib/registry/integrity.ts). Disclosed in the README and LICENSE.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "src", "lib", "registry");
const SKIP = new Set(["manifest.json"]);

function collect(): Record<string, string> {
  const hashes: Record<string, string> = {};
  if (!existsSync(dir)) return hashes;
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".") || SKIP.has(name) || name.endsWith(".test.ts")) continue;
    hashes[name] = createHash("sha256").update(readFileSync(path.join(dir, name))).digest("hex");
  }
  return hashes;
}

const files = collect();
const buildHash = createHash("sha256").update(JSON.stringify(files)).digest("hex");
writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ files, buildHash }, null, 2) + "\n");
console.log(`registry manifest written (${Object.keys(files).length} files, ${buildHash.slice(0, 12)})`);
