/*
 * App.tsx
 *
 * Decides which page to show:
 *   - No one logged in  -> Login page
 *   - User logged in    -> a top bar to switch between Details and Messages
 *
 * The home page / match cards can be added as another entry in PAGES.
 */

import { useCallback, useState } from "react";
import "./AppNav.css";
import Login from "./Login.tsx";
import Details from "./Details.tsx";
import Messages from "./Messages.tsx";
import { apiFetch } from "./api.ts";

// The user information returned by the backend after login/signup.
// token proves who the user is on requests that need it (see api.ts).
export interface AuthUser {
  id: string;
  email: string;
  token: string;
}

type Page = "details" | "messages";

const PAGES: { id: Page; label: string }[] = [
  { id: "details", label: "My Details" },
  { id: "messages", label: "Messages" }
];

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [page, setPage] = useState<Page>("details");

  // Used when the server says the token expired: just go back to Login.
  const endSession = useCallback(() => {
    setUser(null);
    setPage("details");
  }, []);

  async function logOut() {
    if (user) {
      // Tell the server to forget the token. Log out locally either way.
      await apiFetch("/api/logout", user.token, { method: "POST" }).catch(() => {});
    }
    endSession();
  }

  if (!user) {
    return <Login onAuthenticated={setUser} />;
  }

  return (
    <>
      <nav className="app-nav">
        <span className="app-nav-brand">R</span>
        {PAGES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={page === id ? "active" : ""}
            aria-current={page === id ? "page" : undefined}
            onClick={() => setPage(id)}
          >
            {label}
          </button>
        ))}
        <span className="app-nav-user">{user.email}</span>
        <button type="button" onClick={logOut}>
          Log out
        </button>
      </nav>

      {page === "details" && <Details userId={user.id} />}
      {page === "messages" && <Messages user={user} onSessionExpired={endSession} />}
    </>
  );
}

export default App;
