import type {
  AppDataJson,
  AuthorDisplayMode,
  AuthorNameStyle,
  CreditRole,
  Lab,
  Person,
  Project,
  ProjectAuthorship,
  ProjectStatus,
} from "../types";
import { coerceAuthorRole, coerceProjectStatus } from "../types";
import { effectiveCompletion } from "./progress";

export const LAB_COLOR_PALETTE = ["#5c6bc0", "#00897b", "#8e24aa", "#ef6c00", "#c62828", "#1565c0"];
export const UNASSIGNED_LAB_COLOR = "#9e9e9e";
const LAB_COLOR = /^#[0-9a-fA-F]{6}$/;
const SATELLITE_GAP = 3;

export const CREDIT_ROLES: CreditRole[] = [
  "Conceptualization",
  "DataCuration",
  "FormalAnalysis",
  "FundingAcquisition",
  "Investigation",
  "Methodology",
  "ProjectAdministration",
  "Resources",
  "Software",
  "Supervision",
  "Validation",
  "Visualization",
  "WritingOriginalDraft",
  "WritingReviewEditing",
];

export type AuthorTableSort = "position" | "lab" | "credit";

export function creditRoleLabel(role: CreditRole): string {
  switch (role) {
    case "Conceptualization":
      return "概念构思";
    case "DataCuration":
      return "数据管理";
    case "FormalAnalysis":
      return "形式分析";
    case "FundingAcquisition":
      return "获取资助";
    case "Investigation":
      return "调查研究";
    case "Methodology":
      return "研究方法";
    case "ProjectAdministration":
      return "项目管理";
    case "Resources":
      return "资源提供";
    case "Software":
      return "软件";
    case "Supervision":
      return "监督指导";
    case "Validation":
      return "验证";
    case "Visualization":
      return "可视化";
    case "WritingOriginalDraft":
      return "初稿撰写";
    case "WritingReviewEditing":
      return "审阅与编辑";
    default: {
      const unexpected: never = role;
      return unexpected;
    }
  }
}

export function creditRoleLabelEn(role: CreditRole): string {
  switch (role) {
    case "Conceptualization":
      return "Conceptualization";
    case "DataCuration":
      return "Data curation";
    case "FormalAnalysis":
      return "Formal analysis";
    case "FundingAcquisition":
      return "Funding acquisition";
    case "Investigation":
      return "Investigation";
    case "Methodology":
      return "Methodology";
    case "ProjectAdministration":
      return "Project administration";
    case "Resources":
      return "Resources";
    case "Software":
      return "Software";
    case "Supervision":
      return "Supervision";
    case "Validation":
      return "Validation";
    case "Visualization":
      return "Visualization";
    case "WritingOriginalDraft":
      return "Writing – original draft";
    case "WritingReviewEditing":
      return "Writing – review & editing";
    default: {
      const unexpected: never = role;
      return unexpected;
    }
  }
}

function creditRank(role: CreditRole): number {
  const index = CREDIT_ROLES.indexOf(role);
  return index < 0 ? CREDIT_ROLES.length : index;
}

function coerceCreditRoles(raw: unknown): CreditRole[] {
  if (!Array.isArray(raw)) return [];
  const found = new Set<CreditRole>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    if ((CREDIT_ROLES as readonly string[]).includes(item)) found.add(item as CreditRole);
  }
  return CREDIT_ROLES.filter((role) => found.has(role));
}

export function authorShortName(name: string): string {
  return [...name.trim()].slice(0, 2).join("");
}

export function sanitizeLabColor(raw: unknown): string {
  if (typeof raw === "string" && LAB_COLOR.test(raw.trim())) return raw.trim().toLowerCase();
  return LAB_COLOR_PALETTE[0];
}

export function nextCatalogId(prefix: "lab" | "person", existing: Record<string, unknown>): string {
  let n = 1;
  for (;;) {
    const id = `${prefix}_${n}`;
    if (!existing[id]) return id;
    n += 1;
  }
}

export function nextLabColor(labs: Record<string, Lab>): string {
  return LAB_COLOR_PALETTE[Object.keys(labs).length % LAB_COLOR_PALETTE.length];
}

function readLabIds(raw: { lab_id?: unknown; lab_ids?: unknown }, labs: Record<string, Lab>): string[] {
  const ids: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== "string" || !labs[value] || ids.includes(value)) return;
    ids.push(value);
  };
  if (Array.isArray(raw.lab_ids)) {
    for (const id of raw.lab_ids) push(id);
  }
  push(raw.lab_id);
  return ids;
}

