import { describe, expect, it } from "vitest";
import {
  FIELD_RADIUS_RATIO_MAX,
  fitFieldRadii,
  layoutFieldsVennPositions,
  overlapFractionForCounts,
  targetFieldSeparation,
  fieldRadiusForMemberCount,
  visibleFieldLayoutCensus,
  visibleFieldMemberCounts,
  vennNominalFieldRadius,
  VENN_FIELD_BASE_RADIUS,
} from "./fieldVennLayout";
import { defaultEmptyAppData } from "./appData";
import type { ResearchField } from "../types";

function field(id: string): ResearchField {
  return { id, name: id, description: "", position: [0, 0], radius: 1 };
}

describe("layoutFieldsVennPositions", () => {
  it("places two fields with overlapping distance < 2R", () => {
    const fields = { a: field("a"), b: field("b") };
    const out = layoutFieldsVennPositions(["a", "b"], fields);
    const [ax, ay] = out.a.position;
    const [bx, by] = out.b.position;
    const d = Math.hypot(ax - bx, ay - by);
    const R = out.a.radius;
    expect(R).toBe(VENN_FIELD_BASE_RADIUS);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(2 * R);
  });

  it("uses same radius for three fields", () => {
    const fields = { a: field("a"), b: field("b"), c: field("c") };
    const out = layoutFieldsVennPositions(["a", "b", "c"], fields);
    expect(out.a.radius).toBe(out.b.radius);
    expect(out.b.radius).toBe(out.c.radius);
  });

  it("vennNominalFieldRadius matches layout formula for n=2 and n=3", () => {
    const f2 = layoutFieldsVennPositions(["a", "b"], { a: field("a"), b: field("b") });
    expect(vennNominalFieldRadius(2)).toBe(f2.a.radius);
    const f3 = layoutFieldsVennPositions(["a", "b", "c"], {
      a: field("a"),
      b: field("b"),
      c: field("c"),
    });
    expect(vennNominalFieldRadius(3)).toBe(f3.a.radius);
    expect(vennNominalFieldRadius(1)).toBe(VENN_FIELD_BASE_RADIUS);
  });

  it("grows the busier field without exceeding the radius ratio", () => {
    const radii = fitFieldRadii([0, 36]);
    expect(radii[0]).toBe(VENN_FIELD_BASE_RADIUS);
    expect(radii[1]).toBeGreaterThan(radii[0]!);
    expect(radii[1]! / radii[0]!).toBeLessThanOrEqual(FIELD_RADIUS_RATIO_MAX + 1e-9);
  });

  it("keeps a shallow overlap when each field has only its own projects", () => {
    const fields = { a: field("a"), b: field("b") };
    const census = { exclusive: { a: 4, b: 4 }, shared: { a: 0, b: 0 }, pair: {} };
    const out = layoutFieldsVennPositions(["a", "b"], fields, census);
    const d = Math.hypot(out.a.position[0] - out.b.position[0], out.a.position[1] - out.b.position[1]);
    const fraction = overlapFractionForCounts(4, 4, 0);
    const expected = targetFieldSeparation(out.a.radius, out.b.radius, fraction);
    expect(Math.abs(d - expected)).toBeLessThan(0.01);
    const overlap = out.a.radius + out.b.radius - d;
    expect(overlap / Math.min(out.a.radius, out.b.radius)).toBeCloseTo(fraction, 2);
  });

  it("deepens the overlap and keeps the circles smaller when most projects are shared", () => {
    const fields = { a: field("a"), b: field("b") };
    const shared = layoutFieldsVennPositions(["a", "b"], fields, {
      exclusive: { a: 1, b: 1 },
      shared: { a: 12, b: 12 },
      pair: { "a\0b": 12 },
    });
    const separate = layoutFieldsVennPositions(["a", "b"], fields, {
      exclusive: { a: 12, b: 12 },
      shared: { a: 0, b: 0 },
      pair: {},
    });
    const depthRatio = (out: typeof shared) => {
      const d = Math.hypot(out.a.position[0] - out.b.position[0], out.a.position[1] - out.b.position[1]);
      return (out.a.radius + out.b.radius - d) / Math.min(out.a.radius, out.b.radius);
    };
    expect(depthRatio(shared)).toBeGreaterThan(depthRatio(separate) + 0.4);
    expect(shared.a.radius).toBeLessThan(fieldRadiusForMemberCount(13));
  });

  it("spaces a ring of five by the same neighbor separation", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const fields = Object.fromEntries(ids.map((id) => [id, field(id)]));
    const census = {
      exclusive: { a: 2, b: 2, c: 2, d: 2, e: 2 },
      shared: { a: 0, b: 0, c: 0, d: 0, e: 0 },
      pair: {},
    };
    const out = layoutFieldsVennPositions(ids, fields, census);
    const fraction = overlapFractionForCounts(2, 2, 0);
    const expected = targetFieldSeparation(out.a.radius, out.b.radius, fraction);
    for (let i = 0; i < ids.length; i++) {
      const left = out[ids[i]!]!;
      const right = out[ids[(i + 1) % ids.length]!]!;
      const d = Math.hypot(left.position[0] - right.position[0], left.position[1] - right.position[1]);
      expect(Math.abs(d - expected)).toBeLessThan(0.01);
    }
  });

  it("does not count hidden projects as field members", () => {
    const data = defaultEmptyAppData();
    data.projects.p1 = {
      id: "p1",
      name: "p",
      description: "",
      status: "ToBeStarted",
      field_ids: ["a"],
      position: [0, 0],
      radius: 20,
      completion_percentage: 0,
    };
    data.projects.p2 = { ...data.projects.p1, id: "p2", canvas_hidden: true };
    expect(visibleFieldMemberCounts(data, ["a"])).toEqual({ a: 1 });
    expect(visibleFieldLayoutCensus(data, ["a"]).exclusive).toEqual({ a: 1 });
  });
});
