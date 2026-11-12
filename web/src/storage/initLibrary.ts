import { loadUserConfig, saveUserConfig } from "./config";
import { connectUserLibrary, listLogicalPaths } from "./fs";
import { mergeDiscoveredUsers } from "./libraryUsers";

/** 打开本机用户库，并把磁盘上已有、尚未登记的用户补进账号列表。 */
export async function initPersistentStorage(): Promise<void> {
  await connectUserLibrary();
  const merged = mergeDiscoveredUsers(loadUserConfig(), listLogicalPaths());
  if (!merged.changed) return;
  const written = saveUserConfig(merged.config);
  if (!written.ok) throw new Error(written.message);
}
