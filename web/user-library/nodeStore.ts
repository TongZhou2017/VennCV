import * as fs from "node:fs";
import * as path from "node:path";
import { platformLibraryRoot } from "./libraryRoots";
import {
  CONFIG_FILE,
  isAllowedLibraryPath,
  isSafeJsonFilename,
  isSafeUsername,
} from "../src/storage/libraryPaths";

export const MAX_LIBRARY_FILE_BYTES = 32 * 1024 * 1024;

export type LibraryFile = { path: string; contents: string };

export function defaultLibraryRoot(): string {
  const fromEnv = process.env.VENNCV_DATA_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return platformLibraryRoot();
}

function assertInsideRoot(root: string, full: string): void {
  const rel = path.relative(path.resolve(root), path.resolve(full));
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("路径越界");
  }
}

/** 路径上任一已存在的分量若是符号链接，则拒绝。 */
function assertNoSymlink(root: string, full: string): void {
  const rel = path.relative(root, full);
  let current = root;
  const parts = rel.split(path.sep).filter(Boolean);
  for (const part of parts) {
    current = path.join(current, part);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error("拒绝符号链接");
  }
}

export function resolveLibraryFile(root: string, logical: string): string {
  const normalized = logical.replace(/\\/g, "/");
  if (!isAllowedLibraryPath(normalized)) {
    throw new Error("不允许的路径");
  }
  const full = path.resolve(root, ...normalized.split("/"));
  assertInsideRoot(root, full);
  assertNoSymlink(root, full);
  return full;
}

function chmodPrivate(target: string, mode: number): void {
  if (process.platform === "win32") return;
  fs.chmodSync(target, mode);
}

function writePrivate(full: string, contents: string): void {
  const dir = path.dirname(full);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodPrivate(dir, 0o700);
  const fd = fs.openSync(full, "w", 0o600);
  try {
    fs.writeSync(fd, contents);
    chmodPrivate(full, 0o600);
  } finally {
    fs.closeSync(fd);
  }
}

function copyLegacyFile(root: string, logical: string, source: string): void {
  const dest = resolveLibraryFile(root, logical);
  if (fs.existsSync(dest)) return;
  const stat = fs.lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink()) return;
  if (stat.size > MAX_LIBRARY_FILE_BYTES) {
    throw new Error(`文件过大：${logical}`);
  }
  writePrivate(dest, fs.readFileSync(source, "utf8"));
}

/** 用户库里还没有 config.yaml 时，从旧目录复制一次。已有文件不覆盖。 */
export function seedLibrary(root: string, legacyRoots: string[]): void {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  chmodPrivate(root, 0o700);
  const destConfig = path.join(root, CONFIG_FILE);
  if (fs.existsSync(destConfig)) return;

  for (const legacy of legacyRoots) {
    const legacyRoot = path.resolve(legacy);
    if (legacyRoot === path.resolve(root)) continue;
    const usersDir = path.join(legacyRoot, "users");
    if (fs.existsSync(usersDir) && fs.statSync(usersDir).isDirectory() && !fs.lstatSync(usersDir).isSymbolicLink()) {
      for (const userEnt of fs.readdirSync(usersDir, { withFileTypes: true })) {
        if (!userEnt.isDirectory() || userEnt.isSymbolicLink() || !isSafeUsername(userEnt.name)) continue;
        const userDir = path.join(usersDir, userEnt.name);
        for (const fileEnt of fs.readdirSync(userDir, { withFileTypes: true })) {
          if (!fileEnt.isFile() || fileEnt.isSymbolicLink() || !isSafeJsonFilename(fileEnt.name)) continue;
          const logical = `users/${userEnt.name}/${fileEnt.name}`;
          copyLegacyFile(root, logical, path.join(userDir, fileEnt.name));
        }
      }
    }
    const legacyConfig = path.join(legacyRoot, CONFIG_FILE);
    if (fs.existsSync(legacyConfig) && fs.statSync(legacyConfig).isFile() && !fs.lstatSync(legacyConfig).isSymbolicLink()) {
      copyLegacyFile(root, CONFIG_FILE, legacyConfig);
    }
  }
}

export function readLibrarySnapshot(root: string): LibraryFile[] {
  const files: LibraryFile[] = [];
  const configPath = path.join(root, CONFIG_FILE);
  if (fs.existsSync(configPath) && fs.statSync(configPath).isFile()) {
    files.push({ path: CONFIG_FILE, contents: readChecked(root, CONFIG_FILE) });
  }
  const usersDir = path.join(root, "users");
  if (!fs.existsSync(usersDir) || fs.lstatSync(usersDir).isSymbolicLink()) {
    files.sort((a, b) => a.path.localeCompare(b.path));
    return files;
  }
  for (const userEnt of fs.readdirSync(usersDir, { withFileTypes: true })) {
    if (!userEnt.isDirectory() || userEnt.isSymbolicLink() || !isSafeUsername(userEnt.name)) continue;
    const userDir = path.join(usersDir, userEnt.name);
    for (const fileEnt of fs.readdirSync(userDir, { withFileTypes: true })) {
      if (!fileEnt.isFile() || fileEnt.isSymbolicLink() || !isSafeJsonFilename(fileEnt.name)) continue;
      const logical = `users/${userEnt.name}/${fileEnt.name}`;
      files.push({ path: logical, contents: readChecked(root, logical) });
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

function readChecked(root: string, logical: string): string {
  const full = resolveLibraryFile(root, logical);
  const stat = fs.statSync(full);
  if (!stat.isFile()) throw new Error("不是文件");
  if (stat.size > MAX_LIBRARY_FILE_BYTES) throw new Error(`文件过大：${logical}`);
  return fs.readFileSync(full, "utf8");
}

export function writeLibraryFile(root: string, logical: string, contents: string): void {
  if (Buffer.byteLength(contents, "utf8") > MAX_LIBRARY_FILE_BYTES) {
    throw new Error("内容过大");
  }
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  chmodPrivate(root, 0o700);
  const full = resolveLibraryFile(root, logical);
  writePrivate(full, contents);
}

export function ensureLibrary(root: string, legacyRoots: string[]): void {
  seedLibrary(root, legacyRoots);
}

/** 只有系统默认用户库会从旧目录补一次数据。自行指定的路径只建空文件夹。 */
export function openLibrary(root: string, legacyRoots: string[], seedRoot: string): void {
  if (path.resolve(root) === path.resolve(seedRoot)) {
    seedLibrary(root, legacyRoots);
    return;
  }
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  chmodPrivate(root, 0o700);
}
