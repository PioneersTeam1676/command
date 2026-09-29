/**
 * Build step: writes src/lib/registry/manifest.json containing SHA-256 hashes of the files in
 * src/lib/registry/. The registry client compares the files on disk to this manifest at startup
 * (see src/lib/registry/integrity.ts). Disclosed in the README and LICENSE.
 * Prints the build hash so it can be added to the registry (`add-release-hash`).
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { hashFiles, registryDir } from "../src/lib/registry/integrity";

const dir = registryDir();
const manifest = hashFiles(dir);
writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`registry manifest written (${Object.keys(manifest.files).length} files)`);
console.log(`build integrity hash: ${manifest.buildHash}`);
