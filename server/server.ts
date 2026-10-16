/*
 * server.ts
 *
 * Creates an Express server for the Roommate Finder application.
 * Receives user details from the React frontend.
 * Validates the information and saves it into a temporary text file.
 */

import express from "express";
import cors from "cors";
import { appendFile } from "node:fs/promises";
import path from "node:path";

// Creates the Express application
const app = express();

// Defines the backend server port
const PORT = 3001;

// Allows React to communicate with Express
app.use(cors({
  origin: "http://localhost:5173"
}));

// Parses incoming JSON requests
app.use(express.json());

// Location of the temporary data file
const filePath = path.join(process.cwd(), "userDetails.txt");

// Receives user information from Details.tsx
app.post("/api/details", async (req, res) => {

  const details = req.body;

  // Make sure the required fields are valid
  if (
    !details ||
    typeof details.name !== "string" ||
    !details.name.trim() ||
    typeof details.age !== "string" ||
    !Number.isInteger(Number(details.age)) ||
    Number(details.age) < 18 ||
    !["relaxed", "moderate", "very-clean"].includes(details.cleanliness) ||
    !["yes", "no", "depends"].includes(details.pets)
  ) {
    return res.status(400).json({
      message: "Invalid user information"
    });
  }

  // Creates an object containing the submitted information
  const userDetails = {
    name: details.name.trim(),
    age: Number(details.age),
    hobbies: details.hobbies,
    bedtime: details.bedtime,
    cleanliness: details.cleanliness,
    quietHoursStart: details.quietHoursStart,
    quietHoursEnd: details.quietHoursEnd,
    pets: details.pets
  };

  try {
    // Adds the user information to the text file
    await appendFile(
      filePath,
      JSON.stringify(userDetails) + "\n",
      "utf8"
    );

    // Sends a success response to the frontend
    res.status(201).json({
      message: "User details saved successfully!"
    });

  } catch (error) {
    console.error("Error saving user details:", error);

    res.status(500).json({
      message: "Unable to save user information"
    });
  }
});

// Starts the Express server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
