import React from "react";
import ReactDOM from "react-dom/client";
import "./monaco-setup"; // must run before any Monaco editor mounts
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
