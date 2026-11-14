import { readSyncAccount, writeSyncAccount, type SyncAccountFields } from "../domain/jianguoyun";
import type { WriteStorageResult } from "./fs";
import { readStorage, writeStorage } from "./fs";
import { SYNC_ACCOUNT_FILENAME } from "./libraryPaths";

/** 坚果云账号属于整份用户库，写在库根，不放进某个登录用户目录。 */
export function syncAccountPath(): string {
  return SYNC_ACCOUNT_FILENAME;
}

export function loadSyncAccount(): SyncAccountFields {
  return readSyncAccount(readStorage(syncAccountPath()));
}

export function saveSyncAccount(account: SyncAccountFields): WriteStorageResult {
  return writeStorage(syncAccountPath(), writeSyncAccount(account));
}
