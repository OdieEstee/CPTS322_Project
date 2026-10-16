/// created the deatails functionalituy where the information 
/// will be taken from the login page and it will be snet to express data base and 
/// it will create a server to parse the data and then corse will be used to communitcate the the details to 
/// the log in page. 

import { useState } from "react";
import type { FormEvent, ChangeEvent } from "react";

// Defines what information we collect from the user
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

function Details() {

  // Stores all the user information
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

  // Updates the information as the user types
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;

    setUserDetails(prev => ({
      ...prev,
      [name]: value
    }));
  }

  // Sends user information to the Express server
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      const response = await fetch("http://localhost:3001/api/details", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(userDetails)
      });

      if (!response.ok) {
        throw new Error("Failed to save user details");
      }

      alert("User details saved successfully!");
    } catch (error) {
      console.error(error);
      alert("Error saving details");
    }
  }

  return (
    <div>
      <h1>Roommate Details</h1>

      <form onSubmit={handleSubmit}>
        <label>Name:</label>
        <input
          type="text"
          name="name"
          value={userDetails.name}
          onChange={handleChange}
          required
        />

        <label>Age:</label>
        <input
          type="number"
          name="age"
          min="18"
          value={userDetails.age}
          onChange={handleChange}
          required
        />

        <label>Hobbies:</label>
        <input
          type="text"
          name="hobbies"
          value={userDetails.hobbies}
          onChange={handleChange}
        />

        <label>Bedtime:</label>
        <input
          type="time"
          name="bedtime"
          value={userDetails.bedtime}
          onChange={handleChange}
        />

        <label>Cleanliness:</label>
        <input
          type="text"
          name="cleanliness"
          value={userDetails.cleanliness}
          onChange={handleChange}
        />

        <label>Quiet Hours Start:</label>
        <input
          type="time"
          name="quietHoursStart"
          value={userDetails.quietHoursStart}
          onChange={handleChange}
        />

        <label>Quiet Hours End:</label>
        <input
          type="time"
          name="quietHoursEnd"
          value={userDetails.quietHoursEnd}
          onChange={handleChange}
        />

        <label>Pets:</label>
        <input
          type="text"
          name="pets"
          value={userDetails.pets}
          onChange={handleChange}
        />

        <button type="submit">Save Details</button>
      </form>
    </div>
  );
}

export default Details;
