import { textWidth } from "./projectLabelLayout";

/** 图例占位。五个状态加三档完成度，和画布上的图例同高。 */
export const LEGEND_BOX = { w: 126, h: 220 };

/** 领域名的字号。摆放和绘制用同一个值，文字框才能离开圆边。 */
export const FIELD_LABEL_FONT = 14;

/**
 * 项目名字号跟着小球的屏幕半径走。球缩小，字也缩小。
 * 0.62 让字高大约是半径的六成，不再在小球上保持固定的 12 像素。
 */
export function projectNameFontSize(screenRadius: number): number {
  return Math.max(6, screenRadius * 0.62);
}

export type ScreenPoint = { x: number; y: number };

export type ScreenRect = { x: number; y: number; w: number; h: number };

export type NameAnchor = "start" | "middle" | "end";

export type SceneLabels = {
  fieldLabels: { id: string; x: number; y: number }[];
  names: PlacedName[];
  legendAt: ScreenPoint;
};

export type PlacedName = {
  id: string;
  x: number;
  y: number;
  anchor: NameAnchor;
  fontSize: number;
};

export type NameSegment = { x1: number; y1: number; x2: number; y2: number };

type Circle = { id: string; x: number; y: number; r: number; name: string; fieldIds?: string[] };

type FieldDisk = { id: string; x: number; y: number; r: number };

type Box = { l: number; t: number; r: number; b: number };

function unit(x: number, y: number, fallback: ScreenPoint): ScreenPoint {
  const len = Math.hypot(x, y);
  if (len < 1) return fallback;
  return { x: x / len, y: y / len };
}

function boxFor(x: number, y: number, width: number, anchor: NameAnchor, halfH: number): Box {
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  return { l: left, t: y - halfH, r: left + width, b: y + halfH };
}

function boxesOverlap(a: Box, b: Box, pad: number): boolean {
  return a.l - pad < b.r && b.l - pad < a.r && a.t - pad < b.b && b.t - pad < a.b;
}

function rectBox(rect: ScreenRect): Box {
  return { l: rect.x, t: rect.y, r: rect.x + rect.w, b: rect.y + rect.h };
}

function hitsCircle(box: Box, x: number, y: number, radius: number): boolean {
  const px = Math.max(box.l, Math.min(x, box.r));
  const py = Math.max(box.t, Math.min(y, box.b));
  return Math.hypot(px - x, py - y) < radius;
}

function hitsAny(box: Box, obstacles: ScreenRect[], circles: Circle[], ignoreId: string): boolean {
  if (obstacles.some((item) => boxesOverlap(box, rectBox(item), 2))) return true;
  return circles.some((circle) => circle.id !== ignoreId && hitsCircle(box, circle.x, circle.y, circle.r + 2));
}

/** 领域名放在远离其他圆心的外侧。文字框整块离开所有领域圆。 */
export function placeFieldLabels(
  fields: { id: string; name: string; x: number; y: number; r: number }[],
): { id: string; x: number; y: number }[] {
  const centroid = {
    x: fields.reduce((sum, field) => sum + field.x, 0) / Math.max(fields.length, 1),
    y: fields.reduce((sum, field) => sum + field.y, 0) / Math.max(fields.length, 1),
  };
  const gap = 8;
  return fields.map((field) => {
    const dir = unit(field.x - centroid.x, field.y - centroid.y, { x: 0, y: -1 });
    const width = Math.max(textWidth(field.name, FIELD_LABEL_FONT), FIELD_LABEL_FONT * 2);
    const halfH = FIELD_LABEL_FONT * 0.5;
    const support = Math.abs(dir.x) * (width / 2) + Math.abs(dir.y) * halfH;
    let dist = field.r + gap + support;
    const limit = dist + 720;
    let placed = { id: field.id, x: field.x + dir.x * dist, y: field.y + dir.y * dist };
    while (dist <= limit) {
      const x = field.x + dir.x * dist;
      const y = field.y + dir.y * dist;
      const box = boxFor(x, y, width, "middle", halfH);
      const hits = fields.some((other) => hitsCircle(box, other.x, other.y, other.r + 3));
      placed = { id: field.id, x, y };
      if (!hits) break;
      dist += 16;
    }
    return placed;
  });
}

