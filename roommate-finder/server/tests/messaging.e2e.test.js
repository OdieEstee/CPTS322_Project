/*
 * messaging.e2e.test.js — a full conversation through the real server and database
 *
 * Needs the app running first, from the project's top folder:
 *     npm run db:up
 *     npm run dev            (leave it running)
 * then, in a second terminal:
 *     npm run test:e2e
 *
 * It signs up three throwaway accounts through the API, matches two of them
 * with store.createMatch() (the function the matching feature will call),
 * sends messages both ways, and checks the third account is locked out.
 * Every account it creates is deleted at the end, along with its sessions,
 * matches and messages.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { pool } from "../db.js";
import { createPgStore } from "../store.js";

const API = process.env.API_URL ?? "http://localhost:3001";
const RUN_ID = crypto.randomBytes(4).toString("hex");
const EMAIL_PREFIX = `e2e-${RUN_ID}-`;

const store = createPgStore(pool);
let alice, bob, carol; // { id, email, token }
let matchId;

async function call(method, path, { as, body } = {}) {
  const response = await fetch(API + path, {
    method,
    headers: {
      ...(as && { Authorization: `Bearer ${as.token}` }),
      ...(body !== undefined && { "Content-Type": "application/json" })
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json() };
}

async function signUp(name) {
  const email = `${EMAIL_PREFIX}${name}@example.com`;
  const { status, data } = await call("POST", "/api/signup", {
    body: { email, password: "test-password-123" }
  });
  assert.equal(status, 201, data.message);
  assert.equal(typeof data.token, "string", "signup should return a token");
  return { id: data.user.id, email, token: data.token };
}

before(async () => {
  try {
    await fetch(`${API}/api/health`);
  } catch {
    throw new Error(
      `The server isn't reachable at ${API}. Start it with "npm run dev" first.`
    );
  }
  alice = await signUp("alice");
  bob = await signUp("bob");
  carol = await signUp("carol");
  matchId = (await store.createMatch(alice.id, bob.id)).id;
});

after(async () => {
  // Deleting the accounts also deletes their sessions, matches and messages.
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`${EMAIL_PREFIX}%`]);
  await pool.end();
});

test("login returns a token that works", async () => {
  const { status, data } = await call("POST", "/api/login", {
    body: { email: alice.email, password: "test-password-123" }
  });
  assert.equal(status, 200);
  const matches = await call("GET", "/api/matches", { as: { token: data.token } });
  assert.equal(matches.status, 200);
});

test("two matched accounts exchange messages", async () => {
  const path = `/api/matches/${matchId}/messages`;

  const first = await call("POST", path, { as: alice, body: { body: "Hi Bob, still looking for a roommate?" } });
  assert.equal(first.status, 201);
  assert.equal(typeof first.data.message.id, "number");

  const bobSees = await call("GET", path, { as: bob });
  assert.deepEqual(bobSees.data.messages.map((m) => m.body), [
    "Hi Bob, still looking for a roommate?"
  ]);

  await call("POST", path, { as: bob, body: { body: "Yes! Want to grab coffee?" } });
  const aliceNew = await call("GET", `${path}?after=${first.data.message.id}`, { as: alice });
  assert.deepEqual(
    aliceNew.data.messages.map((m) => [m.senderId, m.body]),
    [[bob.id, "Yes! Want to grab coffee?"]]
  );

  const inbox = await call("GET", "/api/matches", { as: alice });
  const match = inbox.data.matches.find((m) => m.id === matchId);
  assert.equal(match.otherUser.id, bob.id);
  assert.equal(match.lastMessage.body, "Yes! Want to grab coffee?");
});

test("paging back through older messages works", async () => {
  const path = `/api/matches/${matchId}/messages`;
  const newest = await call("GET", `${path}?limit=1`, { as: alice });
  assert.equal(newest.data.messages.length, 1);
  const older = await call("GET", `${path}?limit=1&before=${newest.data.messages[0].id}`, {
    as: alice
  });
  assert.equal(older.data.messages[0].body, "Hi Bob, still looking for a roommate?");
});

test("an account outside the match is locked out", async () => {
  const path = `/api/matches/${matchId}/messages`;
  assert.equal((await call("GET", path, { as: carol })).status, 404);
  assert.equal((await call("POST", path, { as: carol, body: { body: "hi" } })).status, 404);
  const inbox = await call("GET", "/api/matches", { as: carol });
  assert.deepEqual(inbox.data.matches, []);
});

test("createMatch reuses an existing match", async () => {
  const again = await store.createMatch(bob.id, alice.id);
  assert.equal(again.id, matchId);
});

test("logging out ends the session", async () => {
  assert.equal((await call("POST", "/api/logout", { as: carol })).status, 200);
  assert.equal((await call("GET", "/api/matches", { as: carol })).status, 401);
});
