import { generateKeyPairSync } from "node:crypto";
import { defineConfig } from "@playwright/test";

/**
 * Cross-app run: the real registry (production build, port 3300) and the real Command (development mode, port 3400,
 * which is the only mode that may point at a different registry). Proves register, revoke, restore and integrity
 * round-trip through the actual heartbeat.
 */
const ADMIN = process.env.TEST_DATABASE_URL ?? "postgres://command:command@localhost:54329/command";
const dbUrl = (name: string) => {
  const u = new URL(ADMIN);
  u.pathname = `/${name}`;
  return u.toString();
};
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const seed = privateKey.export({ type: "pkcs8", format: "der" }).subarray(-32).toString("base64");
const pub = publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("base64");
process.env.E2E_REGISTRY_DB = dbUrl("registry_e2e");

export default defineConfig({
  testDir: "./e2e-registry",
  workers: 1,
  timeout: 120_000,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3400", trace: "retain-on-failure" },
  webServer: [
    {
      command: "node e2e-registry/prepare-dbs.mjs && cd registry && npx next start -p 3300",
      url: "http://localhost:3300/healthz",
      timeout: 120_000,
      reuseExistingServer: false,
      env: { DATABASE_URL: dbUrl("registry_e2e"), APP_URL: "http://localhost:3300", REGISTRY_PRIVATE_KEY: seed, OWNER_EMAIL: "owner@example.com", GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y", IP_HASH_SALT: "e2e-salt-e2e-salt-e2e", NODE_ENV: "production" },
    },
    {
      command: "node e2e-registry/wait-for-db.mjs && npx next dev -p 3400",
      url: "http://localhost:3400/api/health",
      timeout: 240_000,
      reuseExistingServer: false,
      env: { DATABASE_URL: dbUrl("command_reg_e2e"), APP_URL: "http://localhost:3400", SETUP_TOKEN: "e2e-setup-token-1234", DATA_DIR: "/tmp/command-e2e-reg-data", NODE_ENV: "development", REGISTRY_URL_OVERRIDE: "http://localhost:3300", REGISTRY_PUBLIC_KEYS_OVERRIDE: pub },
    },
  ],
});
