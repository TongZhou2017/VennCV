import { describe, expect, it } from "vitest";
import { normalizeAppData } from "./appData";
import { buildLabHome, labByPathSlug, labPathSlug, labSlugFromPath } from "./labHome";
import type { AppDataJson } from "../types";

function workspace(): AppDataJson {
  return normalizeAppData({
    fields: {},
    projects: {
      p1: {
        id: "p1",
        name: "VnFinder",
        description: "找",
        status: "Submitted",
        field_ids: [],
        position: [0, 0],
        radius: 20,
        completion_percentage: 100,
        journal_submissions: [
          {
            id: "s1",
            venue: "Nature Methods",
            is_preprint: false,
            url: "https://example.com/vn",
            article_type: "research-article",
            milestones: [{ id: "m1", kind: "SubmissionStart", label: "", date: "2024-03-01", note: "" }],
          },
        ],
      },
      p2: {
        id: "p2",
        name: "新方向",
        description: "还在做",
        status: "SteadyProgress",
        field_ids: [],
        position: [40, 0],
        radius: 20,
        completion_percentage: 20,
      },
    },
    relations: [],
    relation_tags: [],
    labs: {
      lab_1: { id: "lab_1", name: "孙磊", name_zh: "孙磊", name_en: "Lei Sun", color: "#00897b" },
      lab_2: { id: "lab_2", name: "徐奎栋", name_zh: "徐奎栋", name_en: "Kuidong Xu", color: "#5c6bc0" },
      lab_3: { id: "lab_3", name: "组内", color: "#ef6c00" },
    },
    people: {
      sun: { id: "sun", name: "孙磊", given_name: "Lei", family_name: "Sun", lab_ids: ["lab_1"], orcid: "0000-0001-0000-0001" },
      xu: { id: "xu", name: "徐奎栋", lab_ids: ["lab_2"] },
      zhou: {
        id: "zhou",
        name: "周通",
        lab_ids: ["lab_2", "lab_1"],
        lab_roles: [
          { lab_id: "lab_1", stages: ["postdoc"] },
          { lab_id: "lab_2", stages: ["phd"] },
        ],
        affiliations: [{ name_zh: "中国科学院", name_en: "Chinese Academy of Sciences" }],
      },
      guest: {
        id: "guest",
        name: "访客",
        lab_ids: ["lab_1"],
        lab_roles: [{ lab_id: "lab_1", tags: ["访问学生"] }],
      },
    },
    authorships: [
      {
        project_id: "p1",
        person_id: "zhou",
        role: "First",
        primary: true,
        responsibility: "",
        paper_roles: [{ lab_id: "lab_2", stages: ["phd"] }],
      },
      { project_id: "p1", person_id: "xu", role: "Corresponding", primary: true, responsibility: "", corresponding: true, paper_roles: [{ lab_id: "lab_2", stages: ["pi"] }] },
      { project_id: "p2", person_id: "zhou", role: "First", primary: true, responsibility: "" },
    ],
  });
}

describe("lab path", () => {
  it("folds an English PI name into a subpath", () => {
    const data = workspace();
    expect(labPathSlug(data.labs.lab_1, data.labs)).toBe("leisun");
    expect(labPathSlug(data.labs.lab_2, data.labs)).toBe("kuidongxu");
    expect(labByPathSlug(data.labs, "leisun")?.id).toBe("lab_1");
  });

  it("uses the lab id when the name has no latin letters", () => {
    const data = workspace();
    expect(labPathSlug(data.labs.lab_3, data.labs)).toBe("lab3");
  });

  it("gives a later collision its own suffix", () => {
    const data = workspace();
    data.labs.lab_4 = { id: "lab_4", name: "另一位", name_en: "Lei Sun", color: "#c62828" };
    expect(labPathSlug(data.labs.lab_1, data.labs)).toBe("leisun");
    expect(labPathSlug(data.labs.lab_4, data.labs)).toBe("leisun-lab4");
    expect(labByPathSlug(data.labs, "leisun-lab4")?.id).toBe("lab_4");
  });

  it("reads only a single lab segment", () => {
    expect(labSlugFromPath("/leisun")).toBe("leisun");
    expect(labSlugFromPath("/")).toBeNull();
    expect(labSlugFromPath("/src")).toBeNull();
    expect(labSlugFromPath("/leisun/people")).toBeNull();
  });
});

describe("buildLabHome", () => {
  it("groups members and keeps a paper with the lab recorded at submission", () => {
    const data = workspace();
    const sun = buildLabHome(data, "lab_1");
    expect(sun?.path).toBe("/leisun");
    expect(sun?.groups.map((group) => group.label)).toEqual(["PI", "博后", "访问学生"]);
    expect(sun?.groups[0]?.members[0]?.role).toBe("实验室负责人");
    expect(sun?.papers.map((paper) => paper.title)).toEqual([]);
    expect(sun?.research.map((item) => item.name)).toEqual(["新方向"]);
    expect(sun?.addresses).toEqual(["中国科学院"]);

    const xu = buildLabHome(data, "lab_2");
    expect(xu?.papers.map((paper) => paper.title)).toEqual(["VnFinder"]);
    expect(xu?.papers[0]?.authors).toContain("周通");
    expect(xu?.papers[0]?.authors).toContain("徐奎栋*");
    expect(xu?.papers[0]?.venue).toBe("Nature Methods");
    expect(xu?.papers[0]?.year).toBe("2024");
    expect(xu?.papers[0]?.kind).toBe("研究论文");
  });

  it("lists an internal PI and that PI's student", () => {
    const data = workspace();
    data.people.zhao = {
      id: "zhao",
      name: "赵峰",
      lab_ids: ["lab_1"],
      pi: true,
      job: "研究员",
      family_name: "",
      given_name: "",
      aliases: [],
      orcid: "",
    };
    data.people.li = {
      id: "li",
      name: "李龙召",
      lab_ids: ["lab_1"],
      family_name: "",
      given_name: "",
      aliases: [],
      orcid: "",
      lab_roles: [{ lab_id: "lab_1", stages: ["master"], advisor_id: "zhao" }],
    };
    const home = buildLabHome(data, "lab_1");
    const pi = home?.groups.find((group) => group.label === "PI");
    const masters = home?.groups.find((group) => group.label === "硕士生");
    expect(pi?.members.map((member) => member.name)).toContain("赵峰");
    expect(pi?.members.find((member) => member.name === "赵峰")?.role).toBe("研究员 · 内部 PI");
    expect(masters?.members.find((member) => member.name === "李龙召")?.role).toBe("赵峰的硕士生");
    delete data.people.sun;
    const alone = buildLabHome(data, "lab_1");
    expect(alone?.groups.find((group) => group.label === "硕士生")?.members.find((member) => member.name === "李龙召")?.role).toBe("硕士生");
  });
});
