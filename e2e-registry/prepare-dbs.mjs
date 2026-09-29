// Fresh databases for the cross-app run: one for the registry, one for Command.
import pg from "pg";

const adminUrl = process.env.TEST_DATABASE_URL ?? "postgres://command:command@localhost:54329/command";
const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
for (const name of ["registry_e2e", "command_reg_e2e"]) {
  await pool.query(`drop database if exists ${name} with (force)`);
  await pool.query(`create database ${name}`);
}
await pool.end();
