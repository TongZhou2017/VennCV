import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initPersistentStorage } from "./storage/initLibrary";
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

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("缺少根节点");
}
const mount = rootElement;

function showStartupError(message: string) {
  mount.replaceChildren();
  const box = document.createElement("p");
  box.style.margin = "24px";
  box.style.lineHeight = "1.5";
  box.textContent = message;
  mount.appendChild(box);
}

initPersistentStorage()
  .then(() => {
    createRoot(mount).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : "未知错误";
    showStartupError(
      `无法打开本机用户库（${detail}）。请用开发服务或桌面版启动。用户数据不会写进浏览器。`,
    );
  });
