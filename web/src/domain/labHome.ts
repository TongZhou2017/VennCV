import type { AppDataJson, Lab, LabStage, LabStageRecord, Person, Project, ProjectAuthorship } from "../types";
import { projectStatusVisual } from "../types";
import { affiliationLabel, formatAuthorName, formatLabStage, personAdvisesLab, personAffiliations, personIsLabHead } from "./authors";
import { articleTypeLabel, projectOnSubmissionTrack } from "./projectTime";

const RESERVED = new Set([
  "assets",
  "favicon.ico",
  "index.html",
  "node_modules",
  "src",
]);

/** 英文名去掉空格和标点，Lei Sun → leisun。没有拉丁字母时用实验室 id。 */
export function labPathSlug(lab: Pick<Lab, "id" | "name" | "name_en">, labs: Record<string, Lab>): string {
  const base = foldLabSlug(lab);
  const twins = Object.values(labs)
    .filter((item) => foldLabSlug(item) === base)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (twins.length <= 1 || twins[0]?.id === lab.id) return base;
  const suffix = lab.id.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return suffix ? `${base}-${suffix}` : base;
}

export function labByPathSlug(labs: Record<string, Lab>, slug: string): Lab | null {
  const key = slug.toLowerCase();
  return Object.values(labs).find((lab) => labPathSlug(lab, labs) === key) ?? null;
}

/** 单独一段的子路径，例如 /leisun。工作区根路径和其他资源路径返回空。 */
export function labSlugFromPath(pathname: string): string | null {
  const raw = pathname.split("?")[0]?.split("#")[0] ?? "";
  const parts = raw.split("/").filter(Boolean);
  if (parts.length !== 1) return null;
  let slug = parts[0] ?? "";
  try {
    slug = decodeURIComponent(slug);
  } catch {
    return null;
  }
  slug = slug.toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) return null;
  if (RESERVED.has(slug) || slug.startsWith("@")) return null;
  return slug;
}

export interface LabHomeMember {
  id: string;
  name: string;
  latin: string;
  role: string;
  orcid: string;
}

export interface LabHomeGroup {
  key: string;
  label: string;
  members: LabHomeMember[];
}

export interface LabHomeProject {
  id: string;
  name: string;
  description: string;
  status: string;
  people: string;
}

export interface LabHomePaper {
  id: string;
  title: string;
  authors: string;
  venue: string;
  year: string;
  url: string;
  kind: string;
}

export interface LabHomeModel {
  id: string;
  title: string;
  english: string;
  color: string;
  path: string;
  groups: LabHomeGroup[];
  research: LabHomeProject[];
  papers: LabHomePaper[];
  addresses: string[];
}

export function buildLabHome(data: AppDataJson, labId: string): LabHomeModel | null {
  const lab = data.labs[labId];
  if (!lab) return null;
  const members = Object.values(data.people)
    .filter((person) => person.lab_ids.includes(labId))
    .sort((a, b) => a.name.localeCompare(b.name, "zh"));
  const memberIds = new Set(members.map((person) => person.id));
  const groups = new Map<string, LabHomeGroup>();
  for (const person of members) {
    const group = memberGroup(person, lab);
    const existing = groups.get(group.key) ?? { key: group.key, label: group.label, members: [] };
    existing.members.push(memberCard(person, lab, data.people));
    groups.set(group.key, existing);
  }
  const ordered = [...groups.values()].sort((a, b) => groupRank(a.key) - groupRank(b.key) || a.label.localeCompare(b.label, "zh"));
  const research: LabHomeProject[] = [];
  const papers: LabHomePaper[] = [];
  const projects = Object.values(data.projects).sort((a, b) => a.name.localeCompare(b.name, "zh"));
  for (const project of projects) {
    if (!projectTouchesLab(data, project, labId, memberIds)) continue;
    if (projectOnSubmissionTrack(project.status)) papers.push(paperCard(data, project));
    else research.push(projectCard(data, project));
  }
  papers.sort((a, b) => b.year.localeCompare(a.year) || a.title.localeCompare(b.title, "zh"));
  return {
    id: lab.id,
    title: lab.name_zh?.trim() || lab.name,
    english: lab.name_en?.trim() || "",
    color: lab.color,
    path: `/${labPathSlug(lab, data.labs)}`,
    groups: ordered,
    research,
    papers,
    addresses: addressLines(members),
  };
}

function foldLabSlug(lab: Pick<Lab, "id" | "name" | "name_en">): string {
  const english = lab.name_en?.trim() ?? "";
  const fromEnglish = english.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (fromEnglish) return fromEnglish.slice(0, 48);
  const fromName = lab.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (fromName) return fromName.slice(0, 48);
  return lab.id.toLowerCase().replace(/[^a-z0-9]+/g, "") || "lab";
}

function memberGroup(person: Person, lab: Lab): { key: string; label: string } {
  const record = person.lab_roles?.find((item) => item.lab_id === lab.id);
  const stages = record?.stages ?? [];
  const trainee = stages.some((stage) => stage !== "pi");
  if (personIsLabHead(person, lab) || stages.includes("pi") || (person.pi && !trainee)) return { key: "pi", label: "PI" };
  const preset = stages
    .map((stage) => presetGroup(stage))
    .filter((item): item is { key: string; label: string } => item !== null)
    .sort((a, b) => groupRank(a.key) - groupRank(b.key))[0];
  if (preset) return preset;
  const tag = record?.tags?.find((item) => item.trim());
  if (tag) return { key: `tag:${tag}`, label: tag };
  return { key: "member", label: "成员" };
}

