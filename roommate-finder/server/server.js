/*
 * server.js — the single Express backend for Roommate Finder
 *
 * POST /api/signup           Creates an account (details start empty).
 * POST /api/login            Logs into an existing account.
 * GET  /api/details/:userId  Returns a user's saved details.
 * PUT  /api/details/:userId  Creates or updates a user's details.
 * GET  /api/health           Confirms the backend (and database) is running.
 *
 * All data is stored in PostgreSQL (it used to be in users.txt).
 * The tables are defined in db/init.sql in the project's top folder:
 *
 *   users         id, email, password_hash, created_at
 *   user_details  user_id, name, age, hobbies, bedtime, cleanliness, pets
 *
 * The API sends and receives exactly the same JSON as before, so the React
 * frontend did not need any changes.
 *
 * SAFETY NOTE: every query passes user input as a parameter ($1, $2, ...)
 * instead of gluing it into the SQL text. PostgreSQL then treats the input
 * strictly as data, which prevents SQL injection attacks. Keep doing this
 * for every new query.
 *
 * NOTE: user IDs are not a real authentication mechanism yet.
 */

import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { pool, checkDatabaseConnection } from "./db.js";

const app = express();
const PORT = 3001;

// PostgreSQL error codes this file reacts to.
// Full list: https://www.postgresql.org/docs/16/errcodes-appendix.html
const UNIQUE_VIOLATION = "23505"; // e.g. an email that is already registered
const FOREIGN_KEY_VIOLATION = "23503"; // e.g. details for a user that doesn't exist

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "16kb" }));


/* ---------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------- */

// What the Details page receives for a user who hasn't saved details yet.
function emptyDetails() {
  return {
    name: "",
    age: "",
    hobbies: "",
    bedtime: "",
    cleanliness: "",
    pets: ""
  };
}

// What the frontend is allowed to see about a user (never the hash).
function publicUser(row) {
  return { id: row.id, email: row.email };
}

// Checks that a user ID is a UUID (the format the users table generates).
// Checking first means a bad ID gets a clear 400 instead of a database error.
function validUserId(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

// Accepts an empty string or a valid 24-hour time (e.g. 23:00).
function validTime(value) {
  return (
    typeof value === "string" &&
    (value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value))
  );
}

// Validates submitted details before saving them.
// (The database has matching CHECK rules as a second line of defense.)
function validDetails(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const age = Number(value.age);

  return (
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    value.name.length <= 100 &&

    typeof value.age === "string" &&
    /^\d+$/.test(value.age) &&
    Number.isInteger(age) &&
    age >= 18 &&
    age <= 120 &&

    typeof value.hobbies === "string" &&
    value.hobbies.length <= 500 &&

    validTime(value.bedtime) &&

    typeof value.cleanliness === "string" &&
    ["relaxed", "moderate", "very-clean"].includes(value.cleanliness) &&

    typeof value.pets === "string" &&
    ["yes", "no", "depends"].includes(value.pets)
  );
}


/* ---------------------------------------------------------------
 * Account endpoints
 * ------------------------------------------------------------- */

// Sign up: creates a new row in the users table. No details row is made yet;
// that happens the first time the user saves the Details page.
app.post("/api/signup", async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;

    if (
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        message: "Enter a valid email and a password of 8-128 characters."
      });
    }

    // Hash the password with bcrypt (12 rounds) so the real password is
    // never stored anywhere.
    const passwordHash = await bcrypt.hash(password, 12);

    // Insert the new account. PostgreSQL creates the id automatically, and
    // RETURNING sends back the new row so we don't need a second query.
    const result = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email`,
      [email, passwordHash]
    );

    res.status(201).json({
      message: "Account created successfully!",
      user: publicUser(result.rows[0])
    });
  } catch (error) {
    // The UNIQUE rule on users.email rejected the insert: the email is taken.
    // Letting the database check this (instead of searching first) also
    // works correctly when two people sign up with the same email at once.
    if (error.code === UNIQUE_VIOLATION) {
      return res.status(409).json({
        message: "An account with that email already exists."
      });
    }
    console.error(error);
    res.status(500).json({ message: "Something went wrong on the server." });
  }
});

// Log in: finds the user by email, checks the password, returns their id.
app.post("/api/login", async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      password.length > 128
    ) {
      return res.status(400).json({
        message: "Enter a valid email and password."
      });
    }

    // Look up just this one user. The index on email makes this fast,
    // instead of reading every account the way users.txt had to.
    const result = await pool.query(
      `SELECT id, email, password_hash
       FROM users
       WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];

    // Same message whether the email or the password is wrong, so nobody
    // can use this page to find out which emails have accounts.
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        message: "Incorrect email or password."
      });
    }

    res.json({
      message: "Logged in successfully!",
      user: publicUser(user)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong on the server." });
  }
});


