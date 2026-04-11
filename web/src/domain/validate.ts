import { sanitizeAppDataInPlace } from "./appData";
import { vennNominalFieldRadius } from "./fieldVennLayout";
import { calculateProjectPosition } from "./projectLayout";
import type { AppDataJson, Project, ResearchField } from "../types";

const PI = Math.PI;
const MIN_SPACING = 26;
const ARROW_SPACING = 25;
const PHYSICS_ITERATIONS = 50;
const PHYSICS_ITERATIONS_AFTER_EXPAND = 80;
const DAMPING = 0.8;
const MAX_OUTER_ROUNDS = 12;
const MAX_OVERLAP_EXPAND_ROUNDS = 24;

/** 项目圆边界到领域边界的留白（数据坐标） */
const FIELD_CONTENT_MARGIN = 34;
/** 领域半径上限，避免单域无限膨胀 */
const MAX_FIELD_RADIUS = 480;
/** 两领域圆「嵌入」超过此深度（半径和 − 圆心距）时略推开圆心 */
const MAX_FIELD_OVERLAP_DEPTH = 92;
const FIELD_CENTER_NUDGE = 16;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function isProjectInCorrectRegion(data: AppDataJson, project: Project): boolean {
  const [x, y] = project.position;
  const projectRadius = project.radius;

  if (project.field_ids.length === 0) {
    for (const field of Object.values(data.fields)) {
      const d = dist(x, y, field.position[0], field.position[1]);
      if (d - projectRadius < field.radius) return false;
    }
  } else {
    for (const fieldId of project.field_ids) {
      const field = data.fields[fieldId];
      if (!field) continue;
      const d = dist(x, y, field.position[0], field.position[1]);
      if (d + projectRadius > field.radius - 5) return false;
    }
    for (const field of Object.values(data.fields)) {
      if (project.field_ids.includes(field.id)) continue;
      const d = dist(x, y, field.position[0], field.position[1]);
      if (d - projectRadius < field.radius) return false;
    }
  }
  return true;
}

function findNearestValidPosition(data: AppDataJson, project: Project): [number, number] {
  const [currentX, currentY] = project.position;
  const projectRadius = project.radius;
  const allFields = Object.values(data.fields);

  if (project.field_ids.length === 0) {
    let bestPos: [number, number] = [currentX, currentY];
    let bestDist = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 500; attempt++) {
      const angle = attempt * 0.618 * PI * 2;
      const radius = Math.sqrt(attempt) * 5;
      const x = currentX + radius * Math.cos(angle);
      const y = currentY + radius * Math.sin(angle);
      let outsideAll = true;
      for (const field of allFields) {
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
        if (d < projectRadius + existing.radius + MIN_SPACING) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;
      const dd = dist(x, y, currentX, currentY);
      if (dd < bestDist) {
        bestDist = dd;
        bestPos = [x, y];
        if (dd < 1) break;
      }
    }
    return bestPos;
  }

  const targetFields = project.field_ids
    .map((id) => data.fields[id])
    .filter((f): f is ResearchField => Boolean(f));
  if (targetFields.length === 0) return project.position;

  const nonTargetFields = allFields.filter((f) => !project.field_ids.includes(f.id));

  let bestPos: [number, number] = [currentX, currentY];
  let bestDist = Number.POSITIVE_INFINITY;

  let targetCenterX = 0;
  let targetCenterY = 0;
  for (const field of targetFields) {
    targetCenterX += field.position[0];
    targetCenterY += field.position[1];
  }
  targetCenterX /= targetFields.length;
  targetCenterY /= targetFields.length;

  const minTargetRadius = Math.min(...targetFields.map((f) => f.radius), 100);
  const edgeAngle = Math.atan2(currentY - targetCenterY, currentX - targetCenterX);
  const edgeX = targetCenterX + minTargetRadius * 0.6 * Math.cos(edgeAngle);
  const edgeY = targetCenterY + minTargetRadius * 0.6 * Math.sin(edgeAngle);

  const searchStarts: [number, number][] = [
    [currentX, currentY],
    [edgeX, edgeY],
  ];

  for (const [startX, startY] of searchStarts) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const angle = attempt * 0.618 * PI * 2;
      const radius = Math.sqrt(attempt) * 8;
      const x = startX + radius * Math.cos(angle);
      const y = startY + radius * Math.sin(angle);

      let inAllTargets = true;
      for (const field of targetFields) {
        const d = dist(x, y, field.position[0], field.position[1]);
        if (d + projectRadius > field.radius - 5) {
          inAllTargets = false;
          break;
        }
      }
      if (!inAllTargets) continue;

      let inNonTarget = false;
      for (const field of nonTargetFields) {
        const d = dist(x, y, field.position[0], field.position[1]);
        if (d - projectRadius < field.radius) {
          inNonTarget = true;
          break;
        }
      }
      if (inNonTarget) continue;

      let overlapsProject = false;
      for (const existing of Object.values(data.projects)) {
        if (existing.id === project.id) continue;
        const d = dist(x, y, existing.position[0], existing.position[1]);
        if (d < projectRadius + existing.radius + MIN_SPACING) {
          overlapsProject = true;
          break;
        }
      }
      if (overlapsProject) continue;

      const dd = dist(x, y, currentX, currentY);
      if (dd < bestDist) {
        bestDist = dd;
        bestPos = [x, y];
        if (dd < 1) break;
      }
    }
  }
  return bestPos;
}

