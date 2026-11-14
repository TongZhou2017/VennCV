import { describe, expect, it } from "vitest";
import { defaultEmptyAppData } from "./appData";
import {
  catalogWorks,
  publicationsForGrant,
  REPRESENTATIVE_CAP,
  sanitizeGrantsInPlace,
  unmatchedAwardNumbers,
} from "./grants";
import type { AppDataJson, Project } from "../types";

function project(patch: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "甲",
    description: "",
    status: "Published",
    field_ids: [],
    position: [0, 0],
    radius: 20,
    completion_percentage: 100,
    ...patch,
  };
}

function data(): AppDataJson {
  return {
    ...defaultEmptyAppData(),
    projects: {
      p1: project({
        journal_submissions: [
          {
            id: "journal",
            venue: "Bioinformatics",
            is_preprint: false,
            url: "https://example.test/paper",
            milestones: [{ id: "m1", kind: "Published", label: "", date: "2023-05-24", note: "" }],
            awards: [
              { funder: "国家自然科学基金", number: "41930533" },
              { funder: "中国科学院青年创新促进会", number: "2022206" },
            ],
          },
          {
            id: "pre",
            venue: "bioRxiv",
            is_preprint: true,
            url: "https://example.test/pre",
            milestones: [],
            awards: [{ funder: "国家自然科学基金", number: "41930533" }],
          },
        ],
      }),
    },
  };
}

describe("grants", () => {
  it("counts published papers by grant number and skips preprints", () => {
    const works = catalogWorks(data());
    expect(publicationsForGrant("41930533", works).map((work) => work.submissionId)).toEqual(["journal"]);
    expect(publicationsForGrant(" 2022206 ", works)).toHaveLength(1);
    expect(publicationsForGrant("", works)).toHaveLength(0);
    expect(publicationsForGrant("419305331", works)).toHaveLength(0);
  });

  it("offers numbers that are not filed yet and caps representative works at five", () => {
    const source = data();
    expect(unmatchedAwardNumbers(catalogWorks(source), {})).toEqual([
      { number: "41930533", funder: "国家自然科学基金" },
      { number: "2022206", funder: "中国科学院青年创新促进会" },
    ]);
    source.grants = {
      g1: {
        id: "g1",
        name: "面上",
        number: "41930533",
        funder: "",
        phase: "closed",
        representative_keys: ["p1/journal", "p1/missing", "p1/journal", "p1/pre", "x/y", "p1/pre", "p1/journal"],
        foundation_keys: ["p1/pre"],
      },
    };
    sanitizeGrantsInPlace(source);
    expect(source.grants?.g1?.representative_keys).toEqual(["p1/journal", "p1/pre"]);
    expect(source.grants?.g1?.representative_keys.length).toBeLessThanOrEqual(REPRESENTATIVE_CAP);
    expect(source.grants?.g1?.foundation_keys).toEqual(["p1/pre"]);
    expect(unmatchedAwardNumbers(catalogWorks(source), source.grants ?? {})).toEqual([
      { number: "2022206", funder: "中国科学院青年创新促进会" },
    ]);
  });
});
