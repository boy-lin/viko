import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import "./utils/log";
import { createMenu } from "./utils/menu";

// createMenu();
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
