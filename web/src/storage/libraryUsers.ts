import type { UserConfig, UserConfigEntry } from "../types";
import { chooseWorkspaceFile, isAllowedLibraryPath, isSafeUsername } from "./libraryPaths";

function filenamesFor(paths: string[], username: string): string[] {
  const prefix = `users/${username}/`;
  const names: string[] = [];
  for (const logical of paths) {
    if (!logical.startsWith(prefix)) continue;
    const name = logical.slice(prefix.length);
    if (name && !name.includes("/")) names.push(name);
  }
  return names;
}

/**
 * 把磁盘上已有、但 config.yaml 未登记的用户并入账号列表。
 * 没有密码的用户留空，需在登录时设置，不能用空密码进入。
 */
export function mergeDiscoveredUsers(
  config: UserConfig,
  logicalPaths: string[],
): { config: UserConfig; changed: boolean } {
  const allowed = logicalPaths.filter((logical) => isAllowedLibraryPath(logical));
  const usernames = new Set<string>();
  for (const logical of allowed) {
    const parts = logical.split("/");
    if (parts[0] === "users" && parts[1] && isSafeUsername(parts[1])) usernames.add(parts[1]);
  }

  let changed = false;
  const users: UserConfigEntry[] = config.users.map((user) => ({ ...user }));
  for (const username of usernames) {
    const chosen = chooseWorkspaceFile(filenamesFor(allowed, username));
    const workspace = chosen ? `users/${username}/${chosen}` : null;
    const existing = users.find((user) => user.username === username);
    if (!existing) {
      users.push({
        username,
        password_hash: "",
        data_storage_path: `users/${username}`,
        last_edited_file: workspace,
      });
      changed = true;
      continue;
    }
    if (!existing.data_storage_path) {
      existing.data_storage_path = `users/${username}`;
      changed = true;
    }
    if (!existing.last_edited_file && workspace) {
      existing.last_edited_file = workspace;
      changed = true;
    }
  }
  return { config: { users }, changed };
}

/** 把坚果云上已有、本机账号表还没有的用户登记进来。密码留空，登录时再设。 */
export function mergeCloudUsernames(
  config: UserConfig,
  names: string[],
): { config: UserConfig; changed: boolean } {
  let changed = false;
  const users: UserConfigEntry[] = config.users.map((user) => ({ ...user }));
  for (const raw of names) {
    const username = raw.trim();
    if (!isSafeUsername(username)) continue;
    if (users.some((user) => user.username === username)) continue;
    users.push({
      username,
      password_hash: "",
      data_storage_path: `users/${username}`,
      last_edited_file: null,
    });
    changed = true;
  }
  return { config: { users }, changed };
}
