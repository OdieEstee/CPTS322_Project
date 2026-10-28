/*
 * App.tsx
 *
 * Decides which page to show:
 *   - No one logged in  -> Login page
 *   - User logged in    -> Details page for that user
 */

import { useState } from "react";
import Login from "./Login.tsx";
import Details from "./Details.tsx";

// The user information returned by the backend after login/signup.
export interface AuthUser {
  id: string;
  email: string;
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);

  if (!user) {
    return <Login onAuthenticated={setUser} />;
  }

  return <Details userId={user.id} />;
}

export default App;
