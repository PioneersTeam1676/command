// Fresh database for every e2e run (the web server starts before Playwright's globalSetup).
import pg from "pg";

const adminUrl = process.env.TEST_DATABASE_URL ?? "postgres://command:command@localhost:54329/command";
const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
await pool.query("drop database if exists cmd_e2e with (force)");
await pool.query("create database cmd_e2e");
await pool.end();
