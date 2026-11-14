import { describe, expect, it } from "vitest";
import { normalizeAppData } from "./appData";
import {
  authorContributionText,
  buildCollaborationLayout,
  formatAuthorName,
  formatLabStage,
  findKnownPerson,
  mergePeopleInto,
  personProjectProgress,
  projectAuthorSatellites,
  rememberPersonName,
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
    expect(onFirst.map((link) => link.primary)).toEqual([false, false, true]);
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
    data.people.person_1 = { id: "person_1", name: "张三", lab_ids: [], family_name: "", given_name: "", aliases: [], orcid: "" };
    data.authorships = [
      {
        project_id: "p2",
        person_id: "person_1",
        position: 1,
        corresponding: false,
        credit_roles: [],
        primary: false,
        co_first: false,
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
    expect(projectAuthorSatellites(project, data, "primary")).toEqual([]);
    const all = projectAuthorSatellites(project, data, "all");
    expect(all).toHaveLength(3);
    expect(all.every((item) => item.dy < 0)).toBe(true);
    const radii = all.map((item) => Math.hypot(item.dx, item.dy));
    expect(radii[0]).toBeCloseTo(project.radius + 3 + all[0]!.radius);
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.01);
    const angles = all.map((item) => Math.atan2(item.dy, item.dx));
    expect(Math.max(...angles) - Math.min(...angles)).toBeLessThan(Math.PI);
    expect(all[0].color).toBe("#5c6bc0");
    expect(all.find((item) => item.personId === "person_2")?.color).toBe("#9e9e9e");
  });

  it("shows a co-first or corresponding author only while a todo is still open", () => {
    const data = workspace();
    const project = data.projects.p1;
    const zhang = data.authorships.find((link) => link.project_id === "p1" && link.person_id === "person_1");
    const li = data.authorships.find((link) => link.project_id === "p1" && link.person_id === "person_2");
    if (!zhang || !li) throw new Error("missing authors");
    zhang.co_first = true;
    li.co_first = true;
    sanitizeAuthorsInPlace(data);
    project.progress_blocks = [
      {
        id: "b1",
        slot_id: "s1",
        title: "未做",
        date: "2026-11-01",
        due: "2026-11-20",
        completed_on: null,
        person_id: "person_1",
        note: "",
      },
      {
        id: "b2",
        slot_id: "s1",
        title: "做完",
        date: "2026-11-01",
        due: "2026-11-20",
        completed_on: "2026-11-02",
        person_id: "person_3",
        note: "",
      },
    ];
    expect(projectAuthorSatellites(project, data, "primary").map((item) => item.personId)).toEqual(["person_1"]);
  });

  it("shows every author who still has an open todo", () => {
    const data = workspace();
    const project = data.projects.p1;
    project.progress_blocks = [
      {
        id: "b1",
        slot_id: "s1",
        title: "未做",
        date: "2026-11-01",
        due: "2026-11-20",
        completed_on: null,
        person_id: "person_2",
        note: "",
      },
    ];
    expect(projectAuthorSatellites(project, data, "todo").map((item) => item.personId)).toEqual(["person_2"]);
    expect(projectAuthorSatellites(project, data, "primary")).toEqual([]);
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
      co_first: false,
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

  it("puts a marked person at the center and keeps a dragged position", () => {
    const data = workspace();
    data.people.person_1.network_center = true;
    data.people.person_2.network_x = 12;
    data.people.person_2.network_y = -4;
    const model = buildCollaborationLayout(data);
    const zhang = model.nodes.find((node) => node.personId === "person_1");
    const li = model.nodes.find((node) => node.personId === "person_2");
    expect(zhang).toMatchObject({ center: true, x: 0, y: 0 });
    expect(li).toMatchObject({ center: false, x: 12, y: -4 });
    const wang = model.nodes.find((node) => node.personId === "person_3");
    expect(Math.hypot(wang?.x ?? 0, wang?.y ?? 0)).toBeGreaterThan(80);
    sanitizeAuthorsInPlace(data);
    expect(data.people.person_1.network_center).toBe(true);
    expect(data.people.person_2.network_x).toBe(12);
    data.people.person_3.network_x = 3;
    data.people.person_3.network_y = Number.NaN;
    sanitizeAuthorsInPlace(data);
    expect(data.people.person_3.network_x).toBeUndefined();
    expect(data.people.person_3.network_y).toBeUndefined();
  });

  it("stores a Chinese name and an English name on the same lab", () => {
    const data = workspace();
    const lab = data.labs.lab_1;
    if (!lab) throw new Error("missing lab");
    lab.name = "Cavendish Laboratory";
    lab.name_zh = "卡文迪许实验室";
    sanitizeAuthorsInPlace(data);
    expect(data.labs.lab_1?.name).toBe("卡文迪许实验室");
    expect(data.labs.lab_1?.name_zh).toBe("卡文迪许实验室");
    expect(data.labs.lab_1?.name_en).toBe("Cavendish Laboratory");
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
    data.people.person_1.middle_name = "Q";
    expect(formatAuthorName(data.people.person_1, "familyInitials")).toBe("Zhang SQ");
    data.people.person_1.middle_name = undefined;
    expect(formatAuthorName(data.people.person_1, "familyInitials")).toBe("Zhang S");
    expect(formatAuthorName(data.people.person_1, "initialsFamily")).toBe("S Zhang");
    expect(authorContributionText(data, "p1", "full")).toBe(
      "张三：概念构思、初稿撰写；李四：数据管理；王五*：未填写贡献。",
    );
    expect(authorContributionText(data, "p1", "familyInitials")).toContain("Zhang S: Conceptualization, Writing – original draft");
    expect(authorContributionText(data, "p1", "familyInitials")).toContain("Li S: Data curation");
  });
});

