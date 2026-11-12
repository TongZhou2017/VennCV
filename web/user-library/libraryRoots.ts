import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const LIBRARY_ROOTS_FILE = "library_roots.json";
const MAX_PATHS = 12;
const MAX_CATALOG_BYTES = 64 * 1024;
const MAX_PATH_LENGTH = 1024;

export class LibraryRootError extends Error {
  readonly code: "NEED_CREATE" | "INVALID";

  constructor(code: "NEED_CREATE" | "INVALID", message: string) {
    super(message);
    this.name = "LibraryRootError";
    this.code = code;
  }
}

export type LibraryChoice = {
  path: string;
  label: string;
  current: boolean;
  exists: boolean;
  /** 系统默认用户库，始终留在列表里 */
  builtin: boolean;
};

type Catalog = { active: string | null; paths: string[] };

export function platformLibraryRoot(): string {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "VennCV");
  }
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(base, "VennCV");
  }
  const xdg = process.env.XDG_DATA_HOME?.trim();
  const base = xdg || path.join(home, ".local", "share");
  return path.join(base, "VennCV");
}

/** 环境变量指定目录时，常用路径清单只写在那个目录里，避免改到系统默认用户库。 */
export function catalogHome(): string {
  const fromEnv = process.env.VENNCV_DATA_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return platformLibraryRoot();
}

export function envLibraryRoot(): string | null {
  const fromEnv = process.env.VENNCV_DATA_DIR?.trim();
  return fromEnv ? path.resolve(fromEnv) : null;
}

function broadFolders(home: string): Set<string> {
  const resolvedHome = path.resolve(home);
  const folders = new Set<string>([
    resolvedHome,
    path.parse(resolvedHome).root,
    path.join(resolvedHome, "Documents"),
    path.join(resolvedHome, "Desktop"),
    path.join(resolvedHome, "Downloads"),
  ]);
  if (process.platform === "darwin") {
    for (const item of [
      "/Users",
      "/tmp",
      "/private",
      "/private/tmp",
      "/var",
      "/private/var",
      "/etc",
      "/usr",
      "/bin",
      "/sbin",
      "/System",
      "/Applications",
      "/Library",
      "/Volumes",
      "/opt",
      path.join(resolvedHome, "Library"),
      path.join(resolvedHome, "Library", "Application Support"),
      path.join(resolvedHome, "Movies"),
      path.join(resolvedHome, "Music"),
      path.join(resolvedHome, "Pictures"),
      path.join(resolvedHome, "Public"),
    ]) {
      folders.add(path.resolve(item));
    }
  } else if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(resolvedHome, "AppData", "Roaming");
    for (const item of [
      process.env.SystemRoot,
      process.env.ProgramFiles,
      path.join(resolvedHome, "AppData"),
      appData,
      path.dirname(appData),
    ]) {
      if (item) folders.add(path.resolve(item));
    }
  } else {
    for (const item of ["/etc", "/usr", "/var", "/tmp", "/opt", "/bin", "/sbin", "/home", path.join(resolvedHome, ".local"), path.join(resolvedHome, ".local", "share")]) {
      folders.add(path.resolve(item));
    }
  }
  return folders;
}

export function isForbiddenLibraryRoot(candidate: string, home = os.homedir()): boolean {
  return broadFolders(home).has(path.resolve(candidate));
}

function directoryUsable(candidate: string): boolean {
  try {
    const stat = fs.lstatSync(candidate);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function chmodPrivate(target: string, mode: number): void {
  if (process.platform === "win32") return;
  fs.chmodSync(target, mode);
}

export function resolveLibraryRoot(raw: string, create: boolean, home = os.homedir()): string {
  const text = raw.trim();
  if (!text || text.includes("\0") || text.length > MAX_PATH_LENGTH) {
    throw new LibraryRootError("INVALID", "路径无效");
  }
  if (!path.isAbsolute(text)) {
    throw new LibraryRootError("INVALID", "请填写从根目录开始的完整路径");
  }
  const resolved = path.resolve(text);
  if (isForbiddenLibraryRoot(resolved, home)) {
    throw new LibraryRootError("INVALID", "这个位置太宽，请选一个专门的文件夹");
  }
  let stat: fs.Stats | null = null;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
  if (stat?.isSymbolicLink()) throw new LibraryRootError("INVALID", "不能使用符号链接");
  if (stat && !stat.isDirectory()) throw new LibraryRootError("INVALID", "这不是文件夹");
  if (!stat) {
    if (!create) throw new LibraryRootError("NEED_CREATE", "这个文件夹还不存在");
    const parent = path.dirname(resolved);
    if (parent === resolved || path.parse(parent).root === parent) {
      throw new LibraryRootError("INVALID", "这个位置太宽，请选一个专门的文件夹");
    }
    let parentStat: fs.Stats;
    try {
      parentStat = fs.lstatSync(parent);
    } catch {
      throw new LibraryRootError("INVALID", "上一级文件夹不存在");
    }
    if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
      throw new LibraryRootError("INVALID", "上一级不是文件夹");
    }
    fs.mkdirSync(resolved, { mode: 0o700 });
    chmodPrivate(resolved, 0o700);
    return resolved;
  }
  return resolved;
}

function emptyCatalog(): Catalog {
  return { active: null, paths: [] };
}

function readCatalog(catalogHome: string): Catalog {
  const file = path.join(catalogHome, LIBRARY_ROOTS_FILE);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(file);
  } catch {
    return emptyCatalog();
  }
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_CATALOG_BYTES) return emptyCatalog();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { active?: unknown; paths?: unknown };
    const paths = Array.isArray(parsed.paths)
      ? parsed.paths.filter((item): item is string => typeof item === "string" && path.isAbsolute(item)).map((item) => path.resolve(item))
      : [];
    const unique = [...new Set(paths)].slice(0, MAX_PATHS);
    const active = typeof parsed.active === "string" && path.isAbsolute(parsed.active) ? path.resolve(parsed.active) : null;
    return { active, paths: unique };
  } catch {
    return emptyCatalog();
  }
}

