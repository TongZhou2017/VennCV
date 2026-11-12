import type {
  JournalSubmission,
  Project,
  ProjectStatus,
  SubmissionMilestone,
  SubmissionMilestoneKind,
} from "../types";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

let milestoneSeq = 0;

export function newMilestoneId(): string {
  milestoneSeq += 1;
  return `ms_${Date.now().toString(36)}_${milestoneSeq.toString(36)}`;
}

export function newSubmissionId(): string {
  milestoneSeq += 1;
  return `sub_${Date.now().toString(36)}_${milestoneSeq.toString(36)}`;
}

export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 合法公历 `YYYY-MM-DD`，否则丢掉。 */
export function parseIsoDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = ISO_DATE.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return raw;
}

export type DateTextMeaning =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "date"; iso: string };

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

/** 把直接输入的日期收成 `YYYY-MM-DD`。接受 `2026-3-1`、`2026/3/1`、`2026.3.1`、`2026年3月1日`、`20260301`。 */
export function parseFlexibleDate(raw: string): string | null {
  const text = raw
    .trim()
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[／．。]/g, "/")
    .replace(/\s+/g, "");
  if (!text) return null;
  const digits = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (digits) return parseIsoDate(`${digits[1]}-${digits[2]}-${digits[3]}`);
  const normalized = text.replace(/年/g, "-").replace(/月/g, "-").replace(/日/g, "").replace(/[./]/g, "-");
  const parts = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);
  if (!parts) return null;
  return parseIsoDate(`${parts[1]}-${padDatePart(Number(parts[2]))}-${padDatePart(Number(parts[3]))}`);
}

export function interpretDateText(raw: string): DateTextMeaning {
  const text = raw.trim();
  if (!text) return { kind: "empty" };
  const iso = parseFlexibleDate(text);
  if (!iso) return { kind: "invalid" };
  return { kind: "date", iso };
}

export function coerceSubmissionMilestoneKind(raw: unknown): SubmissionMilestoneKind | null {
  switch (raw) {
    case "SubmissionStart":
    case "Revision":
    case "Accepted":
    case "Published":
    case "Rejected":
    case "Custom":
      return raw;
    default:
      return null;
  }
}

export function submissionMilestoneKindLabel(kind: SubmissionMilestoneKind): string {
  switch (kind) {
    case "SubmissionStart":
      return "开始投稿";
    case "Revision":
      return "返修";
    case "Accepted":
      return "接收";
    case "Published":
      return "发表";
    case "Rejected":
      return "拒稿";
    case "Custom":
      return "自拟";
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export function milestoneDisplayLabel(milestone: SubmissionMilestone): string {
  if (milestone.kind === "Custom") {
    const label = milestone.label.trim();
    return label || "自拟";
  }
  return submissionMilestoneKindLabel(milestone.kind);
}

export function projectOnSubmissionTrack(status: ProjectStatus): boolean {
  return status === "Submitted" || status === "Published";
}

function sanitizeMilestone(raw: unknown, seenIds: Set<string>): SubmissionMilestone | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<SubmissionMilestone>;
  const date = parseIsoDate(item.date);
  const kind = coerceSubmissionMilestoneKind(item.kind);
  if (!date || !kind) return null;
  let id = typeof item.id === "string" ? item.id.trim() : "";
  if (!id || seenIds.has(id)) id = newMilestoneId();
  seenIds.add(id);
  return {
    id,
    kind,
    label: typeof item.label === "string" ? item.label.trim() : "",
    date,
    note: typeof item.note === "string" ? item.note.trim() : "",
  };
}

function sortMilestones(milestones: SubmissionMilestone[]): SubmissionMilestone[] {
  return [...milestones].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

function sanitizeMilestoneList(rawList: unknown, seenIds: Set<string>): SubmissionMilestone[] {
  const list = Array.isArray(rawList) ? rawList : [];
  return sortMilestones(
    list
      .map((item) => sanitizeMilestone(item, seenIds))
      .filter((item): item is SubmissionMilestone => item !== null),
  );
}

function sanitizeExpectedJournal(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().slice(0, 200);
  return text || null;
}

function sanitizeSubmissionUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 2000);
}

function sanitizeJournalSubmission(raw: unknown, seenSubmissionIds: Set<string>, seenMilestoneIds: Set<string>): JournalSubmission | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<JournalSubmission>;
  let id = typeof item.id === "string" ? item.id.trim() : "";
  if (!id || seenSubmissionIds.has(id)) id = newSubmissionId();
  seenSubmissionIds.add(id);
  return {
    id,
    venue: typeof item.venue === "string" ? item.venue.trim() : "",
    is_preprint: item.is_preprint === true,
    url: sanitizeSubmissionUrl(item.url),
    milestones: sanitizeMilestoneList(item.milestones, seenMilestoneIds),
  };
}

export function submissionVenueLabel(submission: JournalSubmission): string {
  const venue = submission.venue.trim();
  if (submission.is_preprint) return venue ? `预印本 · ${venue}` : "预印本";
  return venue || "期刊";
}

export function sanitizeProjectTimes(projects: Record<string, Project>): void {
  for (const project of Object.values(projects)) {
    project.expected_completion_date = parseIsoDate(project.expected_completion_date);
    project.expected_journal = sanitizeExpectedJournal(project.expected_journal);
    const seenMilestoneIds = new Set<string>();
    const seenSubmissionIds = new Set<string>();
    const rawSubmissions = Array.isArray(project.journal_submissions) ? project.journal_submissions : [];
    let submissions = rawSubmissions
      .map((item) => sanitizeJournalSubmission(item, seenSubmissionIds, seenMilestoneIds))
      .filter((item): item is JournalSubmission => item !== null);
    if (submissions.length === 0) {
      const looseMilestones = sanitizeMilestoneList(project.submission_milestones, seenMilestoneIds);
      if (looseMilestones.length > 0) {
        submissions = [
          {
            id: newSubmissionId(),
            venue: "",
            is_preprint: false,
            url: "",
            milestones: looseMilestones,
          },
        ];
      }
    }
    project.journal_submissions = submissions;
    project.submission_milestones = sortMilestones(submissions.flatMap((item) => item.milestones));
  }
}
