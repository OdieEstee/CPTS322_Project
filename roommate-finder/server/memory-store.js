/*
 * memory-store.js — an in-memory stand-in for store.js, used by the tests
 *
 * It has the same functions as createPgStore() in store.js, but keeps
 * everything in plain JavaScript arrays and maps instead of PostgreSQL.
 * That lets the tests check the messaging routes without Docker running.
 * Nothing in the real app uses this file.
 *
 * addUser() exists only here: in the real app, users come from /api/signup.
 */

import crypto from "node:crypto";
import { newToken, hashToken, MAX_PAGE_SIZE } from "./store.js";

export function createMemoryStore() {
  const users = new Map(); // id -> { id, email, name }
  const sessions = new Map(); // token hash -> user id
  const matches = []; // { id, userA, userB, createdAt }
  const messages = []; // { id, matchId, senderId, body, createdAt }
  let nextMessageId = 1;

  const findMatch = (matchId) => matches.find((m) => m.id === matchId);
  const publicMessage = ({ id, senderId, body, createdAt }) => ({
    id,
    senderId,
    body,
    createdAt
  });

  return {
    addUser({ email, name = null }) {
      const id = crypto.randomUUID();
      users.set(id, { id, email, name });
      return id;
    },

    async createSession(userId) {
      const token = newToken();
      sessions.set(hashToken(token), userId);
      return token;
    },

    async userIdForToken(token) {
      return sessions.get(hashToken(token)) ?? null;
    },

    async deleteSession(token) {
      sessions.delete(hashToken(token));
    },

    async createMatch(userId1, userId2) {
      if (userId1 === userId2) {
        throw new Error("A user can't be matched with themselves.");
      }
      const [userA, userB] = [userId1, userId2].map((id) => id.toLowerCase()).sort();
      let match = matches.find((m) => m.userA === userA && m.userB === userB);
      if (!match) {
        match = {
          id: crypto.randomUUID(),
          userA,
          userB,
          createdAt: new Date().toISOString()
        };
        matches.push(match);
      }
      return { id: match.id, userIds: [userA, userB], createdAt: match.createdAt };
    },

    async deleteMatch(matchId) {
      const index = matches.findIndex((m) => m.id === matchId);
      if (index !== -1) matches.splice(index, 1);
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].matchId === matchId) messages.splice(i, 1);
      }
    },

    async listMatches(userId) {
      return matches
        .filter((m) => m.userA === userId || m.userB === userId)
        .map((m) => {
          const other = users.get(m.userA === userId ? m.userB : m.userA);
          const inMatch = messages.filter((msg) => msg.matchId === m.id);
          const last = inMatch[inMatch.length - 1];
          return {
            id: m.id,
            createdAt: m.createdAt,
            otherUser: { id: other.id, name: other.name ?? other.email },
            lastMessage: last ? publicMessage(last) : null
          };
        })
        .sort((x, y) =>
          (y.lastMessage?.createdAt ?? y.createdAt).localeCompare(
            x.lastMessage?.createdAt ?? x.createdAt
          )
        );
    },

    async isUserInMatch(matchId, userId) {
      const match = findMatch(matchId);
      return Boolean(match && (match.userA === userId || match.userB === userId));
    },

    async listMessages(matchId, { afterId = null, beforeId = null, limit = 50 } = {}) {
      const pageSize = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
      const inMatch = messages.filter((m) => m.matchId === matchId);

      if (afterId !== null) {
        return inMatch.filter((m) => m.id > afterId).slice(0, pageSize).map(publicMessage);
      }
      const older = beforeId === null ? inMatch : inMatch.filter((m) => m.id < beforeId);
      return older.slice(-pageSize).map(publicMessage);
    },

    async addMessage(matchId, senderId, body) {
      const message = {
        id: nextMessageId++,
        matchId,
        senderId,
        body,
        createdAt: new Date().toISOString()
      };
      messages.push(message);
      return publicMessage(message);
    },

    async userIdByEmail(email) {
      const wanted = email.trim().toLowerCase();
      for (const user of users.values()) {
        if (user.email === wanted) return user.id;
      }
      return null;
    }
  };
}
