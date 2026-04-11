import { describe, expect, it } from "vitest";
import {
  layoutFieldsVennPositions,
  vennNominalFieldRadius,
  VENN_FIELD_BASE_RADIUS,
} from "./fieldVennLayout";
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
});
