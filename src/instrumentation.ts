export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { runMigrations } = await import("./db/migrate");
  await runMigrations();
  // Scheduler and registry startup hooks are added in later phases.
}
