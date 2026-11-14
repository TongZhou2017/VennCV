import { describe, expect, it } from "vitest";
import { svgDocument, svgWrappingPng } from "./figureExport";

describe("figureExport", () => {
  it("给缺少命名空间的 svg 补上 xmlns", () => {
    expect(svgDocument("<svg></svg>")).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svgDocument('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    );
  });

  it("把 png 嵌进 svg 文件", () => {
    const text = svgWrappingPng("data:image/png;base64,aaa", 20, 10);
    expect(text).toContain('width="20"');
    expect(text).toContain('height="10"');
    expect(text).toContain('href="data:image/png;base64,aaa"');
  });
});
