
/*
 * server.ts — Express backend for the Roommate Finder mockup
 *
 * GET /api/details/:userId
 *   Retrieves previously saved roommate preferences.
 *
 * PUT /api/details/:userId
 *   Creates or updates a user's roommate preferences.
 *
 * All profiles are saved in userDetails.txt.
 * The file survives browser refreshes and server restarts.
 *
 * For this mockup, user IDs are only for testing.
 * Actual authentication will be implemented later.
 */

import express from "express";
import cors from "cors";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Defines the same user information as Details.tsx.
interface UserDetails {
  name: string;
  age: string;
  hobbies: string;
  bedtime: string;
  cleanliness: string;
  pets: string;
}

// Associates each user ID with their saved profile.
type SavedProfiles = Record<string, UserDetails>;

// Creates our Express application.
const app = express();

// Backend port.
const PORT = 3001;

// Location of the temporary storage file.
const dataFile = path.join(
  process.cwd(),
  "userDetails.txt"
);

// Allows requests from our React/Vite frontend.
app.use(cors({
  origin: "http://localhost:5173"
}));

// Converts incoming JSON into req.body.
app.use(express.json({ limit: "16kb" }));


/*
 * FUNCTION 1: validUserId()
 *
 * Checks that the test user ID uses valid characters.
 * This is NOT authentication.
 */
function validUserId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,80}$/.test(value)
  );
}


/*
 * FUNCTION 2: validTime()
 *
 * Accepts an empty string or a valid 24-hour time.
 * Example: 23:00 represents 11:00 PM.
 */
function validTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (
      value === "" ||
      /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    )
  );
}


/*
 * FUNCTION 3: validDetails()
 *
 * Validates user information before saving it.
 * This prevents invalid data from being stored.
 */
function validDetails(value: unknown): value is UserDetails {

  // Verify the submitted information is an object.
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const data = value as Record<string, unknown>;
  const age = Number(data.age);

  // Check required values and their expected types.
  return (
    typeof data.name === "string" &&
    data.name.trim().length > 0 &&
    data.name.length <= 100 &&

    typeof data.age === "string" &&
    /^\d+$/.test(data.age) &&
    Number.isInteger(age) &&
    age >= 18 &&
    age <= 120 &&

    typeof data.hobbies === "string" &&
    data.hobbies.length <= 500 &&

    validTime(data.bedtime) &&

    typeof data.cleanliness === "string" &&
    ["relaxed", "moderate", "very-clean"]
      .includes(data.cleanliness) &&

    typeof data.pets === "string" &&
    ["yes", "no", "depends"]
      .includes(data.pets)
  );
}


/*
 * FUNCTION 4: readProfiles()
 *
 * Reads saved user information from userDetails.txt.
 *
 * If the file doesn't exist yet, returns an empty
 * collection so the first profile can be saved.
 */
async function readProfiles(): Promise<SavedProfiles> {

  try {
    // Read the contents of the file.
    const contents = await readFile(dataFile, "utf8");

    // Convert JSON text into a JavaScript object.
    const parsed: unknown = JSON.parse(contents);

    // Make sure the file contains a JSON object.
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error("Invalid userDetails.txt format");
    }

    // Create a dictionary without inherited properties.
    return Object.assign(
      Object.create(null),
      parsed
    ) as SavedProfiles;

  } catch (error) {

    // No file yet means there are no saved profiles.
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return Object.create(null) as SavedProfiles;
    }

    // Report other errors, such as invalid JSON.
    throw error;
  }
}


/*
 * FUNCTION 5: writeProfiles()
 *
 * Saves all user profiles to userDetails.txt.
 *
 * JSON.stringify converts the object to text.
 * The indentation makes the file easier to read.
 */
async function writeProfiles(
  profiles: SavedProfiles
): Promise<void> {

  await writeFile(
    dataFile,
    JSON.stringify(profiles, null, 2) + "\n",
    "utf8"
  );
}


/*
 * GET ENDPOINT
 *
 * Called automatically when Details.tsx opens.
 *
 * Finds the user's saved information and sends
 * it back to React so the form can be populated.
 */
app.get("/api/details/:userId", async (req, res) => {

  // Get the user ID from the URL.
  const userId = req.params.userId;

  // Check the test user ID.
  if (!validUserId(userId)) {
    res.status(400).json({
      message: "Invalid user ID"
    });
    return;
  }

  try {
    // Call readProfiles() to load existing data.
    const profiles = await readProfiles();

    // Check whether this user already has a profile.
    if (!Object.hasOwn(profiles, userId)) {
      res.status(404).json({
        message: "No saved profile found"
      });
      return;
    }

    // Return the saved profile to Details.tsx.
    res.status(200).json(profiles[userId]);

  } catch (error) {
    console.error("Error loading profile:", error);

    res.status(500).json({
      message: "Unable to load user details"
    });
  }
});


/*
 * PUT ENDPOINT
 *
 * Called when the user clicks Save Details.
 *
 * Saves a new profile or updates an existing one
 * without creating duplicate records.
 */
app.put("/api/details/:userId", async (req, res) => {

  // Identify which test user is saving information.
  const userId = req.params.userId;

  // Get the submitted JSON information.
  const details: unknown = req.body;

  // Validate everything before saving.
  if (
    !validUserId(userId) ||
    !validDetails(details)
  ) {
    res.status(400).json({
      message: "Invalid user ID or preferences"
    });
    return;
  }

  try {
    // Step 1: Load all existing profiles.
    const profiles = await readProfiles();

    // Step 2: Create or replace this user's profile.
    profiles[userId] = {
      ...details,
      name: details.name.trim()
    };

    // Step 3: Save the updated profiles to the file.
    await writeProfiles(profiles);

    // Step 4: Send a success message to React.
    res.status(200).json({
      message: "Roommate preferences saved successfully"
    });

  } catch (error) {
    console.error("Error saving profile:", error);

    res.status(500).json({
      message: "Unable to save user details"
    });
  }
});


/*
 * HEALTH CHECK
 *
 * Lets us verify the backend is running.
 */
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Roommate Finder backend"
  });
});


/*
 * START EXPRESS SERVER
 *
 * Listens for requests on port 3001.
 */
app.listen(PORT, () => {
  console.log(
    `Server running at http://localhost:${PORT}`
  );
});
