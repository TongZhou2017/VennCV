/** 本机用户库允许的逻辑路径。浏览器与桌面共用同一套规则。 */

export const CONFIG_FILE = "config.yaml";
export const VERSION_STORE_FILENAME = "version_store.json";
export const REMEMBER_LOGIN_FILENAME = "remember_login.json";
export const SYNC_ACCOUNT_FILENAME = "sync_account.json";
export const SYNC_STATE_FILENAME = "sync_state.json";
export const SYNC_BASE_FILENAME = "sync_base.json";
export const CLOUD_UPLOAD_FILENAME = "cloud_upload.json";
export const CLOUD_CONFLICT_FILENAME = "cloud_conflict.json";
export const CLOUD_MANIFEST_FILENAME = "sync.json";
export const DEFAULT_WORKSPACE_FILENAME = "workspace.json";

const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const JSON_FILE = /^[A-Za-z0-9][A-Za-z0-9_.-]*\.json$/;

export function isSafeUsername(name: string): boolean {
  return USERNAME.test(name);
}

export function isSafeJsonFilename(name: string): boolean {
  return JSON_FILE.test(name) && !name.includes("..");
}

/** 只允许 config.yaml、库根的 sync_account.json，以及 users/<用户>/<文件>.json。拒绝路径穿越。 */
export function isAllowedLibraryPath(logical: string): boolean {
  const n = logical.replace(/\\/g, "/");
  if (!n || n.startsWith("/") || n.includes("\0")) return false;
  if (n.split("/").some((part) => part === ".." || part === "." || part === "")) return false;
  if (n === CONFIG_FILE || n === SYNC_ACCOUNT_FILENAME) return true;
  const parts = n.split("/");
  if (parts.length !== 3 || parts[0] !== "users") return false;
  return isSafeUsername(parts[1]) && isSafeJsonFilename(parts[2]);
}

const RESERVED_USER_FILES = new Set([
  VERSION_STORE_FILENAME,
  REMEMBER_LOGIN_FILENAME,
  SYNC_ACCOUNT_FILENAME,
  SYNC_STATE_FILENAME,
  SYNC_BASE_FILENAME,
  CLOUD_UPLOAD_FILENAME,
  CLOUD_CONFLICT_FILENAME,
  CLOUD_MANIFEST_FILENAME,
]);

const STAY_LOCAL = new Set([
  REMEMBER_LOGIN_FILENAME,
  SYNC_ACCOUNT_FILENAME,
  SYNC_STATE_FILENAME,
  SYNC_BASE_FILENAME,
  CLOUD_UPLOAD_FILENAME,
  CLOUD_CONFLICT_FILENAME,
  CLOUD_MANIFEST_FILENAME,
]);

export function isReservedUserFile(name: string): boolean {
  return RESERVED_USER_FILES.has(name);
}

/** 可以上传的工作区文件。同步记录、账号和记住登录留在本机。 */
export function isCloudDataFilename(name: string): boolean {
  return isSafeJsonFilename(name) && !STAY_LOCAL.has(name);
}

export function cloudUploadNames(filenames: string[]): string[] {
  return filenames.filter((name) => isCloudDataFilename(name));
}

/** 多个工作区时优先 workspace.json；只有一个数据文件时用那一个。 */
export function chooseWorkspaceFile(filenames: string[]): string | null {
  const files = filenames.filter(
    (name) => name.endsWith(".json") && !RESERVED_USER_FILES.has(name) && isSafeJsonFilename(name),
  );
  if (files.includes(DEFAULT_WORKSPACE_FILENAME)) return DEFAULT_WORKSPACE_FILENAME;
  if (files.length === 1) return files[0];
  return null;
}