/* ---------------------------------------------------------------
 * Details endpoints
 * ------------------------------------------------------------- */

// Returns the user's details so the Details page can fill its fields.
app.get("/api/details/:userId", async (req, res) => {
  const { userId } = req.params;

  if (!validUserId(userId)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  try {
    // LEFT JOIN returns the user even when they have no details row yet
    // (the details columns are then NULL).
    // age::text and to_char(...) turn the stored number and time back into
    // the strings the frontend expects, e.g. 21 -> "21", 23:00:00 -> "23:00".
    const result = await pool.query(
      `SELECT d.user_id IS NOT NULL         AS has_details,
              d.name,
              d.age::text                   AS age,
              d.hobbies,
              to_char(d.bedtime, 'HH24:MI') AS bedtime,
              d.cleanliness,
              d.pets
       FROM users u
       LEFT JOIN user_details d ON d.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    // No row at all means no user with that id.
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const row = result.rows[0];

    // A user who hasn't filled in the form yet gets empty strings.
    if (!row.has_details) {
      return res.status(200).json(emptyDetails());
    }

    res.status(200).json({
      name: row.name,
      age: row.age,
      hobbies: row.hobbies,
      bedtime: row.bedtime ?? "", // NULL bedtime -> "" for the form
      cleanliness: row.cleanliness,
      pets: row.pets
    });
  } catch (error) {
    console.error("Error loading details:", error);
    res.status(500).json({ message: "Unable to load user details" });
  }
});

// Saves the user's details: creates their row the first time, updates it after.
app.put("/api/details/:userId", async (req, res) => {
  const { userId } = req.params;
  const details = req.body;

  if (!validUserId(userId) || !validDetails(details)) {
    return res.status(400).json({ message: "Invalid user ID or preferences" });
  }

  try {
    // "Upsert" = insert, or update if a row already exists.
    // ON CONFLICT (user_id) fires when this user already has a details row,
    // and then the existing row is updated with the new values (EXCLUDED
    // means "the values we just tried to insert").
    await pool.query(
      `INSERT INTO user_details
         (user_id, name, age, hobbies, bedtime, cleanliness, pets)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         name        = EXCLUDED.name,
         age         = EXCLUDED.age,
         hobbies     = EXCLUDED.hobbies,
         bedtime     = EXCLUDED.bedtime,
         cleanliness = EXCLUDED.cleanliness,
         pets        = EXCLUDED.pets,
         updated_at  = NOW()`,
      [
        userId,
        details.name.trim(),
        Number(details.age), // stored as a number
        details.hobbies,
        details.bedtime === "" ? null : details.bedtime, // "" -> no bedtime
        details.cleanliness,
        details.pets
      ]
    );

    res.status(200).json({ message: "Roommate preferences saved successfully" });
  } catch (error) {
    // The foreign key rejected the row: no user has this id.
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return res.status(404).json({ message: "User not found" });
    }
    console.error("Error saving details:", error);
    res.status(500).json({ message: "Unable to save user details" });
  }
});


/* ---------------------------------------------------------------
 * Health check + start
 * ------------------------------------------------------------- */

// Reports whether the server is up AND can reach the database.
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "Roommate Finder backend", database: "ok" });
  } catch {
    res.status(503).json({
      status: "error",
      service: "Roommate Finder backend",
      database: "unreachable"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  checkDatabaseConnection();
});
