import { describe, expect, it } from "vitest";
import { normalizeAppData } from "./appData";
import {
  authorContributionText,
  buildCollaborationLayout,
  formatAuthorName,
  personProjectProgress,
  projectAuthorSatellites,
  sanitizeAuthorsInPlace,
  sortProjectAuthors,
} from "./authors";
import type { AppDataJson } from "../types";
import { defaultEmptyAppData } from "./appData";

function workspace(): AppDataJson {
  return normalizeAppData({
    fields: {},
    projects: {
      p1: {
        id: "p1",
        name: "甲",
        description: "",
        status: "SteadyProgress",
        field_ids: [],
        position: [0, 0],
        radius: 20,
        completion_percentage: 30,
      },
      p2: {
        id: "p2",
        name: "乙",
        description: "",
        status: "ToBeStarted",
        field_ids: [],
        position: [40, 0],
        radius: 20,
        completion_percentage: 10,
      },
    },
    relations: [],
    relation_tags: [],
    labs: {
      lab_1: { id: "lab_1", name: "结构组", color: "#5C6BC0" },
    },
    people: {
      person_1: { id: "person_1", name: "张三", lab_id: "lab_1" },
      person_2: { id: "person_2", name: "李四", lab_id: "missing" },
      person_3: { id: "person_3", name: "王五", lab_id: null },
    },
    authorships: [
      { project_id: "p1", person_id: "person_1", role: "First", primary: true, responsibility: "写稿" },
      { project_id: "p1", person_id: "person_1", role: "Coauthor", primary: false, responsibility: "重复" },
      { project_id: "p1", person_id: "person_2", role: "Nope", primary: false, responsibility: "  图  " },
      { project_id: "p1", person_id: "person_3", role: "Corresponding", primary: true, responsibility: "" },
      { project_id: "gone", person_id: "person_1", role: "Other", primary: false, responsibility: "" },
      { project_id: "p2", person_id: "person_1", role: "Coauthor", primary: false, responsibility: "数据" },
      { project_id: "p2", person_id: "person_2", role: "Other", primary: false, responsibility: "" },
    ],
  });
}

describe("sanitizeAuthorsInPlace", () => {
  it("fills empty catalogs for old workspaces", () => {
    const data = normalizeAppData({
      fields: {},
      projects: {},
      relations: [],
      relation_tags: [],
    });
    expect(data.labs).toEqual({});
    expect(data.people).toEqual({});
    expect(data.authorships).toEqual([]);
  });

  it("drops unknown links and keeps one row per person on a project", () => {
    const data = workspace();
    expect(data.people.person_2.lab_ids).toEqual([]);
    expect(data.people.person_1.lab_ids).toEqual(["lab_1"]);
    expect(data.labs.lab_1.color).toBe("#5c6bc0");
    const onFirst = data.authorships.filter((link) => link.project_id === "p1");
    expect(onFirst.map((link) => link.person_id)).toEqual(["person_1", "person_2", "person_3"]);
    expect(onFirst.map((link) => link.position)).toEqual([1, 2, 3]);
    expect(onFirst[0]?.corresponding).toBe(false);
    expect(onFirst[2]?.corresponding).toBe(true);
    expect(onFirst[1]?.responsibility).toBe("图");
    expect(data.authorships.some((link) => link.project_id === "gone")).toBe(false);
  });

  it("keeps authorship on a trashed project", () => {
    const data = defaultEmptyAppData();
    data.projects.p1 = {
      id: "p1",
      name: "甲",
      description: "",
      status: "ToBeStarted",
      field_ids: [],
      position: [0, 0],
      radius: 10,
      completion_percentage: 0,
    };
    data.deleted_projects = {
      p2: { ...data.projects.p1, id: "p2", name: "回收" },
    };
    data.people.person_1 = { id: "person_1", name: "张三", lab_ids: [], family_name: "", given_name: "" };
    data.authorships = [
      {
        project_id: "p2",
        person_id: "person_1",
        position: 1,
        corresponding: false,
        credit_roles: [],
        primary: false,
        responsibility: "",
      },
    ];
    sanitizeAuthorsInPlace(data);
    expect(data.authorships).toHaveLength(1);
  });
});

