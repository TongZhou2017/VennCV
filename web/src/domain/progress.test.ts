import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import { normalizeAppData } from "./appData";
import {
  addProgressBlock,
  addProgressFigure,
  applyProgressTemplate,
  blocksForPerson,
  effectiveCompletion,
  houseBands,
  defaultReportWindow,
  progressReport,
  progressReportAcross,
  progressReportFileName,
  progressReportText,
  projectThroughDate,
  removeProgressBlock,
  removeProgressFigure,
  slotsBottomUp,
  setFigureShare,
  isBlockDone,
  remainingDays,
  scheduledDays,
  slotsOf,
  updateProgressBlock,
  updateProgressSlot,
} from "./progress";
import { buildTimelineModel } from "./timeline";

function project(partial: Partial<Project> = {}): Project {
  return {
    id: "p",
    name: "P",
    description: "",
    status: "SteadyProgress",
    field_ids: [],
    position: [0, 0],
    radius: 10,
    completion_percentage: 10,
    ...partial,
  };
}

function slotId(current: Project, label: string): string {
  const slot = slotsOf(current).find((item) => item.label === label);
  if (!slot) throw new Error(label);
  return slot.id;
}

function finish(current: Project, date: string): Project {
  const id = current.progress_blocks?.at(-1)?.id;
  if (!id) return current;
  return updateProgressBlock(current, id, { completed_on: date });
}

function fill(current: Project, label: string, count: number, date = "2026-03-01"): Project {
  let next = current;
  const id = slotId(next, label);
  for (let index = 0; index < count; index += 1) {
    next = addProgressBlock(next, id, `${label}${index + 1}`, date, date, null);
    next = finish(next, date);
  }
  return next;
}

