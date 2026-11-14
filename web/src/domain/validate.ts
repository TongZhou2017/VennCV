import { sanitizeAppDataInPlace } from "./appData";
import { calculateProjectPosition } from "./projectLayout";
import { layoutProjectsWithPhysics, type LayoutPhysicsOptions } from "./vennPhysics";
import type { AppDataJson, Project, ResearchField } from "../types";

const PI = Math.PI;
const MIN_SPACING = 26;

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


function prepareWorkspaceCopy(data: AppDataJson): AppDataJson {
  const d = JSON.parse(JSON.stringify(data)) as AppDataJson;
  if (!d.deleted_projects || typeof d.deleted_projects !== "object") d.deleted_projects = {};
  else d.deleted_projects = { ...d.deleted_projects };
  for (const id of Object.keys(d.projects)) {
    delete d.deleted_projects[id];
  }
  sanitizeAppDataInPlace(d);
  d.relations = d.relations.filter((r) => d.projects[r.from_id] && d.projects[r.to_id]);
  for (const id of Object.keys(d.projects)) {
    const project = d.projects[id];
    if (!project) continue;
    const [x, y] = project.position;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      d.projects[id] = { ...project, position: calculateProjectPosition(d, id) };
    }
  }
  return d;
}

/**
 * 登录/载入工作区或恢复版本快照时使用：保留 JSON 中的项目坐标，仅修复 NaN、无效关系、明显越界；
 * 避免整图物理迭代导致「每次进入布局被重置」。
 */
export function validateAppDataPreserveUserLayout(data: AppDataJson): AppDataJson {
  const d = prepareWorkspaceCopy(data);
  snapInvalidRegions(d, Object.keys(d.projects));
  return d;
}

/**
 * 连续拖放项目时使用。只沿领域边界滑开可见项目，绝不修改领域半径。
 */
export function validateProjectPositionsWithoutMutatingFields(
  data: AppDataJson,
  options?: LayoutPhysicsOptions,
): AppDataJson {
  const d = prepareWorkspaceCopy(data);
  const radii = new Map(Object.values(d.fields).map((field) => [field.id, field.radius]));
  const centers = new Map(Object.values(d.fields).map((field) => [field.id, [...field.position] as [number, number]]));
  layoutProjectsWithPhysics(d, { ...options, growFields: false });
  for (const field of Object.values(d.fields)) {
    const radius = radii.get(field.id);
    const center = centers.get(field.id);
    if (radius === undefined || !center) continue;
    d.fields[field.id] = { ...field, radius, position: center };
  }
  return d;
}

/** 领域几何变化时：先滑开项目，放不下再按缺口加大相关领域，半径不超过 480。 */
export function validateAndFixProjectPositions(
  data: AppDataJson,
  options?: LayoutPhysicsOptions,
): AppDataJson {
  const d = prepareWorkspaceCopy(data);
  layoutProjectsWithPhysics(d, { ...options, growFields: true });
  return d;
}
