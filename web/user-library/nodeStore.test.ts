import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readLibrarySnapshot, seedLibrary, writeLibraryFile } from "./nodeStore";

function tempDir(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `venncv-${name}-`));
}

describe("node user library", () => {
  it("copies legacy users once and refuses to overwrite or escape", () => {
    const legacy = tempDir("legacy");
    const dest = tempDir("lib");
    fs.mkdirSync(path.join(legacy, "users", "tong"), { recursive: true });
    fs.writeFileSync(path.join(legacy, "config.yaml"), "users: []\n", "utf8");
    fs.writeFileSync(path.join(legacy, "users", "tong", "set2.json"), '{"name":"tong"}\n', "utf8");

    seedLibrary(dest, [legacy]);
    const first = readLibrarySnapshot(dest);
    expect(first.map((file) => file.path).sort()).toEqual(["config.yaml", "users/tong/set2.json"]);

    writeLibraryFile(dest, "users/tong/set2.json", '{"kept":true}\n');
    seedLibrary(dest, [legacy]);
    const kept = fs.readFileSync(path.join(dest, "users", "tong", "set2.json"), "utf8");
    expect(kept).toContain("kept");

    expect(() => writeLibraryFile(dest, "../config.yaml", "nope")).toThrow(/不允许的路径/);
    expect(() => writeLibraryFile(dest, "users/tong/../../config.yaml", "nope")).toThrow(/不允许的路径/);
  });

  it("rejects a symlink inside the library", () => {
    const dest = tempDir("lib-link");
    const outside = tempDir("outside");
    fs.mkdirSync(path.join(dest, "users", "tong"), { recursive: true });
    fs.writeFileSync(path.join(outside, "secret.json"), "{}", "utf8");
    fs.symlinkSync(path.join(outside, "secret.json"), path.join(dest, "users", "tong", "set2.json"));
    expect(() => writeLibraryFile(dest, "users/tong/set2.json", '{"x":1}')).toThrow(/符号链接/);
  });
});
