/**
 * 与 Rust `VennCVApp::calculate_project_position` 对齐：按所属领域为项目计算合理位置。
 */
import type { AppDataJson, ResearchField } from "../types";

const GOLDEN_ANGLE = 2.399963229728653;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function pointNearLineSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  threshold: number,
): boolean {
  const lineLenSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (lineLenSq < 1) return false;
  const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lineLenSq));
  const nx = x1 + t * (x2 - x1);
  const ny = y1 + t * (y2 - y1);
  return Math.hypot(px - nx, py - ny) < threshold;
}

/** 与 Rust 一致：比较领域集合是否变化（忽略顺序） */
export function fieldIdsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export function calculateProjectPosition(data: AppDataJson, projectId: string): [number, number] {
  const project = data.projects[projectId];
  if (!project) return [400, 400];

  const projectRadius = project.radius;
  const fields = Object.values(data.fields);

  if (project.field_ids.length === 0) {
    let maxX = 0;
    let maxY = 0;
    for (const field of fields) {
      maxX = Math.max(maxX, field.position[0] + field.radius);
      maxY = Math.max(maxY, field.position[1] + field.radius);
    }
    const startX = maxX + 50;
    const startY = maxY + 50;
    for (let attempt = 0; attempt < 200; attempt++) {
      const angle = attempt * 0.618 * Math.PI * 2;
      const radius = Math.sqrt(attempt) * 10;
      const x = startX + radius * Math.cos(angle);
      const y = startY + radius * Math.sin(angle);
      let outsideAll = true;
      for (const field of fields) {
        const d = dist(x, y, field.position[0], field.position[1]);
        if (d - projectRadius < field.radius) {
          outsideAll = false;
          break;
        }
      }
      if (!outsideAll) continue;
      let overlaps = false;
      for (const existing of Object.values(data.projects)) {
        if (existing.id === project.id) continue;
        const d = dist(x, y, existing.position[0], existing.position[1]);
        if (d < projectRadius + existing.radius + 26) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) return [x, y];
    }
    return [startX, startY];
  }

  const targetFields: ResearchField[] = [];
  let centerX = 0;
  let centerY = 0;
  for (const fid of project.field_ids) {
    const f = data.fields[fid];
    if (f) {
      targetFields.push(f);
      centerX += f.position[0];
      centerY += f.position[1];
    }
  }
  const fieldCount = targetFields.length;
  if (fieldCount === 0) return [400, 400];

  centerX /= fieldCount;
  centerY /= fieldCount;

  if (fieldCount === 1) {
    const targetField = targetFields[0];
    const otherFields = fields.filter((f) => f.id !== targetField.id);
    const safeMargin = projectRadius + 26;
    const maxSafeRadius = targetField.radius - safeMargin;
    let bestPos: [number, number] | null = null;
    let bestMinDist = 0;
    const maxAttempts = 200;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = attempt * GOLDEN_ANGLE;
      const radiusFactor = 0.8 - (attempt / maxAttempts) * 0.6;
      const r = Math.max(projectRadius + 10, maxSafeRadius * radiusFactor);
      const x = targetField.position[0] + r * Math.cos(angle);
      const y = targetField.position[1] + r * Math.sin(angle);
      const dfc = dist(x, y, targetField.position[0], targetField.position[1]);
      if (dfc > maxSafeRadius) continue;

      let inOther = false;
      for (const other of otherFields) {
        const dto = dist(x, y, other.position[0], other.position[1]);
        if (dto - projectRadius < other.radius) {
          inOther = true;
          break;
        }
      }
      if (inOther) continue;

      let hasOverlap = false;
      let minDistExisting = Number.POSITIVE_INFINITY;
      for (const ep of Object.values(data.projects)) {
        if (ep.id === project.id) continue;
        const d = dist(x, y, ep.position[0], ep.position[1]);
        if (d < projectRadius + ep.radius + 26) {
          hasOverlap = true;
          break;
        }
        minDistExisting = Math.min(minDistExisting, d);
      }
      if (hasOverlap) continue;

      let crossed = false;
      for (const rel of data.relations) {
        if (rel.from_id === project.id || rel.to_id === project.id) continue;
        const from = data.projects[rel.from_id];
        const to = data.projects[rel.to_id];
        if (!from || !to) continue;
        if (
          pointNearLineSegment(
            x,
            y,
            from.position[0],
            from.position[1],
            to.position[0],
            to.position[1],
            projectRadius + 25,
          )
        ) {
          crossed = true;
          break;
        }
      }
      if (crossed) continue;

      if (minDistExisting > bestMinDist) {
        bestMinDist = minDistExisting;
        bestPos = [x, y];
      }
    }

    if (bestPos) return bestPos;

    for (let attempt = 0; attempt < 200; attempt++) {
      const angle = attempt * 0.618 * Math.PI * 2;
      const radius = Math.sqrt(attempt) * 10;
      const x = targetField.position[0] + radius * Math.cos(angle);
      const y = targetField.position[1] + radius * Math.sin(angle);
      const dfc = dist(x, y, targetField.position[0], targetField.position[1]);
      if (dfc + projectRadius > targetField.radius - 5) continue;
      let inOther = false;
      for (const other of otherFields) {
        const dto = dist(x, y, other.position[0], other.position[1]);
        if (dto - projectRadius < other.radius) {
          inOther = true;
          break;
        }
      }
      if (!inOther) return [x, y];
    }
    const [px, py] = project.position;
    if (Number.isFinite(px) && Number.isFinite(py)) return [px, py];
    return [targetField.position[0] + projectRadius + 30, targetField.position[1]];
  }

  const nonTargetFields = fields.filter((f) => !project.field_ids.includes(f.id));

  let ix = centerX;
  let iy = centerY;
  for (let iter = 0; iter < 100; iter++) {
    let moveX = 0;
    let moveY = 0;
    let needMove = false;
    for (const field of targetFields) {
      const dx = ix - field.position[0];
      const dy = iy - field.position[1];
      const d = Math.hypot(dx, dy);
      const maxDist = field.radius - projectRadius - 15;
      if (d > maxDist && d > 0) {
        const ratio = (d - maxDist) / d;
        moveX -= dx * ratio * 0.5;
        moveY -= dy * ratio * 0.5;
        needMove = true;
      }
    }
    for (const nt of nonTargetFields) {
      const dx = ix - nt.position[0];
      const dy = iy - nt.position[1];
      const d = Math.hypot(dx, dy);
      if (d < nt.radius + projectRadius + 26 && d > 0) {
        const push = (nt.radius + projectRadius + 26 - d) / d;
        moveX += dx * push * 0.3;
        moveY += dy * push * 0.3;
        needMove = true;
      }
    }
    if (!needMove) break;
    ix += moveX;
    iy += moveY;
  }

  const baseRadius = 0;
  const maxAttempts = 100;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const angle = attempt * 0.618 * Math.PI * 2;
    const radius = baseRadius + Math.sqrt(attempt) * 8;
    const x = ix + radius * Math.cos(angle);
    const y = iy + radius * Math.sin(angle);

    let inAll = true;
    for (const field of targetFields) {
      const d = dist(x, y, field.position[0], field.position[1]);
      if (d + projectRadius > field.radius - 10) {
        inAll = false;
        break;
      }
    }
    if (!inAll) continue;

    let inNonTarget = false;
    for (const field of fields) {
      if (project.field_ids.includes(field.id)) continue;
      const d = dist(x, y, field.position[0], field.position[1]);
      if (d - projectRadius < field.radius) {
        inNonTarget = true;
        break;
      }
    }
    if (inNonTarget) continue;

    let hasOverlap = false;
    for (const ep of Object.values(data.projects)) {
      if (ep.id === project.id) continue;
      const d = dist(x, y, ep.position[0], ep.position[1]);
      if (d < projectRadius + ep.radius + 26) {
        hasOverlap = true;
        break;
      }
    }
    if (hasOverlap) continue;

    let crossed = false;
    for (const rel of data.relations) {
      if (rel.from_id === project.id || rel.to_id === project.id) continue;
      const from = data.projects[rel.from_id];
      const to = data.projects[rel.to_id];
      if (!from || !to) continue;
      if (
        pointNearLineSegment(
          x,
          y,
          from.position[0],
          from.position[1],
          to.position[0],
          to.position[1],
          projectRadius + 25,
        )
      ) {
        crossed = true;
        break;
      }
    }
    if (crossed) continue;

    return [x, y];
  }

  const [px, py] = project.position;
  if (Number.isFinite(px) && Number.isFinite(py)) return [px, py];
  return [ix + projectRadius + 30, iy];
}

/** 领域维恩几何变化后，按当前 `field_ids` 为每个项目重算位置，避免仅跑整图校验时圆落在错误区域 */
export function recalculateAllProjectPositions(data: AppDataJson): void {
  for (const id of Object.keys(data.projects)) {
    const p = data.projects[id];
    if (!p) continue;
    data.projects[id] = { ...p, position: calculateProjectPosition(data, id) };
  }
}
