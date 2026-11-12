import { describe, expect, it } from "vitest";
import { summarizeWorkspaceJson } from "./userSummary";

describe("summarizeWorkspaceJson", () => {
  it("counts projects, skips placeholder names, and keeps real titles", () => {
    const raw = JSON.stringify({
      fields: {
        a: { name: "RNA结构" },
        b: { name: "生信工具开发" },
      },
      projects: {
        p1: { name: "VnFinder", status: "Published" },
        p2: { name: "itol.toolkit", status: "Published" },
        p3: { name: "新项目", status: "ToBeStarted" },
        p4: { name: "  ", status: "ToBeStarted" },
      },
    });
    const summary = summarizeWorkspaceJson(raw);
    expect(summary.projectCount).toBe(4);
    expect(summary.previewNames).toEqual(["VnFinder", "itol.toolkit"]);
    expect(summary.namedHiddenCount).toBe(0);
    expect(summary.placeholderCount).toBe(2);
    expect(summary.fieldNames).toEqual(["RNA结构", "生信工具开发"]);
    expect(summary.statusCounts.map((item) => [item.label, item.count])).toEqual([
      ["已发表", 2],
      ["待启动", 2],
    ]);
  });

  it("returns an empty summary for missing or broken JSON", () => {
    expect(summarizeWorkspaceJson(null).projectCount).toBe(0);
    expect(summarizeWorkspaceJson("{").projectCount).toBe(0);
  });
});
