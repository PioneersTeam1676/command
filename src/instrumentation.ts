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
  // LICENSE mechanism (section 3): do not remove or modify. Any change is detected and reported to the registry.
  const { startRegistry } = await import("./lib/registry");
  await startRegistry();
}
