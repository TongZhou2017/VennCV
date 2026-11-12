import { loadUserConfig, resolveWorkspaceStorageKey } from "./config";
import { readRememberUntil } from "./rememberLogin";
import { readStorage } from "./fs";
import {
  PROJECT_STATUS_META,
  coerceProjectStatus,
  type ProjectStatus,
} from "../types";

const STATUS_ORDER: ProjectStatus[] = [
  "Published",
  "Submitted",
  "HighPriority",
  "SteadyProgress",
  "ToBeStarted",
];

const PLACEHOLDER_NAME = "新项目";
const NAMED_PREVIEW_LIMIT = 12;

export type StatusCount = {
  status: ProjectStatus;
  label: string;
  count: number;
};

export type UserWorkspaceSummary = {
  username: string;
  projectCount: number;
  fieldNames: string[];
  previewNames: string[];
  /** 空名称或仍叫「新项目」的数量 */
  placeholderCount: number;
  /** 已命名但没有放进预览的数量 */
  namedHiddenCount: number;
  statusCounts: StatusCount[];
  workspaceFile: string;
  needsPassword: boolean;
  /** 免密码登录的到期时间；没有或已过期时为 null */
  rememberedUntil: number | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function textField(value: unknown, key: string): string {
  const record = asRecord(value);
  const raw = record[key];
  return typeof raw === "string" ? raw.trim() : "";
}

export function summarizeWorkspaceJson(raw: string | null): Omit<
  UserWorkspaceSummary,
  "username" | "workspaceFile" | "needsPassword" | "rememberedUntil"
> {
  const empty = {
    projectCount: 0,
    fieldNames: [] as string[],
    previewNames: [] as string[],
    placeholderCount: 0,
    namedHiddenCount: 0,
    statusCounts: [] as StatusCount[],
  };
  if (!raw) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  const data = asRecord(parsed);
  const projects = Object.values(asRecord(data.projects));
  const fields = Object.values(asRecord(data.fields));
  const counts = new Map<ProjectStatus, number>();
  const previewNames: string[] = [];
  const seen = new Set<string>();
  let placeholderCount = 0;
  let namedCount = 0;

  for (const project of projects) {
    const status = coerceProjectStatus(asRecord(project).status);
    counts.set(status, (counts.get(status) ?? 0) + 1);
    const name = textField(project, "name");
    if (!name || name === PLACEHOLDER_NAME) {
      placeholderCount += 1;
      continue;
    }
    namedCount += 1;
    if (seen.has(name)) continue;
    seen.add(name);
    if (previewNames.length < NAMED_PREVIEW_LIMIT) previewNames.push(name);
  }

  const fieldNames: string[] = [];
  const seenFields = new Set<string>();
  for (const field of fields) {
    const name = textField(field, "name");
    if (!name || seenFields.has(name)) continue;
    seenFields.add(name);
    if (fieldNames.length < 4) fieldNames.push(name);
  }

  const statusCounts = STATUS_ORDER.flatMap((status) => {
    const count = counts.get(status) ?? 0;
    if (count === 0) return [];
    return [{ status, label: PROJECT_STATUS_META[status].label, count }];
  });

  return {
    projectCount: projects.length,
    fieldNames,
    previewNames,
    placeholderCount,
    namedHiddenCount: Math.max(0, namedCount - previewNames.length),
    statusCounts,
  };
}

export function loadUserSummaries(): UserWorkspaceSummary[] {
  const config = loadUserConfig();
  const cards = config.users.map((user) => {
    const logical = resolveWorkspaceStorageKey(user.username);
    const file = logical.split("/").pop() ?? "";
    const summary = summarizeWorkspaceJson(readStorage(logical));
    return {
      username: user.username,
      workspaceFile: file,
      needsPassword: user.password_hash.trim() === "",
      ...summary,
      rememberedUntil: readRememberUntil(user.username),
    };
  });
  cards.sort((a, b) => b.projectCount - a.projectCount || a.username.localeCompare(b.username, "zh"));
  return cards;
}