function writeCatalog(catalogHome: string, catalog: Catalog): void {
  fs.mkdirSync(catalogHome, { recursive: true, mode: 0o700 });
  chmodPrivate(catalogHome, 0o700);
  const file = path.join(catalogHome, LIBRARY_ROOTS_FILE);
  try {
    if (fs.lstatSync(file).isSymbolicLink()) throw new LibraryRootError("INVALID", "不能使用符号链接");
  } catch (error) {
    if (error instanceof LibraryRootError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
  const body = `${JSON.stringify({ active: catalog.active, paths: catalog.paths }, null, 2)}\n`;
  const fd = fs.openSync(file, "w", 0o600);
  try {
    fs.writeSync(fd, body);
    chmodPrivate(file, 0o600);
  } finally {
    fs.closeSync(fd);
  }
}

function choiceLabel(candidate: string, platformRoot: string): string {
  if (path.resolve(candidate) === path.resolve(platformRoot)) return "默认用户库";
  return path.basename(candidate) || candidate;
}

export function listLibraryChoices(catalogHome: string, current: string, platformRoot: string): LibraryChoice[] {
  const catalog = readCatalog(catalogHome);
  const currentResolved = path.resolve(current);
  const platform = path.resolve(platformRoot);
  const paths = new Set<string>([currentResolved, platform, ...catalog.paths]);
  const choices = [...paths].map((item) => ({
    path: item,
    label: choiceLabel(item, platform),
    current: item === currentResolved,
    exists: directoryUsable(item),
    builtin: item === platform,
  }));
  choices.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    const aDefault = a.path === platform;
    const bDefault = b.path === platform;
    if (aDefault !== bDefault) return aDefault ? -1 : 1;
    return a.label.localeCompare(b.label, "zh");
  });
  return choices;
}

export function switchLibraryRoot(
  catalogHome: string,
  requested: string,
  create: boolean,
  home = os.homedir(),
  current = "",
): string {
  const resolved = resolveLibraryRoot(requested, create, home);
  const catalog = readCatalog(catalogHome);
  const remembered = current.trim() && path.isAbsolute(current) ? path.resolve(current) : "";
  const paths = [...new Set([resolved, remembered, ...catalog.paths].filter((item) => item))];
  if (paths.length > MAX_PATHS) throw new LibraryRootError("INVALID", "常用路径最多 12 个");
  writeCatalog(catalogHome, { active: resolved, paths });
  return resolved;
}

export function forgetLibraryRoot(catalogHome: string, current: string, requested: string): void {
  const text = requested.trim();
  if (!text || !path.isAbsolute(text)) throw new LibraryRootError("INVALID", "路径无效");
  const resolved = path.resolve(text);
  if (resolved === path.resolve(current)) throw new LibraryRootError("INVALID", "正在使用的路径不能移出");
  const catalog = readCatalog(catalogHome);
  const paths = catalog.paths.filter((item) => item !== resolved);
  if (paths.length === catalog.paths.length) throw new LibraryRootError("INVALID", "列表里没有这个路径");
  const active = catalog.active === resolved ? path.resolve(current) : catalog.active;
  writeCatalog(catalogHome, { active, paths });
}

export function resolveStartupRoot(envRoot: string | null, catalogHome: string, home = os.homedir()): string {
  if (envRoot && envRoot.trim()) return path.resolve(envRoot);
  const active = readCatalog(catalogHome).active;
  if (active && directoryUsable(active) && !isForbiddenLibraryRoot(active, home)) return active;
  return path.resolve(catalogHome);
}
