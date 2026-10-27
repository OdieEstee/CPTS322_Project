
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

const USERS_FILE = path.join(__dirname, "users.txt");

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// Read accounts from the local text file.
async function readUsers() {
  try {
    const contents = await fs.readFile(USERS_FILE, "utf8");
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

// Write accounts to the local text file.
async function writeUsers(users) {
  await fs.writeFile(
    USERS_FILE,
    JSON.stringify(users, null, 2),
    "utf8"
  );
}

// Sign up
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

    const passwordHash = await bcrypt.hash(password, 12);

    users.push({ email, passwordHash });
    await writeUsers(users);

    res.status(201).json({
      message: "Account created successfully!"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Something went wrong on the server."
    });
  }
});

// Log in
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

    res.json({ message: "Logged in successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Something went wrong on the server."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
