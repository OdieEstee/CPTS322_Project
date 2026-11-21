/*
 * store.js — database queries for login sessions, matches and messages
 *
 * Every function the messaging feature needs from PostgreSQL lives here, in
 * one object made by createPgStore(pool). The routes in messaging.js only
 * call these functions and never write SQL themselves. That has two benefits:
 *
 *   1. The future "check for matches" feature only needs one call:
 *          await store.createMatch(userIdA, userIdB);
 *      and the two users can message each other right away.
 *   2. Tests can swap in memory-store.js (same functions, no database),
 *      so the route logic can be tested without Docker running.
 *
 * The tables are defined in db/messaging.sql.
 *
 * As in server.js, every query passes input as a parameter ($1, $2, ...)
 * so user input is never glued into the SQL text.
 */

import crypto from "node:crypto";

// How long a login lasts before the user has to log in again.
export const SESSION_DAYS = 7;

// How many messages one request returns at most.
export const MAX_PAGE_SIZE = 100;

// A new random login token: 32 random bytes, written as URL-safe text.
export function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

// Only this hash is stored, never the token itself.
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Turns a messages row into the JSON shape the frontend uses.
function toMessage(row) {
  return {
    id: Number(row.id), // BIGSERIAL arrives as a string; ids stay far below 2^53
    senderId: row.sender_id,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export function createPgStore(pool) {
  return {
    /* ------------------------------ sessions ------------------------------ */

    // Starts a login session and returns the token to send to the browser.
    async createSession(userId) {
      const token = newToken();

      // Clean up this user's expired sessions so the table doesn't grow forever.
      await pool.query(
        "DELETE FROM sessions WHERE user_id = $1 AND expires_at <= NOW()",
        [userId]
      );
      await pool.query(
        `INSERT INTO sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, NOW() + make_interval(days => $3))`,
        [hashToken(token), userId, SESSION_DAYS]
      );
      return token;
    },

    // Returns the user ID a token belongs to, or null if it's unknown/expired.
    async userIdForToken(token) {
      const result = await pool.query(
        `SELECT user_id
         FROM sessions
         WHERE token_hash = $1 AND expires_at > NOW()`,
        [hashToken(token)]
      );
      return result.rows[0]?.user_id ?? null;
    },

    // Logs out: the token stops working immediately.
    async deleteSession(token) {
      await pool.query("DELETE FROM sessions WHERE token_hash = $1", [
        hashToken(token)
      ]);
    },

    /* ------------------------------- matches ------------------------------- */

    // Makes two users a match so they can message each other.
    // Safe to call twice for the same pair: it returns the existing match.
    // THIS is the function the matching feature should call.
    async createMatch(userId1, userId2) {
      if (userId1 === userId2) {
        throw new Error("A user can't be matched with themselves.");
      }
      // Store the smaller ID first (see the CHECK rule in messaging.sql).
      // Lowercase hex sorts the same way PostgreSQL compares UUIDs.
      const [userA, userB] = [userId1, userId2].map((id) => id.toLowerCase()).sort();

      // "DO UPDATE SET user_a = EXCLUDED.user_a" changes nothing, but unlike
      // DO NOTHING it makes RETURNING send back the row that already existed.
      const result = await pool.query(
        `INSERT INTO matches (user_a, user_b)
         VALUES ($1, $2)
         ON CONFLICT (user_a, user_b) DO UPDATE SET user_a = EXCLUDED.user_a
         RETURNING id, user_a, user_b, created_at`,
        [userA, userB]
      );
      const row = result.rows[0];
      return {
        id: row.id,
        userIds: [row.user_a, row.user_b],
        createdAt: new Date(row.created_at).toISOString()
      };
    },

    // Unmatches a pair. Their messages are deleted too (ON DELETE CASCADE).
    async deleteMatch(matchId) {
      await pool.query("DELETE FROM matches WHERE id = $1", [matchId]);
    },

    // Every match the user is in, with the other person and the latest
    // message, newest conversation first. Used for the Messages inbox.
    async listMatches(userId) {
      const result = await pool.query(
        `SELECT m.id,
                m.created_at,
                o.id                      AS other_id,
                COALESCE(d.name, o.email) AS other_name,
                latest.id                 AS last_id,
                latest.sender_id          AS last_sender_id,
                latest.body               AS last_body,
                latest.created_at         AS last_created_at
         FROM matches m
         JOIN users o
           ON o.id = CASE WHEN m.user_a = $1 THEN m.user_b ELSE m.user_a END
         LEFT JOIN user_details d ON d.user_id = o.id
         LEFT JOIN LATERAL (
           SELECT id, sender_id, body, created_at
           FROM messages
           WHERE match_id = m.id
           ORDER BY id DESC
           LIMIT 1
         ) latest ON TRUE
         WHERE m.user_a = $1 OR m.user_b = $1
         ORDER BY COALESCE(latest.created_at, m.created_at) DESC`,
        [userId]
      );

      return result.rows.map((row) => ({
        id: row.id,
        createdAt: new Date(row.created_at).toISOString(),
        otherUser: { id: row.other_id, name: row.other_name },
        lastMessage:
          row.last_id === null
            ? null
            : toMessage({
                id: row.last_id,
                sender_id: row.last_sender_id,
                body: row.last_body,
                created_at: row.last_created_at
              })
      }));
    },

    // True only if the match exists AND the user is one of its two people.
    // Every message route checks this before reading or writing anything.
    async isUserInMatch(matchId, userId) {
      const result = await pool.query(
        `SELECT 1
         FROM matches
         WHERE id = $1 AND (user_a = $2 OR user_b = $2)`,
        [matchId, userId]
      );
      return result.rows.length > 0;
    },

    /* ------------------------------ messages ------------------------------ */

    // Messages in a match, oldest first.
    //   { afterId }  -> only messages newer than afterId (checking for new ones)
    //   { beforeId } -> the page of messages just older than beforeId
    //   neither      -> the most recent page
    async listMessages(matchId, { afterId = null, beforeId = null, limit = 50 } = {}) {
      const pageSize = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
      let result;

      if (afterId !== null) {
        result = await pool.query(
          `SELECT id, sender_id, body, created_at
           FROM messages
           WHERE match_id = $1 AND id > $2
           ORDER BY id ASC
           LIMIT $3`,
          [matchId, afterId, pageSize]
        );
      } else {
        // Take the newest page (DESC), then flip it back to oldest-first.
        result = await pool.query(
          `SELECT * FROM (
             SELECT id, sender_id, body, created_at
             FROM messages
             WHERE match_id = $1 AND ($2::bigint IS NULL OR id < $2::bigint)
             ORDER BY id DESC
             LIMIT $3
           ) newest
           ORDER BY id ASC`,
          [matchId, beforeId, pageSize]
        );
      }

      return result.rows.map(toMessage);
    },

    // Saves a message and returns it.
    async addMessage(matchId, senderId, body) {
      const result = await pool.query(
        `INSERT INTO messages (match_id, sender_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, sender_id, body, created_at`,
        [matchId, senderId, body]
      );
      return toMessage(result.rows[0]);
    },

    /* -------------------------------- users -------------------------------- */

    // Used by the "npm run match" helper script.
    async userIdByEmail(email) {
      const result = await pool.query("SELECT id FROM users WHERE email = $1", [
        email.trim().toLowerCase()
      ]);
      return result.rows[0]?.id ?? null;
    }
  };
}