/** 读入和保存前就地补齐。旧的单一实验室和作者角色会转成多实验室、位次和通讯标记。 */
export function sanitizeAuthorsInPlace(data: AppDataJson): void {
  const labsIn = data.labs && typeof data.labs === "object" ? data.labs : {};
  const labs: Record<string, Lab> = {};
  for (const [key, raw] of Object.entries(labsIn)) {
    if (!raw || typeof raw !== "object") continue;
    const name = String(raw.name ?? "").trim().slice(0, 80);
    if (!name || !key) continue;
    labs[key] = { id: key, name, color: sanitizeLabColor(raw.color) };
  }
  data.labs = labs;

  const peopleIn = data.people && typeof data.people === "object" ? data.people : {};
  const people: Record<string, Person> = {};
  for (const [key, value] of Object.entries(peopleIn)) {
    const raw = value as {
      name?: unknown;
      lab_id?: unknown;
      lab_ids?: unknown;
      family_name?: unknown;
      given_name?: unknown;
    };
    if (!raw || typeof raw !== "object") continue;
    const name = String(raw.name ?? "").trim().slice(0, 80);
    if (!name || !key) continue;
    people[key] = {
      id: key,
      name,
      lab_ids: readLabIds(raw, labs),
      family_name: String(raw.family_name ?? "").trim().slice(0, 40),
      given_name: String(raw.given_name ?? "").trim().slice(0, 40),
    };
  }
  data.people = people;

  const seen = new Set<string>();
  const drafts: Array<ProjectAuthorship & { legacyFirst: boolean }> = [];
  const list = Array.isArray(data.authorships) ? data.authorships : [];
  for (const value of list) {
    const raw = value as {
      project_id?: unknown;
      person_id?: unknown;
      role?: unknown;
      position?: unknown;
      corresponding?: unknown;
      credit_roles?: unknown;
      primary?: unknown;
      responsibility?: unknown;
    };
    if (!raw || typeof raw !== "object") continue;
    const projectId = String(raw.project_id ?? "");
    const personId = String(raw.person_id ?? "");
    if (!people[personId]) continue;
    const projectKnown = Boolean(data.projects[projectId] || data.deleted_projects?.[projectId]);
    if (!projectKnown) continue;
    const key = `${projectId}\0${personId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const legacy = coerceAuthorRole(raw.role);
    const explicitPosition = Number(raw.position);
    const hasPosition = Number.isFinite(explicitPosition) && explicitPosition >= 1;
    const corresponding =
      raw.corresponding === true || (raw.corresponding === undefined && legacy === "Corresponding");
    drafts.push({
      project_id: projectId,
      person_id: personId,
      position: hasPosition ? Math.min(999, Math.round(explicitPosition)) : 0,
      corresponding,
      credit_roles: coerceCreditRoles(raw.credit_roles),
      primary: raw.primary === true,
      responsibility: String(raw.responsibility ?? "").trim().slice(0, 200),
      legacyFirst: !hasPosition && legacy === "First",
    });
  }

  const byProject = new Map<string, Array<ProjectAuthorship & { legacyFirst: boolean }>>();
  for (const draft of drafts) {
    const group = byProject.get(draft.project_id) ?? [];
    group.push(draft);
    byProject.set(draft.project_id, group);
  }
  const authorships: ProjectAuthorship[] = [];
  for (const group of byProject.values()) {
    const placed = group.filter((item) => item.position > 0).sort((a, b) => a.position - b.position);
    const pending = group.filter((item) => item.position <= 0);
    pending.sort((a, b) => Number(b.legacyFirst) - Number(a.legacyFirst));
    const used = new Set(placed.map((item) => item.position));
    let next = 1;
    for (const item of pending) {
      while (used.has(next)) next += 1;
      item.position = next;
      used.add(next);
      next += 1;
    }
    for (const item of [...placed, ...pending].sort((a, b) => a.position - b.position)) {
      authorships.push({
        project_id: item.project_id,
        person_id: item.person_id,
        position: item.position,
        corresponding: item.corresponding,
        credit_roles: item.credit_roles,
        primary: item.primary,
        responsibility: item.responsibility,
      });
    }
  }
  data.authorships = authorships;
}

export interface AuthorSatellite {
  personId: string;
  name: string;
  shortName: string;
  color: string;
  dx: number;
  dy: number;
  radius: number;
}

export function projectAuthorSatellites(
  project: Pick<Project, "id" | "radius">,
  data: Pick<AppDataJson, "people" | "labs" | "authorships">,
  mode: AuthorDisplayMode,
): AuthorSatellite[] {
  if (mode === "off") return [];
  const links = data.authorships
    .filter((link) => link.project_id === project.id && data.people[link.person_id])
    .filter((link) => mode === "all" || link.primary)
    .slice()
    .sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      const byName = data.people[a.person_id].name.localeCompare(data.people[b.person_id].name, "zh");
      if (byName !== 0) return byName;
      return a.person_id.localeCompare(b.person_id);
    });
  if (links.length === 0) return [];
  const radius = Math.max(6, Math.min(11, project.radius * 0.42));
  const ring = project.radius + SATELLITE_GAP + radius;
  return links.map((link, index) => {
    const person = data.people[link.person_id];
    const lab = person.lab_ids.map((id) => data.labs[id]).find((item) => item);
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / links.length;
    return {
      personId: person.id,
      name: person.name,
      shortName: authorShortName(person.name),
      color: lab?.color ?? UNASSIGNED_LAB_COLOR,
      dx: Math.cos(angle) * ring,
      dy: Math.sin(angle) * ring,
      radius,
    };
  });
}

export interface PersonProjectProgress {
  projectId: string;
  name: string;
  status: ProjectStatus;
  completion: number;
  responsibility: string;
}

export function personProjectProgress(data: AppDataJson, personId: string): PersonProjectProgress[] {
  const rows: PersonProjectProgress[] = [];
  for (const link of data.authorships) {
    if (link.person_id !== personId) continue;
    const project = data.projects[link.project_id];
    if (!project) continue;
    rows.push({
      projectId: project.id,
      name: project.name,
      status: coerceProjectStatus(project.status),
      completion: effectiveCompletion(project),
      responsibility: link.responsibility,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, "zh") || a.projectId.localeCompare(b.projectId));
  return rows;
}

function nameParts(person: Person): { family: string; given: string } {
  const family = person.family_name.trim();
  const given = person.given_name.trim();
  if (family || given) return { family: family || person.name.trim(), given };
  const name = person.name.trim();
  const spaced = name.split(/\s+/).filter(Boolean);
  if (spaced.length >= 2) return { family: spaced[0] ?? "", given: spaced.slice(1).join(" ") };
  const chars = [...name];
  const han = chars.length >= 2 && chars.every((ch) => /\p{Script=Han}/u.test(ch));
  if (han) return { family: chars[0] ?? "", given: chars.slice(1).join("") };
  return { family: name, given: "" };
}

function latinInitials(given: string): string {
  const letters: string[] = [];
  for (const part of given.split(/[\s-]+/).filter(Boolean)) {
    const first = [...part][0];
    if (!first || !/[A-Za-z]/.test(first)) return "";
    letters.push(first.toUpperCase());
  }
  return letters.join("");
}

export function formatAuthorName(person: Person, style: AuthorNameStyle): string {
  const full = person.name.trim();
  switch (style) {
    case "full":
      return full;
    case "familyInitials":
    case "initialsFamily": {
      const { family, given } = nameParts(person);
      const initials = latinInitials(given);
      if (!family || !initials) return full;
      if (style === "familyInitials") return `${family} ${initials}`;
      return `${initials} ${family}`;
    }
    default: {
      const unexpected: never = style;
      return unexpected;
    }
  }
}

export function labSortKey(person: Person, labs: Record<string, Lab>): string {
  return person.lab_ids
    .map((id) => labs[id]?.name ?? "")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "zh"))
    .join("、");
}

export function creditSortKey(roles: CreditRole[]): string {
  return [...roles]
    .sort((a, b) => creditRank(a) - creditRank(b))
    .map((role) => creditRoleLabel(role))
    .join("、");
}

export function sortProjectAuthors(
  links: ProjectAuthorship[],
  data: Pick<AppDataJson, "people" | "labs">,
  sort: AuthorTableSort,
): ProjectAuthorship[] {
  const copy = links.slice();
  copy.sort((a, b) => {
    const personA = data.people[a.person_id];
    const personB = data.people[b.person_id];
    const byPosition = a.position - b.position || a.person_id.localeCompare(b.person_id);
    if (!personA || !personB) return byPosition;
    switch (sort) {
      case "position":
        return byPosition;
      case "lab": {
        const byLab = labSortKey(personA, data.labs).localeCompare(labSortKey(personB, data.labs), "zh");
        return byLab || byPosition;
      }
      case "credit": {
        const rankA = a.credit_roles.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...a.credit_roles.map(creditRank));
        const rankB = b.credit_roles.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...b.credit_roles.map(creditRank));
        const byCredit = rankA - rankB || creditSortKey(a.credit_roles).localeCompare(creditSortKey(b.credit_roles), "zh");
        return byCredit || byPosition;
      }
      default: {
        const unexpected: never = sort;
        return unexpected;
      }
    }
  });
  return copy;
}

/** 按位次导出。原名用中文 CRediT；缩写用英文 CRediT。通讯作者名后加 *。 */
export function authorContributionText(
  data: Pick<AppDataJson, "people" | "authorships">,
  projectId: string,
  style: AuthorNameStyle,
): string {
  const links = data.authorships
    .filter((link) => link.project_id === projectId && data.people[link.person_id])
    .slice()
    .sort((a, b) => a.position - b.position || a.person_id.localeCompare(b.person_id));
  const english = style !== "full";
  const parts = links.map((link) => {
    const person = data.people[link.person_id];
    const name = `${formatAuthorName(person, style)}${link.corresponding ? "*" : ""}`;
    const roles = [...link.credit_roles]
      .sort((a, b) => creditRank(a) - creditRank(b))
      .map((role) => (english ? creditRoleLabelEn(role) : creditRoleLabel(role)));
    const roleText = roles.length > 0 ? roles.join(english ? ", " : "、") : english ? "Contribution not specified" : "未填写贡献";
    return english ? `${name}: ${roleText}` : `${name}：${roleText}`;
  });
  if (parts.length === 0) return "";
  return english ? `${parts.join("; ")}.` : `${parts.join("；")}。`;
}

export interface CollabNode {
  personId: string;
  name: string;
  labId: string | null;
  labName: string;
  color: string;
  x: number;
  y: number;
}

export interface CollabEdge {
  a: string;
  b: string;
  shared: number;
}

export interface CollaborationModel {
  nodes: CollabNode[];
  edges: CollabEdge[];
}

/** 只统计还在主列表里的项目。同一对人物的边粗细等于共同项目数。 */
export function buildCollaborationLayout(data: AppDataJson): CollaborationModel {
  const active = new Set(Object.keys(data.projects));
  const involved = new Set<string>();
  const peopleByProject = new Map<string, string[]>();
  for (const link of data.authorships) {
    if (!active.has(link.project_id) || !data.people[link.person_id]) continue;
    involved.add(link.person_id);
    const list = peopleByProject.get(link.project_id) ?? [];
    if (!list.includes(link.person_id)) list.push(link.person_id);
    peopleByProject.set(link.project_id, list);
  }

  const weight = new Map<string, number>();
  for (const ids of peopleByProject.values()) {
    const sorted = [...ids].sort();
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const key = `${sorted[i]}\0${sorted[j]}`;
        weight.set(key, (weight.get(key) ?? 0) + 1);
      }
    }
  }

  const groups = new Map<string, string[]>();
  for (const personId of involved) {
    const person = data.people[personId];
    const knownLabs = person.lab_ids.filter((id) => data.labs[id]).sort();
    const labKey = knownLabs.join("|");
    const list = groups.get(labKey) ?? [];
    list.push(personId);
    groups.set(labKey, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => data.people[a].name.localeCompare(data.people[b].name, "zh") || a.localeCompare(b));
  }
  const groupKeys = [...groups.keys()].sort((a, b) => {
    const an = a ? (data.labs[a]?.name ?? a) : "未归入实验室";
    const bn = b ? (data.labs[b]?.name ?? b) : "未归入实验室";
    return an.localeCompare(bn, "zh") || a.localeCompare(b);
  });

  const clusterDistance = groupKeys.length <= 1 ? 0 : 220;
  const nodes: CollabNode[] = [];
  groupKeys.forEach((labKey, groupIndex) => {
    const members = groups.get(labKey) ?? [];
    const groupAngle = -Math.PI / 2 + (2 * Math.PI * groupIndex) / Math.max(groupKeys.length, 1);
    const gx = Math.cos(groupAngle) * clusterDistance;
    const gy = Math.sin(groupAngle) * clusterDistance;
    const inner = members.length <= 1 ? 0 : 36 + members.length * 8;
    members.forEach((personId, personIndex) => {
      const angle = members.length <= 1 ? 0 : -Math.PI / 2 + (2 * Math.PI * personIndex) / members.length;
      const person = data.people[personId];
      const knownLabs = person.lab_ids.map((id) => data.labs[id]).filter((lab) => lab);
      const lab = knownLabs[0];
      nodes.push({
        personId,
        name: person.name,
        labId: lab?.id ?? null,
        labName: knownLabs.length > 0 ? knownLabs.map((item) => item.name).join("、") : "未归入实验室",
        color: lab?.color ?? UNASSIGNED_LAB_COLOR,
        x: gx + Math.cos(angle) * inner,
        y: gy + Math.sin(angle) * inner,
      });
    });
  });

  const edges: CollabEdge[] = [];
  for (const [key, shared] of weight) {
    const [a, b] = key.split("\0");
    if (!a || !b || !involved.has(a) || !involved.has(b)) continue;
    edges.push({ a, b, shared });
  }
  edges.sort((left, right) => left.a.localeCompare(right.a) || left.b.localeCompare(right.b));
  nodes.sort((left, right) => left.personId.localeCompare(right.personId));
  return { nodes, edges };
}
