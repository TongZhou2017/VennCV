import { describe, expect, it } from "vitest";
import { mergeDiscoveredUsers } from "./libraryUsers";
import type { UserConfig } from "../types";

const baseConfig: UserConfig = {
  users: [
    {
      username: "admin",
      password_hash: "admin",
      data_storage_path: null,
      last_edited_file: null,
    },
  ],
};

describe("mergeDiscoveredUsers", () => {
  it("registers a directory user without a password and points at its only workspace", () => {
    const merged = mergeDiscoveredUsers(baseConfig, [
      "config.yaml",
      "users/admin/set1.json",
      "users/tong/set2.json",
    ]);
    expect(merged.changed).toBe(true);
    const tong = merged.config.users.find((user) => user.username === "tong");
    expect(tong?.password_hash).toBe("");
    expect(tong?.last_edited_file).toBe("users/tong/set2.json");
    const admin = merged.config.users.find((user) => user.username === "admin");
    expect(admin?.last_edited_file).toBe("users/admin/set1.json");
    expect(admin?.password_hash).toBe("admin");
  });

  it("does not overwrite an existing workspace pointer", () => {
    const merged = mergeDiscoveredUsers(
      {
        users: [
          {
            username: "tong",
            password_hash: "secret",
            data_storage_path: "users/tong",
            last_edited_file: "users/tong/set2.json",
          },
        ],
      },
      ["users/tong/set2.json", "users/tong/workspace.json"],
    );
    expect(merged.changed).toBe(false);
    expect(merged.config.users[0].last_edited_file).toBe("users/tong/set2.json");
  });
});
