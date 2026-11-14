import {
  CLOUD_MANIFEST_FILENAME,
  isCloudDataFilename,
  isSafeUsername,
} from "../storage/libraryPaths";
import {
  cloudDirectEntries,
  syncAccountError,
  syncFolderPath,
  type DavTransport,
  type SyncAccountFields,
} from "./nutstore";
import { mergeJsonText } from "./jsonMerge";

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>`;

export interface SyncBase {
  generation: number;
  files: Record<string, string>;
}

export interface RemoteManifest {
  generation: number;
  files: Record<string, string>;
}

export type FileDecision = "upload" | "download" | "keep" | "conflict";

export type UserSyncResult =
  | {
      ok: true;
      status: "synced";
      message: string;
      generation: number;
      files: Record<string, string>;
      downloads: Record<string, string>;
    }
  | {
      ok: true;
      status: "conflict";
      message: string;
      conflicts: Record<string, string>;
      generation: number;
      remoteFiles: Record<string, string>;
    }
  | { ok: true; status: "stale" }
  | { ok: false; message: string };

const CONFLICT_MESSAGE = "同一处两边都改过，没有互相覆盖。请在工具栏选择保留本机或改用云端。";
const MERGED_MESSAGE = "已合并两边的修改";

export async function sha256Text(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function readManifest(raw: string): RemoteManifest | null {
  try {
    const parsed = JSON.parse(raw) as { generation?: unknown; files?: unknown };
    if (typeof parsed.generation !== "number" || !Number.isInteger(parsed.generation) || parsed.generation < 1) return null;
    if (!parsed.files || typeof parsed.files !== "object" || Array.isArray(parsed.files)) return null;
    const files: Record<string, string> = {};
    for (const [name, hash] of Object.entries(parsed.files)) {
      if (!isCloudDataFilename(name)) return null;
      if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) return null;
      files[name] = hash;
    }
    return { generation: parsed.generation, files };
  } catch {
    return null;
  }
}

export function manifestText(generation: number, files: Record<string, string>): string {
  const ordered: Record<string, string> = {};
  for (const name of Object.keys(files).sort()) ordered[name] = files[name];
  return JSON.stringify({ generation, files: ordered });
}

/**
 * 和上次同步成功时的哈希比较。
 * 只有本机变了就上传，只有云端变了就下载，两边都变了就冲突。内容相同则视为已对齐。
 */
export function decideFile(localHash: string | null, remoteHash: string | null, baseHash: string | null): FileDecision {
  if (localHash === remoteHash) return "keep";
  if (localHash === null && remoteHash !== null && remoteHash === baseHash) return "keep";
  if (baseHash === remoteHash && localHash !== null) return "upload";
  if (baseHash === localHash && remoteHash !== null) return "download";
  return "conflict";
}

function rejected(status: number, body: string): string | null {
  if (status === 401) return "邮箱或应用密码不正确";
  if (status === 0) return body || "连不上坚果云";
  return null;
}

function userDirectory(account: SyncAccountFields, username: string): string | null {
  const folder = syncFolderPath(account.folder);
  if (!folder || !isSafeUsername(username)) return null;
  return `${folder}/users/${username}`;
}

async function ensureDirectory(
  transport: DavTransport,
  account: SyncAccountFields,
  path: string,
): Promise<string | null> {
  const made = await transport({
    method: "MKCOL",
    path,
    email: account.email.trim(),
    password: account.password,
  });
  const failed = rejected(made.status, made.body);
  if (failed) return failed;
  const ready = made.status === 200 || made.status === 201 || made.status === 204 || made.status === 301 || made.status === 405;
  return ready ? null : "建不了远程目录";
}

export async function runUserSync(input: {
  transport: DavTransport;
  account: SyncAccountFields;
  username: string;
  localFiles: Record<string, string>;
  base: SyncBase | null;
  /** 上次同步成功时的文件正文，用来做三方合并。 */
  baseFiles?: Record<string, string>;
}): Promise<UserSyncResult> {
  const invalid = syncAccountError(input.account);
  if (invalid) return { ok: false, message: invalid };
  const directory = userDirectory(input.account, input.username);
  const folder = syncFolderPath(input.account.folder);
  if (!directory || !folder) return { ok: false, message: "远程目录无效" };
  const email = input.account.email.trim();
  const password = input.account.password;
  const call = (
    method: "MKCOL" | "PUT" | "GET" | "PROPFIND",
    path: string,
    body?: string,
    precondition?: { ifMatch?: string; ifNoneMatch?: string },
  ) => input.transport({ method, path, body, email, password, ...precondition });

  const manifestPath = `${directory}/${CLOUD_MANIFEST_FILENAME}`;
  const listed = await call("GET", manifestPath);
  const listFailed = rejected(listed.status, listed.body);
  if (listFailed) return { ok: false, message: listFailed };

  let remote: RemoteManifest | null = null;
  if (listed.status === 200) {
    remote = readManifest(listed.body);
    if (!remote) return { ok: false, message: "云端同步记录无法读取，没有覆盖。" };
  } else if (listed.status !== 404) {
    return { ok: false, message: "读不到云端同步记录" };
  } else {
    const found = await call("PROPFIND", directory, PROPFIND_BODY);
    const findFailed = rejected(found.status, found.body);
    if (findFailed) return { ok: false, message: findFailed };
    if (found.status === 404) {
      remote = null;
    } else if (found.status !== 207 && found.status !== 200) {
      return { ok: false, message: "列不出远程目录" };
    } else {
      const entries = cloudDirectEntries(found.body, directory);
      if (!entries) return { ok: false, message: "列不出远程目录" };
      if (entries.length > 0) return { ok: false, message: "云端已有文件，但没有同步记录，没有覆盖。" };
    }
  }

  const bodies: Record<string, string> = {};
  const localHashes: Record<string, string> = {};
  for (const [name, contents] of Object.entries(input.localFiles)) {
    if (!isCloudDataFilename(name)) continue;
    bodies[name] = contents;
    localHashes[name] = await sha256Text(contents);
  }
  const remoteHashes = remote?.files ?? {};
  const baseHashes = input.base?.files ?? {};
  const baseFiles = input.baseFiles ?? {};
  const names = [...new Set([...Object.keys(localHashes), ...Object.keys(remoteHashes), ...Object.keys(baseHashes)])].sort();
  const decisions = new Map<string, FileDecision>();
  const conflicts: string[] = [];
  for (const name of names) {
    const decision = decideFile(localHashes[name] ?? null, remoteHashes[name] ?? null, baseHashes[name] ?? null);
    decisions.set(name, decision);
    if (decision === "conflict") conflicts.push(name);
  }
  const prefetched = new Map<string, string>();
  let mergedUpload = false;
  if (conflicts.length > 0) {
    const copies: Record<string, string> = {};
    const resolved = new Map<string, { text: string; decision: FileDecision }>();
    let unresolved = false;
    for (const name of conflicts) {
      if (!remoteHashes[name]) {
        unresolved = true;
        continue;
      }
      const got = await call("GET", `${directory}/${name}`);
      const getFailed = rejected(got.status, got.body);
      if (getFailed) return { ok: false, message: getFailed };
      if (got.status !== 200) return { ok: false, message: "没能取回云端副本，没有覆盖本地。" };
      const hash = await sha256Text(got.body);
      if (hash !== remoteHashes[name]) return { ok: false, message: "云端文件和记录不一致，没有覆盖。" };
      const localBody = bodies[name];
      const ancestor = baseFiles[name];
      const merged = localBody !== undefined && ancestor !== undefined ? mergeJsonText(ancestor, localBody, got.body) : { ok: false as const };
      if (!merged.ok) {
        unresolved = true;
        copies[name] = got.body;
        continue;
      }
      const mergedHash = await sha256Text(merged.text);
      if (mergedHash === remoteHashes[name]) {
        resolved.set(name, { text: merged.text, decision: merged.text === localBody ? "keep" : "download" });
      } else {
        resolved.set(name, { text: merged.text, decision: "upload" });
      }
    }
    if (unresolved) {
      return {
        ok: true,
        status: "conflict",
        message: CONFLICT_MESSAGE,
        conflicts: copies,
        generation: remote?.generation ?? input.base?.generation ?? 1,
        remoteFiles: remoteHashes,
      };
    }
    for (const [name, item] of resolved) {
      bodies[name] = item.text;
      localHashes[name] = await sha256Text(item.text);
      decisions.set(name, item.decision);
      if (item.decision === "download") prefetched.set(name, item.text);
      if (item.decision === "upload") mergedUpload = true;
    }
  }

  const nextFiles: Record<string, string> = {};
  const uploads: string[] = [];
  const downloads: string[] = [];
  for (const name of names) {
    const decision = decisions.get(name);
    if (decision === "upload") {
      uploads.push(name);
      nextFiles[name] = localHashes[name];
    } else if (decision === "download") {
      downloads.push(name);
      nextFiles[name] = remoteHashes[name];
    } else if (localHashes[name]) {
      nextFiles[name] = localHashes[name];
    } else if (remoteHashes[name]) {
      nextFiles[name] = remoteHashes[name];
    }
  }

  const remoteGeneration = remote?.generation ?? null;
  const baseGeneration = input.base?.generation ?? 0;
  const generation = uploads.length > 0 ? (remoteGeneration ?? baseGeneration) + 1 : remoteGeneration ?? baseGeneration;

  const downloaded: Record<string, string> = {};
  for (const name of downloads) {
    const cached = prefetched.get(name);
    if (cached !== undefined) {
      downloaded[name] = cached;
      continue;
    }
    const got = await call("GET", `${directory}/${name}`);
    const getFailed = rejected(got.status, got.body);
    if (getFailed) return { ok: false, message: getFailed };
    if (got.status !== 200) return { ok: false, message: "没能下载云端文件，没有覆盖本地。" };
    const hash = await sha256Text(got.body);
    if (hash !== remoteHashes[name]) return { ok: false, message: "云端文件和记录不一致，没有覆盖。" };
    downloaded[name] = got.body;
  }

  if (uploads.length > 0) {
    const fresh = await call("GET", manifestPath);
    const freshFailed = rejected(fresh.status, fresh.body);
    if (freshFailed) return { ok: false, message: freshFailed };
    const planned = listed.status === 200 ? listed.body : "";
    const current = fresh.status === 200 ? fresh.body : "";
    if (fresh.status !== listed.status || current !== planned) return { ok: true, status: "stale" };
    for (const path of [folder, `${folder}/users`, directory]) {
      const mkdirFailed = await ensureDirectory(input.transport, input.account, path);
      if (mkdirFailed) return { ok: false, message: mkdirFailed };
    }
    for (const name of uploads) {
      let ifMatch: string | undefined;
      let ifNoneMatch: string | undefined;
      if (remoteHashes[name]) {
        const seen = await call("GET", `${directory}/${name}`);
        const seenFailed = rejected(seen.status, seen.body);
        if (seenFailed) return { ok: false, message: seenFailed };
        if (seen.status === 404) ifNoneMatch = "*";
        else if (seen.status !== 200) return { ok: false, message: "没能确认云端文件，没有覆盖。" };
        else {
          const seenHash = await sha256Text(seen.body);
          if (seenHash !== remoteHashes[name]) return { ok: true, status: "stale" };
          if (seen.etag) ifMatch = seen.etag;
        }
      } else {
        ifNoneMatch = "*";
      }
      const put = await call("PUT", `${directory}/${name}`, bodies[name], { ifMatch, ifNoneMatch });
      const putFailed = rejected(put.status, put.body);
      if (putFailed) return { ok: false, message: putFailed };
      if (put.status === 412) return { ok: true, status: "stale" };
      if (put.status < 200 || put.status >= 300) return { ok: false, message: "没能上传，云端保持原样。" };
    }
    const manifestEtag = fresh.etag || listed.etag;
    const manifest = await call(
      "PUT",
      manifestPath,
      manifestText(generation, nextFiles),
      manifestEtag ? { ifMatch: manifestEtag } : listed.status === 404 ? { ifNoneMatch: "*" } : undefined,
    );
    const manifestFailed = rejected(manifest.status, manifest.body);
    if (manifestFailed) return { ok: false, message: manifestFailed };
    if (manifest.status === 412) return { ok: true, status: "stale" };
    if (manifest.status < 200 || manifest.status >= 300) return { ok: false, message: "没能写上同步记录，请再同步一次。" };
  }

  const localEdits: Record<string, string> = {};
  for (const name of uploads) {
    if (bodies[name] !== input.localFiles[name]) localEdits[name] = bodies[name];
  }
  const changed = uploads.length > 0 || downloads.length > 0;
  return {
    ok: true,
    status: "synced",
    message: mergedUpload ? MERGED_MESSAGE : changed ? "已同步" : "没有需要同步的文件",
    generation,
    files: nextFiles,
    downloads: { ...downloaded, ...localEdits },
  };
}