describe("progress building", () => {
  it("lays the example house without changing a hand-entered completion", () => {
    const next = applyProgressTemplate(project());
    expect(next.completion_percentage).toBe(10);
    expect(effectiveCompletion(next)).toBe(10);
    expect(next.status).toBe("SteadyProgress");
    expect(slotsBottomUp(next).map((slot) => slot.label)).toEqual([
      "方法-数据",
      "方法-框架",
      "方法-消融",
      "POC-SOTA",
      "POC-Story",
      "主图1",
      "主图2",
      "主图3",
      "主图4",
      "论文-初稿",
      "论文-成稿",
    ]);
    const house = houseBands(next);
    expect(house[0]?.slots[0]?.label).toBe("论文-成稿");
    expect(house[house.length - 1]?.slots.at(-1)?.label).toBe("方法-数据");
    expect(applyProgressTemplate(next)).toBe(next);
  });

  it("lets sections fill in parallel and tops a full house at 100", () => {
    let next = applyProgressTemplate(project({ completion_percentage: 40 }));
    next = finish(addProgressBlock(next, slotId(next, "主图1"), "画故事线", "2026-01-09", "2026-01-09", null), "2026-01-09");
    next = finish(
      addProgressBlock(next, slotId(next, "方法-数据"), "整理数据", "2026-01-08", "2026-01-08", "person_1"),
      "2026-01-08",
    );
    expect(next.status).toBe("SteadyProgress");
    expect(effectiveCompletion(next)).toBe(3);
    expect(addProgressBlock(next, "missing", "不会写入", "2026-01-01", "2026-01-01", null)).toBe(next);

    next = fill(next, "方法-数据", 6);
    next = fill(next, "方法-框架", 6);
    next = fill(next, "方法-消融", 6);
    expect(effectiveCompletion(next)).toBe(31);
    next = fill(next, "POC-SOTA", 6);
    next = fill(next, "POC-Story", 6);
    expect(effectiveCompletion(next)).toBe(51);
    next = fill(next, "主图1", 6);
    next = fill(next, "主图2", 6);
    next = fill(next, "主图3", 6);
    next = fill(next, "主图4", 6);
    expect(effectiveCompletion(next)).toBe(80);
    next = fill(next, "论文-初稿", 6);
    expect(effectiveCompletion(next)).toBe(90);
    next = fill(next, "论文-成稿", 6);
    expect(effectiveCompletion(next)).toBe(100);
    expect(next.status).toBe("SteadyProgress");
  });

  it("drops completion when a stone is removed and keeps the manual number before any stone", () => {
    let next = applyProgressTemplate(project());
    expect(removeProgressFigure(next, slotId(next, "主图4")).completion_percentage).toBe(10);
    next = fill(next, "方法-数据", 6);
    next = fill(next, "方法-框架", 6);
    next = fill(next, "方法-消融", 6);
    expect(effectiveCompletion(next)).toBe(30);
    const block = next.progress_blocks?.find((item) => item.slot_id === slotId(next, "方法-数据"));
    expect(block).toBeDefined();
    next = removeProgressBlock(next, block!.id);
    expect(effectiveCompletion(next)).toBe(28);
    const laid = applyProgressTemplate(project({ completion_percentage: 40 }));
    const only = finish(addProgressBlock(laid, slotId(laid, "方法-数据"), "一块", "2026-01-01", "2026-01-01", null), "2026-01-01");
    const cleared = removeProgressBlock(only, only.progress_blocks?.[0]?.id ?? "");
    expect(only.completion_percentage).toBe(2);
    expect(cleared.completion_percentage).toBe(0);
  });

  it("splits the figure band across however many figures the project has", () => {
    let next = applyProgressTemplate(project({ completion_percentage: 0 }));
    next = fill(next, "主图1", 6);
    expect(effectiveCompletion(next)).toBe(8);
    const shared = setFigureShare(next, 40);
    expect(effectiveCompletion(shared)).toBe(10);
    const back = setFigureShare(shared, 30);
    expect(back.figure_share).toBeUndefined();
    expect(effectiveCompletion(back)).toBe(8);
    const grown = addProgressFigure(shared);
    expect(slotsOf(grown).filter((slot) => slot.band === "figure")).toHaveLength(5);
    expect(effectiveCompletion(grown)).toBe(8);
    const bare = project();
    const firstFigure = addProgressFigure(bare);
    expect(slotsOf(firstFigure).map((slot) => slot.label)).toEqual(["主图1"]);
    const kept = applyProgressTemplate(firstFigure);
    expect(slotsOf(kept).filter((slot) => slot.band === "figure").map((slot) => slot.label)).toEqual(["主图1"]);
    expect(slotsOf(kept).some((slot) => slot.label === "方法-数据")).toBe(true);
    expect(slotsOf(kept).some((slot) => slot.label === "论文-成稿")).toBe(true);
    expect(removeProgressFigure(next, slotId(next, "方法-数据"))).toBe(next);
  });

  it("groups stones by day, week, month, and year", () => {
    let next = applyProgressTemplate(project({ name: "甲" }));
    next = addProgressBlock(next, slotId(next, "方法-数据"), "整理", "2026-01-05", "2026-01-12", null);
    next = addProgressBlock(next, slotId(next, "方法-框架"), "搭框架", "2026-01-06", "2026-01-06", null);
    next = addProgressBlock(next, slotId(next, "主图1"), "出图", "2026-02-01", "2026-02-01", null);
    expect(progressReport(next, "day").map((group) => group.label)).toEqual(["2026-02-01", "2026-01-06", "2026-01-05"]);
    expect(progressReport(next, "week").map((group) => group.label)).toEqual(["2026-01-26 当周", "2026-01-05 当周"]);
    expect(progressReport(next, "month").map((group) => [group.label, group.entries.length])).toEqual([
      ["2026-02", 1],
      ["2026-01", 2],
    ]);
    expect(progressReport(next, "year")[0]?.entries.map((entry) => entry.block.title)).toEqual(["出图", "搭框架", "整理"]);

    let other = applyProgressTemplate(project({ id: "q", name: "乙" }));
    other = addProgressBlock(other, slotId(other, "POC-Story"), "对故事", "2026-01-06", "2026-01-06", null);
    const month = progressReportAcross({ p: next, q: other }, "day");
    const shared = month.find((group) => group.key === "2026-01-06");
    expect(shared?.lines.map((line) => `${line.projectName}:${line.block.title}`)).toEqual(["甲:搭框架", "乙:对故事"]);
  });

  it("writes the current review as a text report", () => {
    let next = applyProgressTemplate(project({ name: "甲", completion_percentage: 0 }));
    next = addProgressBlock(next, slotId(next, "方法-数据"), "整理", "2026-01-05", "2026-01-12", null);
    const open = next.progress_blocks?.[0];
    next = updateProgressBlock(next, open!.id, { note: "先对表" });
    const text = progressReportText(next, "month", { from: "2026-01-01", to: "2026-01-31" }, "2026-01-06", () => "未指定");
    expect(text).toBe(
      [
        "回看报告",
        "项目：甲",
        "完成度：0%",
        "范围：2026-01-01 至 2026-01-31",
        "按：月",
        "截至：2026-01-06",
        "",
        "2026-01",
        "整理（剩余 6 天）",
        "方法-数据 · 未指定",
        "2026-01-05 → 2026-01-12",
        "开始到期限 7 天",
        "备注：先对表",
        "",
      ].join("\n"),
    );
    expect(progressReportText(next, "day", { from: "2026-02-01", to: "2026-02-28" }, "2026-01-06", () => "未指定")).toContain(
      "这段时间里没有待办。",
    );
    expect(progressReportFileName("甲 / 乙", "2026-01-06")).toBe("甲乙-回看-2026-01-06.txt");
  });

  it("defaults the report window to the whole span and can narrow it", () => {
    let next = applyProgressTemplate(project({ expected_completion_date: "2026-12-01" }));
    next = addProgressBlock(next, slotId(next, "方法-数据"), "整理", "2026-01-05", "2026-01-20", null);
    next = addProgressBlock(next, slotId(next, "主图1"), "出图", "2026-02-01", "2026-03-01", null);
    expect(defaultReportWindow(next, "2026-03-01")).toEqual({ from: "2026-01-05", to: "2026-12-01" });
    expect(defaultReportWindow(next, "2027-01-01")).toEqual({ from: "2026-01-05", to: "2027-01-01" });
    const january = progressReport(next, "day", { from: "2026-01-01", to: "2026-01-31" });
    expect(january.map((group) => group.entries[0]?.block.title)).toEqual(["整理"]);
    expect(progressReport(next, "day", defaultReportWindow(next, "2026-03-01")).map((group) => group.label)).toEqual([
      "2026-02-01",
      "2026-01-05",
    ]);
    expect(defaultReportWindow(next, "2026-03-01").to).toBe("2026-12-01");
    const during = progressReport(next, "day", { from: "2026-02-15", to: "2026-02-20" });
    expect(during.map((group) => group.entries[0]?.block.title)).toEqual(["出图"]);
  });

  it("counts the days from the start to the deadline, not from today", () => {
    let next = applyProgressTemplate(project({ completion_percentage: 0 }));
    next = addProgressBlock(next, slotId(next, "方法-数据"), "整理", "2026-11-20", "2026-11-27", null);
    const open = next.progress_blocks?.[0];
    expect(scheduledDays(open!)).toBe(7);
    expect(remainingDays(open!, "2026-11-13")).toBe(14);
    const done = updateProgressBlock(next, open!.id, { completed_on: "2026-11-21" });
    expect(scheduledDays(done.progress_blocks?.[0]!)).toBeNull();
  });

  it("keeps the deadline on or after the start day", () => {
    let next = applyProgressTemplate(project({ completion_percentage: 0 }));
    next = addProgressBlock(next, slotId(next, "方法-数据"), "整理", "2026-11-13", "2026-11-01", null);
    const id = next.progress_blocks?.[0]?.id ?? "";
    expect(next.progress_blocks?.[0]?.due).toBe("2026-11-13");
    const moved = updateProgressBlock(next, id, { date: "2026-11-20" });
    expect(moved.progress_blocks?.[0]?.due).toBe("2026-11-20");
    const earlier = updateProgressBlock(moved, id, { due: "2026-11-01" });
    expect(earlier.progress_blocks?.[0]?.due).toBe("2026-11-20");
  });

  it("counts a task only after it is marked done", () => {
    let next = applyProgressTemplate(project({ completion_percentage: 40 }));
    next = addProgressBlock(next, slotId(next, "方法-数据"), "整理", "2026-11-01", "2026-11-20", null);
    const open = next.progress_blocks?.[0];
    expect(open).toBeDefined();
    expect(isBlockDone(open!)).toBe(false);
    expect(remainingDays(open!, "2026-11-13")).toBe(7);
    expect(effectiveCompletion(next)).toBe(0);
    const done = updateProgressBlock(next, open!.id, { completed_on: "2026-11-13" });
    expect(effectiveCompletion(done)).toBe(2);
    expect(remainingDays(done.progress_blocks?.[0]!, "2026-11-13")).toBeNull();
    const undone = updateProgressBlock(done, open!.id, { completed_on: null });
    expect(effectiveCompletion(undone)).toBe(0);
    const later = projectThroughDate(done, "2026-11-10");
    expect(later.progress_blocks?.[0]?.completed_on).toBeNull();
    expect(effectiveCompletion(later)).toBe(0);
  });

  it("uses a part's own share and color, and can return to the example share", () => {
    let next = applyProgressTemplate(project({ completion_percentage: 0 }));
    next = updateProgressSlot(next, slotId(next, "方法-数据"), { share: 20, color: "#1565c0" });
    next = fill(next, "方法-数据", 6);
    expect(effectiveCompletion(next)).toBe(20);
    expect(next.status).toBe("SteadyProgress");
    expect(slotsOf(next).find((slot) => slot.label === "方法-数据")?.color).toBe("#1565c0");
    const rejected = updateProgressSlot(next, slotId(next, "方法-数据"), { color: "#112233" });
    expect(slotsOf(rejected).find((slot) => slot.label === "方法-数据")?.color).toBeUndefined();
    const restored = updateProgressSlot(next, slotId(next, "方法-数据"), { share: null });
    expect(effectiveCompletion(restored)).toBe(10);
    expect(slotsOf(restored).find((slot) => slot.label === "方法-数据")?.share).toBeUndefined();
  });

  it("keeps a manual completion when the project has no stones", () => {
    expect(effectiveCompletion(project({ completion_percentage: 100 }))).toBe(100);
  });
});

