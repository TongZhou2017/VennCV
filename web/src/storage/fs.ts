/** 与 Rust `platform.rs` 的 `venncv_fs:` 前缀一致 */

const PREFIX = "venncv_fs:";

export type WriteStorageResult =
  | { ok: true }
  | { ok: false; code: "QUOTA" | "UNKNOWN"; message: string };

export function storageKey(path: string): string {
  const n = path.replace(/\\/g, "/");
  return `${PREFIX}${n}`;
}

export function readStorage(path: string): string | null {
  try {
    return localStorage.getItem(storageKey(path));
  } catch {
    return null;
  }
}

function classifyWriteError(e: unknown): WriteStorageResult {
  const name = e instanceof DOMException ? e.name : "";
  if (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    (typeof name === "string" && name.includes("QuotaExceeded"))
  ) {
    return {
      ok: false,
      code: "QUOTA",
      message:
        "浏览器存储空间已满，无法保存。请先用「导出 JSON」备份，再清理本站点数据或其它占用后重试。",
    };
  }
  const msg = e instanceof Error ? e.message : String(e);
  return { ok: false, code: "UNKNOWN", message: msg || "写入存储失败" };
}

/** 写入虚拟路径；失败不抛错，由调用方处理提示 */
export function writeStorage(path: string, contents: string): WriteStorageResult {
  try {
    localStorage.setItem(storageKey(path), contents);
    return { ok: true };
  } catch (e) {
    return classifyWriteError(e);
  }
}

export function existsStorage(path: string): boolean {
  return readStorage(path) !== null;
}

/** 列出某用户目录下已存在的 .json 虚拟路径（用于工作区切换） */
export function listUserWorkspaceJsonFiles(username: string): string[] {
  if (typeof localStorage === "undefined") return [];
  const logicalPrefix = `users/${username}/`;
  const rawPrefix = storageKey(logicalPrefix);
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(rawPrefix) || !k.endsWith(".json")) continue;
      const logical = k.slice(PREFIX.length);
      if (!logical.startsWith(logicalPrefix)) continue;
      const rest = logical.slice(logicalPrefix.length);
      if (!rest || rest.includes("/")) continue;
      if (/^[a-zA-Z0-9_.-]+\.json$/.test(rest)) out.push(logical);
    }
  } catch {
    /* ignore */
  }
  out.sort();
  return out;
}
