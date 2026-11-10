/*
 * migrate-users-txt.js — ONE-TIME copy of old accounts into PostgreSQL
 *
 * Before the database, accounts were saved in server/users.txt. Run this
 * script once to copy those accounts (and their details) into the database
 * so nobody has to sign up again:
 *
 *     npm run db:up                         (top folder: start the database)
 *     npm run migrate --prefix roommate-finder
 *
 * It is safe to run more than once: accounts whose email is already in the
 * database are skipped. Passwords keep working because the bcrypt hashes are
 * copied exactly as they are.
 *
 * After it succeeds, users.txt is no longer used and can be deleted.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.join(__dirname, "users.txt");

async function migrate() {
  // Read and parse the old file. If it doesn't exist, there's nothing to do.
  let users;
  try {
    users = JSON.parse(await fs.readFile(USERS_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log("No users.txt found, so there is nothing to migrate.");
      return;
    }
    throw error;
  }

  let copied = 0;
  let skipped = 0;

  for (const user of users) {
    // Use a transaction so each account is copied completely or not at all:
    // the user row and the details row are saved together.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Keep the same id, so anything that remembered it still works.
      // ON CONFLICT DO NOTHING skips accounts that are already in the database.
      const inserted = await client.query(
        `INSERT INTO users (id, email, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [user.id, user.email.trim().toLowerCase(), user.passwordHash]
      );

      if (inserted.rows.length === 0) {
        skipped++;
        await client.query("ROLLBACK");
        continue;
      }

      // Copy the details only if the user actually filled them in
      // (an account with empty details simply gets no details row).
      const d = user.details ?? {};
      if (d.name && d.age && d.cleanliness && d.pets) {
        await client.query(
          `INSERT INTO user_details
             (user_id, name, age, hobbies, bedtime, cleanliness, pets)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            user.id,
            d.name,
            Number(d.age),
            d.hobbies ?? "",
            d.bedtime ? d.bedtime : null,
            d.cleanliness,
            d.pets
          ]
        );
      }

      await client.query("COMMIT");
      copied++;
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`Could not copy ${user.email}: ${error.message}`);
    } finally {
      client.release(); // give the connection back to the pool
    }
  }

  console.log(`Done. Copied ${copied} account(s), skipped ${skipped} already in the database.`);
}

migrate()
  .catch((error) => {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end()); // close connections so the script can exit