describe("progress sanitizing", () => {
  it("drops broken slots and stones, and derives completion from the stones that remain", () => {
    const data = normalizeAppData({
      fields: {},
      projects: {
        p: {
          id: "p",
          name: "P",
          description: "",
          status: "ToBeStarted",
          field_ids: [],
          position: [0, 0],
          radius: 1,
          completion_percentage: 5,
          progress_slots: [
            { id: "s1", band: "method", label: "方法-数据", order: 0, share: 20, color: "#112233" },
            { id: "bad", band: "nope", label: "坏层", order: 1 },
            { id: "blank", band: "poc", label: "  ", order: 0 },
          ],
          progress_blocks: [
            { id: "b1", slot_id: "s1", title: "整理", date: "2026-01-08", person_id: "person_1", note: "" },
            { id: "b2", slot_id: "gone", title: "悬空", date: "2026-01-09", person_id: null, note: "" },
            { id: "b3", slot_id: "s1", title: "坏日期", date: "昨天", person_id: null, note: "" },
          ],
          progress_stages: [{ id: "old", name: "方法", percent: 30 }],
        },
      },
      relations: [],
      people: {
        person_1: { id: "person_1", name: "张三", lab_ids: [], family_name: "", given_name: "" },
      },
    });
    const saved = data.projects.p as Project & { progress_stages?: unknown };
    expect(saved.progress_stages).toBeUndefined();
    expect(saved.progress_slots).toEqual([
      { id: "s1", band: "method", label: "方法-数据", order: 0, share: 20 },
    ]);
    expect(saved.progress_blocks).toEqual([
      {
        id: "b1",
        slot_id: "s1",
        title: "整理",
        date: "2026-01-08",
        completed_on: "2026-01-08",
        person_id: "person_1",
        note: "",
      },
    ]);
    expect(saved.completion_percentage).toBe(3);
    expect(saved.status).toBe("ToBeStarted");
  });
});