/**
 * 仅在「拥挤」相关领域内扩大半径，使归属项目整圆落在领域内（含边距）。
 * `onlyFieldIds` 为空集时不做任何扩容；省略时兼容旧行为（处理全部领域）。
 */
function expandFieldRadiiForAssignedProjects(
  d: AppDataJson,
  onlyFieldIds?: Set<string>,
): boolean {
  if (onlyFieldIds !== undefined && onlyFieldIds.size === 0) return false;
  let changed = false;
  for (const field of Object.values(d.fields)) {
    if (onlyFieldIds !== undefined && !onlyFieldIds.has(field.id)) continue;
    const assigned = Object.values(d.projects).filter((p) => p.field_ids.includes(field.id));
    if (assigned.length === 0) continue;
    const [cx, cy] = field.position;
    let needR = field.radius;
    for (const p of assigned) {
      const dd = dist(p.position[0], p.position[1], cx, cy);
      needR = Math.max(needR, dd + p.radius + FIELD_CONTENT_MARGIN);
    }
    needR = Math.min(MAX_FIELD_RADIUS, needR);
    if (needR > field.radius + 0.5) {
      field.radius = needR;
      changed = true;
    }
  }
  return changed;
}

/** 存在区域非法的项目，或项目圆两两重叠时，涉及领域视为需要扩容 */
function collectCrowdedFieldIds(d: AppDataJson): Set<string> {
  const s = new Set<string>();
  for (const p of Object.values(d.projects)) {
    if (!isProjectInCorrectRegion(d, p)) {
      for (const fid of p.field_ids) s.add(fid);
    }
  }
  const ids = Object.keys(d.projects);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const p1 = d.projects[ids[i]];
      const p2 = d.projects[ids[j]];
      const dlen = dist(p1.position[0], p1.position[1], p2.position[0], p2.position[1]);
      if (dlen >= p1.radius + p2.radius + MIN_SPACING) continue;
      for (const fid of p1.field_ids) s.add(fid);
      for (const fid of p2.field_ids) s.add(fid);
    }
  }
  return s;
}

function allProjectsInValidRegions(d: AppDataJson): boolean {
  return Object.values(d.projects).every((p) => isProjectInCorrectRegion(d, p));
}

function anyFieldRadiusExceedsVennNominal(d: AppDataJson): boolean {
  const n = Object.keys(d.fields).length;
  if (n === 0) return false;
  const nominal = vennNominalFieldRadius(n);
  return Object.values(d.fields).some((f) => f.radius > nominal + 10);
}

/** 领域圆因多次扩容后重叠过深时，沿圆心连线略分离，维持可辨的维恩相交比例 */
function nudgeOverlappingFieldCenters(d: AppDataJson): boolean {
  const fields = Object.values(d.fields);
  if (fields.length < 2) return false;
  let changed = false;
  for (let i = 0; i < fields.length; i++) {
    for (let j = i + 1; j < fields.length; j++) {
      const a = fields[i]!;
      const b = fields[j]!;
      const dx = b.position[0] - a.position[0];
      const dy = b.position[1] - a.position[1];
      const dlen = Math.hypot(dx, dy);
      if (dlen < 1e-6) continue;
      const overlap = a.radius + b.radius - dlen;
      if (overlap <= MAX_FIELD_OVERLAP_DEPTH) continue;
      const extra = overlap - MAX_FIELD_OVERLAP_DEPTH;
      const push = Math.min(FIELD_CENTER_NUDGE, extra * 0.22);
      const nx = dx / dlen;
      const ny = dy / dlen;
      a.position[0] -= nx * push * 0.5;
      a.position[1] -= ny * push * 0.5;
      b.position[0] += nx * push * 0.5;
      b.position[1] += ny * push * 0.5;
      changed = true;
    }
  }
  return changed;
}

