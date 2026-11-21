-- =============================================================================
-- db/messaging.sql
-- -----------------------------------------------------------------------------
-- PURPOSE:
--   Tables for logging in with a token and for messaging between matched users.
--
--     sessions  -> who is logged in (one row per login, holds a token hash)
--     matches   -> pairs of users who are allowed to message each other
--     messages  -> the text messages inside a match
--
--   Every statement uses IF NOT EXISTS, so this file is safe to run again:
--     - Docker runs it automatically when the database is first created
--       (after init.sql, because files run in alphabetical order).
--     - The Express server also runs it every time it starts, so a database
--       that was created BEFORE this file existed gets the new tables without
--       having to run "npm run db:reset" (which would delete all accounts).
--
--   HOW MATCHING PLUGS IN:
--   Nothing in the app creates matches yet. When the "check for matches"
--   feature is built, it only has to insert a row here, by calling
--   createMatch(userA, userB) in roommate-finder/server/store.js. The
--   Messages page then shows the new conversation automatically.
--   Until then, create test matches with:   npm run match -- a@x.com b@x.com
-- =============================================================================


-- -----------------------------------------------------------------------------
-- TABLE: sessions
-- Created by POST /api/login and POST /api/signup. The browser gets a random
-- token and sends it with every request ("Authorization: Bearer <token>"),
-- so the server knows who is asking instead of trusting a user ID in the URL.
-- Only a SHA-256 hash of the token is stored, so a leaked copy of this table
-- can't be used to log in as anyone.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT         PRIMARY KEY,
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);


-- -----------------------------------------------------------------------------
-- TABLE: matches
-- One row per pair of matched users. The two IDs are always stored with the
-- smaller one in user_a (the CHECK rule enforces it), so a pair can only ever
-- be stored once: (Alice, Bob) and (Bob, Alice) are the same row.
-- Deleting a match (an "unmatch") also deletes its messages.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matches (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT matches_ordered_pair CHECK (user_a < user_b),
    CONSTRAINT matches_unique_pair  UNIQUE (user_a, user_b)
);

-- The UNIQUE rule already indexes lookups by user_a; this covers user_b.
CREATE INDEX IF NOT EXISTS idx_matches_user_b ON matches (user_b);


-- -----------------------------------------------------------------------------
-- TABLE: messages
-- Every message belongs to a match, so two users who aren't matched have
-- nowhere to put a message. id counts up, which lets the browser ask for
-- "everything after the last message I have" when it checks for new ones.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id          BIGSERIAL     PRIMARY KEY,
    match_id    UUID          NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    sender_id   UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        VARCHAR(2000) NOT NULL CHECK (length(btrim(body)) > 0),
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Loading one conversation in order is the most common query.
CREATE INDEX IF NOT EXISTS idx_messages_match_id ON messages (match_id, id);
