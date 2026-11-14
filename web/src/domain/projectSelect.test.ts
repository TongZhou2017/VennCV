import { describe, expect, it } from "vitest";
import { fieldSetKey, projectNamePrefix, vennRelationKey } from "./projectSelect";

describe("projectNamePrefix", () => {
  it("以空格或连字符切开，取第一段", () => {
    expect(projectNamePrefix("MAGIC-RNA")).toBe("MAGIC");
    expect(projectNamePrefix("MAGIC")).toBe("MAGIC");
    expect(projectNamePrefix("Sea cucumber")).toBe("Sea");
    expect(projectNamePrefix("  itol.toolkit 2.0  ")).toBe("itol.toolkit");
    expect(projectNamePrefix("Modtector-2.0")).toBe("Modtector");
  });

  it("连续分隔符只算一次", () => {
    expect(projectNamePrefix("A  -  B")).toBe("A");
  });
});

describe("vennRelationKey", () => {
  it("只比较还在的领域，顺序无关", () => {
    const known = new Set(["bio", "eco", "rna"]);
    expect(vennRelationKey(["rna", "bio"], known)).toBe(vennRelationKey(["bio", "rna"], known));
    expect(vennRelationKey(["bio", "rna"], known)).not.toBe(vennRelationKey(["bio"], known));
    expect(vennRelationKey(["bio", "gone"], known)).toBe("bio");
  });

  it("领域名单本身仍保留已经不在侧栏里的项", () => {
    expect(fieldSetKey(["bio", "gone"])).not.toBe(vennRelationKey(["bio", "gone"], new Set(["bio"])));
  });
});