export function checkAnyProjectOverlap(data: AppDataJson, minSpacing: number): boolean {
  const ids = Object.keys(data.projects);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const p1 = data.projects[ids[i]];
      const p2 = data.projects[ids[j]];
      const d = dist(p1.position[0], p1.position[1], p2.position[0], p2.position[1]);
      const minDist = p1.radius + p2.radius + minSpacing;
      if (d < minDist) return true;
    }
  }
  return false;
}

/**
 * 与某领域相关的项目对中，最大的「应分开却重叠」深度（数据坐标）。
 * 含跨领域重叠：只要一方归属该领域即计入，与旧版「重叠双方领域各 + 固定值」一致。
 */
function maxOverlapDepthForField(data: AppDataJson, fieldId: string): number {
  const ids = Object.keys(data.projects);
  let maxOv = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const p1 = data.projects[ids[i]]!;
      const p2 = data.projects[ids[j]]!;
      if (!p1.field_ids.includes(fieldId) && !p2.field_ids.includes(fieldId)) continue;
      const dlen = dist(p1.position[0], p1.position[1], p2.position[0], p2.position[1]);
      const minDist = p1.radius + p2.radius + MIN_SPACING;
      if (dlen >= minDist) continue;
      maxOv = Math.max(maxOv, minDist - dlen);
    }
  }
  return maxOv;
}

/**
 * 当项目圆仍重叠时，略扩大相关领域半径，给物理排斥一点空间。
 * 增量按重叠深度估算并设上限，避免固定 +30 在「只需一点空间」时把领域圈撑得过大。
 */
/** @returns 实际扩大半径的领域个数（重叠双方均无领域时为 0） */
function expandFieldsForOverlappingPairs(data: AppDataJson): number {
  const ids = Object.keys(data.projects);
  const fieldIdsToExpand = new Set<string>();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const p1 = data.projects[ids[i]]!;
      const p2 = data.projects[ids[j]]!;
      const dlen = dist(p1.position[0], p1.position[1], p2.position[0], p2.position[1]);
      if (dlen >= p1.radius + p2.radius + MIN_SPACING) continue;
      for (const fid of p1.field_ids) fieldIdsToExpand.add(fid);
      for (const fid of p2.field_ids) fieldIdsToExpand.add(fid);
    }
  }
  let n = 0;
  for (const fid of fieldIdsToExpand) {
    const f = data.fields[fid];
    if (!f) continue;
    const maxOv = maxOverlapDepthForField(data, fid);
    if (maxOv <= 0) continue;
    const bump = Math.min(26, Math.max(4, maxOv * 0.42 + 2));
    const next = Math.min(MAX_FIELD_RADIUS, f.radius + bump);
    if (next > f.radius + 0.5) {
      f.radius = next;
      n += 1;
    }
  }
  return n;
}

function snapInvalidRegions(d: AppDataJson, projectIds: string[]): boolean {
  let changed = false;
  for (const id of projectIds) {
    const project = d.projects[id];
    if (!project) continue;
    if (!isProjectInCorrectRegion(d, project)) {
      const newPos = findNearestValidPosition(d, project);
      d.projects[id] = { ...project, position: newPos };
      changed = true;
    }
  }
  return changed;
}

