import { describe, expect, it } from "vitest";
import {
  fitTimelineWindow,
  nextTimelineSpan,
  shiftTimelineWindow,
  timelineDateRatio,
  timelineWindowRange,
  timelineWindowTicks,
  todayIso,
  windowForProjectRange,
  zoomTimelineSpan,
} from "./timeline";

describe("timeline window", () => {
  it("fits the full span and keeps both ends inside", () => {
    const window = fitTimelineWindow("2020-01-01", "2024-01-01");
    const range = timelineWindowRange(window);
    expect(timelineDateRatio("2020-01-01", range.start, range.end)).toBeGreaterThan(0);
    expect(timelineDateRatio("2024-01-01", range.start, range.end)).toBeLessThan(1);
    expect(timelineDateRatio(window.center, range.start, range.end)).toBeCloseTo(0.5, 1);
  });

  it("stops zooming out at the global span", () => {
    expect(nextTimelineSpan(80, false, 400)).toBeLessThan(400);
    expect(nextTimelineSpan(300, false, 400)).toBeNull();
    expect(nextTimelineSpan(400, false, 400)).toBeNull();
    expect(nextTimelineSpan(400, true, 400)).toBeLessThan(400);
  });

  it("zooms the span and leaves the center date in place", () => {
    const shorter = zoomTimelineSpan(400, true);
    const longer = zoomTimelineSpan(400, false);
    expect(shorter).toBeLessThan(400);
    expect(longer).toBeGreaterThan(400);
    const moved = shiftTimelineWindow({ center: "2024-06-01", spanDays: shorter }, 10);
    expect(moved.center > "2024-06-01").toBe(true);
    expect(moved.spanDays).toBe(shorter);
  });

  it("frames a project range around its midpoint", () => {
    const window = windowForProjectRange(["2022-01-01", "2022-07-01", "2022-03-01"]);
    expect(window).not.toBeNull();
    const range = timelineWindowRange(window!);
    expect(timelineDateRatio("2022-01-01", range.start, range.end)).toBeGreaterThanOrEqual(0);
    expect(timelineDateRatio("2022-07-01", range.start, range.end)).toBeLessThanOrEqual(1);
    expect(range.start < "2022-04-01" && range.end > "2022-04-01").toBe(true);
  });

  it("returns nothing for a project without dates", () => {
    expect(windowForProjectRange([])).toBeNull();
  });

  it("uses the local calendar day for today", () => {
    expect(todayIso(new Date(2026, 10, 14, 23, 30))).toBe("2026-11-14");
  });

  it("keeps short-window ticks inside the range", () => {
    const ticks = timelineWindowTicks("2026-11-01", "2026-11-20");
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.length).toBeLessThanOrEqual(8);
    for (const tick of ticks) {
      expect(tick.date > "2026-11-01").toBe(true);
      expect(tick.date < "2026-11-20").toBe(true);
    }
  });
});