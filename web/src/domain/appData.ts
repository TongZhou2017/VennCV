import {
  type AppDataJson,
  type Project,
  type ResearchField,
  coerceProjectStatus,
  coerceRelationType,
} from "../types";

export const DEFAULT_RELATION_COLOR: [number, number, number, number] = [0, 0, 0, 255];
export const DEFAULT_RELATION_WIDTH = 2;

export function defaultEmptyAppData(): AppDataJson {
  return {
    fields: {},
    projects: {},
    relations: [],
    relation_tags: [],
    deleted_projects: {},
    deleted_relation_stash: [],
  };
}

function normalizeDeletedProjects(
  projects: Record<string, Project>,
  raw: Record<string, Project> | undefined,
): Record<string, Project> {
  const out: Record<string, Project> = { ...(raw ?? {}) };
  for (const id of Object.keys(projects)) {
    delete out[id];
  }
  sanitizeProjectCompletion(out);
  sanitizeProjectStatuses(out);
  return out;
}

function sanitizeProjectCompletion(projects: Record<string, Project>): void {
  for (const p of Object.values(projects)) {
    const c = p.completion_percentage;
    if (typeof c !== "number" || !Number.isFinite(c)) {
      p.completion_percentage = 0;
    } else {
      p.completion_percentage = Math.max(0, Math.min(100, c));
    }
  }
}

function sanitizeProjectStatuses(projects: Record<string, Project>): void {
  for (const p of Object.values(projects)) {
    p.status = coerceProjectStatus(p.status);
  }
}

function sanitizeRelationTypes(data: AppDataJson): void {
  for (const r of data.relations) {
    r.relation_type = coerceRelationType(r.relation_type);
  }
  if (data.deleted_relation_stash) {
    for (const r of data.deleted_relation_stash) {
      r.relation_type = coerceRelationType(r.relation_type);
    }
  }
}

/** 提交前就地修正，避免编辑缓冲区或合并数据把非法枚举带回 store 导致渲染崩溃 */
export function sanitizeAppDataInPlace(d: AppDataJson): void {
  sanitizeProjectCompletion(d.projects);
  sanitizeProjectStatuses(d.projects);
  sanitizeRelationTypes(d);
  if (d.deleted_projects && typeof d.deleted_projects === "object") {
    sanitizeProjectCompletion(d.deleted_projects);
    sanitizeProjectStatuses(d.deleted_projects);
  }
}

export function cloneAppData(d: AppDataJson): AppDataJson {
  const copy = JSON.parse(JSON.stringify(d)) as AppDataJson;
  copy.deleted_projects = normalizeDeletedProjects(
    copy.projects,
    copy.deleted_projects,
  );
  if (!Array.isArray(copy.deleted_relation_stash)) {
    copy.deleted_relation_stash = [];
  }
  sanitizeProjectCompletion(copy.projects);
  sanitizeProjectStatuses(copy.projects);
  sanitizeRelationTypes(copy);
  return copy;
}

export function normalizeAppData(raw: unknown): AppDataJson {
  const j = raw as AppDataJson;
  const relations = (j.relations ?? []).map((r) => ({
    ...r,
    tags: r.tags ?? [],
    color: r.color ?? DEFAULT_RELATION_COLOR,
    width: r.width ?? DEFAULT_RELATION_WIDTH,
    relation_type: coerceRelationType(r.relation_type),
  }));
  const projects = { ...(j.projects ?? {}) };
  sanitizeProjectCompletion(projects);
  sanitizeProjectStatuses(projects);
  const deleted_projects = normalizeDeletedProjects(
    projects,
    j.deleted_projects as Record<string, Project> | undefined,
  );
  const deleted_relation_stash = (j.deleted_relation_stash ?? []).map((r) => ({
    ...r,
    tags: r.tags ?? [],
    color: r.color ?? DEFAULT_RELATION_COLOR,
    width: r.width ?? DEFAULT_RELATION_WIDTH,
    relation_type: coerceRelationType(r.relation_type),
  }));
  return {
    fields: j.fields ?? {},
    projects,
    relations,
    relation_tags: j.relation_tags ?? [],
    deleted_projects,
    deleted_relation_stash,
  };
}

/** 与 Rust `merge_import_json` 一致：合并导入，关系按 (from,to) 去重 */
export function mergeImportJson(current: AppDataJson, content: string): AppDataJson {
  let imported: AppDataJson;
  try {
    imported = normalizeAppData(JSON.parse(content));
  } catch {
    return current;
  }
  const next = cloneAppData(current);
  for (const [id, p] of Object.entries(imported.projects)) {
    next.projects[id] = p;
    if (next.deleted_projects?.[id]) delete next.deleted_projects[id];
  }
  for (const [id, f] of Object.entries(imported.fields)) {
    next.fields[id] = f;
  }
  for (const relation of imported.relations) {
    const dup = next.relations.some(
      (r) => r.from_id === relation.from_id && r.to_id === relation.to_id,
    );
    if (!dup) next.relations.push(relation);
  }
  next.deleted_projects = normalizeDeletedProjects(
    next.projects,
    { ...next.deleted_projects, ...(imported.deleted_projects ?? {}) },
  );
  next.deleted_relation_stash = [
    ...(next.deleted_relation_stash ?? []),
    ...(imported.deleted_relation_stash ?? []),
  ];
  return next;
}

export function allocNewFieldId(fields: Record<string, ResearchField>): string {
  const keys = Object.keys(fields);
  let maxSuffix = 0;
  for (const k of keys) {
    const m = /^field_(\d+)$/.exec(k);
    if (m) maxSuffix = Math.max(maxSuffix, Number(m[1]));
  }
  let n = Math.max(maxSuffix + 1, 1);
  for (;;) {
    const id = `field_${n}`;
    if (!fields[id]) return id;
    n += 1;
  }
}

export function appDataToExportJson(data: AppDataJson): string {
  const payload: Record<string, unknown> = {
    fields: data.fields,
    projects: data.projects,
    relations: data.relations,
    relation_tags: data.relation_tags,
  };
  if (data.deleted_projects && Object.keys(data.deleted_projects).length > 0) {
    payload.deleted_projects = data.deleted_projects;
  }
  if (data.deleted_relation_stash && data.deleted_relation_stash.length > 0) {
    payload.deleted_relation_stash = data.deleted_relation_stash;
  }
  return JSON.stringify(payload, null, 2);
}
