import { invoke } from "@tauri-apps/api/core";
import { isTauriApp } from "../platform/tauri";
import { isAllowedLibraryPath, isReservedUserFile, isSafeJsonFilename, isSafeUsername } from "./libraryPaths";

export type WriteStorageResult =
  | { ok: true }
  | { ok: false; code: "QUOTA" | "UNKNOWN"; message: string };

type LibraryMode = "http" | "tauri" | "closed";

type LibraryFile = { path: string; contents: string };

type LibrarySnapshot = { root?: string; files?: LibraryFile[] };

const files = new Map<string, string>();

let mode: LibraryMode = "closed";
let dataDirectory = "";
let errorSink: (message: string) => void = () => {};

export function setStorageErrorSink(sink: (message: string) => void): void {
  errorSink = sink;
}

export function getDataDirectory(): string {
  return dataDirectory;
}

export function listLogicalPaths(): string[] {
  return [...files.keys()];
}

function replaceFiles(next: LibraryFile[]): void {
  files.clear();
  for (const file of next) {
    if (isAllowedLibraryPath(file.path)) files.set(file.path, file.contents);
  }
}

function httpRequest(method: string, url: string, body?: string): { status: number; text: string } {
  const xhr = new XMLHttpRequest();
  xhr.open(method, url, false);
  xhr.setRequestHeader("X-VennCV-Library", "1");
  if (body !== undefined) xhr.setRequestHeader("Content-Type", "application/json");
  xhr.send(body ?? null);
  return { status: xhr.status, text: xhr.responseText };
}

/** 连接到本机用户库。浏览器走开发服务，桌面窗口走 Tauri。 */
export async function connectUserLibrary(): Promise<void> {
  if (isTauriApp()) {
    const snap = await invoke<LibrarySnapshot>("user_library_snapshot");
    dataDirectory = snap.root ?? "";
    replaceFiles(snap.files ?? []);
    mode = "tauri";
    return;
  }
  let health: { status: number; text: string };
  try {
    health = httpRequest("GET", "/__venncv/user-library/health");
  } catch {
    mode = "closed";
    throw new Error("开发服务没有提供本机用户库");
  }
  if (health.status !== 200) {
    mode = "closed";
    throw new Error(health.text || "开发服务没有提供本机用户库");
  }
  const snapResponse = httpRequest("GET", "/__venncv/user-library/snapshot");
  if (snapResponse.status !== 200) {
    mode = "closed";
    throw new Error(snapResponse.text || "读取用户库失败");
  }
  const snap = JSON.parse(snapResponse.text) as LibrarySnapshot;
  const healthBody = JSON.parse(health.text) as { root?: string };
  dataDirectory = snap.root ?? healthBody.root ?? "";
  replaceFiles(snap.files ?? []);
  mode = "http";
}

export function readStorage(path: string): string | null {
  const logical = path.replace(/\\/g, "/");
  return files.get(logical) ?? null;
}

export function writeStorage(path: string, contents: string): WriteStorageResult {
  const logical = path.replace(/\\/g, "/");
  if (!isAllowedLibraryPath(logical)) {
    return { ok: false, code: "UNKNOWN", message: "不允许的路径" };
  }
  if (mode === "closed") {
    return { ok: false, code: "UNKNOWN", message: "本机用户库未连接" };
  }
  if (mode === "http") {
    let result: { status: number; text: string };
    try {
      result = httpRequest(
        "PUT",
        "/__venncv/user-library/file",
        JSON.stringify({ path: logical, contents }),
      );
    } catch {
      return { ok: false, code: "UNKNOWN", message: "写入用户库失败" };
    }
    if (result.status < 200 || result.status >= 300) {
      return { ok: false, code: "UNKNOWN", message: result.text || "写入用户库失败" };
    }
    files.set(logical, contents);
    return { ok: true };
  }
  files.set(logical, contents);
  void invoke("user_library_write", { path: logical, contents }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "写入用户库失败";
    errorSink(message);
  });
  return { ok: true };
}

export function existsStorage(path: string): boolean {
  return readStorage(path) !== null;
}