function presetGroup(stage: LabStage | undefined): { key: string; label: string } | null {
  switch (stage) {
    case "pi":
      return { key: "pi", label: "PI" };
    case "postdoc":
      return { key: "postdoc", label: "博后" };
    case "phd":
      return { key: "phd", label: "博士生" };
    case "master":
      return { key: "master", label: "硕士生" };
    case "assistant":
      return { key: "assistant", label: "科研助理" };
    case undefined:
      return null;
    default: {
      const unreachable: never = stage;
      return unreachable;
    }
  }
}

function groupRank(key: string): number {
  switch (key) {
    case "pi":
      return 0;
    case "postdoc":
      return 1;
    case "phd":
      return 2;
    case "master":
      return 3;
    case "assistant":
      return 4;
    case "member":
      return 100;
    default:
      return 50;
  }
}

function memberCard(person: Person, lab: Lab, people: Record<string, Person>): LabHomeMember {
  const record = person.lab_roles?.find((item) => item.lab_id === lab.id);
  const given = [person.given_name, person.middle_name].map((item) => item?.trim() ?? "").filter(Boolean).join(" ");
  const family = person.family_name?.trim() ?? "";
  const latin = [given, family].filter(Boolean).join(" ");
  const severalAdvisors = Object.values(people).filter((item) => personAdvisesLab(item, lab)).length >= 2;
  const advisor = severalAdvisors && record?.advisor_id ? people[record.advisor_id]?.name ?? "" : "";
  return {
    id: person.id,
    name: person.name,
    latin: /[A-Za-z]/.test(latin) ? latin : "",
    role: memberRole(person, lab, record, advisor),
    orcid: person.orcid?.trim() ?? "",
  };
}

function memberRole(person: Person, lab: Lab, record: LabStageRecord | undefined, advisor: string): string {
  const job = person.job?.trim() ?? "";
  if (personIsLabHead(person, lab)) return job ? `${job} · 实验室负责人` : "实验室负责人";
  const stages = record?.stages ?? [];
  if (person.pi && !stages.some((stage) => stage !== "pi")) return [job, "内部 PI"].filter(Boolean).join(" · ");
  return formatLabStage(record, advisor) || "成员";
}

function projectTouchesLab(data: AppDataJson, project: Project, labId: string, memberIds: Set<string>): boolean {
  return data.authorships.some((link) => link.project_id === project.id && authorshipTouchesLab(link, labId, memberIds));
}

/** 投稿当时记下了这个实验室，或还没记实验室、而作者现在在这里。后来加入的实验室不算这篇投稿。 */
function authorshipTouchesLab(link: ProjectAuthorship, labId: string, memberIds: Set<string>): boolean {
  const roles = link.paper_roles ?? [];
  if (roles.some((role) => role.lab_id === labId)) return true;
  return roles.length === 0 && memberIds.has(link.person_id);
}

function projectCard(data: AppDataJson, project: Project): LabHomeProject {
  return {
    id: project.id,
    name: project.name,
    description: project.description.trim(),
    status: projectStatusVisual(project.status).label,
    people: authorLine(data, project.id),
  };
}

function paperCard(data: AppDataJson, project: Project): LabHomePaper {
  const submissions = project.journal_submissions ?? [];
  const chosen = submissions.find((item) => !item.is_preprint && item.venue.trim()) ?? submissions[0];
  const kind = chosen?.article_type?.trim() ? articleTypeLabel(chosen.article_type) : "";
  const venue = chosen?.venue.trim() ?? "";
  return {
    id: project.id,
    title: project.name,
    authors: authorLine(data, project.id),
    venue: chosen?.is_preprint && venue ? `${venue} 预印本` : venue,
    year: paperYear(project),
    url: chosen?.url.trim() ?? "",
    kind,
  };
}

function authorLine(data: AppDataJson, projectId: string): string {
  return data.authorships
    .filter((link) => link.project_id === projectId)
    .map((link) => {
      const person = data.people[link.person_id];
      if (!person) return "";
      const marks = `${link.co_first ? "†" : ""}${link.corresponding ? "*" : ""}`;
      return `${formatAuthorName(person, "full")}${marks}`;
    })
    .filter(Boolean)
    .join(", ");
}

function paperYear(project: Project): string {
  const milestones = (project.journal_submissions ?? []).flatMap((item) => item.milestones);
  const ranked = milestones
    .map((item) => ({ rank: yearRank(item.kind), year: item.date.slice(0, 4) }))
    .filter((item) => item.rank < 9 && /^\d{4}$/.test(item.year))
    .sort((a, b) => a.rank - b.rank);
  return ranked[0]?.year ?? "";
}

function yearRank(kind: string): number {
  switch (kind) {
    case "Published":
      return 0;
    case "Accepted":
      return 1;
    case "SubmissionStart":
      return 2;
    default:
      return 9;
  }
}

function addressLines(members: Person[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const person of members) {
    for (const item of personAffiliations(person)) {
      const label = affiliationLabel(item);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      lines.push(label);
    }
  }
  return lines;
}
