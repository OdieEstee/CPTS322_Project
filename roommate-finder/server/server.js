/*
 * server.js — the single Express backend for Roommate Finder
 *
 * POST /api/signup           Creates an account (details start empty).
 * POST /api/login            Logs into an existing account.
 * GET  /api/details/:userId  Returns a user's saved details.
 * PUT  /api/details/:userId  Creates or updates a user's details.
 * GET  /api/health           Confirms the backend is running.
 *
 * Every user is stored as ONE JSON object in users.txt:
 *
 *   {
 *     "id": "…",
 *     "email": "you@example.com",
 *     "passwordHash": "…",
 *     "details": {
 *       "name": "", "age": "", "hobbies": "",
 *       "bedtime": "", "cleanliness": "", "pets": ""
 *     }
 *   }
 *
 * A freshly created account has empty strings for every details field
 * until the user fills them in on the Details page.
 *
 * NOTE: user IDs are not a real authentication mechanism yet.
 */

import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

const USERS_FILE = path.join(__dirname, "users.txt");

// The fields collected on the Details page.
const DETAIL_FIELDS = [
  "name",
  "age",
  "hobbies",
  "bedtime",
  "cleanliness",
  "pets"
];

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "16kb" }));


/* ---------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------- */

// Returns a details object with every field set to "".
function emptyDetails() {
  return Object.fromEntries(DETAIL_FIELDS.map((field) => [field, ""]));
}

// Makes sure a stored user record has an id and a complete details object.
// This also upgrades older records that only had email + passwordHash.
function normalizeUser(user) {
  const details = { ...emptyDetails() };
  if (user.details && typeof user.details === "object") {
    for (const field of DETAIL_FIELDS) {
      if (typeof user.details[field] === "string") {
        details[field] = user.details[field];
      }
    }
  }
  return {
    id: typeof user.id === "string" ? user.id : randomUUID(),
    email: user.email,
    passwordHash: user.passwordHash,
    details
  };
}

// What the frontend is allowed to see about a user (never the hash).
function publicUser(user) {
  return { id: user.id, email: user.email };
}

// Read all user records from users.txt.
async function readUsers() {
  try {
    const contents = await fs.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(contents);
    if (!Array.isArray(parsed)) {
      throw new Error("Invalid users.txt format");
    }
    return parsed.map(normalizeUser);
  } catch (error) {
    // No file yet means no accounts yet.
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

// Write all user records back to users.txt.
async function writeUsers(users) {
  await fs.writeFile(
    USERS_FILE,
    JSON.stringify(users, null, 2) + "\n",
    "utf8"
  );
}

// Checks that a user ID only uses safe characters.
function validUserId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

// Accepts an empty string or a valid 24-hour time (e.g. 23:00).
function validTime(value) {
  return (
    typeof value === "string" &&
    (value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value))
  );
}

// Validates submitted details before saving them.
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

// Sign up: creates a new user with empty details.
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
        message: "Enter a valid email and a password of 8–128 characters."
      });
    }

    const users = await readUsers();

    if (users.some((user) => user.email === email)) {
      return res.status(409).json({
        message: "An account with that email already exists."
      });
    }

    const newUser = {
      id: randomUUID(),
      email,
      passwordHash: await bcrypt.hash(password, 12),
      details: emptyDetails()
    };

    users.push(newUser);
    await writeUsers(users);

    res.status(201).json({
      message: "Account created successfully!",
      user: publicUser(newUser)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong on the server." });
  }
});

// Log in: checks the password and returns the user's id.
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

    const users = await readUsers();
    const user = users.find((item) => item.email === email);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        message: "Incorrect email or password."
      });
    }

    // Saves any upgrades made by normalizeUser (e.g. a newly assigned id).
    await writeUsers(users);

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
    const users = await readUsers();
    const user = users.find((item) => item.id === userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user.details);
  } catch (error) {
    console.error("Error loading details:", error);
    res.status(500).json({ message: "Unable to load user details" });
  }
});

// Saves the user's details inside their single user record.
app.put("/api/details/:userId", async (req, res) => {
  const { userId } = req.params;
  const details = req.body;

  if (!validUserId(userId) || !validDetails(details)) {
    return res.status(400).json({ message: "Invalid user ID or preferences" });
  }

  try {
    const users = await readUsers();
    const user = users.find((item) => item.id === userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.details = {
      name: details.name.trim(),
      age: details.age,
      hobbies: details.hobbies,
      bedtime: details.bedtime,
      cleanliness: details.cleanliness,
      pets: details.pets
    };

    await writeUsers(users);

    res.status(200).json({ message: "Roommate preferences saved successfully" });
  } catch (error) {
    console.error("Error saving details:", error);
    res.status(500).json({ message: "Unable to save user details" });
  }
});


/* ---------------------------------------------------------------
 * Health check + start
 * ------------------------------------------------------------- */

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "Roommate Finder backend" });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
