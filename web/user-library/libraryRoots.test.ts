import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LibraryRootError,
  forgetLibraryRoot,
  isForbiddenLibraryRoot,
  listLibraryChoices,
  resolveLibraryRoot,
  resolveStartupRoot,
  switchLibraryRoot,
} from "./libraryRoots";
import { openLibrary } from "./nodeStore";

function tempDir(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `venncv-${name}-`));
}

describe("library roots", () => {
  it("rejects broad, relative, and symlink paths", () => {
    expect(isForbiddenLibraryRoot(os.homedir())).toBe(true);
    expect(isForbiddenLibraryRoot(path.parse(os.homedir()).root)).toBe(true);
    expect(() => resolveLibraryRoot("relative/library", false)).toThrow(/完整路径/);
    const parent = tempDir("link-parent");
    const target = tempDir("link-target");
    const link = path.join(parent, "linked");
    fs.symlinkSync(target, link);
    expect(() => resolveLibraryRoot(link, false)).toThrow(LibraryRootError);
    expect(() => resolveLibraryRoot(link, false)).toThrow(/符号链接/);
  });

  it("asks before creating a missing folder, then remembers the switch", () => {
    const catalog = tempDir("catalog");
    const parent = tempDir("new-parent");
    const origin = tempDir("origin");
    const created = path.join(parent, "VennCV-data");
    expect(() => switchLibraryRoot(catalog, created, false)).toThrow(/还不存在/);
    const next = switchLibraryRoot(catalog, created, true, os.homedir(), origin);
    expect(next).toBe(created);
    expect(fs.statSync(created).isDirectory()).toBe(true);
    const choices = listLibraryChoices(catalog, next, path.join(parent, "default"));
    expect(choices.find((item) => item.path === created)?.current).toBe(true);
    expect(choices.some((item) => item.path === origin)).toBe(true);
    expect(fs.existsSync(path.join(created, "config.yaml"))).toBe(false);
  });

  it("uses a saved path only when the process did not set its own directory", () => {
    const catalog = tempDir("startup");
    const saved = tempDir("saved");
    switchLibraryRoot(catalog, saved, false);
    expect(resolveStartupRoot(null, catalog)).toBe(saved);
    const forced = tempDir("forced");
    expect(resolveStartupRoot(forced, catalog)).toBe(forced);
  });

  it("can drop a path that is not in use and does not copy old project files", () => {
    const catalog = tempDir("forget");
    const first = tempDir("first");
    const second = tempDir("second");
    const legacy = tempDir("legacy");
    fs.mkdirSync(path.join(legacy, "users", "tong"), { recursive: true });
    fs.writeFileSync(path.join(legacy, "config.yaml"), "users: []\n", "utf8");
    fs.writeFileSync(path.join(legacy, "users", "tong", "set2.json"), "{}\n", "utf8");
    switchLibraryRoot(catalog, first, false);
    switchLibraryRoot(catalog, second, false);
    openLibrary(second, [legacy], path.join(catalog, "not-this"));
    expect(fs.existsSync(path.join(second, "users", "tong", "set2.json"))).toBe(false);
    expect(() => forgetLibraryRoot(catalog, second, second)).toThrow(/正在使用/);
    forgetLibraryRoot(catalog, second, first);
    const choices = listLibraryChoices(catalog, second, path.join(catalog, "default"));
    expect(choices.some((item) => item.path === first)).toBe(false);
  });
});
