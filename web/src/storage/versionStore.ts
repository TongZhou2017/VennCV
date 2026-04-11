import type { AppDataJson } from "../types";
import { appDataToExportJson, cloneAppData, normalizeAppData } from "../domain/appData";
import type { WriteStorageResult } from "./fs";
import { readStorage, writeStorage } from "./fs";

export const VERSION_STORE_SCHEMA = 1;
export const MAX_VERSION_SNAPSHOTS = 48;

export interface VersionSnapshot {
  id: string;
  parentId: string | null;
  branchId: string;
  label: string;
  createdAt: number;
  /** `AppDataJson` 的 JSON 字符串 */
  payload: string;
}

export interface VersionStoreFile {
  schema: number;
  /** 分支 id → 该分支最新快照 id */
  tips: Record<string, string>;
  branchNames: Record<string, string>;
  snapshots: Record<string, VersionSnapshot>;
  currentBranchId: string;
}

export function versionStorePath(username: string): string {
  return `users/${username}/version_store.json`;
}

function newSnapshotId(): string {
  return `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultVersionStore(): VersionStoreFile {
  return {
    schema: VERSION_STORE_SCHEMA,
    tips: {},
    branchNames: { main: "主分支" },
    snapshots: {},
    currentBranchId: "main",
  };
}

export function loadVersionStore(username: string): VersionStoreFile {
  const path = versionStorePath(username);
  const raw = readStorage(path);
  if (!raw) return defaultVersionStore();
  try {
    const j = JSON.parse(raw) as VersionStoreFile;
    if (!j || typeof j !== "object" || j.schema !== VERSION_STORE_SCHEMA) {
      return defaultVersionStore();
    }
    if (!j.branchNames) j.branchNames = { main: "主分支" };
    if (!j.tips) j.tips = {};
    if (!j.snapshots) j.snapshots = {};
    if (!j.currentBranchId || !j.branchNames[j.currentBranchId]) {
      j.currentBranchId = "main";
    }
    return j;
  } catch {
    return defaultVersionStore();
  }
}

export function persistVersionStore(
  username: string,
  store: VersionStoreFile,
): WriteStorageResult {
  return writeStorage(versionStorePath(username), JSON.stringify(store, null, 2));
}

function reachableSnapshotIds(store: VersionStoreFile): Set<string> {
  const seen = new Set<string>();
  const walk = (id: string | null) => {
    let cur: string | null = id;
    while (cur && store.snapshots[cur] && !seen.has(cur)) {
      seen.add(cur);
      cur = store.snapshots[cur].parentId;
    }
  };
  for (const tipId of Object.values(store.tips)) {
    if (tipId) walk(tipId);
  }
  return seen;
}

function pruneUnreachable(store: VersionStoreFile): void {
  const keep = reachableSnapshotIds(store);
  for (const id of Object.keys(store.snapshots)) {
    if (!keep.has(id)) delete store.snapshots[id];
  }
}

function removeOldestRootIfNotTip(store: VersionStoreFile): boolean {
  const tipSet = new Set(Object.values(store.tips));
  const roots = Object.values(store.snapshots).filter((s) => s.parentId === null);
  if (roots.length === 0) return false;
  const oldest = roots.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
  if (tipSet.has(oldest.id)) return false;
  for (const s of Object.values(store.snapshots)) {
    if (s.parentId === oldest.id) s.parentId = null;
  }
  delete store.snapshots[oldest.id];
  return true;
}

function pruneToMax(store: VersionStoreFile, max: number): void {
  pruneUnreachable(store);
  let guard = 0;
  while (Object.keys(store.snapshots).length > max && guard++ < max + 20) {
    const ids = Object.keys(store.snapshots);
    const leaves = ids.filter((id) => {
      if (Object.values(store.tips).includes(id)) return false;
      return !ids.some((other) => store.snapshots[other].parentId === id);
    });
    if (leaves.length > 0) {
      leaves.sort(
        (a, b) => store.snapshots[a].createdAt - store.snapshots[b].createdAt,
      );
      delete store.snapshots[leaves[0]];
      continue;
    }
    if (!removeOldestRootIfNotTip(store)) break;
  }
}

export function slugBranchId(name: string): string {
  const t = name
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (t || "branch").slice(0, 40);
}

export function uniqueBranchId(store: VersionStoreFile, base: string): string {
  let id = base;
  let n = 2;
  while (store.branchNames[id] !== undefined) {
    id = `${base}_${n}`;
    n += 1;
  }
  return id;
}

/** 从分支 tip 沿 parent 回溯，返回从旧到新 */
export function lineageForBranch(
  store: VersionStoreFile,
  branchId: string,
): VersionSnapshot[] {
  const tipId = store.tips[branchId];
  if (!tipId || !store.snapshots[tipId]) return [];
  const rev: VersionSnapshot[] = [];
  let cur: string | null = tipId;
  while (cur && store.snapshots[cur]) {
    rev.push(store.snapshots[cur]);
    cur = store.snapshots[cur].parentId;
  }
  return rev.reverse();
}

/** 用于概览：按分支列出 lineage */
export function allBranchLineages(
  store: VersionStoreFile,
): { branchId: string; name: string; chain: VersionSnapshot[] }[] {
  return Object.keys(store.branchNames).map((branchId) => ({
    branchId,
    name: store.branchNames[branchId] ?? branchId,
    chain: lineageForBranch(store, branchId),
  }));
}

export function parseSnapshotData(s: VersionSnapshot): AppDataJson | null {
  try {
    return normalizeAppData(JSON.parse(s.payload));
  } catch {
    return null;
  }
}

export function appendSnapshot(
  store: VersionStoreFile,
  branchId: string,
  data: AppDataJson,
  label: string,
): { store: VersionStoreFile; id: string } {
  const next = { ...store, snapshots: { ...store.snapshots } };
  const id = newSnapshotId();
  const parentId = next.tips[branchId] ?? null;
  const payload = appDataToExportJson(cloneAppData(data));
  next.snapshots[id] = {
    id,
    parentId,
    branchId,
    label: label.trim() || "快照",
    createdAt: Date.now(),
    payload,
  };
  next.tips = { ...next.tips, [branchId]: id };
  next.currentBranchId = branchId;
  pruneToMax(next, MAX_VERSION_SNAPSHOTS);
  return { store: next, id };
}

export function forkBranch(
  store: VersionStoreFile,
  fromSnapshotId: string,
  displayName: string,
):
  | { ok: true; store: VersionStoreFile; newBranchId: string; data: AppDataJson }
  | { ok: false; error: string } {
  const src = store.snapshots[fromSnapshotId];
  if (!src) return { ok: false, error: "找不到该快照" };
  const data = parseSnapshotData(src);
  if (!data) return { ok: false, error: "快照数据已损坏，无法分叉" };
  const base = slugBranchId(displayName);
  const newBranchId = uniqueBranchId(store, base);
  const next: VersionStoreFile = {
    ...store,
    tips: { ...store.tips },
    branchNames: { ...store.branchNames, [newBranchId]: displayName.trim() || newBranchId },
    snapshots: { ...store.snapshots },
    currentBranchId: newBranchId,
  };
  next.tips[newBranchId] = fromSnapshotId;
  return { ok: true, store: next, newBranchId, data: cloneAppData(data) };
}

export function switchBranch(
  store: VersionStoreFile,
  branchId: string,
):
  | { ok: true; store: VersionStoreFile; data: AppDataJson | null }
  | { ok: false; error: string } {
  if (!store.branchNames[branchId]) return { ok: false, error: "分支不存在" };
  const tipId = store.tips[branchId];
  if (!tipId || !store.snapshots[tipId]) {
    return {
      ok: true,
      store: { ...store, currentBranchId: branchId },
      data: null,
    };
  }
  const data = parseSnapshotData(store.snapshots[tipId]);
  if (!data) return { ok: false, error: "分支顶端快照损坏" };
  return {
    ok: true,
    store: { ...store, currentBranchId: branchId },
    data: cloneAppData(data),
  };
}

export function renameBranch(
  store: VersionStoreFile,
  branchId: string,
  newName: string,
): VersionStoreFile {
  const name = newName.trim() || store.branchNames[branchId] || branchId;
  return {
    ...store,
    branchNames: { ...store.branchNames, [branchId]: name },
  };
}

/** 删除分支（不可删除 `main`）；会剪掉该分支 tip 并 prune 孤立快照 */
export function deleteBranch(
  store: VersionStoreFile,
  branchId: string,
):
  | { ok: true; store: VersionStoreFile; switchedWorkspace: boolean }
  | { ok: false; error: string } {
  if (!store.branchNames[branchId]) return { ok: false, error: "分支不存在" };
  if (branchId === "main") return { ok: false, error: "不能删除主分支" };
  const ids = Object.keys(store.branchNames);
  if (ids.length <= 1) return { ok: false, error: "至少保留一个分支" };

  const wasCurrent = store.currentBranchId === branchId;
  const nextBranchNames = { ...store.branchNames };
  delete nextBranchNames[branchId];
  const nextTips = { ...store.tips };
  delete nextTips[branchId];

  let nextCurrent = store.currentBranchId;
  if (wasCurrent) {
    nextCurrent =
      nextBranchNames.main !== undefined ? "main" : Object.keys(nextBranchNames)[0];
  }

  const next: VersionStoreFile = {
    ...store,
    branchNames: nextBranchNames,
    tips: nextTips,
    currentBranchId: nextCurrent,
    snapshots: { ...store.snapshots },
  };
  pruneUnreachable(next);
  return { ok: true, store: next, switchedWorkspace: wasCurrent };
}
