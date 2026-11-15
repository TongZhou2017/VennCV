import { normalizeAppData } from "../domain/appData";
import type { SyncBase } from "../domain/cloudSync";
import { syncAccountError } from "../domain/nutstore";
import { syncNutstoreUser } from "./nutstoreClient";
import { loadUserConfig, saveUserConfig, setUserLastEditedFile } from "./config";
import { mergeCloudUsernames } from "./libraryUsers";
import { listUserFileNames, readStorage, writeStorage } from "./fs";
import {
  CLOUD_CONFLICT_FILENAME,
  CLOUD_UPLOAD_FILENAME,
  SYNC_BASE_FILENAME,
  SYNC_STATE_FILENAME,
  isCloudDataFilename,
  isSafeUsername,
  preferredWorkspaceFile,
} from "./libraryPaths";
import { loadSyncAccount } from "./syncAccount";
import { appendSnapshot, loadVersionStore, persistVersionStore } from "./versionStore";

export interface CloudSyncNotice {
  ok: boolean;
  status: "synced" | "conflict" | "failed";
  message: string;
  downloaded: boolean;
}

type Listener = (username: string, notice: CloudSyncNotice) => void;

const COLLAB_INTERVAL_MS = 10_000;

const inflight = new Map<string, Promise<CloudSyncNotice>>();
const timers = new Map<string, number>();
const announced = new Map<string, string>();
let listener: Listener | null = null;

export type CloudPhase = "off" | "syncing" | "synced" | "conflict" | "failed";

export interface CloudPhaseSnapshot {
  phase: CloudPhase;
  message: string;
}

let phaseSnapshot: CloudPhaseSnapshot = { phase: "off", message: "" };
const phaseWatchers = new Set<() => void>();
let collabUser: string | null = null;
let collabTimer = 0;

function setPhase(phase: CloudPhase, message: string): void {
  if (phaseSnapshot.phase === phase && phaseSnapshot.message === message) return;
  phaseSnapshot = { phase, message };
  for (const notify of phaseWatchers) notify();
}

export function subscribeCloudPhase(notify: () => void): () => void {
  phaseWatchers.add(notify);
  return () => phaseWatchers.delete(notify);
}

export function getCloudPhase(): CloudPhaseSnapshot {
  return phaseSnapshot;
}

function userFile(username: string, name: string): string | null {
  if (!isSafeUsername(username)) return null;
  return `users/${username}/${name}`;
}

export function cloudUploadEnabled(username: string): boolean {
  const path = userFile(username, CLOUD_UPLOAD_FILENAME);
  if (!path) return false;
  const raw = readStorage(path);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { enabled?: unknown };
    return parsed.enabled === true;
  } catch {
    return false;
  }
}

export function setCloudUploadEnabled(username: string, enabled: boolean): { ok: true } | { ok: false; message: string } {
  const path = userFile(username, CLOUD_UPLOAD_FILENAME);
  if (!path) return { ok: false, message: "用户名无效" };
  return writeStorage(path, JSON.stringify({ enabled }));
}

export function readSyncBase(username: string): (SyncBase & { status: "synced" | "conflict" }) | null {
  const path = userFile(username, SYNC_STATE_FILENAME);
  if (!path) return null;
  const raw = readStorage(path);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { generation?: unknown; files?: unknown; status?: unknown };
    if (typeof parsed.generation !== "number" || !Number.isInteger(parsed.generation) || parsed.generation < 0) return null;
    if (!parsed.files || typeof parsed.files !== "object" || Array.isArray(parsed.files)) return null;
    const files: Record<string, string> = {};
    for (const [name, hash] of Object.entries(parsed.files)) {
      if (!isCloudDataFilename(name) || typeof hash !== "string") return null;
      files[name] = hash;
    }
    return {
      generation: parsed.generation,
      files,
      status: parsed.status === "conflict" ? "conflict" : "synced",
    };
  } catch {
    return null;
  }
}

function readBaseFiles(username: string): Record<string, string> {
  const path = userFile(username, SYNC_BASE_FILENAME);
  if (!path) return {};
  const raw = readStorage(path);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as { files?: unknown };
    if (!parsed.files || typeof parsed.files !== "object" || Array.isArray(parsed.files)) return {};
    const files: Record<string, string> = {};
    for (const [name, contents] of Object.entries(parsed.files)) {
      if (!isCloudDataFilename(name) || typeof contents !== "string") continue;
      files[name] = contents;
    }
    return files;
  } catch {
    return {};
  }
}

function writeBaseFiles(username: string, files: Record<string, string>): string | null {
  const path = userFile(username, SYNC_BASE_FILENAME);
  if (!path) return "用户名无效";
  const ordered: Record<string, string> = {};
  for (const name of Object.keys(files).sort()) {
    if (!isCloudDataFilename(name)) continue;
    ordered[name] = files[name];
  }
  const written = writeStorage(path, JSON.stringify({ files: ordered }));
  return written.ok ? null : written.message;
}

