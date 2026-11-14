import { describe, expect, it } from "vitest";
import { lerpScene, relationLabelPoint, sceneClose } from "./sceneMotion";

describe("scene motion", () => {
  it("starts at the current pose and ends on the settled pose", () => {
    const from = { a: [0, 0] as [number, number], b: [10, 0] as [number, number] };
    const to = { a: [4, 8] as [number, number], b: [10, 0] as [number, number] };
    expect(lerpScene(from, to, 0).a).toEqual([0, 0]);
    expect(lerpScene(from, to, 1).a).toEqual([4, 8]);
    expect(lerpScene(from, to, 1).b).toEqual([10, 0]);
    const mid = lerpScene(from, to, 0.5).a!;
    expect(mid[0]).toBeGreaterThan(0);
    expect(mid[0]).toBeLessThan(4);
  });

  it("treats nearly equal poses as settled", () => {
    expect(sceneClose({ a: [1, 1] }, { a: [1.1, 1] })).toBe(true);
    expect(sceneClose({ a: [1, 1] }, { a: [3, 1] })).toBe(false);
  });

  it("moves a relation label off the midpoint", () => {
    const label = relationLabelPoint(0, 0, 100, 0);
    expect(label.x).toBeCloseTo(50);
    expect(Math.abs(label.y)).toBeGreaterThan(15);
  });
});