/*
 * db.js — the one place the server connects to PostgreSQL
 *
 * Every other file that needs the database imports from here:
 *
 *     import { pool } from "./db.js";
 *     const result = await pool.query("SELECT ...", [values]);
 *
 * Connection settings come from the .env file in the project's top folder
 * (the same file docker-compose.yml uses), so the server and the database
 * container always agree on the name, user, password and port.
 */

import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to the shared .env file: roommate-finder/server -> project top folder.
const ENV_FILE = path.join(__dirname, "..", "..", ".env");

// Load the .env values into process.env. process.loadEnvFile is built into
// Node 20.12+, so no extra package (like dotenv) is needed.
try {
  process.loadEnvFile(ENV_FILE);
} catch {
  console.warn(
    `No .env file found at ${ENV_FILE}. ` +
      "Copy .env.example to .env (see docker-compose.yml)."
  );
}

/*
 * A "pool" keeps a few database connections open and lends one out to each
 * query. Opening a new connection for every request would be slow, and one
 * shared connection would make requests wait on each other.
 */
export const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 10 // at most 10 connections open at once
});

// If an idle connection breaks (e.g. the container restarted), log it instead
// of letting the error crash the whole server. The pool reconnects by itself.
pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL error:", error.message);
});

/*
 * Runs a quick test query when the server starts, so a missing or stopped
 * database is reported right away with a helpful message, instead of only
 * when someone tries to log in.
 */
export async function checkDatabaseConnection() {
  try {
    await pool.query("SELECT 1");
    console.log("Connected to PostgreSQL.");
  } catch (error) {
    console.error(
      "Could not connect to PostgreSQL. Is the database running?\n" +
        "Start it with:  npm run db:up   (from the project's top folder)\n" +
        `Details: ${error.message}`
    );
  }
}
