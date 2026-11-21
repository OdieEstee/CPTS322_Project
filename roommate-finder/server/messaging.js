/*
 * messaging.js — text messages between matched users
 *
 * GET  /api/matches                     The logged-in user's matches (inbox),
 *                                       each with the other person and the
 *                                       latest message.
 * GET  /api/matches/:matchId/messages   Messages in one match, oldest first.
 *        ?after=<id>   only messages newer than <id> (used to check for new
 *                      messages every couple of seconds)
 *        ?before=<id>  the page just older than <id> (load earlier messages)
 *        ?limit=<n>    page size, 1-100 (default 50)
 * POST /api/matches/:matchId/messages   Sends a message: { "body": "Hi!" }
 *
 * Every route requires a login token (see auth.js), and every match route
 * checks that the logged-in user is one of the two people in that match.
 * Anyone else gets 404, so they can't even tell whether the match exists.
 *
 * Matches themselves are created elsewhere, by store.createMatch().
 */

import express from "express";
import { requireAuth } from "./auth.js";
import { MAX_PAGE_SIZE } from "./store.js";

export const MAX_MESSAGE_LENGTH = 2000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reads an optional whole-number query parameter.
// Returns undefined if it's missing, null if it's invalid.
function readIdParam(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{1,15}$/.test(value)) return null;
  return Number(value);
}

export function createMessagingRouter(store) {
  const router = express.Router();
  router.use("/api/matches", requireAuth(store));

  // Checks the :matchId in the URL and that the user is part of that match.
  // Sends the error response itself and returns false if not.
  async function checkMatchAccess(req, res) {
    const { matchId } = req.params;
    if (!UUID_PATTERN.test(matchId)) {
      res.status(400).json({ message: "Invalid conversation ID." });
      return false;
    }
    if (!(await store.isUserInMatch(matchId, req.userId))) {
      res.status(404).json({ message: "Conversation not found." });
      return false;
    }
    return true;
  }

  router.get("/api/matches", async (req, res) => {
    try {
      const matches = await store.listMatches(req.userId);
      res.json({ userId: req.userId, matches });
    } catch (error) {
      console.error("Error loading matches:", error);
      res.status(500).json({ message: "Unable to load your matches." });
    }
  });

  router.get("/api/matches/:matchId/messages", async (req, res) => {
    const afterId = readIdParam(req.query.after);
    const beforeId = readIdParam(req.query.before);
    const limit = readIdParam(req.query.limit);

    if (
      afterId === null ||
      beforeId === null ||
      limit === null ||
      (afterId !== undefined && beforeId !== undefined) ||
      (limit !== undefined && (limit < 1 || limit > MAX_PAGE_SIZE))
    ) {
      return res.status(400).json({
        message: `Use either "after" or "before" (whole numbers), and a limit of 1-${MAX_PAGE_SIZE}.`
      });
    }

    try {
      if (!(await checkMatchAccess(req, res))) return;

      const messages = await store.listMessages(req.params.matchId, {
        afterId: afterId ?? null,
        beforeId: beforeId ?? null,
        limit: limit ?? 50
      });
      res.json({ messages });
    } catch (error) {
      console.error("Error loading messages:", error);
      res.status(500).json({ message: "Unable to load messages." });
    }
  });

  router.post("/api/matches/:matchId/messages", async (req, res) => {
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";

    if (body.length === 0 || body.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        message: `A message must be 1-${MAX_MESSAGE_LENGTH} characters.`
      });
    }

    try {
      if (!(await checkMatchAccess(req, res))) return;

      const message = await store.addMessage(req.params.matchId, req.userId, body);
      res.status(201).json({ message });
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Unable to send your message." });
    }
  });

  return router;
}
