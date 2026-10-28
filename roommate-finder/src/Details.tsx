
/*
 * Details.tsx
 *
 * Collects user information for the Roommate Finder application.
 * Information includes name, age, hobbies, bedtime, cleanliness,
 * and pet preferences.
 *
 * When the page opens, it loads the user's saved details from the
 * Express backend (server.js) and fills in the fields. A brand-new
 * account has empty details, so the fields start blank.
 *
 * When the user submits the form, the information is converted
 * into JSON and sent to the backend using an HTTP PUT request, which
 * saves it inside that user's record in users.txt.
 *
 * CORS allows the React frontend to communicate with the
 * Express backend running on a different port.
 */

import { useEffect, useState } from "react";
import type { SubmitEvent, ChangeEvent } from "react";
import "./Details.css";

// Defines the roommate information collected from the user
interface UserDetails {
  name: string;
  age: string;
  hobbies: string;
  bedtime: string;
  cleanliness: string;
  pets: string;
}

// Defines the information passed from App.tsx
interface DetailsProps {
  userId: string;
}

// Receives the logged-in user's ID from App.tsx
function Details({ userId }: DetailsProps) {

  // Stores all roommate information in one state object
  const [userDetails, setUserDetails] = useState<UserDetails>({
    name: "",
    age: "",
    hobbies: "",
    bedtime: "",
    cleanliness: "",
    pets: ""
  });

  // Loads the user's saved details and fills in the form.
  // A freshly created account returns empty strings, so fields stay blank.
  useEffect(() => {
    let cancelled = false;

    async function loadDetails() {
      try {
        const response = await fetch(
          `http://localhost:3001/api/details/${encodeURIComponent(userId)}`
        );

        if (!response.ok) {
          throw new Error("Failed to load user details");
        }

        const saved: Partial<UserDetails> = await response.json();

        if (!cancelled) {
          setUserDetails(prev => ({ ...prev, ...saved }));
        }
      } catch (error) {
        console.error("Error loading user details:", error);
      }
    }

    loadDetails();

    return () => {
      cancelled = true;
    };
  }, [userId]);

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
    <main className="page">
      <section className="details-card">
        <div className="brand-mark">R</div>
        <h1>Roommate Details</h1>
        <p className="subtitle">
          Please enter your information and living preferences.
        </p>

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

        <div className="field-row">
          <div className="field">
            <label htmlFor="bedtime">Bedtime:</label>
            <input
              id="bedtime"
              type="time"
              name="bedtime"
              value={userDetails.bedtime}
              onChange={handleChange}
            />
          </div>

          <div className="field">
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
          </div>
        </div>

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
        <button className="submit-button" type="submit">
          Save Details
        </button>

        </form>
      </section>
    </main>
  );
}

export default Details;
