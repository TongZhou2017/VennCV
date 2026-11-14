import { CLOUD_MANIFEST_FILENAME, isCloudDataFilename, isSafeUsername } from "../storage/libraryPaths";

/** 坚果云 WebDAV。地址固定，调用方不能改主机。 */

export const JIANGUOYUN_DAV_ROOT = "https://dav.jianguoyun.com/dav/";
export const DEFAULT_SYNC_FOLDER = "VennCV";
export const SYNC_MARKER_NAME = ".venncv-sync";
export const SYNC_MARKER_BODY = "venncv\n";

export type DavMethod = "MKCOL" | "PUT" | "GET" | "DELETE" | "PROPFIND";

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>`;

export interface DavCall {
  method: DavMethod;
  path: string;
  body?: string;
  email: string;
  password: string;
  /** 只在云端仍是这个版本时写入。 */
  ifMatch?: string;
  /** `*` 表示只在云端还没有这个文件时写入。 */
  ifNoneMatch?: string;
}

export interface DavResponse {
  status: number;
  body: string;
  etag?: string;
}

export type DavTransport = (call: DavCall) => Promise<DavResponse>;

export interface SyncAccountFields {
  email: string;
  password: string;
  folder: string;
}

/** 远程目录只有一段，不能借 `..` 或斜杠逃出指定文件夹。 */
export function syncFolderPath(raw: string): string | null {
  const folder = raw.trim() || DEFAULT_SYNC_FOLDER;
  if (folder.includes("/") || !isSafeDavPath(folder)) return null;
  return folder;
}

function safeSegment(part: string): boolean {
  return part.length > 0 && part !== "." && part !== ".." && !/[\u0000-\u001f\\]/.test(part);
}

/** 只允许同步用到的路径，避免本机代理变成任意 WebDAV 转发。 */
export function isSafeDavPath(path: string): boolean {
  if (!path || path.length > 180) return false;
  if (path.startsWith("/") || path.includes("\\") || path.includes("..")) return false;
  const parts = path.split("/");
  if (parts.some((part) => !safeSegment(part))) return false;
  if (parts.length === 1) return true;
  if (parts.length === 2) return parts[1] === SYNC_MARKER_NAME || parts[1] === "users";
  if (parts.length === 3) return parts[1] === "users" && isSafeUsername(parts[2]);
  if (parts.length === 4) {
    const file = parts[3];
    return parts[1] === "users" && isSafeUsername(parts[2]) && (file === CLOUD_MANIFEST_FILENAME || isCloudDataFilename(file));
  }
  return false;
}

export function emptySyncAccount(): SyncAccountFields {
  return { email: "", password: "", folder: DEFAULT_SYNC_FOLDER };
}

export function readSyncAccount(raw: string | null): SyncAccountFields {
  const empty = emptySyncAccount();
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<SyncAccountFields>;
    const email = typeof parsed.email === "string" ? parsed.email.trim() : "";
    const password = typeof parsed.password === "string" ? parsed.password : "";
    const folder = syncFolderPath(typeof parsed.folder === "string" ? parsed.folder : "") ?? DEFAULT_SYNC_FOLDER;
    return { email, password, folder };
  } catch {
    return empty;
  }
}

export function writeSyncAccount(account: SyncAccountFields): string {
  const folder = syncFolderPath(account.folder) ?? DEFAULT_SYNC_FOLDER;
  return JSON.stringify({ email: account.email.trim(), password: account.password, folder });
}

function failure(status: number, fallback: string): { ok: false; message: string } | null {
  if (status === 401) return { ok: false, message: "邮箱或应用密码不正确" };
  if (status === 0) return { ok: false, message: fallback || "连不上坚果云" };
  return null;
}

export function syncAccountError(account: SyncAccountFields): string | null {
  if (!account.email.trim() || !account.email.includes("@")) return "请填写坚果云邮箱";
  if (!account.password) return "请填写应用密码";
  if (!syncFolderPath(account.folder)) return "远程目录无效";
  return null;
}

export interface CloudEntry {
  name: string;
  collection: boolean;
}

/** 从 PROPFIND 结果里取出这个目录的直接子项。 */
export function cloudDirectEntries(xml: string, parent: string): CloudEntry[] | null {
  if (!/<(?:\w+:)?multistatus\b/i.test(xml)) return null;
  const marker = `/${parent.replace(/^\/+|\/+$/g, "")}/`;
  const entries = new Map<string, boolean>();
  for (const block of xml.split(/<(?:\w+:)?response\b/i).slice(1)) {
    const hrefMatch = /<(?:\w+:)?href[^>]*>([^<]*)<\//i.exec(block);
    if (!hrefMatch) continue;
    const raw = hrefMatch[1].trim();
    const collection = /<(?:\w+:)?collection\b/i.test(block) || /\/\s*$/.test(raw);
    let href = raw;
    try {
      href = decodeURIComponent(href);
    } catch {
      continue;
    }
    const path = href.replace(/^https?:\/\/[^/]+/i, "").split("?")[0];
    const index = path.lastIndexOf(marker);
    if (index < 0) continue;
    const rest = path.slice(index + marker.length).replace(/\/+$/g, "");
    if (!rest || rest.includes("/") || rest.startsWith(".")) continue;
    if (rest.length > 64 || /[\\/\u0000-\u001f]/.test(rest)) continue;
    entries.set(rest, collection);
  }
  return [...entries].map(([name, collection]) => ({ name, collection }));
}

/** 只要直接子文件夹。 */
export function cloudChildNames(xml: string, parent: string): string[] | null {
  const entries = cloudDirectEntries(xml, parent);
  if (!entries) return null;
  return entries
    .filter((entry) => entry.collection)
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "zh"));
}

/**
 * 创建远程目录，写入 `.venncv-sync` 再读回。
 * 目录已经存在时 MKCOL 常返回 405，仍算连通。
 */
export async function probeJianguoyun(
  transport: DavTransport,
  account: SyncAccountFields,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const invalid = syncAccountError(account);
  if (invalid) return { ok: false, message: invalid };
  const email = account.email.trim();
  const password = account.password;
  const folder = syncFolderPath(account.folder);
  if (!folder) return { ok: false, message: "远程目录无效" };

  const made = await transport({ method: "MKCOL", path: folder, email, password });
  const rejected = failure(made.status, made.body);
  if (rejected) return rejected;
  const folderReady = made.status === 200 || made.status === 201 || made.status === 204 || made.status === 301 || made.status === 405;
  if (!folderReady) return { ok: false, message: "建不了远程目录" };

  const marker = `${folder}/${SYNC_MARKER_NAME}`;
  const put = await transport({ method: "PUT", path: marker, body: SYNC_MARKER_BODY, email, password });
  const putFailed = failure(put.status, put.body);
  if (putFailed) return putFailed;
  if (put.status < 200 || put.status >= 300) return { ok: false, message: "写不进验证文件" };

  const got = await transport({ method: "GET", path: marker, email, password });
  const getFailed = failure(got.status, got.body);
  if (getFailed) return getFailed;
  if (got.status !== 200 || got.body !== SYNC_MARKER_BODY) return { ok: false, message: "读回的验证文件不对" };
  return { ok: true };
}

async function propfindChildren(
  transport: DavTransport,
  account: SyncAccountFields,
  path: string,
): Promise<{ ok: true; names: string[] } | { ok: false; message: string }> {
  const email = account.email.trim();
  const listed = await transport({
    method: "PROPFIND",
    path,
    body: PROPFIND_BODY,
    email,
    password: account.password,
  });
  const rejected = failure(listed.status, listed.body);
  if (rejected) return rejected;
  if (listed.status === 404) return { ok: false, message: "远程目录还不存在" };
  if (listed.status !== 207 && listed.status !== 200) return { ok: false, message: "列不出远程目录" };
  const names = cloudChildNames(listed.body, path);
  if (!names) return { ok: false, message: "列不出远程目录" };
  return { ok: true, names };
}

/**
 * 列出远程目录下的用户文件夹。
 * 若其中有 `users`，则改看这个文件夹里面的用户，不再把 `users` 本身当成一个用户。
 */
export async function listJianguoyunUsers(
  transport: DavTransport,
  account: SyncAccountFields,
): Promise<{ ok: true; users: string[] } | { ok: false; message: string }> {
  const invalid = syncAccountError(account);
  if (invalid) return { ok: false, message: invalid };
  const folder = syncFolderPath(account.folder);
  if (!folder) return { ok: false, message: "远程目录无效" };
  const top = await propfindChildren(transport, account, folder);
  if (!top.ok) return top;
  const direct = top.names.filter((name) => name !== "users");
  if (!top.names.includes("users")) {
    direct.sort((a, b) => a.localeCompare(b, "zh"));
    return { ok: true, users: direct };
  }
  const nested = await propfindChildren(transport, account, `${folder}/users`);
  if (!nested.ok) return nested;
  const users = [...new Set([...direct, ...nested.names])];
  users.sort((a, b) => a.localeCompare(b, "zh"));
  return { ok: true, users };
}