/** 物理排斥迭代（项目–项目 + 箭头线段避让），返回是否有位置被修改 */
function runPhysicsIterations(d: AppDataJson, projectIds: string[], maxIter: number): boolean {
  let anyChanged = false;
  for (let iter = 0; iter < maxIter; iter++) {
    const forces: Record<string, [number, number]> = {};
    for (const id of projectIds) forces[id] = [0, 0];

    for (let i = 0; i < projectIds.length; i++) {
      for (let j = i + 1; j < projectIds.length; j++) {
        const id1 = projectIds[i];
        const id2 = projectIds[j];
        const p1 = d.projects[id1];
        const p2 = d.projects[id2];
        const dx = p2.position[0] - p1.position[0];
        const dy = p2.position[1] - p1.position[1];
        let distance = Math.hypot(dx, dy);
        if (distance < 1) distance = 1;
        const minDist = p1.radius + p2.radius + MIN_SPACING;
        if (distance < minDist) {
          const overlap = minDist - distance;
          const forceMagnitude = overlap * 0.5;
          const fx = (dx / distance) * forceMagnitude;
          const fy = (dy / distance) * forceMagnitude;
          forces[id1][0] -= fx;
          forces[id1][1] -= fy;
          forces[id2][0] += fx;
          forces[id2][1] += fy;
        }
      }
    }

    const relations = d.relations.map((r) => [r.from_id, r.to_id] as const);
    for (const [fromId, toId] of relations) {
      const fromProj = d.projects[fromId];
      const toProj = d.projects[toId];
      if (!fromProj || !toProj) continue;
      const x1 = fromProj.position[0];
      const y1 = fromProj.position[1];
      const x2 = toProj.position[0];
      const y2 = toProj.position[1];
      for (const id of projectIds) {
        if (id === fromId || id === toId) continue;
        const project = d.projects[id];
        const px = project.position[0];
        const py = project.position[1];
        const threshold = project.radius + ARROW_SPACING;
        const lineLenSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;
        if (lineLenSq <= 1) continue;
        const t = Math.max(
          0,
          Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lineLenSq),
        );
        const nearestX = x1 + t * (x2 - x1);
        const nearestY = y1 + t * (y2 - y1);
        const dx = px - nearestX;
        const dy = py - nearestY;
        let dst = Math.hypot(dx, dy);
        if (dst < 1) dst = 1;
        if (dst < threshold) {
          const overlap = threshold - dst;
          const forceMagnitude = overlap * 0.3;
          const fx = (dx / dst) * forceMagnitude;
          const fy = (dy / dst) * forceMagnitude;
          forces[id][0] += fx;
          forces[id][1] += fy;
        }
      }
    }

    let anyMoved = false;
    for (const id of projectIds) {
      const [fx, fy] = forces[id];
      if (Math.abs(fx) <= 0.1 && Math.abs(fy) <= 0.1) continue;
      const project = d.projects[id];
      let newX = project.position[0] + fx * DAMPING;
      let newY = project.position[1] + fy * DAMPING;
      const temp: Project = { ...project, position: [newX, newY] };
      if (!isProjectInCorrectRegion(d, temp)) {
        temp.position = [newX, project.position[1]];
        if (isProjectInCorrectRegion(d, temp)) {
          newY = project.position[1];
        } else {
          temp.position = [project.position[0], newY];
          if (isProjectInCorrectRegion(d, temp)) {
            newX = project.position[0];
          } else {
            continue;
          }
        }
      }
      d.projects[id] = { ...project, position: [newX, newY] };
      anyMoved = true;
      anyChanged = true;
    }
    if (!anyMoved) break;
  }
  return anyChanged;
}

/**
 * 与 Rust `validate_and_fix_project_positions` 对齐思路，并强调：
 * - 优先只移动项目圆；领域半径保持维恩基准，仅在重叠或区域非法（拥挤）时再扩容。
 * - 维恩相交深度较大时不推开圆心，除非领域已因拥挤明显大于名义维恩半径。
 */
/**
 * 登录/载入工作区或恢复版本快照时使用：保留 JSON 中的项目坐标，仅修复 NaN、无效关系、明显越界；
 * 避免 `validateAndFixProjectPositions` 整图物理迭代导致「每次进入布局被重置」。
 */
export function validateAppDataPreserveUserLayout(data: AppDataJson): AppDataJson {
  const d = JSON.parse(JSON.stringify(data)) as AppDataJson;
  if (!d.deleted_projects || typeof d.deleted_projects !== "object") d.deleted_projects = {};
  else d.deleted_projects = { ...d.deleted_projects };
  for (const id of Object.keys(d.projects)) {
    delete d.deleted_projects[id];
  }
  sanitizeAppDataInPlace(d);
  d.relations = d.relations.filter((r) => d.projects[r.from_id] && d.projects[r.to_id]);
  const projectIds = Object.keys(d.projects);
  for (const id of projectIds) {
    const p = d.projects[id];
    const [x, y] = p.position;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      d.projects[id] = { ...p, position: calculateProjectPosition(d, id) };
    }
  }
  snapInvalidRegions(d, projectIds);
  return d;
}

const DRAG_LAYOUT_PHYSICS_FIRST = 40;
const DRAG_LAYOUT_PHYSICS_SECOND = 24;

/**
 * 连续拖放项目时使用：`validateAndFixProjectPositions` 会反复**扩大领域半径**并**推开领域圆心**，
 * 三圆交集有效区越挤越小，项目被迫重叠，校验与物理迭代加重，最终易闪退。
 * 本函数**绝不修改 `fields`**，仅在固定领域几何下做越界吸附与项目间排斥。
 */
