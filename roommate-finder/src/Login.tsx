
import { useState } from "react";
import "./Login.css";

type Mode = "login" | "signup";

function Login() {
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(
        `http://localhost:3001/api/${mode}`,
        {
          method: "POST",
          headers: {    
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Request failed.");
      }

      setMessage(data.message);
      setPassword("");

      if (mode === "signup") {
        setMode("login");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not connect to the server."
      );
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setMode(mode === "signup" ? "login" : "signup");
    setMessage("");
    setPassword("");
  }

  return (
    <main className="page">
      <section className="auth-card">
        <div className="brand-mark">R</div>

        <h1>Roommate Finder</h1>
        <p className="subtitle">
          Find your place. Meet your people.
        </p>

        <div className="tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setMessage("");
            }}
          >
            Log In
          </button>

          <button
            type="button"
            className={mode === "signup" ? "active" : ""}
            onClick={() => {
              setMode("signup");
              setMessage("");
            }}
          >
            Sign Up
          </button>
        </div>

        <h2>
          {mode === "signup" ? "Create an account" : "Welcome back"}
        </h2>

        <p className="description">
          {mode === "signup"
            ? "Get started finding your ideal roommate."
            : "Log in to continue your search."}
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder={
              mode === "signup"
                ? "At least 8 characters"
                : "Enter your password"
            }
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            minLength={mode === "signup" ? 8 : undefined}
            maxLength={128}
            required
          />

          {message && (
            <p className="message" role="status">
              {message}
            </p>
          )}

          <button
            className="submit-button"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : mode === "signup"
                ? "Create Account"
                : "Log In"}
          </button>
        </form>


      </section>
    </main>
  );
}

export default Login;
