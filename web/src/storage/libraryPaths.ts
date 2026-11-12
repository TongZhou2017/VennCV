/** 本机用户库允许的逻辑路径。浏览器与桌面共用同一套规则。 */

export const CONFIG_FILE = "config.yaml";
export const VERSION_STORE_FILENAME = "version_store.json";
export const REMEMBER_LOGIN_FILENAME = "remember_login.json";
export const DEFAULT_WORKSPACE_FILENAME = "workspace.json";

const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const JSON_FILE = /^[A-Za-z0-9][A-Za-z0-9_.-]*\.json$/;

export function isSafeUsername(name: string): boolean {
  return USERNAME.test(name);
}

export function isSafeJsonFilename(name: string): boolean {
  return JSON_FILE.test(name) && !name.includes("..");
}

/** 只允许 config.yaml 与 users/<用户>/<文件>.json，拒绝路径穿越。 */
export function isAllowedLibraryPath(logical: string): boolean {
  const n = logical.replace(/\\/g, "/");
  if (!n || n.startsWith("/") || n.includes("\0")) return false;
  if (n.split("/").some((part) => part === ".." || part === "." || part === "")) return false;
  if (n === CONFIG_FILE) return true;
  const parts = n.split("/");
  if (parts.length !== 3 || parts[0] !== "users") return false;
  return isSafeUsername(parts[1]) && isSafeJsonFilename(parts[2]);
}

const RESERVED_USER_FILES = new Set([VERSION_STORE_FILENAME, REMEMBER_LOGIN_FILENAME]);

/** 多个工作区时优先 workspace.json；只有一个数据文件时用那一个。 */
export function chooseWorkspaceFile(filenames: string[]): string | null {
  const files = filenames.filter(
    (name) => name.endsWith(".json") && !RESERVED_USER_FILES.has(name) && isSafeJsonFilename(name),
  );
  if (files.includes(DEFAULT_WORKSPACE_FILENAME)) return DEFAULT_WORKSPACE_FILENAME;
  if (files.length === 1) return files[0];
  return null;
}