export function validateProjectPositionsWithoutMutatingFields(data: AppDataJson): AppDataJson {
  const d = JSON.parse(JSON.stringify(data)) as AppDataJson;
  if (!d.deleted_projects || typeof d.deleted_projects !== "object") d.deleted_projects = {};
  else d.deleted_projects = { ...d.deleted_projects };
  for (const id of Object.keys(d.projects)) {
    delete d.deleted_projects[id];
  }
  sanitizeAppDataInPlace(d);
  d.relations = d.relations.filter((r) => d.projects[r.from_id] && d.projects[r.to_id]);
  const projectIds = Object.keys(d.projects);
  for (const id of projectIds) {
    const p = d.projects[id];
    const [x, y] = p.position;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      d.projects[id] = { ...p, position: calculateProjectPosition(d, id) };
    }
  }
  snapInvalidRegions(d, projectIds);
  runPhysicsIterations(d, projectIds, DRAG_LAYOUT_PHYSICS_FIRST);
  snapInvalidRegions(d, projectIds);
  runPhysicsIterations(d, projectIds, DRAG_LAYOUT_PHYSICS_SECOND);
  snapInvalidRegions(d, projectIds);
  return d;
}

export function validateAndFixProjectPositions(data: AppDataJson): AppDataJson {
  const d = JSON.parse(JSON.stringify(data)) as AppDataJson;
  const projectIds = Object.keys(d.projects);
  let changed = false;

  changed = snapInvalidRegions(d, projectIds) || changed;
  changed = runPhysicsIterations(d, projectIds, PHYSICS_ITERATIONS) || changed;

  for (let round = 0; round < MAX_OUTER_ROUNDS; round++) {
    if (!checkAnyProjectOverlap(d, MIN_SPACING) && allProjectsInValidRegions(d)) break;

    runPhysicsIterations(d, projectIds, PHYSICS_ITERATIONS_AFTER_EXPAND);
    snapInvalidRegions(d, projectIds);
    if (!checkAnyProjectOverlap(d, MIN_SPACING) && allProjectsInValidRegions(d)) break;

    const crowded = collectCrowdedFieldIds(d);
    if (crowded.size > 0) {
      changed = expandFieldRadiiForAssignedProjects(d, crowded) || changed;
    }
    expandFieldsForOverlappingPairs(d);
    changed = true;

    snapInvalidRegions(d, projectIds);
    changed = runPhysicsIterations(d, projectIds, PHYSICS_ITERATIONS_AFTER_EXPAND) || changed;

    if (!checkAnyProjectOverlap(d, MIN_SPACING) && allProjectsInValidRegions(d)) break;
  }

  let guard = 0;
  while (checkAnyProjectOverlap(d, MIN_SPACING) && guard < MAX_OVERLAP_EXPAND_ROUNDS) {
    const crowded = collectCrowdedFieldIds(d);
    if (crowded.size === 0) {
      runPhysicsIterations(d, projectIds, PHYSICS_ITERATIONS_AFTER_EXPAND);
      snapInvalidRegions(d, projectIds);
      guard += 1;
      continue;
    }
    changed = expandFieldRadiiForAssignedProjects(d, crowded) || changed;
    expandFieldsForOverlappingPairs(d);
    snapInvalidRegions(d, projectIds);
    runPhysicsIterations(d, projectIds, PHYSICS_ITERATIONS_AFTER_EXPAND);
    changed = true;
    guard += 1;
  }

  for (const id of projectIds) {
    const p = d.projects[id];
    if (!p) continue;
    if (!isProjectInCorrectRegion(d, p)) {
      const np = calculateProjectPosition(d, id);
      d.projects[id] = { ...p, position: np };
      changed = true;
    }
  }

  const crowdedFinal = collectCrowdedFieldIds(d);
  if (crowdedFinal.size > 0) {
    changed = expandFieldRadiiForAssignedProjects(d, crowdedFinal) || changed;
  }

  if (anyFieldRadiusExceedsVennNominal(d)) {
    changed = nudgeOverlappingFieldCenters(d) || changed;
  }

  changed = snapInvalidRegions(d, projectIds) || changed;

  for (const id of projectIds) {
    const p = d.projects[id];
    if (!p) continue;
    if (!isProjectInCorrectRegion(d, p)) {
      const np = calculateProjectPosition(d, id);
      d.projects[id] = { ...p, position: np };
      changed = true;
    }
  }

  changed = runPhysicsIterations(d, projectIds, PHYSICS_ITERATIONS) || changed;

  return changed ? d : data;
}
