import { projectCollisionRadius } from "./authors";
import type { AppDataJson, AuthorDisplayMode } from "../types";

/** 项目碰撞体之间要留出的空隙（数据坐标） */
export const PROJECT_GAP = 26;
/** 项目圆边界到领域边界的留白 */
export const REGION_INSET = 5;
export const MAX_FIELD_RADIUS = 480;
/** 单轮最多把领域半径加大这么多 */
export const FIELD_GROW_PER_ROUND = 26;
const STOP_PENETRATION = 0.35;
const STOP_DISPLACEMENT = 0.15;
const MAX_ITERS = 60;
const MAX_GROW_ROUNDS = 12;

type Body = {
  id: string;
  x: number;
  y: number;
  radius: number;
  fieldIds: string[];
};

type FieldCircle = {
  id: string;
  x: number;
  y: number;
  radius: number;
};

export type LayoutPhysicsOptions = {
  authorDisplay?: AuthorDisplayMode;
  /** 为 false 时只移动项目，不改领域半径 */
  growFields?: boolean;
};

function fieldCircles(data: AppDataJson): FieldCircle[] {
  return Object.values(data.fields).map((field) => ({
    id: field.id,
    x: field.position[0],
    y: field.position[1],
    radius: field.radius,
  }));
}

function buildBodies(data: AppDataJson, mode: AuthorDisplayMode): Body[] {
  const bodies: Body[] = [];
  for (const project of Object.values(data.projects)) {
    if (project.canvas_hidden === true) continue;
    const [x, y] = project.position;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const fieldIds = project.field_ids.filter((id) => data.fields[id]);
    bodies.push({
      id: project.id,
      x,
      y,
      radius: projectCollisionRadius(project, data, mode),
      fieldIds,
    });
  }
  return bodies;
}

function separatePairs(bodies: Body[]): number {
  let maxPenetration = 0;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distance = Math.hypot(dx, dy);
      const minDistance = a.radius + b.radius + PROJECT_GAP;
      if (distance < 1e-4) {
        dx = 1;
        dy = 0;
        distance = 1e-4;
      }
      const penetration = minDistance - distance;
      if (penetration <= 0) continue;
      maxPenetration = Math.max(maxPenetration, penetration);
      const nx = dx / distance;
      const ny = dy / distance;
      const shift = penetration / 2;
      a.x -= nx * shift;
      a.y -= ny * shift;
      b.x += nx * shift;
      b.y += ny * shift;
    }
  }
  return maxPenetration;
}

/** 把越界的法向分量吃掉，切向位移留在坐标里。 */
function projectBodyToRegion(body: Body, fields: FieldCircle[]): number {
  let moved = 0;
  const targets = fields.filter((field) => body.fieldIds.includes(field.id));
  const blocked = body.fieldIds.length === 0 ? fields : fields.filter((field) => !body.fieldIds.includes(field.id));

  for (const field of targets) {
    const dx = body.x - field.x;
    const dy = body.y - field.y;
    const distance = Math.hypot(dx, dy);
    const maxDistance = field.radius - body.radius - REGION_INSET;
    if (maxDistance <= 0) {
      moved += distance;
      body.x = field.x;
      body.y = field.y;
      continue;
    }
    if (distance > maxDistance) {
      const nx = distance < 1e-6 ? 1 : dx / distance;
      const ny = distance < 1e-6 ? 0 : dy / distance;
      const excess = distance - maxDistance;
      body.x -= nx * excess;
      body.y -= ny * excess;
      moved += excess;
    }
  }

  for (const field of blocked) {
    const dx = body.x - field.x;
    const dy = body.y - field.y;
    const distance = Math.hypot(dx, dy);
    const minDistance = field.radius + body.radius;
    if (distance >= minDistance) continue;
    const nx = distance < 1e-6 ? 1 : dx / distance;
    const ny = distance < 1e-6 ? 0 : dy / distance;
    const excess = minDistance - Math.max(distance, 1e-6);
    body.x += nx * excess;
    body.y += ny * excess;
    moved += excess;
  }
  return moved;
}

function solveBodies(bodies: Body[], fields: FieldCircle[]): number {
  let maxPenetration = 0;
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const before = bodies.map((body) => [body.x, body.y] as const);
    maxPenetration = separatePairs(bodies);
    let maxDisplacement = 0;
    for (const body of bodies) {
      maxDisplacement = Math.max(maxDisplacement, projectBodyToRegion(body, fields));
    }
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i]!;
      const origin = before[i]!;
      maxDisplacement = Math.max(maxDisplacement, Math.hypot(body.x - origin[0], body.y - origin[1]));
    }
    if (maxPenetration <= STOP_PENETRATION && maxDisplacement <= STOP_DISPLACEMENT) break;
  }
  return maxPenetration;
}

function writeBodies(data: AppDataJson, bodies: Body[]): void {
  for (const body of bodies) {
    const project = data.projects[body.id];
    if (!project) continue;
    data.projects[body.id] = { ...project, position: [body.x, body.y] };
  }
}

function pairPenetration(a: Body, b: Body): number {
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  return a.radius + b.radius + PROJECT_GAP - distance;
}

/**
 * 只补「还差多少才能放下」。不按被扔到圈外的坐标去追半径。
 * 单轮有上限，总半径不超过 480。
 */
function growFieldsByDeficit(data: AppDataJson, bodies: Body[]): boolean {
  const bumps = new Map<string, number>();
  const note = (fieldId: string, amount: number) => {
    if (!data.fields[fieldId] || amount <= 0.5) return;
    const capped = Math.min(FIELD_GROW_PER_ROUND, amount);
    bumps.set(fieldId, Math.max(bumps.get(fieldId) ?? 0, capped));
  };

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      const penetration = pairPenetration(a, b);
      if (penetration <= STOP_PENETRATION) continue;
      for (const fieldId of a.fieldIds) note(fieldId, penetration);
      for (const fieldId of b.fieldIds) note(fieldId, penetration);
    }
    const body = bodies[i]!;
    for (const fieldId of body.fieldIds) {
      const field = data.fields[fieldId];
      if (!field) continue;
      const need = body.radius + REGION_INSET - field.radius;
      note(fieldId, need);
    }
  }

  let changed = false;
  for (const [fieldId, bump] of bumps) {
    const field = data.fields[fieldId];
    if (!field) continue;
    const next = Math.min(MAX_FIELD_RADIUS, field.radius + bump);
    if (next > field.radius + 0.5) {
      data.fields[fieldId] = { ...field, radius: next };
      changed = true;
    }
  }
  return changed;
}

function refreshFieldCircles(data: AppDataJson, fields: FieldCircle[]): void {
  for (const circle of fields) {
    const field = data.fields[circle.id];
    if (!field) continue;
    circle.radius = field.radius;
    circle.x = field.position[0];
    circle.y = field.position[1];
  }
}

/**
 * 在一份已经复制过的数据上移动可见项目。
 * `growFields` 为 false 时领域半径保持不变。
 */
export function layoutProjectsWithPhysics(data: AppDataJson, options?: LayoutPhysicsOptions): void {
  const mode = options?.authorDisplay ?? "off";
  const grow = options?.growFields === true;
  const fields = fieldCircles(data);
  for (let round = 0; round < (grow ? MAX_GROW_ROUNDS : 1); round++) {
    const bodies = buildBodies(data, mode);
    solveBodies(bodies, fields);
    writeBodies(data, bodies);
    if (!grow) return;
    if (!growFieldsByDeficit(data, bodies)) return;
    refreshFieldCircles(data, fields);
  }
}