/** 列出某用户目录下已存在的工作区 .json（不含版本库文件） */
export type LibraryChoice = {
  path: string;
  label: string;
  current: boolean;
  exists: boolean;
  builtin: boolean;
};

export class LibrarySwitchError extends Error {
  readonly code: "NEED_CREATE" | "FAILED";

  constructor(code: "NEED_CREATE" | "FAILED", message: string) {
    super(message);
    this.name = "LibrarySwitchError";
    this.code = code;
  }
}

type LibraryChoicesBody = LibrarySnapshot & {
  choices?: LibraryChoice[];
  platform?: string;
};

function applySnapshot(snap: LibrarySnapshot): void {
  dataDirectory = snap.root ?? "";
  replaceFiles(snap.files ?? []);
}

function libraryCommand(action: "switch" | "forget"): string {
  switch (action) {
    case "switch":
      return "user_library_switch";
    case "forget":
      return "user_library_forget";
    default: {
      const unexpected: never = action;
      return unexpected;
    }
  }
}

function libraryRoute(action: "switch" | "forget"): string {
  switch (action) {
    case "switch":
      return "/__venncv/user-library/switch";
    case "forget":
      return "/__venncv/user-library/forget";
    default: {
      const unexpected: never = action;
      return unexpected;
    }
  }
}

export async function fetchLibraryChoices(): Promise<LibraryChoice[]> {
  if (isTauriApp()) {
    const body = await invoke<LibraryChoicesBody>("user_library_choices");
    return body.choices ?? [];
  }
  const result = httpRequest("GET", "/__venncv/user-library/choices");
  if (result.status !== 200) {
    throw new LibrarySwitchError("FAILED", result.text || "读取常用路径失败");
  }
  const body = JSON.parse(result.text) as LibraryChoicesBody;
  return body.choices ?? [];
}

async function postLibraryRoot(action: "switch" | "forget", libraryPath: string, create: boolean): Promise<LibraryChoice[]> {
  if (isTauriApp()) {
    try {
      const body = await invoke<LibraryChoicesBody>(libraryCommand(action), { path: libraryPath, create });
      if (action === "switch") {
        applySnapshot(body);
        mode = "tauri";
      }
      return body.choices ?? [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("NEED_CREATE")) {
        throw new LibrarySwitchError("NEED_CREATE", "这个文件夹还不存在");
      }
      throw new LibrarySwitchError("FAILED", message || "切换用户数据路径失败");
    }
  }
  const result = httpRequest("POST", libraryRoute(action), JSON.stringify({ path: libraryPath, create }));
  if (result.status === 409) {
    throw new LibrarySwitchError("NEED_CREATE", "这个文件夹还不存在");
  }
  if (result.status < 200 || result.status >= 300) {
    throw new LibrarySwitchError("FAILED", result.text || "切换用户数据路径失败");
  }
  const body = JSON.parse(result.text) as LibraryChoicesBody;
  if (action === "switch") {
    applySnapshot(body);
    mode = "http";
  }
  return body.choices ?? [];
}

export function switchUserLibrary(libraryPath: string, create: boolean): Promise<LibraryChoice[]> {
  return postLibraryRoot("switch", libraryPath, create);
}

export function forgetUserLibrary(libraryPath: string): Promise<LibraryChoice[]> {
  return postLibraryRoot("forget", libraryPath, false);
}

export function listUserWorkspaceJsonFiles(username: string): string[] {
  const prefix = `users/${username}/`;
  const out: string[] = [];
  for (const key of files.keys()) {
    if (!key.startsWith(prefix) || !key.endsWith(".json")) continue;
    const rest = key.slice(prefix.length);
    if (!rest || rest.includes("/") || isReservedUserFile(rest)) continue;
    if (!isSafeJsonFilename(rest)) continue;
    out.push(key);
  }
  out.sort();
  return out;
}

export function listUserFileNames(username: string): string[] {
  if (!isSafeUsername(username)) return [];
  const prefix = `users/${username}/`;
  const names: string[] = [];
  for (const key of files.keys()) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    if (!rest || rest.includes("/") || !isSafeJsonFilename(rest)) continue;
    names.push(rest);
  }
  names.sort();
  return names;
}
