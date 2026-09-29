// Command's dev server must start after the databases were recreated: the registry's server command does that
// (prepare-dbs.mjs) and only then starts listening. So wait for the registry to answer.
const deadline = Date.now() + 110_000;
while (Date.now() < deadline) {
  try {
    const r = await fetch("http://localhost:3300/healthz");
    if (r.ok) process.exit(0);
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 500));
}
console.error("timed out waiting for the registry");
process.exit(1);
