import { describe, expect, it } from "vitest";
import { defaultEmptyAppData } from "./appData";
import { projectCollisionRadius } from "./authors";
import type { AppDataJson, Project } from "../types";
import { MAX_FIELD_RADIUS, PROJECT_GAP } from "./vennPhysics";
import {
  validateAndFixProjectPositions,
  validateProjectPositionsWithoutMutatingFields,
} from "./validate";

function project(id: string, fieldIds: string[], position: [number, number], radius = 20): Project {
  return {
    id,
    name: id,
    description: "",
    status: "ToBeStarted",
    field_ids: fieldIds,
    position,
    radius,
    completion_percentage: 0,
  };
}

function workspace(): AppDataJson {
  const data = defaultEmptyAppData();
  data.fields.a = { id: "a", name: "A", description: "", position: [0, 0], radius: 400 };
  return data;
}

function gap(data: AppDataJson, left: string, right: string): number {
  const a = data.projects[left]!;
  const b = data.projects[right]!;
  return Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1]);
}

describe("venn physics", () => {
  it("separates overlapping projects inside one field", () => {
    const data = workspace();
    data.projects.p1 = project("p1", ["a"], [0, 0]);
    data.projects.p2 = project("p2", ["a"], [10, 0]);
    const out = validateProjectPositionsWithoutMutatingFields(data);
    expect(gap(out, "p1", "p2")).toBeGreaterThanOrEqual(40 + PROJECT_GAP - 0.5);
    expect(out.fields.a!.radius).toBe(400);
  });

  it("slides a thrown project back in without growing the field", () => {
    const data = workspace();
    data.fields.a!.radius = 185;
    data.projects.p1 = project("p1", ["a"], [2000, 2000]);
    const out = validateAndFixProjectPositions(data);
    const field = out.fields.a!;
    const placed = out.projects.p1!;
    const distance = Math.hypot(placed.position[0] - field.position[0], placed.position[1] - field.position[1]);
    expect(distance + placed.radius).toBeLessThanOrEqual(field.radius);
    expect(field.radius).toBe(185);
  });

  it("slides projects apart inside an intersection", () => {
    const data = workspace();
    data.fields.a = { id: "a", name: "A", description: "", position: [0, 0], radius: 220 };
    data.fields.b = { id: "b", name: "B", description: "", position: [140, 0], radius: 220 };
    data.projects.p1 = project("p1", ["a", "b"], [70, 0], 16);
    data.projects.p2 = project("p2", ["a", "b"], [80, 0], 16);
    const out = validateProjectPositionsWithoutMutatingFields(data);
    expect(gap(out, "p1", "p2")).toBeGreaterThanOrEqual(32 + PROJECT_GAP - 0.5);
    for (const id of ["p1", "p2"] as const) {
      const placed = out.projects[id]!;
      for (const fieldId of ["a", "b"] as const) {
        const field = out.fields[fieldId]!;
        const distance = Math.hypot(
          placed.position[0] - field.position[0],
          placed.position[1] - field.position[1],
        );
        expect(distance + placed.radius).toBeLessThanOrEqual(field.radius - 4);
      }
    }
    expect(out.fields.a!.radius).toBe(220);
    expect(out.fields.b!.radius).toBe(220);
  });

  it("leaves hidden projects in place and out of the packing", () => {
    const data = workspace();
    data.projects.p1 = project("p1", ["a"], [0, 0]);
    data.projects.p2 = project("p2", ["a"], [8, 0]);
    data.projects.hidden = { ...project("hidden", ["a"], [0, 0]), canvas_hidden: true };
    const out = validateProjectPositionsWithoutMutatingFields(data);
    expect(out.projects.hidden!.position).toEqual([0, 0]);
    expect(gap(out, "p1", "p2")).toBeGreaterThanOrEqual(40 + PROJECT_GAP - 0.5);
  });

  it("grows a tight field only by the deficit and stays under the cap", () => {
    const data = workspace();
    data.fields.a!.radius = 70;
    data.projects.p1 = project("p1", ["a"], [0, 0], 40);
    data.projects.p2 = project("p2", ["a"], [4, 0], 40);
    const dragged = validateProjectPositionsWithoutMutatingFields(data);
    expect(dragged.fields.a!.radius).toBe(70);
    const out = validateAndFixProjectPositions(data);
    expect(out.fields.a!.radius).toBeGreaterThan(70);
    expect(out.fields.a!.radius).toBeLessThanOrEqual(MAX_FIELD_RADIUS);
    expect(gap(out, "p1", "p2")).toBeGreaterThanOrEqual(80 + PROJECT_GAP - 1);
  });

  it("counts the author ring in the collision radius", () => {
    const data = workspace();
    data.people.ada = {
      id: "ada",
      name: "Ada Lovelace",
      lab_ids: [],
      family_name: "Lovelace",
      given_name: "Ada",
      aliases: [],
      orcid: "",
    };
    data.projects.p1 = project("p1", ["a"], [0, 0], 20);
    data.projects.p2 = project("p2", ["a"], [12, 0], 20);
    data.authorships = [
      {
        project_id: "p1",
        person_id: "ada",
        position: 1,
        corresponding: false,
        credit_roles: [],
        primary: true,
        co_first: false,
        responsibility: "",
      },
      {
        project_id: "p2",
        person_id: "ada",
        position: 1,
        corresponding: false,
        credit_roles: [],
        primary: true,
        co_first: false,
        responsibility: "",
      },
    ];
    const collision = projectCollisionRadius(data.projects.p1, data, "all");
    expect(collision).toBeGreaterThan(20);
    const out = validateProjectPositionsWithoutMutatingFields(data, { authorDisplay: "all" });
    expect(gap(out, "p1", "p2")).toBeGreaterThanOrEqual(collision * 2 + PROJECT_GAP - 0.5);
  });
});
