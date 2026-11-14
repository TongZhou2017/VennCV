import type { AppDataJson, ResearchField } from "../types";

/** 领域圆在数据坐标系中的统一基准半径（与维恩图比例一致） */
export const VENN_FIELD_BASE_RADIUS = 185;

/** 相邻领域要保留的相交深度，占较小半径的比例 */
export const FIELD_OVERLAP_FRACTION = 0.35;

/** 最大领域半径与最小领域半径之比 */
export const FIELD_RADIUS_RATIO_MAX = 1.6;

/**
 * 没有成员时的名义半径。领域个数不再把所有圈一起放大。
 * 参数保留，是为了和按领域个数调用的旧写法兼容。
 */
export function vennNominalFieldRadius(_fieldCount: number): number {
  return VENN_FIELD_BASE_RADIUS;
}

/**
 * 只按这个领域特有的项目数长半径。交集里的项目只算一小部分，
 * 避免两边都把同一批项目算成自己的一整圈。
 */
export function fieldRadiusForMemberCount(exclusiveCount: number, sharedCount = 0): number {
  const effective = Math.max(0, exclusiveCount) + 0.35 * Math.max(0, sharedCount);
  return VENN_FIELD_BASE_RADIUS * (1 + 0.2 * Math.sqrt(effective));
}

/** 交集项目越多，相交越深。没有共有项目时保持一段浅相交。 */
export function overlapFractionForCounts(exclusiveA: number, exclusiveB: number, shared: number): number {
  const total = Math.max(0, shared) + Math.max(0, exclusiveA) + Math.max(0, exclusiveB);
  if (total <= 0) return FIELD_OVERLAP_FRACTION;
  const ratio = Math.max(0, shared) / total;
  return 0.28 + 1.05 * ratio;
}

/** 把一组半径压进最大/最小不超过约 1.6，最小的那个保持不变。 */
export function fitFieldRadii(memberCounts: number[], sharedCounts: number[] = []): number[] {
  const raw = memberCounts.map((count, index) => fieldRadiusForMemberCount(count, sharedCounts[index] ?? 0));
  if (raw.length === 0) return [];
  const lo = Math.min(...raw);
  const hi = Math.max(...raw);
  if (!(lo > 0) || hi / lo <= FIELD_RADIUS_RATIO_MAX) return raw;
  const cap = lo * FIELD_RADIUS_RATIO_MAX;
  const span = hi - lo;
  return raw.map((radius) => lo + ((radius - lo) / span) * (cap - lo));
}

/** 两个圆的圆心距。`fraction` 是相交深度占较小半径的比例，可以大于 1，让交集比两侧特有区域更宽。 */
export function targetFieldSeparation(radiusA: number, radiusB: number, fraction = FIELD_OVERLAP_FRACTION): number {
  const smaller = Math.min(radiusA, radiusB);
  const depth = Math.min(Math.max(fraction, 0.2), 1.5) * smaller;
  const distance = radiusA + radiusB - depth;
  return Math.max(distance, Math.abs(radiusA - radiusB) + 28);
}

export type FieldVennCensus = {
  exclusive: Record<string, number>;
  shared: Record<string, number>;
  pair: Record<string, number>;
};

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

/** 可见项目按「只属于这一圈」和「同时属于两圈」分开计数。隐藏项目不计入。 */
export function visibleFieldLayoutCensus(
  data: Pick<AppDataJson, "projects">,
  fieldIds: string[],
): FieldVennCensus {
  const known = new Set(fieldIds);
  const exclusive: Record<string, number> = {};
  const shared: Record<string, number> = {};
  const pair: Record<string, number> = {};
  for (const id of fieldIds) {
    exclusive[id] = 0;
    shared[id] = 0;
  }
  for (const project of Object.values(data.projects)) {
    if (project.canvas_hidden === true) continue;
    const mine = project.field_ids.filter((id) => known.has(id));
    if (mine.length === 0) continue;
    if (mine.length === 1) {
      exclusive[mine[0]!] = (exclusive[mine[0]!] ?? 0) + 1;
      continue;
    }
    for (const id of mine) shared[id] = (shared[id] ?? 0) + 1;
    for (let i = 0; i < mine.length; i++) {
      for (let j = i + 1; j < mine.length; j++) {
        const key = pairKey(mine[i]!, mine[j]!);
        pair[key] = (pair[key] ?? 0) + 1;
      }
    }
  }
  return { exclusive, shared, pair };
}