describe("one person, several names", () => {
  function query(patch: Partial<{ name: string; family: string; given: string; orcid: string }> = {}) {
    return { name: "", family: "", given: "", orcid: "", ...patch };
  }

  it("keeps journal spellings and a chinese name on the same person", () => {
    const data = defaultEmptyAppData();
    data.people.person_1 = {
      id: "person_1",
      name: "周通",
      lab_ids: [],
      family_name: "Zhou",
      given_name: "Tong",
      aliases: ["Zhou Tong"],
      orcid: "",
    };
    expect(findKnownPerson(data.people, query({ name: "Tong Zhou", family: "Zhou", given: "Tong" }))?.id).toBe("person_1");
    expect(findKnownPerson(data.people, query({ name: "周通" }))?.id).toBe("person_1");
    const matched = findKnownPerson(data.people, query({ name: "Zhou T.", family: "Zhou", given: "T." }));
    expect(matched?.id).toBe("person_1");
    if (!matched) return;
    rememberPersonName(matched, "Zhou T.");
    expect(matched.aliases).toEqual(["Zhou Tong", "Zhou T."]);
    const crowded = defaultEmptyAppData();
    crowded.people.person_1 = { ...data.people.person_1, aliases: ["Zhou Tong"] };
    crowded.people.person_2 = {
      id: "person_2",
      name: "Zhou Tao",
      lab_ids: [],
      family_name: "Zhou",
      given_name: "Tao",
      aliases: [],
      orcid: "",
    };
    expect(findKnownPerson(crowded.people, query({ name: "Zhou T.", family: "Zhou", given: "T." }))).toBeUndefined();
  });

  it("uses an orcid across different spellings and can merge two cards", () => {
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
    data.people.person_1 = {
      id: "person_1",
      name: "周通",
      lab_ids: [],
      family_name: "",
      given_name: "",
      aliases: [],
      orcid: "0000-0002-5186-519X",
    };
    data.people.person_2 = {
      id: "person_2",
      name: "Tong Zhou",
      lab_ids: [],
      family_name: "Zhou",
      given_name: "Tong",
      aliases: [],
      orcid: "",
    };
    expect(findKnownPerson(data.people, query({ name: "Zhou Tong", family: "Zhou", given: "Tong", orcid: "https://orcid.org/0000-0002-5186-519X" }))?.id).toBe(
      "person_1",
    );
    data.authorships = [
      {
        project_id: "p1",
        person_id: "person_2",
        position: 1,
        corresponding: false,
        credit_roles: [],
        primary: false,
        co_first: false,
        responsibility: "",
      },
    ];
    expect(mergePeopleInto(data, "person_1", "person_2")).toBe(true);
    expect(data.people.person_2).toBeUndefined();
    expect(data.people.person_1.aliases).toContain("Tong Zhou");
    expect(data.people.person_1.family_name).toBe("Zhou");
    expect(data.authorships.map((link) => link.person_id)).toEqual(["person_1"]);
  });
});

