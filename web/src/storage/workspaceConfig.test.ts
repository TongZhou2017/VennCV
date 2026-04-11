import { describe, expect, it } from "vitest";
import {
  isValidWorkspaceStorageKey,
  normalizeNewWorkspaceFilename,
} from "./config";

describe("workspace path validation", () => {
  it("accepts users/<name>/<file>.json", () => {
    expect(isValidWorkspaceStorageKey("admin", "users/admin/workspace.json")).toBe(true);
    expect(isValidWorkspaceStorageKey("u1", "users/u1/a_b-1.json")).toBe(true);
  });

  it("rejects traversal and wrong prefix", () => {
    expect(isValidWorkspaceStorageKey("admin", "users/other/workspace.json")).toBe(false);
    expect(isValidWorkspaceStorageKey("admin", "users/admin/../x.json")).toBe(false);
    expect(isValidWorkspaceStorageKey("admin", "users/admin/sub/x.json")).toBe(false);
  });

  it("normalizes new filename", () => {
    expect(normalizeNewWorkspaceFilename("  my-backup  ")).toBe("my-backup.json");
    expect(normalizeNewWorkspaceFilename("x.json")).toBe("x.json");
    expect(normalizeNewWorkspaceFilename("bad/name")).toBe(null);
  });
});