function intrusion(box: Box, x: number, y: number, radius: number): number {
  const px = Math.max(box.l, Math.min(x, box.r));
  const py = Math.max(box.t, Math.min(y, box.b));
  return Math.max(0, radius - Math.hypot(px - x, py - y));
}

/** 视图切换、缩放和已选数量占住的屏幕区域。图例和名字都要让开。 */
export function canvasChrome(canvasW: number, canvasH: number): ScreenRect[] {
  return [
    { x: 0, y: 0, w: 128, h: 52 },
    { x: Math.max(0, canvasW - 84), y: 0, w: 84, h: 52 },
    { x: Math.max(0, canvasW - 128), y: Math.max(0, canvasH - 48), w: 128, h: 48 },
  ];
}

function rectsOverlap(a: ScreenRect, b: ScreenRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 图例留在最不挡领域圆、领域名和角落按钮的一角。 */
export function placeLegend(
  canvasW: number,
  canvasH: number,
  legendW: number,
  legendH: number,
  circles: { x: number; y: number; r: number }[],
  blocked: ScreenRect[] = [],
): ScreenPoint {
  const pad = 12;
  const bottom = 36;
  const corners = [
    { x: pad, y: 58 },
    { x: canvasW - legendW - pad, y: 58 },
    { x: pad, y: canvasH - legendH - bottom },
    { x: canvasW - legendW - pad, y: canvasH - legendH - bottom },
  ];
  let best = corners[0] ?? { x: pad, y: pad };
  let bestScore = Number.POSITIVE_INFINITY;
  for (const corner of corners) {
    const box = { l: corner.x, t: corner.y, r: corner.x + legendW, b: corner.y + legendH };
    const legend = { x: corner.x, y: corner.y, w: legendW, h: legendH };
    const covered = blocked.reduce((sum, block) => sum + (rectsOverlap(legend, block) ? 1 : 0), 0);
    const score =
      covered * 100000 +
      circles.reduce((sum, circle) => sum + intrusion(box, circle.x, circle.y, circle.r + 10), 0);
    if (score < bestScore) {
      best = corner;
      bestScore = score;
      if (score === 0) break;
    }
  }
  return best;
}

/** 拖动后的图例留在画布内，并离开角落按钮。 */
export function clampLegendPosition(
  rawX: number,
  rawY: number,
  canvasW: number,
  canvasH: number,
  legendW: number,
  legendH: number,
  blocked: ScreenRect[],
): ScreenPoint {
  const margin = 8;
  const maxX = Math.max(margin, canvasW - legendW - margin);
  const maxY = Math.max(margin, canvasH - legendH - margin);
  let x = Math.min(maxX, Math.max(margin, rawX));
  let y = Math.min(maxY, Math.max(margin, rawY));
  for (let pass = 0; pass < blocked.length; pass += 1) {
    const box = { x, y, w: legendW, h: legendH };
    const hit = blocked.find((block) => rectsOverlap(box, block));
    if (!hit) break;
    const options = [
      { x: hit.x - legendW - 4, y },
      { x: hit.x + hit.w + 4, y },
      { x, y: hit.y - legendH - 4 },
      { x, y: hit.y + hit.h + 4 },
    ];
    let best = { x, y };
    let bestDist = Number.POSITIVE_INFINITY;
    for (const option of options) {
      const nextX = Math.min(maxX, Math.max(margin, option.x));
      const nextY = Math.min(maxY, Math.max(margin, option.y));
      const next = { x: nextX, y: nextY, w: legendW, h: legendH };
      if (blocked.some((block) => rectsOverlap(next, block))) continue;
      const dist = Math.hypot(nextX - rawX, nextY - rawY);
      if (dist < bestDist) {
        best = { x: nextX, y: nextY };
        bestDist = dist;
      }
    }
    if (bestDist === Number.POSITIVE_INFINITY) break;
    x = best.x;
    y = best.y;
  }
  return { x, y };
}

type Draft = {
  id: string;
  cx: number;
  cy: number;
  r: number;
  width: number;
  halfH: number;
  gap: number;
  fontSize: number;
  x: number;
  y: number;
  anchor: NameAnchor;
};

function draftBox(draft: Draft): Box {
  return boxFor(draft.x, draft.y, draft.width, draft.anchor, draft.halfH);
}

function nameMetrics(radius: number, name: string): { fontSize: number; halfH: number; gap: number; width: number } {
  const fontSize = projectNameFontSize(radius);
  const halfH = fontSize * 0.5;
  const gap = Math.max(2, fontSize * 0.35);
  const width = Math.max(textWidth(name, fontSize), fontSize * 2);
  return { fontSize, halfH, gap, width };
}

function radialDraft(circle: Circle, dir: ScreenPoint, metrics: { fontSize: number; halfH: number; gap: number; width: number }): Draft {
  const support = Math.abs(dir.x) * (metrics.width / 2) + Math.abs(dir.y) * metrics.halfH;
  const reach = circle.r + metrics.gap + support;
  return {
    id: circle.id,
    cx: circle.x,
    cy: circle.y,
    r: circle.r,
    width: metrics.width,
    halfH: metrics.halfH,
    gap: metrics.gap,
    fontSize: metrics.fontSize,
    x: circle.x + dir.x * reach,
    y: circle.y + dir.y * reach,
    anchor: "middle",
  };
}

function openDirection(project: Circle, projects: Circle[]): ScreenPoint {
  let nearest: Circle | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const other of projects) {
    if (other.id === project.id) continue;
    const distance = Math.hypot(other.x - project.x, other.y - project.y);
    if (distance < best) {
      best = distance;
      nearest = other;
    }
  }
  if (!nearest) return { x: 0, y: 1 };
  return unit(project.x - nearest.x, project.y - nearest.y, { x: 0, y: 1 });
}

