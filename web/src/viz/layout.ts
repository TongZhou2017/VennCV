import type { AppDataJson, Project } from "../types";

function projectVisibleOnCanvas(p: Project): boolean {
  return p.canvas_hidden !== true;
}

function finite(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

/** 自适应缩放后，项目圆在屏幕上的最小半径（px），避免缩得过小难以点击与辨认 */
export const MIN_PROJECT_SCREEN_RADIUS_PX = 16;
/** 领域圆在屏幕上的最小半径（px），保持维恩区域可见 */
export const MIN_FIELD_SCREEN_RADIUS_PX = 50;

export interface VizLayout {
  contentWidth: number;
  contentHeight: number;
  contentCenterX: number;
  contentCenterY: number;
  autoScale: number;
  offsetX: number;
  offsetY: number;
}

/** 与 `app.rs` 中可视化区域计算一致 */
export function computeVizLayout(
  data: AppDataJson,
  rectW: number,
  rectH: number,
  zoom: number,
  offset: { x: number; y: number },
): VizLayout {
  void offset;
  const rw = Math.max(rectW, 1);
  const rh = Math.max(rectH, 1);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let hasContent = false;

  for (const field of Object.values(data.fields)) {
    minX = Math.min(minX, field.position[0] - field.radius);
    maxX = Math.max(maxX, field.position[0] + field.radius);
    minY = Math.min(minY, field.position[1] - field.radius);
    maxY = Math.max(maxY, field.position[1] + field.radius);
    hasContent = true;
  }
  for (const project of Object.values(data.projects)) {
    if (!projectVisibleOnCanvas(project)) continue;
    minX = Math.min(minX, project.position[0] - project.radius);
    maxX = Math.max(maxX, project.position[0] + project.radius);
    minY = Math.min(minY, project.position[1] - project.radius);
    maxY = Math.max(maxY, project.position[1] + project.radius);
    hasContent = true;
  }

  let contentWidth = 800;
  let contentHeight = 600;
  let contentCenterX = 400;
  let contentCenterY = 400;
  let autoScale = 1;

  if (hasContent) {
    contentWidth = Math.max(maxX - minX, 100);
    contentHeight = Math.max(maxY - minY, 100);
    contentCenterX = (minX + maxX) / 2;
    contentCenterY = (minY + maxY) / 2;
    const margin = 40;
    const innerW = Math.max(rw - margin * 2, 24);
    const innerH = Math.max(rh - margin * 2, 24);
    const scaleX = innerW / contentWidth;
    const scaleY = innerH / contentHeight;
    autoScale = Math.min(scaleX, scaleY, 3);
    autoScale = Math.max(autoScale, 0.1);

    /**
     * 最小屏幕半径下限必须用「固定参考 zoom」计算。若用当前 zoom 做分母，缩小 zoom 时会抬高 autoScale，
     * 与 dataToScreen 里的 `autoScale * zoom` 相乘后几乎抵消，滚轮/按钮缩放会「失灵」。
     */
    const zBaseline = 1;
    let minScaleForRadii = autoScale;
    for (const p of Object.values(data.projects)) {
      if (!projectVisibleOnCanvas(p)) continue;
      if (p.radius > 0) {
        minScaleForRadii = Math.max(
          minScaleForRadii,
          MIN_PROJECT_SCREEN_RADIUS_PX / (p.radius * zBaseline),
        );
      }
    }
    for (const f of Object.values(data.fields)) {
      if (f.radius > 0) {
        minScaleForRadii = Math.max(
          minScaleForRadii,
          MIN_FIELD_SCREEN_RADIUS_PX / (f.radius * zBaseline),
        );
      }
    }
    autoScale = Math.min(Math.max(autoScale, minScaleForRadii), 8);
  }

  const windowCenterX = rw / 2;
  const windowCenterY = rh / 2;
  const zLay = Math.max(finite(zoom, 1), 0.05);
  const offsetX = windowCenterX - contentCenterX * autoScale * zLay;
  const offsetY = windowCenterY - contentCenterY * autoScale * zLay;

  return {
    contentWidth: Math.max(1, finite(contentWidth, 800)),
    contentHeight: Math.max(1, finite(contentHeight, 600)),
    contentCenterX: finite(contentCenterX, 400),
    contentCenterY: finite(contentCenterY, 400),
    autoScale: Math.min(100, Math.max(1e-4, finite(autoScale, 1))),
    offsetX: finite(offsetX, windowCenterX),
    offsetY: finite(offsetY, windowCenterY),
  };
}

export function dataToScreen(
  x: number,
  y: number,
  layout: VizLayout,
  zoom: number,
  pan: { x: number; y: number },
): [number, number] {
  const z = Math.max(finite(zoom, 1), 0.05);
  const s = finite(layout.autoScale, 1);
  const sx = finite(layout.offsetX, 0) + x * s * z + finite(pan.x, 0);
  const sy = finite(layout.offsetY, 0) + y * s * z + finite(pan.y, 0);
  return [finite(sx, 0), finite(sy, 0)];
}

export function screenToData(
  sx: number,
  sy: number,
  layout: VizLayout,
  zoom: number,
  pan: { x: number; y: number },
): [number, number] {
  const z = Math.max(finite(zoom, 1), 0.05);
  const denom = Math.max(1e-9, finite(layout.autoScale, 1) * z);
  const x = (sx - finite(layout.offsetX, 0) - finite(pan.x, 0)) / denom;
  const y = (sy - finite(layout.offsetY, 0) - finite(pan.y, 0)) / denom;
  return [finite(x, 0), finite(y, 0)];
}

/** 屏幕坐标命中项目圆（用于拖拽连线终点） */
export function hitTestProjectScreen(
  screenX: number,
  screenY: number,
  data: AppDataJson,
  layout: VizLayout,
  zoom: number,
  pan: { x: number; y: number },
): string | null {
  for (const proj of Object.values(data.projects)) {
    if (!projectVisibleOnCanvas(proj)) continue;
    const [sx, sy] = dataToScreen(proj.position[0], proj.position[1], layout, zoom, pan);
    const r = proj.radius * layout.autoScale * zoom;
    if (Math.hypot(screenX - sx, screenY - sy) <= r) return proj.id;
  }
  return null;
}
