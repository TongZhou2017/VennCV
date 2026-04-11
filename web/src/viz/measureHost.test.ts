import { describe, expect, it } from "vitest";
import { measureCanvasHost } from "./measureHost";

describe("measureCanvasHost", () => {
  it("uses fallback when element has zero size", () => {
    const el = document.createElement("div");
    el.getBoundingClientRect = () => ({ width: 0, height: 0, x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, toJSON: () => "" });
    Object.defineProperty(el, "clientWidth", { value: 0 });
    Object.defineProperty(el, "clientHeight", { value: 0 });
    const { w, h } = measureCanvasHost(el);
    expect(w).toBeGreaterThanOrEqual(280);
    expect(h).toBeGreaterThanOrEqual(260);
  });
});
