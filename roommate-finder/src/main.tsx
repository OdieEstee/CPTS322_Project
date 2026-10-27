
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import Details from "./Details";

// Temporarily displays the Details page for testing.
// Uses a fictional user ID to save and load preferences.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Details userId="demo-user-1" />
  </StrictMode>
);
