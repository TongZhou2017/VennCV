import type { ResearchField } from "../types";

/** 领域圆在数据坐标系中的统一基准半径（与维恩图比例一致） */
export const VENN_FIELD_BASE_RADIUS = 185;

/** 与 `layoutFieldsVennPositions` 中各数量的统一半径公式一致，用于判断领域是否已因拥挤而扩容 */
export function vennNominalFieldRadius(fieldCount: number): number {
  const n = Math.max(1, fieldCount);
  return VENN_FIELD_BASE_RADIUS * (1 + Math.max(0, n - 3) * 0.06);
}

export const VENN_CENTER_X = 400;
export const VENN_CENTER_Y = 415;

/**
 * 按侧栏顺序将领域摆成经典维恩式布局（两圆相交、三叶、或多圆环带相交）。
 * 仅改写 `orderedFieldIds` 中存在的项的 `position` 与 `radius`。
 */
export function layoutFieldsVennPositions(
  orderedFieldIds: string[],
  fields: Record<string, ResearchField>,
): Record<string, ResearchField> {
  const result = { ...fields };
  const ids = orderedFieldIds.filter((id) => result[id]);
  const n = ids.length;
  if (n === 0) return result;

  const R = VENN_FIELD_BASE_RADIUS * (1 + Math.max(0, n - 3) * 0.06);
  const cx = VENN_CENTER_X;
  const cy = VENN_CENTER_Y;

  const centers: [number, number][] = [];

  if (n === 1) {
    centers.push([cx, cy]);
  } else if (n === 2) {
    const sep = R * 0.82;
    centers.push([cx - sep / 2, cy], [cx + sep / 2, cy]);
  } else if (n === 3) {
    const d = R * 0.92;
    centers.push(
      [cx, cy - d * 0.55],
      [cx - d * 0.82, cy + d * 0.48],
      [cx + d * 0.82, cy + d * 0.48],
    );
  } else if (n === 4) {
    const s = R * 0.72;
    centers.push(
      [cx - s, cy - s],
      [cx + s, cy - s],
      [cx - s, cy + s],
      [cx + s, cy + s],
    );
  } else {
    const ringR = R * (0.95 + n * 0.06);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * 2 * Math.PI - Math.PI / 2;
      centers.push([cx + ringR * Math.cos(ang), cy + ringR * Math.sin(ang)]);
    }
  }

  for (let i = 0; i < n; i++) {
    const id = ids[i]!;
    const f = result[id];
    if (!f) continue;
    const c = centers[i]!;
    result[id] = { ...f, position: c, radius: R };
  }

  return result;
}
