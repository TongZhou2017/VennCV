import type { Project } from "../types";
import { dataToScreen, type VizLayout } from "./layout";

const NAME_FONT_H = 14;
/** 与 VisualizationCanvas 中 `offsetX={name.length * 3}` 大致匹配的半宽估算 */
const HALF_W_PER_CHAR = 3.2;
const VERTICAL_GAP = 2;

type LabelBox = {
  id: string;
  cx: number;
  baseTop: number;
  halfW: number;
};

function collectBoxes(
  projects: Project[],
  layout: VizLayout,
  zoom: number,
  pan: { x: number; y: number },
): LabelBox[] {
  return projects.map((p) => {
    const [sx, sy] = dataToScreen(p.position[0], p.position[1], layout, zoom, pan);
    const r = p.radius * layout.autoScale * zoom;
    const baseLineY = sy + r + NAME_FONT_H;
    const baseTop = baseLineY - NAME_FONT_H;
    return {
      id: p.id,
      cx: sx,
      baseTop,
      halfW: Math.max(p.name.length * HALF_W_PER_CHAR, 18),
    };
  });
}

function horizOverlap(a: LabelBox, b: LabelBox, dyA: number, dyB: number): boolean {
  const topA = a.baseTop + dyA;
  const botA = topA + NAME_FONT_H;
  const topB = b.baseTop + dyB;
  const botB = topB + NAME_FONT_H;
  if (botA + VERTICAL_GAP <= topB || botB + VERTICAL_GAP <= topA) return false;
  const sep = 6;
  return Math.abs(a.cx - b.cx) < a.halfW + b.halfW + sep;
}

/**
 * 在屏幕空间为项目名称计算附加垂直偏移（px），减轻标签互相遮挡。
 */
export function computeProjectNameLabelOffsets(
  projects: Project[],
  layout: VizLayout,
  zoom: number,
  pan: { x: number; y: number },
): Record<string, number> {
  const dy: Record<string, number> = {};
  if (projects.length === 0) return dy;

  const boxes = collectBoxes(projects, layout, zoom, pan);
  for (const b of boxes) dy[b.id] = 0;

  const maxStep = 9;
  for (let iter = 0; iter < 40; iter++) {
    let any = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if (!horizOverlap(a, b, dy[a.id]!, dy[b.id]!)) continue;
        const push = 3.2;
        if (a.baseTop + dy[a.id]! <= b.baseTop + dy[b.id]!) {
          dy[a.id]! -= push;
          dy[b.id]! += push;
        } else {
          dy[a.id]! += push;
          dy[b.id]! -= push;
        }
        dy[a.id] = Math.max(-maxStep * push, Math.min(maxStep * push, dy[a.id]!));
        dy[b.id] = Math.max(-maxStep * push, Math.min(maxStep * push, dy[b.id]!));
        any = true;
      }
    }
    if (!any) break;
  }

  return dy;
}