export const VENN_CENTER_X = 400;
export const VENN_CENTER_Y = 415;

/** 画布上可见、且归入该领域的项目数。隐藏项目不把圈撑大。 */
export function visibleFieldMemberCounts(
  data: Pick<AppDataJson, "projects">,
  fieldIds: string[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of fieldIds) counts[id] = 0;
  for (const project of Object.values(data.projects)) {
    if (project.canvas_hidden === true) continue;
    for (const fieldId of project.field_ids) {
      if (counts[fieldId] !== undefined) counts[fieldId] += 1;
    }
  }
  return counts;
}

function ringCenters(
  radii: number[],
  cx: number,
  cy: number,
  separation: (index: number, next: number) => number,
): [number, number][] {
  const n = radii.length;
  let chord = 0;
  for (let i = 0; i < n; i++) chord += separation(i, (i + 1) % n);
  chord /= n;
  const ringR = chord / (2 * Math.sin(Math.PI / n));
  const centers: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * 2 * Math.PI - Math.PI / 2;
    centers.push([cx + ringR * Math.cos(ang), cy + ringR * Math.sin(ang)]);
  }
  return centers;
}

function triangleCenters(
  cx: number,
  cy: number,
  separation: (index: number, next: number) => number,
): [number, number][] {
  const d01 = separation(0, 1);
  const d02 = separation(0, 2);
  const d12 = separation(1, 2);
  const side = Math.max(d01, 1);
  const x2 = (d02 * d02 - d12 * d12 + side * side) / (2 * side);
  const y2sq = Math.max(0, d02 * d02 - x2 * x2);
  const pts: [number, number][] = [
    [0, 0],
    [side, 0],
    [x2, -Math.sqrt(y2sq)],
  ];
  const mx = (pts[0]![0] + pts[1]![0] + pts[2]![0]) / 3;
  const my = (pts[0]![1] + pts[1]![1] + pts[2]![1]) / 3;
  return pts.map((point) => [cx + point[0] - mx, cy + point[1] - my]);
}

/**
 * 按侧栏顺序将领域摆成维恩式布局。
 * 半径主要随特有项目增长。两圈共有的项目加深相交，不再把两边的特有区域一起撑空。
 * `census` 省略时按没有项目处理。
 */
export function layoutFieldsVennPositions(
  orderedFieldIds: string[],
  fields: Record<string, ResearchField>,
  census?: FieldVennCensus,
): Record<string, ResearchField> {
  const result = { ...fields };
  const ids = orderedFieldIds.filter((id) => result[id]);
  const n = ids.length;
  if (n === 0) return result;

  const radii = fitFieldRadii(
    ids.map((id) => census?.exclusive[id] ?? 0),
    ids.map((id) => census?.shared[id] ?? 0),
  );
  const separation = (index: number, next: number) => {
    const left = ids[index]!;
    const right = ids[next]!;
    const fraction = overlapFractionForCounts(
      census?.exclusive[left] ?? 0,
      census?.exclusive[right] ?? 0,
      census?.pair[pairKey(left, right)] ?? 0,
    );
    return targetFieldSeparation(radii[index]!, radii[next]!, fraction);
  };
  const cx = VENN_CENTER_X;
  const cy = VENN_CENTER_Y;
  let centers: [number, number][];

  if (n === 1) {
    centers = [[cx, cy]];
  } else if (n === 2) {
    const sep = separation(0, 1);
    centers = [
      [cx - sep / 2, cy],
      [cx + sep / 2, cy],
    ];
  } else if (n === 3) {
    centers = triangleCenters(cx, cy, separation);
  } else {
    centers = ringCenters(radii, cx, cy, separation);
  }

  for (let i = 0; i < n; i++) {
    const id = ids[i]!;
    const field = result[id];
    const center = centers[i];
    const radius = radii[i];
    if (!field || !center || radius === undefined) continue;
    result[id] = { ...field, position: center, radius };
  }

  return result;
}