/** 下载下来的工作区如果不是 workspace.json，就把登录卡片指到那一份。 */
export function attachWorkspacePointer(username: string): boolean {
  if (!isSafeUsername(username)) return false;
  const entry = loadUserConfig().users.find((user) => user.username === username);
  if (!entry) return false;
  const chosen = preferredWorkspaceFile(entry.last_edited_file, listUserFileNames(username));
  if (!chosen) return false;
  const written = setUserLastEditedFile(username, `users/${username}/${chosen}`);
  return written.ok;
}

/** 把选中的坚果云用户登记到本机并下载工作区。还没有的用户密码留空。 */
export async function importRemoteUser(
  username: string,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  if (!isSafeUsername(username)) return { ok: false, message: "用户名无效" };
  const merged = mergeCloudUsernames(loadUserConfig(), [username]);
  if (merged.changed) {
    const written = saveUserConfig(merged.config);
    if (!written.ok) return { ok: false, message: written.message };
  }
  const result = await syncUserNow(username);
  if (!result.ok) return { ok: false, message: result.message };
  attachWorkspacePointer(username);
  return { ok: true, message: result.message };
}

export function cloudSyncSummary(username: string): string {
  const base = readSyncBase(username);
  if (!base) return "";
  if (base.status === "conflict") return "两边都改过，已停下。云端副本留在本机，没有覆盖。";
  if (base.generation > 0) return "已同步";
  return "";
}

export function setCloudSyncListener(next: Listener | null): void {
  listener = next;
}

function remember(username: string, notice: CloudSyncNotice): void {
  if (notice.downloaded) listener?.(username, { ...notice, message: "" });
  if (notice.status === "synced") {
    announced.delete(username);
    return;
  }
  const key = `${notice.status}:${notice.message}`;
  if (announced.get(username) === key) return;
  announced.set(username, key);
  listener?.(username, notice);
}

function finish(notice: CloudSyncNotice): CloudSyncNotice {
  if (notice.status === "synced") setPhase("synced", notice.message || "已同步");
  else if (notice.status === "conflict") setPhase("conflict", notice.message);
  else setPhase("failed", notice.message);
  return notice;
}

interface ParkedConflict {
  generation: number;
  remoteFiles: Record<string, string>;
  files: Record<string, string>;
}

function readConflict(username: string): ParkedConflict | null {
  const path = userFile(username, CLOUD_CONFLICT_FILENAME);
  if (!path) return null;
  const raw = readStorage(path);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      resolved?: unknown;
      generation?: unknown;
      remoteFiles?: unknown;
      files?: unknown;
    };
    if (parsed.resolved === true) return null;
    if (typeof parsed.generation !== "number" || !Number.isInteger(parsed.generation) || parsed.generation < 1) return null;
    if (!parsed.files || typeof parsed.files !== "object" || Array.isArray(parsed.files)) return null;
    if (!parsed.remoteFiles || typeof parsed.remoteFiles !== "object" || Array.isArray(parsed.remoteFiles)) return null;
    const files: Record<string, string> = {};
    const remoteFiles: Record<string, string> = {};
    for (const [name, contents] of Object.entries(parsed.files)) {
      if (!isCloudDataFilename(name) || typeof contents !== "string") return null;
      files[name] = contents;
    }
    for (const [name, hash] of Object.entries(parsed.remoteFiles)) {
      if (!isCloudDataFilename(name) || typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) return null;
      remoteFiles[name] = hash;
    }
    return { generation: parsed.generation, remoteFiles, files };
  } catch {
    return null;
  }
}

function markConflictResolved(username: string, parked: ParkedConflict): string | null {
  const conflictPath = userFile(username, CLOUD_CONFLICT_FILENAME);
  const statePath = userFile(username, SYNC_STATE_FILENAME);
  if (!conflictPath || !statePath) return "用户名无效";
  const state = writeStorage(
    statePath,
    JSON.stringify({ generation: parked.generation, files: parked.remoteFiles, status: "synced" }),
  );
  if (!state.ok) return state.message;
  const kept = writeStorage(conflictPath, JSON.stringify({ resolved: true, files: parked.files }));
  return kept.ok ? null : kept.message;
}

