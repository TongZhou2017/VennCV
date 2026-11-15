import { describe, expect, it } from "vitest";
import { chooseWorkspaceFile, isAllowedLibraryPath, preferredWorkspaceFile } from "./libraryPaths";

describe("library paths", () => {
  it("allows config and a user json file", () => {
    expect(isAllowedLibraryPath("config.yaml")).toBe(true);
    expect(isAllowedLibraryPath("sync_account.json")).toBe(true);
    expect(isAllowedLibraryPath("users/tong/set2.json")).toBe(true);
    expect(isAllowedLibraryPath("notes.json")).toBe(false);
  });

  it("rejects traversal and absolute paths", () => {
    expect(isAllowedLibraryPath("../config.yaml")).toBe(false);
    expect(isAllowedLibraryPath("users/../config.yaml")).toBe(false);
    expect(isAllowedLibraryPath("users/tong/../../config.yaml")).toBe(false);
    expect(isAllowedLibraryPath("/etc/passwd")).toBe(false);
    expect(isAllowedLibraryPath("users/tong/notes.txt")).toBe(false);
  });

  it("picks the only workspace file when workspace.json is absent", () => {
    expect(chooseWorkspaceFile(["set2.json", "version_store.json"])).toBe("set2.json");
    expect(chooseWorkspaceFile(["remember_login.json"])).toBe(null);
    expect(chooseWorkspaceFile(["sync_account.json", "workspace.json"])).toBe("workspace.json");
    expect(chooseWorkspaceFile(["cloud_upload.json", "sync_state.json", "workspace.json"])).toBe("workspace.json");
    expect(chooseWorkspaceFile(["set2.json", "remember_login.json"])).toBe("set2.json");
    expect(chooseWorkspaceFile(["set1.json", "set2.json"])).toBe(null);
    expect(chooseWorkspaceFile(["set1.json", "workspace.json"])).toBe("workspace.json");
  });

  it("points a new computer at the workspace that actually exists", () => {
    expect(preferredWorkspaceFile(null, ["set2.json", "version_store.json", "sync.json"])).toBe("set2.json");
    expect(preferredWorkspaceFile("users/tong/set2.json", ["set2.json", "version_store.json"])).toBe(null);
    expect(preferredWorkspaceFile("users/tong/workspace.json", ["set2.json"])).toBe("set2.json");
  });
});
