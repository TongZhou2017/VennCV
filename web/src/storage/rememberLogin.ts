import { readStorage, writeStorage } from "./fs";
import { isSafeUsername } from "./libraryPaths";

export const REMEMBER_LOGIN_FILENAME = "remember_login.json";
export const REMEMBER_LOGIN_MS = 3 * 24 * 60 * 60 * 1000;

export function rememberLoginPath(username: string): string | null {
  if (!isSafeUsername(username)) return null;
  return `users/${username}/${REMEMBER_LOGIN_FILENAME}`;
}

export function rememberUntil(now: number): number {
  return now + REMEMBER_LOGIN_MS;
}

/** 未过期时返回到期时间戳。不保存密码本身。 */
export function parseRememberUntil(raw: string | null, now: number): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { expiresAt?: unknown };
    if (typeof parsed.expiresAt !== "number" || !Number.isFinite(parsed.expiresAt)) return null;
    if (parsed.expiresAt <= now) return null;
    return parsed.expiresAt;
  } catch {
    return null;
  }
}

export function formatRememberUntil(expiresAt: number): string {
  return new Date(expiresAt).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function readRememberUntil(username: string, now = Date.now()): number | null {
  const path = rememberLoginPath(username);
  if (!path) return null;
  return parseRememberUntil(readStorage(path), now);
}

export function saveRememberLogin(username: string, now = Date.now()) {
  const path = rememberLoginPath(username);
  if (!path) return { ok: false as const, code: "UNKNOWN" as const, message: "用户名无效" };
  return writeStorage(path, JSON.stringify({ expiresAt: rememberUntil(now) }));
}

export function clearRememberLogin(username: string) {
  const path = rememberLoginPath(username);
  if (!path) return { ok: false as const, code: "UNKNOWN" as const, message: "用户名无效" };
  return writeStorage(path, JSON.stringify({ expiresAt: 0 }));
}
