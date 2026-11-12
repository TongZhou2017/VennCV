import { describe, expect, it } from "vitest";
import { normalizeAppData } from "./appData";
import { interpretDateText, parseFlexibleDate } from "./projectTime";
import { buildTimelineModel } from "./timeline";

describe("normalizeAppData project times", () => {
  it("fills empty defaults and drops illegal dates", () => {
    const data = normalizeAppData({
      fields: {},
      projects: {
        p1: {
          id: "p1",
          name: "进行中",
          description: "",
          status: "SteadyProgress",
          field_ids: [],
          position: [0, 0],
          radius: 10,
          completion_percentage: 40,
          expected_completion_date: "2026-02-31",
          expected_journal: "  ",
          submission_milestones: [
            { id: "a", kind: "Revision", date: "2026-13-01", label: "", note: "" },
            { id: "b", kind: "Nope", date: "2026-06-01", label: "", note: "" },
          ],
        },
        p2: {
          id: "p2",
          name: "投稿",
          description: "",
          status: "Submitted",
          field_ids: [],
          position: [0, 0],
          radius: 10,
          completion_percentage: 100,
        },
      },
      relations: [],
      relation_tags: [],
    });
    expect(data.projects.p1.expected_completion_date).toBeNull();
    expect(data.projects.p1.submission_milestones).toEqual([]);
    expect(data.projects.p1.expected_journal).toBeNull();
    expect(data.projects.p2.expected_completion_date).toBeNull();
    expect(data.projects.p2.submission_milestones).toEqual([]);
  });

  it("sorts milestones by date", () => {
    const data = normalizeAppData({
      fields: {},
      projects: {
        p: {
          id: "p",
          name: "稿",
          description: "",
          status: "Published",
          field_ids: [],
          position: [0, 0],
          radius: 10,
          completion_percentage: 100,
          submission_milestones: [
            { id: "late", kind: "Published", date: "2026-08-01", label: "", note: "见刊" },
            { id: "early", kind: "SubmissionStart", date: "2026-01-15", label: "", note: "" },
            { id: "mid", kind: "Revision", date: "2026-04-02", label: "  ", note: " 大修 " },
          ],
        },
      },
      relations: [],
      relation_tags: [],
    });
    expect(data.projects.p.submission_milestones?.map((item) => item.id)).toEqual([
      "early",
      "mid",
      "late",
    ]);
    expect(data.projects.p.submission_milestones?.[1].note).toBe("大修");
    expect(data.projects.p.journal_submissions).toHaveLength(1);
    expect(data.projects.p.journal_submissions?.[0].venue).toBe("");
    expect(data.projects.p.journal_submissions?.[0].is_preprint).toBe(false);
  });

  it("keeps separate journals and a preprint url", () => {
    const data = normalizeAppData({
      fields: {},
      projects: {
        p: {
          id: "p",
          name: "稿",
          description: "",
          status: "Submitted",
          field_ids: [],
          position: [0, 0],
          radius: 10,
          completion_percentage: 100,
          journal_submissions: [
            {
              id: "nature",
              venue: "Nature",
              is_preprint: false,
              url: " https://doi.org/10.1/example ",
              milestones: [{ id: "n", kind: "SubmissionStart", date: "2026-02-01", label: "", note: "" }],
            },
            {
              id: "biorxiv",
              venue: "bioRxiv",
              is_preprint: true,
              url: "https://www.biorxiv.org/content/10.1/example",
              milestones: [{ id: "b", kind: "Published", date: "2026-01-20", label: "", note: "" }],
            },
          ],
        },
      },
      relations: [],
      relation_tags: [],
    });
    const submissions = data.projects.p.journal_submissions ?? [];
    expect(submissions.map((item) => item.venue)).toEqual(["Nature", "bioRxiv"]);
    expect(submissions[0].url).toBe("https://doi.org/10.1/example");
    expect(submissions[1].is_preprint).toBe(true);
    expect(data.projects.p.submission_milestones?.map((item) => item.id)).toEqual(["b", "n"]);
  });
});

describe("buildTimelineModel", () => {
  it("places expected dates and milestone chains, and lists projects without dates", () => {
    const model = buildTimelineModel({
      open: {
        id: "open",
        name: "未完成",
        description: "",
        status: "HighPriority",
        field_ids: [],
        position: [0, 0],
        radius: 10,
        completion_percentage: 30,
        expected_completion_date: "2026-09-01",
        expected_journal: " Nature ",
        submission_milestones: [],
      },
      submitted: {
        id: "submitted",
        name: "在投",
        description: "",
        status: "Submitted",
        field_ids: [],
        position: [0, 0],
        radius: 10,
        completion_percentage: 100,
        expected_completion_date: "2026-01-01",
        submission_milestones: [
          { id: "s", kind: "SubmissionStart", date: "2026-03-01", label: "", note: "" },
          { id: "r", kind: "Custom", date: "2026-05-01", label: "补实验", note: "" },
        ],
      },
      blank: {
        id: "blank",
        name: "没填",
        description: "",
        status: "ToBeStarted",
        field_ids: [],
        position: [0, 0],
        radius: 10,
        completion_percentage: 0,
        expected_completion_date: null,
        submission_milestones: [],
      },
    });
    expect(model.lanes.map((lane) => lane.projectId)).toEqual(["submitted", "open"]);
    expect(model.lanes[0].tracks.map((track) => track.label)).toEqual(["期刊"]);
    expect(model.lanes[0].points.map((point) => point.title)).toEqual(["开始投稿", "补实验"]);
    expect(model.lanes[1].points[0]).toMatchObject({ title: "预期完成", detail: "30% · Nature" });
    expect(model.lanes[1].tracks[0]?.label).toBe("Nature");
    expect(model.undated.map((item) => item.projectId)).toEqual(["blank"]);
    expect(model.minDate).toBe("2026-03-01");
    expect(model.maxDate).toBe("2026-09-01");
  });
});

describe("parseFlexibleDate", () => {
  it("accepts typed dates and rejects incomplete or impossible ones", () => {
    expect(parseFlexibleDate("2026-03-01")).toBe("2026-03-01");
    expect(parseFlexibleDate("2026/3/1")).toBe("2026-03-01");
    expect(parseFlexibleDate("2026.3.1")).toBe("2026-03-01");
    expect(parseFlexibleDate("2026年3月1日")).toBe("2026-03-01");
    expect(parseFlexibleDate("20260301")).toBe("2026-03-01");
    expect(parseFlexibleDate("  ２０２６/３/１  ")).toBe("2026-03-01");
    expect(parseFlexibleDate("2026-02-31")).toBeNull();
    expect(parseFlexibleDate("2026-3")).toBeNull();
    expect(parseFlexibleDate("")).toBeNull();
    expect(interpretDateText("")).toEqual({ kind: "empty" });
    expect(interpretDateText("三月")).toEqual({ kind: "invalid" });
    expect(interpretDateText("2026/3/1")).toEqual({ kind: "date", iso: "2026-03-01" });
  });
});