describe("lab stages", () => {
  it("keeps the current stage on the person and the submission stage on the paper", () => {
    const data = defaultEmptyAppData();
    data.labs.lab_1 = { id: "lab_1", name: "孙磊", color: "#00897b" };
    data.labs.lab_2 = { id: "lab_2", name: "徐奎栋", color: "#5c6bc0" };
    data.projects.p1 = {
      id: "p1",
      name: "EBOV",
      description: "",
      status: "Submitted",
      field_ids: [],
      position: [0, 0],
      radius: 20,
      completion_percentage: 100,
    };
    data.people.person_1 = {
      id: "person_1",
      name: "周通",
      lab_ids: ["lab_1"],
      family_name: "Zhou",
      given_name: "Tong",
      aliases: [],
      orcid: "",
    };
    Object.assign(data.people.person_1, {
      lab_roles: [
        { lab_id: "lab_1", stage: "phd", note: "忽略" },
        { lab_id: "lab_2", stage: "pi" },
        { lab_id: "lab_1", stage: "postdoc" },
      ],
    });
    data.people.person_2 = {
      id: "person_2",
      name: "李四",
      lab_ids: ["lab_2"],
      family_name: "",
      given_name: "",
      aliases: [],
      orcid: "",
    };
    Object.assign(data.people.person_2, {
      lab_roles: [{ lab_id: "lab_2", stage: "other", note: "  访问学者  " }],
    });
    data.authorships = [
      {
        project_id: "p1",
        person_id: "person_1",
        position: 1,
        corresponding: false,
        credit_roles: [],
        primary: false,
        co_first: false,
        responsibility: "",
        paper_roles: [
          { lab_id: "lab_1", stages: ["postdoc"] },
          { lab_id: "missing", stages: ["pi"] },
        ],
      },
    ];
    sanitizeAuthorsInPlace(data);
    expect(data.people.person_1.lab_roles).toEqual([{ lab_id: "lab_1", stages: ["phd"] }]);
    expect(data.people.person_2.lab_roles).toEqual([{ lab_id: "lab_2", tags: ["访问学者"] }]);
    expect(data.authorships[0]?.paper_roles).toEqual([{ lab_id: "lab_1", stages: ["postdoc"] }]);
    data.people.person_1.lab_ids = [];
    sanitizeAuthorsInPlace(data);
    expect(data.people.person_1.lab_roles).toBeUndefined();
    expect(data.authorships[0]?.paper_roles).toEqual([{ lab_id: "lab_1", stages: ["postdoc"] }]);
  });

  it("records the lab head as PI and keeps extra identity tags", () => {
    const data = defaultEmptyAppData();
    data.labs.lab_1 = { id: "lab_1", name: "孙磊", name_en: "Sun Lei", color: "#00897b" };
    data.labs.lab_2 = { id: "lab_2", name: "Qiang Ding", color: "#5c6bc0" };
    data.projects.p1 = {
      id: "p1",
      name: "EBOV",
      description: "",
      status: "Submitted",
      field_ids: [],
      position: [0, 0],
      radius: 20,
      completion_percentage: 100,
    };
    data.people.person_1 = {
      id: "person_1",
      name: "孙磊",
      lab_ids: ["lab_1"],
      family_name: "Sun",
      given_name: "Lei",
      aliases: [],
      orcid: "",
      lab_roles: [{ lab_id: "lab_1", stages: ["phd"] }],
    };
    data.people.person_2 = {
      id: "person_2",
      name: "王五",
      lab_ids: ["lab_1"],
      family_name: "",
      given_name: "",
      aliases: [],
      orcid: "",
      lab_roles: [{ lab_id: "lab_1", stages: ["assistant"], tags: ["技术员", " 技术员 ", "博士生"] }],
    };
    data.people.person_3 = {
      id: "person_3",
      name: "Ding Qiang",
      lab_ids: ["lab_2"],
      family_name: "Ding",
      given_name: "Qiang",
      aliases: [],
      orcid: "",
    };
    data.authorships = [
      {
        project_id: "p1",
        person_id: "person_1",
        position: 1,
        corresponding: false,
        credit_roles: [],
        primary: false,
        co_first: false,
        responsibility: "",
        paper_roles: [{ lab_id: "lab_1", stages: ["postdoc"] }],
      },
      {
        project_id: "p1",
        person_id: "person_2",
        position: 2,
        corresponding: false,
        credit_roles: [],
        primary: false,
        co_first: false,
        responsibility: "",
        paper_roles: [{ lab_id: "lab_1", stages: ["master"], tags: ["访问学者"] }],
      },
      {
        project_id: "p1",
        person_id: "person_3",
        position: 3,
        corresponding: false,
        credit_roles: [],
        primary: false,
        co_first: false,
        responsibility: "",
      },
    ];
    sanitizeAuthorsInPlace(data);
    expect(data.people.person_1.lab_roles).toEqual([{ lab_id: "lab_1", stages: ["pi"] }]);
    expect(data.authorships.find((link) => link.person_id === "person_1")?.paper_roles).toEqual([{ lab_id: "lab_1", stages: ["pi"] }]);
    expect(data.people.person_2.lab_roles).toEqual([{ lab_id: "lab_1", stages: ["assistant"], tags: ["技术员"] }]);
    expect(data.labs.lab_1.identities).toEqual(["技术员", "访问学者"]);
    expect(data.authorships.find((link) => link.person_id === "person_2")?.paper_roles).toEqual([
      { lab_id: "lab_1", stages: ["master"], tags: ["访问学者"] },
    ]);
    data.labs.lab_1.identities = [];
    sanitizeAuthorsInPlace(data);
    expect(data.labs.lab_1.identities).toEqual([]);
    expect(data.people.person_2.lab_roles).toEqual([{ lab_id: "lab_1", stages: ["assistant"], tags: ["技术员"] }]);
    expect(data.people.person_3.lab_roles).toEqual([{ lab_id: "lab_2", stages: ["pi"] }]);
    expect(data.authorships.find((link) => link.person_id === "person_3")?.paper_roles).toBeUndefined();
  });

  it("keeps several stages for one person in the same lab", () => {
    const data = defaultEmptyAppData();
    data.labs.lab_1 = { id: "lab_1", name: "孙磊", color: "#00897b" };
    data.people.person_1 = {
      id: "person_1",
      name: "周通",
      lab_ids: ["lab_1"],
      family_name: "",
      given_name: "",
      aliases: [],
      orcid: "",
    };
    Object.assign(data.people.person_1, {
      lab_roles: [{ lab_id: "lab_1", stage: "phd", stages: ["postdoc", "master", "postdoc"] }],
    });
    sanitizeAuthorsInPlace(data);
    expect(data.people.person_1.lab_roles).toEqual([{ lab_id: "lab_1", stages: ["master", "phd", "postdoc"] }]);
    expect(formatLabStage(data.people.person_1.lab_roles?.[0])).toBe("硕士生、博士生、博后");
  });

  it("keeps a PI mark when the person has no laboratory", () => {
    const data = defaultEmptyAppData();
    data.people.person_1 = {
      id: "person_1",
      name: "合作者",
      lab_ids: [],
      family_name: "",
      given_name: "",
      aliases: [],
      orcid: "",
      pi: true,
    };
    data.people.person_2 = {
      id: "person_2",
      name: "另一位",
      lab_ids: [],
      family_name: "",
      given_name: "",
      aliases: [],
      orcid: "",
      pi: false,
    };
    sanitizeAuthorsInPlace(data);
    expect(data.people.person_1.pi).toBe(true);
    expect(data.people.person_1.lab_ids).toEqual([]);
    expect(data.people.person_1.lab_roles).toBeUndefined();
    expect(data.people.person_2.pi).toBeUndefined();
    mergePeopleInto(data, "person_2", "person_1");
    expect(data.people.person_2.pi).toBe(true);
  });

  it("keeps a job title and a student's advisor inside the same lab", () => {
    const data = defaultEmptyAppData();
    data.labs.lab_1 = { id: "lab_1", name: "大实验室", color: "#00897b" };
    data.people.zhao = {
      id: "zhao",
      name: "赵峰",
      lab_ids: ["lab_1"],
      family_name: "",
      given_name: "",
      aliases: [],
      orcid: "",
      pi: true,
      job: "  研究员  ",
    };
    data.people.li = {
      id: "li",
      name: "李龙召",
      lab_ids: ["lab_1"],
      family_name: "",
      given_name: "",
      aliases: [],
      orcid: "",
    };
    Object.assign(data.people.li, {
      lab_roles: [
        { lab_id: "lab_1", stages: ["master"], advisor_id: "zhao" },
        { lab_id: "lab_1", stages: ["phd"], advisor_id: "missing" },
      ],
    });
    sanitizeAuthorsInPlace(data);
    expect(data.people.zhao.job).toBe("研究员");
    expect(data.people.li.lab_roles).toEqual([{ lab_id: "lab_1", stages: ["master"], advisor_id: "zhao" }]);
    expect(formatLabStage(data.people.li.lab_roles?.[0], "赵峰")).toBe("赵峰的硕士生");
    data.people.zhao.lab_ids = [];
    sanitizeAuthorsInPlace(data);
    expect(data.people.li.lab_roles).toEqual([{ lab_id: "lab_1", stages: ["master"] }]);
  });
});
