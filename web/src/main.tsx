import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

function installGlobalErrorLogging() {
  const log = (kind: string, err: unknown) => {
    const msg =
      err instanceof Error
        ? `${err.name}: ${err.message}\n${err.stack ?? ""}`
        : String(err);
    console.error(`[VennCV ${kind}]`, msg);
  };
  window.addEventListener("error", (ev) => {
    log("window.error", ev.error ?? ev.message);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    log("unhandledrejection", ev.reason);
  });
}

installGlobalErrorLogging();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
