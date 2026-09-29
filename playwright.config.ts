import { defineConfig } from "@playwright/test";

const PORT = 3100;
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://command:command@localhost:54329/command";
const dbUrl = new URL(ADMIN_URL);
dbUrl.pathname = "/cmd_e2e";

const baseEnv = {
  SETUP_TOKEN: "e2e-setup-token-1234",
  DATA_DIR: "/tmp/command-e2e-data",
  NODE_ENV: "production",
};

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: [
    {
      command: `node e2e/prepare-db.mjs && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { ...baseEnv, DATABASE_URL: dbUrl.toString(), APP_URL: `http://localhost:${PORT}` },
    },
    {
      // Same database, but with the leaderboard switched off, to prove LEADERBOARD_ENABLED=false hides it everywhere.
      command: `node e2e/wait-for-db.mjs && npx next start -p ${PORT + 1}`,
      url: `http://localhost:${PORT + 1}/api/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { ...baseEnv, DATABASE_URL: dbUrl.toString(), APP_URL: `http://localhost:${PORT + 1}`, LEADERBOARD_ENABLED: "false", TEST_DATABASE_URL: ADMIN_URL },
    },
  ],
});
