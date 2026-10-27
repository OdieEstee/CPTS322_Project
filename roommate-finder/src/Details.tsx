
/*
 * Details.tsx
 *
 * Collects user information for the Roommate Finder application.
 * Information includes name, age, hobbies, bedtime, cleanliness,
 * quiet hours, and pet preferences.
 *
 * When the user submits the form, the information is converted
 * into JSON and sent to the Express backend using an HTTP POST request.
 *
 * The Express server will validate and save the information into
 * a temporary text file.
 *
 * CORS allows the React frontend to communicate with the
 * Express backend running on a different port.
 */

import { useState } from "react";
import type { SubmitEvent, ChangeEvent } from "react";
import "./Details.css";

// Defines the roommate information collected from the user
interface UserDetails {
  name: string;
  age: string;
  hobbies: string;
  bedtime: string;
  cleanliness: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  pets: string;
}

// Defines the information passed from main.tsx
interface DetailsProps {
  userId: string;
}

// Receives the user ID from main.tsx
function Details({ userId }: DetailsProps) {

  // Stores all roommate information in one state object
  const [userDetails, setUserDetails] = useState<UserDetails>({
    name: "",
    age: "",
    hobbies: "",
    bedtime: "",
    cleanliness: "",
    quietHoursStart: "",
    quietHoursEnd: "",
    pets: ""
  });

  // Updates the corresponding field when the user changes an input
  function handleChange(
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;

    setUserDetails(prev => ({
      ...prev,
      [name]: value
    }));
  }

/*
 * Sends the user's preferences to Express.
 * The userId identifies which profile is being saved.
 * PUT creates or updates the user's saved information.
 */
async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
  // Prevents the page from refreshing.
  e.preventDefault();

  try {
    // Sends user information to the correct profile.
    const response = await fetch(
      `http://localhost:3001/api/details/${encodeURIComponent(userId)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(userDetails)
      }
    );

    // Checks whether Express successfully saved it.
    if (!response.ok) {
      throw new Error("Failed to save user details");
    }

    alert("User details saved successfully!");

  } catch (error) {
    console.error("Error saving user details:", error);
    alert("Error saving details. Please try again.");
  }
}

  return (
    <div className="details-page">
      <h1>Roommate Details</h1>
      <p>Please enter your information and living preferences.</p>

      <form onSubmit={handleSubmit}>

        {/* User's name */}
        <label htmlFor="name">Name:</label>
        <input
          id="name"
          type="text"
          name="name"
          value={userDetails.name}
          onChange={handleChange}
          required
        />

        {/* User's age */}
        <label htmlFor="age">Age:</label>
        <input
          id="age"
          type="number"
          name="age"
          min="18"
          step="1"
          value={userDetails.age}
          onChange={handleChange}
          required
        />

        {/* User's hobbies */}
        <label htmlFor="hobbies">Hobbies:</label>
        <input
          id="hobbies"
          type="text"
          name="hobbies"
          value={userDetails.hobbies}
          onChange={handleChange}
          placeholder="Gaming, hiking, sports..."
        />

        {/* User's preferred bedtime */}
        <label htmlFor="bedtime">Bedtime:</label>
        <input
          id="bedtime"
          type="time"
          name="bedtime"
          value={userDetails.bedtime}
          onChange={handleChange}
        />

        {/* User's cleanliness preference */}
        <label htmlFor="cleanliness">Cleanliness:</label>
        <select
          id="cleanliness"
          name="cleanliness"
          value={userDetails.cleanliness}
          onChange={handleChange}
          required
        >
          <option value="">Select cleanliness</option>
          <option value="relaxed">Relaxed</option>
          <option value="moderate">Moderate</option>
          <option value="very-clean">Very Clean</option>
        </select>

        {/* User's preferred quiet hours */}
        <label htmlFor="quietHoursStart">Quiet Hours Start:</label>
        <input
          id="quietHoursStart"
          type="time"
          name="quietHoursStart"
          value={userDetails.quietHoursStart}
          onChange={handleChange}
        />

        <label htmlFor="quietHoursEnd">Quiet Hours End:</label>
        <input
          id="quietHoursEnd"
          type="time"
          name="quietHoursEnd"
          value={userDetails.quietHoursEnd}
          onChange={handleChange}
        />

        {/* User's pet preferences; gave options so no errors could be given by user */}
        <label htmlFor="pets">
          Are you comfortable living with pets?
        </label>
        <select
          id="pets"
          name="pets"
          value={userDetails.pets}
          onChange={handleChange}
          required
        >
          <option value="">Select an option</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
          <option value="depends">Depends on the animal</option>
        </select>

        {/* Submits the information to the backend */}
        <button type="submit">Save Details</button>

      </form>
    </div>
  );
}

export default Details;
