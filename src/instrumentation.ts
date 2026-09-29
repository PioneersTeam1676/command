export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { runMigrations } = await import("./db/migrate");
  await runMigrations();
  const { ensureSetupToken } = await import("./lib/setup");
  await ensureSetupToken();
  const { registerAllJobs } = await import("./lib/jobs/handlers");
  const { startScheduler } = await import("./lib/jobs/scheduler");
  registerAllJobs();
  await startScheduler();
  // Registry startup hook is added with the registry client.
}