/** 朝领域内部，让文字落在圈里，而不是跨过描边。 */
function interiorDirection(project: Circle, fields: FieldDisk[]): ScreenPoint | null {
  const mine = fields.filter((field) => project.fieldIds?.includes(field.id));
  let nearest: FieldDisk | null = null;
  let slack = Number.POSITIVE_INFINITY;
  for (const field of mine) {
    const room = field.r - Math.hypot(project.x - field.x, project.y - field.y);
    if (room < slack) {
      slack = room;
      nearest = field;
    }
  }
  if (!nearest) return null;
  return unit(nearest.x - project.x, nearest.y - project.y, { x: 0, y: -1 });
}

function boundaryOverflow(box: Box, project: Circle, fields: FieldDisk[]): number {
  const mine = fields.filter((field) => project.fieldIds?.includes(field.id));
  let overflow = 0;
  const corners: Array<[number, number]> = [
    [box.l, box.t],
    [box.r, box.t],
    [box.l, box.b],
    [box.r, box.b],
  ];
  for (const field of mine) {
    const limit = field.r - 3;
    for (const [x, y] of corners) {
      overflow += Math.max(0, Math.hypot(x - field.x, y - field.y) - limit);
    }
  }
  return overflow;
}

function hitsSegment(box: Box, segment: NameSegment, pad: number): boolean {
  const left = box.l - pad;
  const top = box.t - pad;
  const right = box.r + pad;
  const bottom = box.b + pad;
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const p = [-dx, dx, -dy, dy];
  const q = [segment.x1 - left, right - segment.x1, segment.y1 - top, bottom - segment.y1];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    const pi = p[i] ?? 0;
    const qi = q[i] ?? 0;
    if (Math.abs(pi) < 1e-9) {
      if (qi < 0) return false;
      continue;
    }
    const t = qi / pi;
    if (pi < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

function arrowHits(box: Box, arrows: NameSegment[]): number {
  return arrows.reduce((count, segment) => count + (hitsSegment(box, segment, 4) ? 1 : 0), 0);
}

function turned(dir: ScreenPoint, angle: number): ScreenPoint {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: dir.x * cos - dir.y * sin, y: dir.x * sin + dir.y * cos };
}

function keepNearCircle(draft: Draft): void {
  const dx = draft.x - draft.cx;
  const dy = draft.y - draft.cy;
  const dist = Math.hypot(dx, dy) || 1;
  const min = draft.r + draft.gap;
  const max = draft.r + draft.fontSize * 3;
  const next = Math.min(max, Math.max(min, dist));
  draft.x = draft.cx + (dx / dist) * next;
  draft.y = draft.cy + (dy / dist) * next;
}

type NameCost = { overflow: number; arrows: number; blocked: number };

function nameCost(
  draft: Draft,
  project: Circle,
  obstacles: ScreenRect[],
  projects: Circle[],
  fields: FieldDisk[],
  arrows: NameSegment[],
): NameCost {
  const box = draftBox(draft);
  const onOwn = hitsCircle(box, draft.cx, draft.cy, draft.r + 1);
  return {
    overflow: boundaryOverflow(box, project, fields) + (onOwn ? 1000 : 0),
    arrows: arrowHits(box, arrows),
    blocked: hitsAny(box, obstacles, projects, project.id) ? 1 : 0,
  };
}

function betterCost(next: NameCost, prev: NameCost): boolean {
  if (next.overflow !== prev.overflow) return next.overflow < prev.overflow;
  if (next.arrows !== prev.arrows) return next.arrows < prev.arrows;
  return next.blocked < prev.blocked;
}

/**
 * 名字贴在自己的小球外侧，字号随球的屏幕半径变化。
 * 文字框要留在所属领域圈内，并躲开关系箭头。不拉延伸线。
 */
export function placeProjectNames(
  projects: Circle[],
  obstacles: ScreenRect[],
  fields: FieldDisk[] = [],
  arrows: NameSegment[] = [],
): PlacedName[] {
  const turns = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2, -2, Math.PI];
  const drafts = projects.map((project) => {
    const metrics = nameMetrics(project.r, project.name);
    const base = interiorDirection(project, fields) ?? openDirection(project, projects);
    let chosen = radialDraft(project, base, metrics);
    let chosenCost = nameCost(chosen, project, obstacles, projects, fields, arrows);
    for (const turn of turns) {
      const draft = radialDraft(project, turned(base, turn), metrics);
      const cost = nameCost(draft, project, obstacles, projects, fields, arrows);
      if (betterCost(cost, chosenCost)) {
        chosen = draft;
        chosenCost = cost;
      }
      if (cost.overflow === 0 && cost.arrows === 0 && cost.blocked === 0) break;
    }
    return chosen;
  });
  const projectOf = new Map(projects.map((project) => [project.id, project]));
  const blocked = (draft: Draft) => {
    const project = projectOf.get(draft.id);
    if (!project) return true;
    const cost = nameCost(draft, project, obstacles, projects, fields, arrows);
    return cost.overflow > 0 || cost.arrows > 0 || cost.blocked > 0;
  };
  for (let step = 0; step < 8; step++) {
    let moved = false;
    for (let i = 0; i < drafts.length; i++) {
      for (let j = i + 1; j < drafts.length; j++) {
        const left = drafts[i]!;
        const right = drafts[j]!;
        if (!boxesOverlap(draftBox(left), draftBox(right), 2)) continue;
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const len = Math.hypot(dx, dy);
        const push = len < 1 ? { x: left.id < right.id ? -1 : 1, y: 0 } : { x: dx / len, y: dy / len };
        const saved = [
          [left.x, left.y],
          [right.x, right.y],
        ] as const;
        left.x -= push.x * 4;
        left.y -= push.y * 4;
        right.x += push.x * 4;
        right.y += push.y * 4;
        keepNearCircle(left);
        keepNearCircle(right);
        if (blocked(left)) {
          left.x = saved[0][0];
          left.y = saved[0][1];
        }
        if (blocked(right)) {
          right.x = saved[1][0];
          right.y = saved[1][1];
        }
        if (left.x !== saved[0][0] || right.x !== saved[1][0] || left.y !== saved[0][1] || right.y !== saved[1][1]) {
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return drafts.map((draft) => ({
    id: draft.id,
    x: draft.x,
    y: draft.y,
    anchor: "middle" as const,
    fontSize: draft.fontSize,
  }));
}
