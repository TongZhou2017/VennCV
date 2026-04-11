import { describe, expect, it } from "vitest";
import { defaultEmptyAppData } from "../domain/appData";
import type { AppDataJson } from "../types";
import {
  appendSnapshot,
  defaultVersionStore,
  deleteBranch,
  forkBranch,
  lineageForBranch,
  loadVersionStore,
  MAX_VERSION_SNAPSHOTS,
} from "./versionStore";

describe("versionStore", () => {
  it("appendSnapshot 链式增加当前分支 tip", () => {
    let s = defaultVersionStore();
    const d0 = defaultEmptyAppData();
    const r1 = appendSnapshot(s, "main", d0, "一");
    s = r1.store;
    expect(s.tips.main).toBe(r1.id);
    const d1: AppDataJson = {
      ...defaultEmptyAppData(),
      projects: {
        px: {
          id: "px",
          name: "快照B",
          description: "",
          status: "Published",
          field_ids: [],
          position: [100, 100],
          radius: 15,
          completion_percentage: 0,
        },
      },
    };
    const r2 = appendSnapshot(s, "main", d1, "二");
    s = r2.store;
    expect(s.snapshots[r2.id].parentId).toBe(r1.id);
    expect(s.tips.main).toBe(r2.id);
  });

  it("forkBranch 新建分支且 tip 指向源快照", () => {
    let s = defaultVersionStore();
    const r1 = appendSnapshot(s, "main", defaultEmptyAppData(), "根");
    s = r1.store;
    const fr = forkBranch(s, r1.id, "实验线");
    expect(fr.ok).toBe(true);
    if (!fr.ok) return;
    expect(fr.newBranchId).toBeTruthy();
    expect(fr.store.tips[fr.newBranchId]).toBe(r1.id);
    expect(fr.store.currentBranchId).toBe(fr.newBranchId);
    const chain = lineageForBranch(fr.store, fr.newBranchId);
    expect(chain).toHaveLength(1);
    expect(chain[0].id).toBe(r1.id);
  });

  it("MAX_VERSION_SNAPSHOTS 为合理上限", () => {
    expect(MAX_VERSION_SNAPSHOTS).toBeGreaterThan(10);
    expect(MAX_VERSION_SNAPSHOTS).toBeLessThan(500);
  });

  it("loadVersionStore 对空用户名仍返回默认结构", () => {
    const v = loadVersionStore("");
    expect(v.branchNames.main).toBeTruthy();
    expect(v.currentBranchId).toBe("main");
  });

  it("不能删除主分支", () => {
    const r = deleteBranch(defaultVersionStore(), "main");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("主");
  });

  it("deleteBranch 删除非主分支并回落到 main", () => {
    let s = defaultVersionStore();
    const r1 = appendSnapshot(s, "main", defaultEmptyAppData(), "m1");
    s = r1.store;
    const fr = forkBranch(s, r1.id, "side");
    expect(fr.ok).toBe(true);
    if (!fr.ok) return;
    s = fr.store;
    const r2 = appendSnapshot(s, fr.newBranchId, defaultEmptyAppData(), "s1");
    s = r2.store;
    expect(s.currentBranchId).toBe(fr.newBranchId);
    const del = deleteBranch(s, fr.newBranchId);
    expect(del.ok).toBe(true);
    if (!del.ok) return;
    expect(del.store.branchNames[fr.newBranchId]).toBeUndefined();
    expect(del.store.tips[fr.newBranchId]).toBeUndefined();
    expect(del.store.currentBranchId).toBe("main");
    expect(del.switchedWorkspace).toBe(true);
    expect(lineageForBranch(del.store, "main").length).toBeGreaterThan(0);
  });
});
