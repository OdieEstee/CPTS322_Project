/*
 * auth.js — knowing who is making a request
 *
 * After login/signup the server hands the browser a random token (see
 * createSession in store.js). The browser sends it back on every request:
 *
 *     Authorization: Bearer <token>
 *
 * requireAuth() checks that token and puts the logged-in user's ID on
 * req.userId. Routes that use it never trust a user ID from the URL or the
 * body, so nobody can read or send messages as someone else.
 *
 * POST /api/logout   Ends the current session (the token stops working).
 */

import express from "express";

// Pulls the token out of "Authorization: Bearer <token>", or returns null.
function readBearerToken(req) {
  const header = req.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(header);
  return match ? match[1] : null;
}

// Middleware: rejects the request with 401 unless it has a valid token.
export function requireAuth(store) {
  return async (req, res, next) => {
    const token = readBearerToken(req);
    if (!token) {
      return res.status(401).json({ message: "Please log in first." });
    }

    try {
      const userId = await store.userIdForToken(token);
      if (!userId) {
        return res
          .status(401)
          .json({ message: "Your session has expired. Please log in again." });
      }
      req.userId = userId;
      req.sessionToken = token;
      next();
    } catch (error) {
      console.error("Error checking session:", error);
      res.status(500).json({ message: "Something went wrong on the server." });
    }
  };
}

export function createAuthRouter(store) {
  const router = express.Router();

  router.post("/api/logout", requireAuth(store), async (req, res) => {
    try {
      await store.deleteSession(req.sessionToken);
      res.json({ message: "Logged out." });
    } catch (error) {
      console.error("Error logging out:", error);
      res.status(500).json({ message: "Something went wrong on the server." });
    }
  });

  return router;
}
