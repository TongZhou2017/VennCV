import { isSafeUsername } from "./libraryPaths";

const HANDOFF_KEY = "venncv_lab_tab";
const TAB_KEY = "venncv_lab_tab_user";
const REVOKE_KEY = "venncv_lab_tab_revoke";
const HANDOFF_MS = 2 * 60 * 1000;

type Memory = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

type Stamp = { username: string; at: number };

/** 当前页已经登录。新标签页在短时间内用这个记号直接进入，不写免密码登录。 */
export function publishLabTabHandoff(username: string, local: Memory, now = Date.now()): void {
  if (!isSafeUsername(username)) return;
  local.setItem(HANDOFF_KEY, JSON.stringify({ username, at: now }));
}

export function revokeLabTabHandoff(local: Memory, now = Date.now()): void {
  local.removeItem(HANDOFF_KEY);
  local.setItem(REVOKE_KEY, String(now));
}

/** 新标签页先认自己留下的记号，否则认刚才打开时写下的记号。 */
export function claimLabTabHandoff(local: Memory, session: Memory, now = Date.now()): string | null {
  const revoked = Number(local.getItem(REVOKE_KEY) || 0);
  const kept = readStamp(session.getItem(TAB_KEY));
  if (kept && kept.at > revoked) return kept.username;
  const handoff = readStamp(local.getItem(HANDOFF_KEY));
  if (!handoff || handoff.at <= revoked || now - handoff.at > HANDOFF_MS) return null;
  session.setItem(TAB_KEY, JSON.stringify(handoff));
  return handoff.username;
}

function readStamp(raw: string | null): Stamp | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { username?: unknown; at?: unknown };
    if (typeof parsed.username !== "string" || !isSafeUsername(parsed.username)) return null;
    if (typeof parsed.at !== "number" || !Number.isFinite(parsed.at)) return null;
    return { username: parsed.username, at: parsed.at };
  } catch {
    return null;
  }
}
