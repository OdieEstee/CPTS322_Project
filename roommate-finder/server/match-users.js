/*
 * match-users.js — makes two existing accounts a match, for testing messaging
 *
 * The real "check for matches" feature isn't built yet, so this script
 * stands in for it. It calls the same store.createMatch() function that
 * feature will call.
 *
 * Usage (from the project's top folder, with the database running):
 *     npm run match -- alice@example.com bob@example.com
 *
 * Running it again for the same two people is harmless; it reuses the match.
 * Add --unmatch to delete the match (and its messages) instead:
 *     npm run match -- alice@example.com bob@example.com --unmatch
 */

import { pool, ensureMessagingTables } from "./db.js";
import { createPgStore } from "./store.js";

const args = process.argv.slice(2);
const unmatch = args.includes("--unmatch");
const emails = args.filter((arg) => arg !== "--unmatch");

if (emails.length !== 2) {
  console.error(
    "Usage: npm run match -- <first email> <second email> [--unmatch]"
  );
  process.exit(1);
}

const store = createPgStore(pool);

try {
  await ensureMessagingTables();

  const ids = [];
  for (const email of emails) {
    const id = await store.userIdByEmail(email);
    if (!id) {
      throw new Error(`No account uses ${email}. Sign up with it in the app first.`);
    }
    ids.push(id);
  }

  if (ids[0] === ids[1]) {
    throw new Error("Those are the same account. Use two different emails.");
  }

  const match = await store.createMatch(ids[0], ids[1]);

  if (unmatch) {
    await store.deleteMatch(match.id);
    console.log(`Unmatched ${emails[0]} and ${emails[1]}.`);
  } else {
    console.log(
      `Matched ${emails[0]} and ${emails[1]}.\n` +
        "Log in as each of them (e.g. one normal window and one private window)\n" +
        "and open Messages to chat."
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