describe("projectAuthorSatellites", () => {
  it("hides everyone until the display mode asks for them", () => {
    const data = workspace();
    const project = data.projects.p1;
    expect(projectAuthorSatellites(project, data, "off")).toEqual([]);
    const primary = projectAuthorSatellites(project, data, "primary");
    expect(primary.map((item) => item.personId)).toEqual(["person_1", "person_3"]);
    const all = projectAuthorSatellites(project, data, "all");
    expect(all).toHaveLength(3);
    expect(all[0].dx).toBeCloseTo(0);
    expect(all[0].dy).toBeLessThan(0);
    const ring = Math.hypot(all[1].dx, all[1].dy);
    expect(ring).toBeCloseTo(project.radius + 3 + all[1].radius);
    expect(all[0].color).toBe("#5c6bc0");
    expect(all.find((item) => item.personId === "person_2")?.color).toBe("#9e9e9e");
  });
});

describe("collaboration", () => {
  it("connects people who share an active project and skips the trash", () => {
    const data = workspace();
    data.deleted_projects = {
      p3: {
        id: "p3",
        name: "回收",
        description: "",
        status: "ToBeStarted",
        field_ids: [],
        position: [0, 0],
        radius: 10,
        completion_percentage: 0,
      },
    };
    data.authorships.push({
      project_id: "p3",
      person_id: "person_3",
      position: 1,
      corresponding: false,
      credit_roles: [],
      primary: false,
      responsibility: "",
    });
    const model = buildCollaborationLayout(data);
    expect(model.nodes.map((node) => node.personId).sort()).toEqual(["person_1", "person_2", "person_3"]);
    const zhangLi = model.edges.find((edge) => edge.a === "person_1" && edge.b === "person_2");
    expect(zhangLi?.shared).toBe(2);
    const liWang = model.edges.find((edge) => edge.a === "person_2" && edge.b === "person_3");
    expect(liWang?.shared).toBe(1);
    const progress = personProjectProgress(data, "person_1");
    expect(progress.map((row) => row.projectId).sort()).toEqual(["p1", "p2"]);
    expect(progress.find((row) => row.projectId === "p1")?.responsibility).toBe("写稿");
  });

  it("sorts by lab or CRediT and exports contribution text", () => {
    const data = workspace();
    data.labs.lab_2 = { id: "lab_2", name: "算法组", color: "#00897b" };
    data.people.person_1.lab_ids = ["lab_1", "lab_2"];
    data.people.person_1.family_name = "Zhang";
    data.people.person_1.given_name = "San";
    data.people.person_2.family_name = "Li";
    data.people.person_2.given_name = "Si";
    const zhang = data.authorships.find((link) => link.project_id === "p1" && link.person_id === "person_1");
    const li = data.authorships.find((link) => link.project_id === "p1" && link.person_id === "person_2");
    if (!zhang || !li) throw new Error("missing authors");
    zhang.credit_roles = ["WritingOriginalDraft", "Conceptualization"];
    li.credit_roles = ["DataCuration"];
    const byCredit = sortProjectAuthors(
      data.authorships.filter((link) => link.project_id === "p1"),
      data,
      "credit",
    ).map((link) => link.person_id);
    expect(byCredit[0]).toBe("person_1");
    const byLab = sortProjectAuthors(
      data.authorships.filter((link) => link.project_id === "p1"),
      data,
      "lab",
    );
    expect(byLab[0]?.person_id).toBe("person_2");
    expect(formatAuthorName(data.people.person_1, "familyInitials")).toBe("Zhang S");
    expect(formatAuthorName(data.people.person_1, "initialsFamily")).toBe("S Zhang");
    expect(authorContributionText(data, "p1", "full")).toBe(
      "张三：概念构思、初稿撰写；李四：数据管理；王五*：未填写贡献。",
    );
    expect(authorContributionText(data, "p1", "familyInitials")).toContain("Zhang S: Conceptualization, Writing – original draft");
    expect(authorContributionText(data, "p1", "familyInitials")).toContain("Li S: Data curation");
  });
});
