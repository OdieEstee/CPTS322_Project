/*
 * messaging.test.js — tests for login tokens and messaging between matches
 *
 * Run with:   npm test        (from the project's top folder)
 *
 * These tests use memory-store.js instead of PostgreSQL, so they don't need
 * Docker. They check the route logic: who may read and send messages, input
 * checks, and that two matched users really see each other's messages.
 * messaging.e2e.test.js runs a similar conversation against the real server
 * and database.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createMemoryStore } from "../memory-store.js";
import { createAuthRouter } from "../auth.js";
import { createMessagingRouter, MAX_MESSAGE_LENGTH } from "../messaging.js";

let server;
let baseUrl;
let store;
let alice, bob, carol; // { id, token }
let matchId;

// Sends a request as a user ({ token }) and returns { status, data }.
async function call(method, path, { as, body, headers = {} } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(as && { Authorization: `Bearer ${as.token}` }),
      ...(body !== undefined && { "Content-Type": "application/json" }),
      ...headers
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json() };
}

const messagesPath = (id = matchId) => `/api/matches/${id}/messages`;

before(async () => {
  store = createMemoryStore();

  // The same routers server.js uses, on a throwaway port.
  const app = express();
  app.use(express.json());
  app.use(createAuthRouter(store));
  app.use(createMessagingRouter(store));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://localhost:${server.address().port}`;

  const makeUser = async (email, name) => {
    const id = store.addUser({ email, name });
    return { id, token: await store.createSession(id) };
  };
  alice = await makeUser("alice@example.com", "Alice");
  bob = await makeUser("bob@example.com", null); // no details saved yet
  carol = await makeUser("carol@example.com", "Carol");

  matchId = (await store.createMatch(alice.id, bob.id)).id;
});

after(() => server.close());

test("requests without a valid token are rejected", async () => {
  assert.equal((await call("GET", "/api/matches")).status, 401);
  assert.equal(
    (await call("GET", "/api/matches", { as: { token: "x".repeat(43) } })).status,
    401
  );
  assert.equal(
    (await call("GET", "/api/matches", { headers: { Authorization: "Basic abc" } })).status,
    401
  );
  assert.equal((await call("POST", messagesPath(), { body: { body: "hi" } })).status, 401);
});

test("two matched users can message each other", async () => {
  // Alice sends the first message.
  const sent = await call("POST", messagesPath(), { as: alice, body: { body: "  Hi Bob!  " } });
  assert.equal(sent.status, 201);
  assert.equal(sent.data.message.body, "Hi Bob!"); // trimmed
  assert.equal(sent.data.message.senderId, alice.id);

  // Bob sees it.
  const bobView = await call("GET", messagesPath(), { as: bob });
  assert.equal(bobView.status, 200);
  assert.deepEqual(
    bobView.data.messages.map((m) => [m.senderId, m.body]),
    [[alice.id, "Hi Bob!"]]
  );

  // Bob replies; Alice picks up only the new message by polling with ?after=.
  const lastSeen = sent.data.message.id;
  await call("POST", messagesPath(), { as: bob, body: { body: "Hey Alice\nWhat's up?" } });
  const poll = await call("GET", `${messagesPath()}?after=${lastSeen}`, { as: alice });
  assert.equal(poll.status, 200);
  assert.deepEqual(
    poll.data.messages.map((m) => [m.senderId, m.body]),
    [[bob.id, "Hey Alice\nWhat's up?"]]
  );

  // Nothing newer yet.
  const newest = poll.data.messages.at(-1).id;
  const empty = await call("GET", `${messagesPath()}?after=${newest}`, { as: alice });
  assert.deepEqual(empty.data.messages, []);
});

test("the inbox lists the other person and the latest message", async () => {
  const forAlice = await call("GET", "/api/matches", { as: alice });
  assert.equal(forAlice.status, 200);
  assert.equal(forAlice.data.userId, alice.id);
  assert.equal(forAlice.data.matches.length, 1);
  assert.equal(forAlice.data.matches[0].id, matchId);
  assert.equal(forAlice.data.matches[0].otherUser.id, bob.id);
  // Bob hasn't saved a name, so his email is shown instead.
  assert.equal(forAlice.data.matches[0].otherUser.name, "bob@example.com");
  assert.equal(forAlice.data.matches[0].lastMessage.body, "Hey Alice\nWhat's up?");

  const forBob = await call("GET", "/api/matches", { as: bob });
  assert.equal(forBob.data.matches[0].otherUser.name, "Alice");
});

test("a user who isn't in the match can't read or send messages", async () => {
  assert.equal((await call("GET", messagesPath(), { as: carol })).status, 404);
  assert.equal(
    (await call("POST", messagesPath(), { as: carol, body: { body: "let me in" } })).status,
    404
  );
  assert.deepEqual((await call("GET", "/api/matches", { as: carol })).data.matches, []);

  // A match ID that doesn't exist looks exactly the same as someone else's.
  const missing = "00000000-0000-4000-8000-000000000000";
  assert.equal((await call("GET", messagesPath(missing), { as: alice })).status, 404);
});

test("bad input is rejected", async () => {
  const send = (body) => call("POST", messagesPath(), { as: alice, body });

  assert.equal((await send({ body: "" })).status, 400);
  assert.equal((await send({ body: "    " })).status, 400);
  assert.equal((await send({ body: 42 })).status, 400);
  assert.equal((await send({})).status, 400);
  assert.equal((await send({ body: "a".repeat(MAX_MESSAGE_LENGTH + 1) })).status, 400);
  assert.equal((await send({ body: "a".repeat(MAX_MESSAGE_LENGTH) })).status, 201);

  assert.equal((await call("GET", messagesPath("not-a-uuid"), { as: alice })).status, 400);
  for (const query of ["?after=abc", "?after=-1", "?after=1&before=5", "?limit=0", "?limit=101"]) {
    assert.equal(
      (await call("GET", messagesPath() + query, { as: alice })).status,
      400,
      query
    );
  }
});

test("older messages can be loaded a page at a time", async () => {
  const { id } = await store.createMatch(alice.id, carol.id);
  for (let i = 1; i <= 5; i++) {
    await call("POST", messagesPath(id), { as: i % 2 ? alice : carol, body: { body: `m${i}` } });
  }

  const newest = await call("GET", `${messagesPath(id)}?limit=2`, { as: carol });
  assert.deepEqual(newest.data.messages.map((m) => m.body), ["m4", "m5"]);

  const older = await call(
    "GET",
    `${messagesPath(id)}?limit=2&before=${newest.data.messages[0].id}`,
    { as: carol }
  );
  assert.deepEqual(older.data.messages.map((m) => m.body), ["m2", "m3"]);
});

test("createMatch is safe to repeat and refuses self-matches", async () => {
  const again = await store.createMatch(bob.id, alice.id); // reversed order
  assert.equal(again.id, matchId);
  await assert.rejects(() => store.createMatch(alice.id, alice.id));
});

test("logging out makes the token stop working", async () => {
  const id = store.addUser({ email: "dave@example.com" });
  const dave = { id, token: await store.createSession(id) };

  assert.equal((await call("GET", "/api/matches", { as: dave })).status, 200);
  assert.equal((await call("POST", "/api/logout", { as: dave })).status, 200);
  assert.equal((await call("GET", "/api/matches", { as: dave })).status, 401);
});
