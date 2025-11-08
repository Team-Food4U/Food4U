/*
  The entry point of the React application.
  Creates the React root, loads global CSS (Bootstrap + custom styles), and renders the top-level <App /> component into the #root element in index.html.
*/

import React from "react";
// createRoot is how to attach a React tree to a real DOM element in React 18+
import { createRoot } from "react-dom/client";

// Top-level App component (the entire UI is inside App)
import App from "./App.jsx";

// Bootstrap CSS (optional): provides ready-made, responsive UI utilities and components.
// Styles are available globally.
import "bootstrap/dist/css/bootstrap.min.css";

// Our app's custom styles. This file contains the CSS rules for the app.
import "./index.css";

createRoot(document.getElementById("root")).render(<App />);
