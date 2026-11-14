import { describe, expect, it } from "vitest";
import { mergeJsonText } from "./jsonMerge";

const base = JSON.stringify({
  projects: {
    a: { id: "a", name: "甲", status: "ToBeStarted", progress_blocks: [{ id: "t1", title: "旧" }] },
  },
  relation_tags: ["方法"],
});

describe("json merge", () => {
  it("keeps both projects when each side added a different one", () => {
    const local = JSON.stringify({
      projects: {
        a: { id: "a", name: "甲", status: "ToBeStarted", progress_blocks: [{ id: "t1", title: "旧" }] },
        b: { id: "b", name: "乙" },
      },
      relation_tags: ["方法"],
    });
    const remote = JSON.stringify({
      projects: {
        a: { id: "a", name: "甲", status: "ToBeStarted", progress_blocks: [{ id: "t1", title: "旧" }] },
        c: { id: "c", name: "丙" },
      },
      relation_tags: ["方法", "图"],
    });
    const merged = mergeJsonText(base, local, remote);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    const parsed = JSON.parse(merged.text) as { projects: Record<string, { name: string }>; relation_tags: string[] };
    expect(Object.keys(parsed.projects).sort()).toEqual(["a", "b", "c"]);
    expect(parsed.relation_tags).toEqual(["方法", "图"]);
  });

  it("merges different fields of the same project and stops on the same field", () => {
    const local = JSON.stringify({
      projects: {
        a: { id: "a", name: "甲改", status: "ToBeStarted", progress_blocks: [{ id: "t1", title: "旧" }, { id: "t2", title: "本机" }] },
      },
      relation_tags: ["方法"],
    });
    const remote = JSON.stringify({
      projects: {
        a: { id: "a", name: "甲", status: "SteadyProgress", progress_blocks: [{ id: "t1", title: "旧" }, { id: "t3", title: "云端" }] },
      },
      relation_tags: ["方法"],
    });
    const merged = mergeJsonText(base, local, remote);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    const project = JSON.parse(merged.text).projects.a;
    expect(project.name).toBe("甲改");
    expect(project.status).toBe("SteadyProgress");
    expect(project.progress_blocks.map((block: { id: string }) => block.id)).toEqual(["t1", "t3", "t2"]);

    const clash = mergeJsonText(
      base,
      JSON.stringify({ projects: { a: { id: "a", name: "本机", status: "ToBeStarted", progress_blocks: [] } }, relation_tags: ["方法"] }),
      JSON.stringify({ projects: { a: { id: "a", name: "云端", status: "ToBeStarted", progress_blocks: [] } }, relation_tags: ["方法"] }),
    );
    expect(clash).toEqual({ ok: false });
  });

  it("stops when one side deletes an item the other side edited", () => {
    const local = JSON.stringify({ projects: {}, relation_tags: ["方法"] });
    const remote = JSON.stringify({
      projects: { a: { id: "a", name: "云端改", status: "ToBeStarted", progress_blocks: [] } },
      relation_tags: ["方法"],
    });
    expect(mergeJsonText(base, local, remote)).toEqual({ ok: false });
  });

  it("stops when both sides reorder the same list", () => {
    const origin = JSON.stringify({ field_ids: ["a", "b"] });
    const merged = mergeJsonText(origin, JSON.stringify({ field_ids: ["b", "a"] }), JSON.stringify({ field_ids: ["b", "a", "c"] }));
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(JSON.parse(merged.text).field_ids).toEqual(["b", "a", "c"]);
    const originThree = JSON.stringify({ field_ids: ["a", "b", "c"] });
    expect(
      mergeJsonText(originThree, JSON.stringify({ field_ids: ["c", "b", "a"] }), JSON.stringify({ field_ids: ["b", "c", "a"] })),
    ).toEqual({ ok: false });
  });
});
