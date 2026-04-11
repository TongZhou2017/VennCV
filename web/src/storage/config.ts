import yaml from "js-yaml";
import type { UserConfig } from "../types";
import type { WriteStorageResult } from "./fs";
import { existsStorage, readStorage, writeStorage } from "./fs";

const CONFIG_PATH = "config.yaml";

export const DEFAULT_WORKSPACE_FILENAME = "workspace.json";

/** 合法工作区：users/<username>/<仅文件名>.json */
export function isValidWorkspaceStorageKey(username: string, logicalPath: string): boolean {
  const norm = logicalPath.replace(/\\/g, "/");
  const prefix = `users/${username}/`;
  if (!norm.startsWith(prefix) || !norm.endsWith(".json")) return false;
  const rest = norm.slice(prefix.length);
  if (!rest || rest.includes("/") || rest.includes("..")) return false;
  return /^[a-zA-Z0-9_.-]+\.json$/.test(rest);
}

/** 根据 config 中 last_edited_file 解析当前工作区存储路径，无效时回退为默认 workspace.json */
export function resolveWorkspaceStorageKey(username: string): string {
  const cfg = loadUserConfig();
  const entry = cfg.users.find((u) => u.username === username);
  const candidate = entry?.last_edited_file?.replace(/\\/g, "/") ?? "";
  if (candidate && isValidWorkspaceStorageKey(username, candidate)) {
    return candidate;
  }
  return `users/${username}/${DEFAULT_WORKSPACE_FILENAME}`;
}

export function setUserLastEditedFile(username: string, logicalPath: string): WriteStorageResult {
  if (!isValidWorkspaceStorageKey(username, logicalPath)) {
    return { ok: false, code: "UNKNOWN", message: "无效的工作区路径" };
  }
  const cfg = loadUserConfig();
  const entry = cfg.users.find((u) => u.username === username);
  if (!entry) {
    return { ok: false, code: "UNKNOWN", message: "用户不存在" };
  }
  entry.last_edited_file = logicalPath;
  return saveUserConfig(cfg);
}

/** 用户输入转为安全的工作区文件名，如 my-backup → my-backup.json（禁止路径分隔符） */
export function normalizeNewWorkspaceFilename(input: string): string | null {
  const s = input.trim();
  if (s.includes("/") || s.includes("\\")) return null;
  const name = s.replace(/\.json$/i, "");
  if (!name || !/^[a-zA-Z0-9_.-]+$/.test(name)) return null;
  return `${name}.json`;
}

export const DEFAULT_USER_CONFIG: UserConfig = {
  users: [
    {
      username: "admin",
      password_hash: "admin",
      data_storage_path: "users/admin",
      last_edited_file: null,
    },
  ],
};

export function loadUserConfig(): UserConfig {
  if (!existsStorage(CONFIG_PATH)) {
    writeStorage(CONFIG_PATH, yaml.dump(DEFAULT_USER_CONFIG));
  }
  const raw = readStorage(CONFIG_PATH);
  if (!raw) return DEFAULT_USER_CONFIG;
  try {
    return yaml.load(raw) as UserConfig;
  } catch {
    return DEFAULT_USER_CONFIG;
  }
}

export function saveUserConfig(config: UserConfig): WriteStorageResult {
  return writeStorage(CONFIG_PATH, yaml.dump(config));
}

export function verifyUser(
  username: string,
  password: string,
): { ok: true; storagePath?: string | null } | { ok: false } {
  const config = loadUserConfig();
  for (const u of config.users) {
    if (u.username === username && u.password_hash === password) {
      return { ok: true, storagePath: u.data_storage_path };
    }
  }
  return { ok: false };
}
