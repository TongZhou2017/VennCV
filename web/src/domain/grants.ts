import type { AppDataJson, FundingAward, Grant, GrantPhase, JournalSubmission, Project } from "../types";
import { articleTypeLabel } from "./projectTime";

export const REPRESENTATIVE_CAP = 5;
export const FOUNDATION_CAP = 24;

let grantSeq = 0;

export function newGrantId(): string {
  grantSeq += 1;
  return `grant_${Date.now().toString(36)}_${grantSeq.toString(36)}`;
}

export function workKey(projectId: string, submissionId: string): string {
  return `${projectId}/${submissionId}`;
}

export function grantPhaseLabel(phase: GrantPhase): string {
  switch (phase) {
    case "proposal":
      return "申报";
    case "active":
      return "在研";
    case "closed":
      return "结题";
    default: {
      const unexpected: never = phase;
      return unexpected;
    }
  }
}

export function coerceGrantPhase(raw: unknown): GrantPhase {
  if (raw === "proposal" || raw === "active" || raw === "closed") return raw;
  return "proposal";
}

export interface CatalogWork {
  key: string;
  projectId: string;
  submissionId: string;
  projectName: string;
  venue: string;
  preprint: boolean;
  url: string;
  articleType: string;
  publishedOn: string;
  awards: FundingAward[];
}

function compactNumber(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

function publishedOn(submission: JournalSubmission): string {
  const dated = submission.milestones
    .filter((item) => item.kind === "Published" && item.date)
    .map((item) => item.date)
    .sort();
  return dated[0] ?? "";
}

/** 主列表里带名称或链接的投稿。回收站不进入基金。 */
export function catalogWorks(data: { projects: Record<string, Project> }): CatalogWork[] {
  const works: CatalogWork[] = [];
  const projects = Object.values(data.projects).sort((a, b) => a.name.localeCompare(b.name, "zh"));
  for (const project of projects) {
    for (const submission of project.journal_submissions ?? []) {
      if (!submission.venue.trim() && !submission.url.trim()) continue;
      works.push(workFrom(project, submission));
    }
  }
  return works;
}

function workFrom(project: Project, submission: JournalSubmission): CatalogWork {
  return {
    key: workKey(project.id, submission.id),
    projectId: project.id,
    submissionId: submission.id,
    projectName: project.name,
    venue: submission.venue.trim(),
    preprint: submission.is_preprint,
    url: submission.url.trim(),
    articleType: submission.article_type?.trim() ? articleTypeLabel(submission.article_type) : "",
    publishedOn: publishedOn(submission),
    awards: submission.awards ?? [],
  };
}

export function workLabel(work: CatalogWork): string {
  const venue = work.venue || (work.preprint ? "预印本" : "期刊");
  const kind = work.articleType ? ` · ${work.articleType}` : "";
  return `${work.projectName} · ${venue}${kind}`;
}

/** 结题只计正式发表，并且基金号完全一致。空号不对上任何文章。 */
export function publicationsForGrant(number: string, works: CatalogWork[]): CatalogWork[] {
  const key = compactNumber(number);
  if (!key) return [];
  return works.filter(
    (work) => !work.preprint && work.awards.some((award) => compactNumber(award.number) === key),
  );
}

export function unmatchedAwardNumbers(
  works: CatalogWork[],
  grants: Record<string, Grant>,
): Array<{ number: string; funder: string }> {
  const used = new Set(
    Object.values(grants)
      .map((grant) => compactNumber(grant.number))
      .filter(Boolean),
  );
  const seen = new Map<string, { number: string; funder: string }>();
  for (const work of works) {
    if (work.preprint) continue;
    for (const award of work.awards) {
      const key = compactNumber(award.number);
      if (!key || used.has(key) || seen.has(key)) continue;
      seen.set(key, { number: award.number.trim(), funder: award.funder.trim() });
    }
  }
  return [...seen.values()];
}

export function toggleWorkKey(keys: string[], key: string, cap: number): string[] {
  if (keys.includes(key)) return keys.filter((item) => item !== key);
  if (keys.length >= cap) return keys;
  return [...keys, key];
}

function cleanKeys(raw: unknown, known: Set<string>, cap: number): string[] {
  if (!Array.isArray(raw)) return [];
  const keys: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !known.has(item) || keys.includes(item)) continue;
    keys.push(item);
    if (keys.length >= cap) break;
  }
  return keys;
}

export function sanitizeGrantsInPlace(data: AppDataJson): void {
  const known = new Set(catalogWorks(data).map((work) => work.key));
  const grants: Record<string, Grant> = {};
  const raw = data.grants;
  if (raw && typeof raw === "object") {
    for (const item of Object.values(raw)) {
      if (!item || typeof item !== "object") continue;
      const row = item as Partial<Grant>;
      const id = typeof row.id === "string" ? row.id.trim() : "";
      if (!id || grants[id]) continue;
      grants[id] = {
        id,
        name: typeof row.name === "string" ? row.name.trim().replace(/\s+/g, " ").slice(0, 80) : "",
        number: typeof row.number === "string" ? row.number.trim().replace(/\s+/g, "").slice(0, 40) : "",
        funder: typeof row.funder === "string" ? row.funder.trim().replace(/\s+/g, " ").slice(0, 80) : "",
        phase: coerceGrantPhase(row.phase),
        representative_keys: cleanKeys(row.representative_keys, known, REPRESENTATIVE_CAP),
        foundation_keys: cleanKeys(row.foundation_keys, known, FOUNDATION_CAP),
      };
      if (Object.keys(grants).length >= 40) break;
    }
  }
  data.grants = grants;
}