async function performSync(username: string): Promise<CloudSyncNotice> {
  setPhase("syncing", "同步中");
  const account = loadSyncAccount();
  const invalid = syncAccountError(account);
  if (invalid) return finish({ ok: false, status: "failed", message: invalid, downloaded: false });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const localFiles: Record<string, string> = {};
    for (const name of listUserFileNames(username)) {
      if (!isCloudDataFilename(name)) continue;
      const contents = readStorage(`users/${username}/${name}`);
      if (contents !== null) localFiles[name] = contents;
    }
    const stored = readSyncBase(username);
    const base = stored ? { generation: stored.generation, files: stored.files } : null;
    const result = await syncNutstoreUser(account, username, localFiles, base, readBaseFiles(username));
    if (!result.ok) return finish({ ok: false, status: "failed", message: result.message, downloaded: false });
    switch (result.status) {
      case "stale":
        continue;
      case "conflict": {
        const conflictPath = userFile(username, CLOUD_CONFLICT_FILENAME);
        const statePath = userFile(username, SYNC_STATE_FILENAME);
        if (!conflictPath || !statePath) return finish({ ok: false, status: "failed", message: "用户名无效", downloaded: false });
        const kept = writeStorage(
          conflictPath,
          JSON.stringify({ generation: result.generation, remoteFiles: result.remoteFiles, files: result.conflicts }),
        );
        if (!kept.ok) return finish({ ok: false, status: "failed", message: kept.message, downloaded: false });
        const previous = stored ?? { generation: 0, files: {} };
        const state = writeStorage(
          statePath,
          JSON.stringify({ generation: previous.generation, files: previous.files, status: "conflict" }),
        );
        if (!state.ok) return finish({ ok: false, status: "failed", message: state.message, downloaded: false });
        return finish({ ok: true, status: "conflict", message: result.message, downloaded: false });
      }
      case "synced": {
        const statePath = userFile(username, SYNC_STATE_FILENAME);
        if (!statePath) return finish({ ok: false, status: "failed", message: "用户名无效", downloaded: false });
        for (const [name, contents] of Object.entries(result.downloads)) {
          if (!isCloudDataFilename(name)) continue;
          const written = writeStorage(`users/${username}/${name}`, contents);
          if (!written.ok) return finish({ ok: false, status: "failed", message: written.message, downloaded: false });
        }
        const ancestor = writeBaseFiles(username, { ...localFiles, ...result.downloads });
        if (ancestor) return finish({ ok: false, status: "failed", message: ancestor, downloaded: false });
        const state = writeStorage(
          statePath,
          JSON.stringify({ generation: result.generation, files: result.files, status: "synced" }),
        );
        if (!state.ok) return finish({ ok: false, status: "failed", message: state.message, downloaded: false });
        attachWorkspacePointer(username);
        return finish({
          ok: true,
          status: "synced",
          message: result.message,
          downloaded: Object.keys(result.downloads).length > 0,
        });
      }
      default: {
        const unreachable: never = result;
        return unreachable;
      }
    }
  }
  return finish({
    ok: false,
    status: "failed",
    message: "另一端刚刚写入，这一次没有覆盖。请再同步一次。",
    downloaded: false,
  });
}

export function syncUserNow(username: string): Promise<CloudSyncNotice> {
  const existing = inflight.get(username);
  if (existing) return existing;
  const run = performSync(username)
    .then((notice) => {
      remember(username, notice);
      return notice;
    })
    .finally(() => inflight.delete(username));
  inflight.set(username, run);
  return run;
}

export function queueCloudSync(username: string): void {
  if (!cloudUploadEnabled(username)) return;
  if (readSyncBase(username)?.status === "conflict") return;
  const pending = timers.get(username);
  if (pending) clearTimeout(pending);
  timers.set(
    username,
    window.setTimeout(() => {
      timers.delete(username);
      void syncUserNow(username);
    }, 1200),
  );
}

function collabTick(): void {
  if (!collabUser) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  if (readSyncBase(collabUser)?.status === "conflict") return;
  void syncUserNow(collabUser);
}

export function startCloudCollab(username: string): void {
  stopCloudCollab();
  if (!isSafeUsername(username) || !cloudUploadEnabled(username)) {
    setPhase("off", "");
    return;
  }
  collabUser = username;
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", collabTick);
  if (typeof window !== "undefined") collabTimer = window.setInterval(collabTick, COLLAB_INTERVAL_MS);
  void syncUserNow(username);
}

export function stopCloudCollab(): void {
  collabUser = null;
  if (collabTimer) {
    window.clearInterval(collabTimer);
    collabTimer = 0;
  }
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", collabTick);
  setPhase("off", "");
}

/** 保留本机。云端工作区先记入版本，再把本机作为下一版上传。 */
export async function keepCloudLocal(username: string): Promise<string | null> {
  const parked = readConflict(username);
  if (!parked) return "没有可保留的云端副本";
  const workspace = parked.files["workspace.json"];
  if (workspace) {
    let data;
    try {
      data = normalizeAppData(JSON.parse(workspace));
    } catch {
      return "云端副本无法记入版本，没有上传。";
    }
    const store = loadVersionStore(username);
    const next = appendSnapshot(store, store.currentBranchId, data, "云端副本");
    const written = persistVersionStore(username, next.store);
    if (!written.ok) return written.message;
  }
  const failed = markConflictResolved(username, parked);
  if (failed) return failed;
  await syncUserNow(username);
  return null;
}

/** 改用云端。用已经取回的副本替换本机，并接上云端的同步记录。 */
export function takeCloudCopy(username: string): string | null {
  const parked = readConflict(username);
  if (!parked) return "没有可取回的云端副本";
  for (const [name, contents] of Object.entries(parked.files)) {
    const written = writeStorage(`users/${username}/${name}`, contents);
    if (!written.ok) return written.message;
  }
  const failed = markConflictResolved(username, parked);
  if (failed) return failed;
  setPhase("synced", "已改用云端");
  listener?.(username, { ok: true, status: "synced", message: "", downloaded: true });
  return null;
}