describe("progress on the timeline", () => {
  it("plots cumulative completion and keeps the house for the hovered date", () => {
    let next = applyProgressTemplate(
      project({ expected_completion_date: "2026-12-01", expected_journal: "Nature" }),
    );
    next = finish(addProgressBlock(next, slotId(next, "方法-数据"), "整理数据", "2026-01-08", "2026-01-08", null), "2026-01-08");
    next = finish(addProgressBlock(next, slotId(next, "主图2"), "画故事线", "2026-01-09", "2026-01-09", null), "2026-01-09");
    const model = buildTimelineModel({ p: next });
    const lane = model.lanes[0];
    expect(lane?.tracks.map((track) => track.label)).toEqual(["总完成度", "Nature"]);
    const progress = lane?.tracks[0];
    expect(progress?.progress).toBe(true);
    expect(progress?.points.map((point) => `${point.date} ${point.title} ${point.detail}`)).toEqual([
      "2026-01-08 2% 整理数据",
      "2026-01-09 3% 画故事线",
    ]);
    expect(projectThroughDate(next, "2026-01-08").progress_blocks?.map((block) => block.title)).toEqual(["整理数据"]);
    expect(lane?.points.map((point) => point.title)).toEqual(["2%", "3%", "预期完成"]);
    expect(model.minDate).toBe("2026-01-08");
    expect(model.maxDate).toBe("2026-12-01");
  });

  it("leaves an empty house off the timeline until a stone has a date", () => {
    const next = applyProgressTemplate(project());
    const model = buildTimelineModel({ p: next });
    expect(model.lanes).toHaveLength(0);
    expect(model.undated.map((item) => item.projectId)).toEqual(["p"]);
  });

  it("lists a person's stones with the slot and the date", () => {
    let next = applyProgressTemplate(project({ name: "新项目" }));
    next = addProgressBlock(next, slotId(next, "方法-数据"), "整理数据", "2026-01-08", "2026-01-15", "person_1");
    next = addProgressBlock(next, slotId(next, "主图1"), "画故事线", "2026-02-02", "2026-02-09", "person_1");
    const rows = blocksForPerson({ p: next }, "person_1");
    expect(rows.map((row) => `${row.date} ${row.slotLabel} ${row.title}`)).toEqual([
      "2026-02-02 主图1 画故事线",
      "2026-01-08 方法-数据 整理数据",
    ]);
    expect(rows[0]?.projectName).toBe("新项目");
  });
});
