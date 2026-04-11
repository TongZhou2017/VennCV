import { describe, expect, it } from "vitest";
import minimalFixture from "../__fixtures__/minimal_app_data.json";
import {
  appDataToExportJson,
  defaultEmptyAppData,
  mergeImportJson,
  normalizeAppData,
} from "./appData";

describe("normalizeAppData", () => {
  it("fills relation defaults", () => {
    const raw = {
      fields: {},
      projects: {},
      relations: [
        {
          from_id: "a",
          to_id: "b",
          relation_type: "Direct",
        },
      ],
      relation_tags: [],
    };
    const n = normalizeAppData(raw);
    expect(n.relations[0].tags).toEqual([]);
    expect(n.relations[0].width).toBe(2);
    expect(n.relations[0].color).toEqual([0, 0, 0, 255]);
  });
});

describe("mergeImportJson", () => {
  it("merges projects and dedupes relations", () => {
    const base = defaultEmptyAppData();
    const imported = JSON.stringify({
      fields: {
        f1: {
          id: "f1",
          name: "F",
          description: "",
          position: [0, 0],
          radius: 100,
        },
      },
      projects: {
        p1: {
          id: "p1",
          name: "P",
          description: "",
          status: "Published",
          field_ids: ["f1"],
          position: [10, 10],
          radius: 10,
          completion_percentage: 0,
        },
      },
      relations: [
        {
          from_id: "p1",
          to_id: "p1",
          relation_type: "Direct",
          tags: [],
          color: [0, 0, 0, 255],
          width: 2,
        },
      ],
      relation_tags: [],
    });
    const merged = mergeImportJson(base, imported);
    expect(merged.fields.f1.name).toBe("F");
    expect(merged.projects.p1.name).toBe("P");
    expect(merged.relations.length).toBe(1);
    const again = mergeImportJson(merged, imported);
    expect(again.relations.length).toBe(1);
  });
});

describe("fixtures", () => {
  it("minimal JSON snapshot round-trip", () => {
    const n = normalizeAppData(minimalFixture);
    const out = appDataToExportJson(n);
    expect(JSON.parse(out)).toEqual(minimalFixture);
  });

  it("defaultEmptyAppData has no fields or projects", () => {
    const d = defaultEmptyAppData();
    expect(Object.keys(d.fields)).toHaveLength(0);
    expect(Object.keys(d.projects)).toHaveLength(0);
    expect(d.relations).toHaveLength(0);
  });
});
