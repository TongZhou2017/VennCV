import { describe, expect, it } from "vitest";
import { textWidth } from "./projectLabelLayout";
import { canvasChrome, clampLegendPosition, FIELD_LABEL_FONT, placeFieldLabels, placeLegend, placeProjectNames, projectNameFontSize } from "./sceneSpace";

function box(name: { x: number; y: number; anchor: "start" | "middle" | "end"; fontSize: number }, label: string) {
  const width = Math.max(textWidth(label, name.fontSize), name.fontSize * 2);
  const halfH = name.fontSize * 0.5;
  const left = name.anchor === "start" ? name.x : name.anchor === "end" ? name.x - width : name.x - width / 2;
  return { l: left, t: name.y - halfH, r: left + width, b: name.y + halfH };
}

function hits(name: { x: number; y: number; anchor: "start" | "middle" | "end"; fontSize: number }, label: string, x: number, y: number, r: number) {
  const item = box(name, label);
  const px = Math.max(item.l, Math.min(x, item.r));
  const py = Math.max(item.t, Math.min(y, item.b));
  return Math.hypot(px - x, py - y) < r;
}

describe("scene space", () => {
  it("puts field names outside every field circle", () => {
    const fields = [
      { id: "a", name: "生信工具开发", x: 0, y: 0, r: 100 },
      { id: "b", name: "微生物生态", x: 140, y: 0, r: 100 },
    ];
    const labels = placeFieldLabels(fields);
    const left = labels.find((item) => item.id === "a")!;
    const right = labels.find((item) => item.id === "b")!;
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(140);
    for (const field of fields) {
      const label = labels.find((item) => item.id === field.id)!;
      for (const circle of fields) {
        expect(hits({ ...label, anchor: "middle", fontSize: FIELD_LABEL_FONT }, field.name, circle.x, circle.y, circle.r)).toBe(
          false,
        );
      }
    }
  });

  it("pushes a field name out of a larger neighboring circle", () => {
    const fields = [
      { id: "a", name: "甲", x: 0, y: 0, r: 40 },
      { id: "b", name: "乙", x: 30, y: 0, r: 200 },
    ];
    const labels = placeFieldLabels(fields);
    const label = labels.find((item) => item.id === "a")!;
    for (const circle of fields) {
      expect(hits({ ...label, anchor: "middle", fontSize: FIELD_LABEL_FONT }, "甲", circle.x, circle.y, circle.r)).toBe(false);
    }
  });

  it("moves the legend off a circle that covers the top right", () => {
    const legend = placeLegend(400, 300, 120, 140, [{ x: 340, y: 80, r: 90 }]);
    expect(legend.x).toBeLessThan(40);
  });

  it("keeps the legend off the corner buttons", () => {
    const blocked = canvasChrome(800, 600);
    const legend = placeLegend(800, 600, 126, 220, [], blocked);
    for (const block of blocked) {
      const overlaps =
        legend.x < block.x + block.w &&
        legend.x + 126 > block.x &&
        legend.y < block.y + block.h &&
        legend.y + 220 > block.y;
      expect(overlaps).toBe(false);
    }
  });

  it("pushes a dragged legend out from under the zoom buttons", () => {
    const blocked = canvasChrome(800, 600);
    const zoom = blocked[1]!;
    const placed = clampLegendPosition(zoom.x - 10, 0, 800, 600, 126, 220, blocked);
    const overlaps =
      placed.x < zoom.x + zoom.w &&
      placed.x + 126 > zoom.x &&
      placed.y < zoom.y + zoom.h &&
      placed.y + 220 > zoom.y;
    expect(overlaps).toBe(false);
    expect(placed.y).toBeGreaterThanOrEqual(zoom.y + zoom.h);
  });

  it("keeps a lone name outside its circle", () => {
    const [name] = placeProjectNames([{ id: "p", x: 0, y: 0, r: 20, name: "甲项目" }], []);
    expect(hits(name!, "甲项目", 0, 0, 20)).toBe(false);
    expect(name!.y).toBeGreaterThan(20);
  });

  it("keeps crowded names beside their own circles", () => {
    const projects = [
      { id: "a", x: 0, y: 0, r: 16, name: "Modtector" },
      { id: "b", x: 28, y: 6, r: 16, name: "CROWNS" },
      { id: "c", x: 8, y: 30, r: 16, name: "STONE" },
      { id: "d", x: 36, y: 32, r: 16, name: "Destop" },
    ];
    const names = placeProjectNames(projects, []);
    for (const project of projects) {
      const name = names.find((item) => item.id === project.id)!;
      expect(hits(name, project.name, project.x, project.y, project.r)).toBe(false);
      expect(Math.hypot(name.x - project.x, name.y - project.y)).toBeLessThan(project.r + 80);
    }
  });

  it("shrinks the name as the ball gets smaller", () => {
    const [small] = placeProjectNames([{ id: "s", x: 0, y: 0, r: 10, name: "甲" }], []);
    const [large] = placeProjectNames([{ id: "l", x: 0, y: 0, r: 40, name: "甲" }], []);
    expect(small!.fontSize).toBe(projectNameFontSize(10));
    expect(large!.fontSize).toBe(projectNameFontSize(40));
    expect(small!.fontSize).toBeLessThan(large!.fontSize);
    expect(large!.fontSize / small!.fontSize).toBeCloseTo(4, 1);
  });

  it("keeps a name inside the field circle", () => {
    const [name] = placeProjectNames(
      [{ id: "p", x: 78, y: 0, r: 14, name: "边缘项目", fieldIds: ["f"] }],
      [],
      [{ id: "f", x: 0, y: 0, r: 100 }],
    );
    expect(name!.x).toBeLessThan(78);
    const item = box(name!, "边缘项目");
    for (const [x, y] of [
      [item.l, item.t],
      [item.r, item.t],
      [item.l, item.b],
      [item.r, item.b],
    ] as const) {
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(100);
    }
  });

  it("moves a name off an arrow leaving the ball", () => {
    const [name] = placeProjectNames(
      [{ id: "p", x: 0, y: 0, r: 16, name: "甲项目" }],
      [],
      [],
      [{ x1: 0, y1: 0, x2: 0, y2: 90 }],
    );
    const item = box(name!, "甲项目");
    const crosses =
      item.l <= 4 && item.r >= -4 && item.b > 16 && item.t < 90;
    expect(crosses).toBe(false);
  });
});
