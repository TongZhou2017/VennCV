import type { Person, ProgressBand, ProgressBlock, ProgressSlot, Project } from "../types";
import { parseIsoDate } from "./projectTime";

/** 一格里大约这么多方块，这一格就算铺满。多出来的块仍保留，只是不再抬高这一格。 */
export const PROGRESS_STONES_PER_SLOT = 6;

/** 一个项目最多几张主图。 */
export const MAX_PROGRESS_FIGURES = 12;

/** 方法、POC、论文各自最多几格。主图另计。 */
export const MAX_PROGRESS_ROWS = 8;

/** 主图这一层没单独写占比时，铺满一共占这么多。 */
export const DEFAULT_FIGURE_SHARE = 30;

/** 布局里可选的颜色。前四种是示例里方法、POC、主图、论文的颜色。 */
export const PROGRESS_COLORS = ["#c62828", "#f9a825", "#2e7d32", "#1565c0", "#6a1b9a", "#00838f", "#6d4c41"] as const;

const FRAME: { band: ProgressBand; label: string }[] = [
  { band: "method", label: "方法-数据" },
  { band: "method", label: "方法-框架" },
  { band: "method", label: "方法-消融" },
  { band: "poc", label: "POC-SOTA" },
  { band: "poc", label: "POC-Story" },
  { band: "figure", label: "主图1" },
  { band: "figure", label: "主图2" },
  { band: "figure", label: "主图3" },
  { band: "figure", label: "主图4" },
  { band: "paper", label: "论文-初稿" },
  { band: "paper", label: "论文-成稿" },
];

const BAND_RANK: Record<ProgressBand, number> = { method: 0, poc: 1, figure: 2, paper: 3 };

let progressSeq = 0;

export function newProgressId(prefix: "slot" | "blk"): string {
  progressSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${progressSeq.toString(36)}`;
}

export function slotsOf(project: Project): ProgressSlot[] {
  return [...(project.progress_slots ?? [])].sort(
    (a, b) => BAND_RANK[a.band] - BAND_RANK[b.band] || a.order - b.order || a.id.localeCompare(b.id),
  );
}

export function blocksOf(project: Project): ProgressBlock[] {
  return project.progress_blocks ?? [];
}

export function hasProgressBlocks(project: Project): boolean {
  return blocksOf(project).length > 0;
}

export function blocksInSlot(project: Project, slotId: string): ProgressBlock[] {
  return blocksOf(project)
    .filter((block) => block.slot_id === slotId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export interface HouseBand {
  band: ProgressBand;
  slots: ProgressSlot[];
}

/** 从上到下：论文、主图、POC、方法。方法里最底下是数据。 */
export function houseBands(project: Project): HouseBand[] {
  const slots = slotsOf(project);
  const order: ProgressBand[] = ["paper", "figure", "poc", "method"];
  return order
    .map((band) => {
      const rows = slots.filter((slot) => slot.band === band);
      return { band, slots: band === "figure" ? rows : [...rows].reverse() };
    })
    .filter((row) => row.slots.length > 0);
}

/** 从地基往上，方便按盖楼的顺序选格子。 */
export function slotsBottomUp(project: Project): ProgressSlot[] {
  return [...houseBands(project)]
    .reverse()
    .flatMap((row) => (row.band === "figure" ? row.slots : [...row.slots].reverse()));
}

export function bandColor(band: ProgressBand): string {
  switch (band) {
    case "method":
      return "#c62828";
    case "poc":
      return "#f9a825";
    case "figure":
      return "#2e7d32";
    case "paper":
      return "#1565c0";
    default: {
      const unexpected: never = band;
      return unexpected;
    }
  }
}

function bandTitle(band: ProgressBand): string {
  switch (band) {
    case "method":
      return "方法";
    case "poc":
      return "POC";
    case "figure":
      return "主图";
    case "paper":
      return "论文";
    default: {
      const unexpected: never = band;
      return unexpected;
    }
  }
}

/** 格子实际使用的颜色。选用的常用色优先，否则跟这一层。 */
export function slotColor(slot: ProgressSlot): string {
  if (slot.color && (PROGRESS_COLORS as readonly string[]).includes(slot.color)) return slot.color;
  return bandColor(slot.band);
}

function manualCompletion(project: Project): number {
  const value = project.completion_percentage;
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** 没单独写占比时，这一格在示例里占多少。 */
export function defaultSlotShare(project: Project, slot: ProgressSlot): number {
  return templateShare(project, slot);
}

function slotShare(project: Project, slot: ProgressSlot): number {
  if (slot.band === "figure") return templateShare(project, slot);
  if (typeof slot.share === "number" && Number.isFinite(slot.share)) {
    return Math.max(0, Math.min(100, slot.share));
  }
  return templateShare(project, slot);
}

/** 主图这一层铺满时一共占多少。没写时是 30。 */
export function figureShareOf(project: Project): number {
  if (typeof project.figure_share === "number" && Number.isFinite(project.figure_share)) {
    return Math.max(0, Math.min(100, project.figure_share));
  }
  return DEFAULT_FIGURE_SHARE;
}

function templateShare(project: Project, slot: ProgressSlot): number {
  switch (slot.band) {
    case "method":
      return 10;
    case "poc":
      return 10;
    case "figure": {
      const count = slotsOf(project).filter((item) => item.band === "figure").length;
      return count > 0 ? figureShareOf(project) / count : 0;
    }
    case "paper":
      return 10;
    default: {
      const unexpected: never = slot.band;
      return unexpected;
    }
  }
}

/** 已经标成完成。没有完成日期的待办不计进度。 */
export function isBlockDone(block: Pick<ProgressBlock, "completed_on">): boolean {
  return parseIsoDate(block.completed_on) !== null;
}

/** 两个 `YYYY-MM-DD` 相差的天数。`to` 晚于 `from` 时为正。 */
export function isoDaySpan(from: string, to: string): number | null {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end) return null;
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  if (!startYear || !startMonth || !startDay || !endYear || !endMonth || !endDay) return null;
  const ms = Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay);
  return Math.round(ms / 86_400_000);
}

export function addIsoDays(iso: string, days: number): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return iso;
  const [year, month, day] = parsed.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** 未完成待办从这一天到期限还剩几天。过期为负数。已完成或没有期限时没有这个数字。 */
export function remainingDays(block: Pick<ProgressBlock, "completed_on" | "due">, asOf: string): number | null {
  if (isBlockDone(block)) return null;
  const due = parseIsoDate(block.due);
  if (!due) return null;
  return isoDaySpan(asOf, due);
}

/**
 * 未完成待办从开始到期限一共几天。
 * 这个数字不看今天：不是今天到开始，也不是今天到期限。
 * 已完成、没有开始或没有期限时没有这个数字。
 */
export function scheduledDays(block: Pick<ProgressBlock, "completed_on" | "date" | "due">): number | null {
  if (isBlockDone(block)) return null;
  const start = parseIsoDate(block.date);
  const due = parseIsoDate(block.due);
  if (!start || !due) return null;
  return isoDaySpan(start, due);
}

/** 只保留这一天和更早开始的待办。还没到完成日的，在这一天仍算未完成。 */
export function projectThroughDate(project: Project, date: string): Project {
  return {
    ...project,
    progress_blocks: blocksOf(project)
      .filter((block) => block.date <= date)
      .map((block) => (block.completed_on && block.completed_on > date ? { ...block, completed_on: null } : block)),
  };
}

/** 有待办时只累计已经标成完成的，最高 100。没有待办时沿用手上填的完成度。 */
export function effectiveCompletion(project: Project): number {
  if (!hasProgressBlocks(project)) return manualCompletion(project);
  let sum = 0;
  for (const slot of slotsOf(project)) {
    const count = blocksOf(project).filter((block) => block.slot_id === slot.id && isBlockDone(block)).length;
    const fraction = Math.min(1, count / PROGRESS_STONES_PER_SLOT);
    sum += fraction * slotShare(project, slot);
  }
  return Math.max(0, Math.min(100, Math.round(sum)));
}

function withBlocks(project: Project, blocks: ProgressBlock[], removedSome: boolean): Project {
  const next = { ...project, progress_blocks: blocks };
  if (blocks.length > 0) return { ...next, completion_percentage: effectiveCompletion(next) };
  if (removedSome && slotsOf(next).length > 0) return { ...next, completion_percentage: 0 };
  return next;
}

/** 补上还没有的层。已有的主图保留，完成度不变。四层都在时原样返回。 */
export function applyProgressTemplate(project: Project): Project {
  const existing = slotsOf(project);
  const present = new Set(existing.map((slot) => slot.band));
  if (present.has("method") && present.has("poc") && present.has("figure") && present.has("paper")) {
    return project;
  }
  const counts: Record<ProgressBand, number> = { method: 0, poc: 0, figure: 0, paper: 0 };
  for (const slot of existing) counts[slot.band] += 1;
  const added: ProgressSlot[] = [];
  for (const item of FRAME) {
    if (present.has(item.band)) continue;
    const order = counts[item.band];
    counts[item.band] += 1;
    added.push({ id: newProgressId("slot"), band: item.band, label: item.label, order });
  }
  if (added.length === 0) return project;
  return { ...project, progress_slots: [...existing, ...added], progress_blocks: blocksOf(project) };
}

export interface ProgressSlotPatch {
  label?: string;
  /** `null` 表示回到示例比例。 */
  share?: number | null;
  /** `null` 表示回到这一层的颜色。 */
  color?: string | null;
}

function normalizeShare(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

function normalizeColor(value: string | null): string | null {
  if (value === null) return null;
  const color = value.trim().toLowerCase();
  return (PROGRESS_COLORS as readonly string[]).includes(color) ? color : null;
}

export function setFigureShare(project: Project, share: number | null): Project {
  const normalized = share === null ? null : normalizeShare(share);
  const nextShare = normalized === DEFAULT_FIGURE_SHARE ? null : normalized;
  if ((project.figure_share ?? null) === nextShare) return project;
  const next: Project = { ...project, progress_blocks: blocksOf(project) };
  if (nextShare === null) delete next.figure_share;
  else next.figure_share = nextShare;
  if (hasProgressBlocks(next)) return { ...next, completion_percentage: effectiveCompletion(next) };
  return next;
}

function slotWith(slot: ProgressSlot, label: string, share: number | null, color: string | null): ProgressSlot {
  const next: ProgressSlot = { id: slot.id, band: slot.band, label, order: slot.order };
  if (share !== null) next.share = share;
  if (color !== null) next.color = color;
  return next;
}

function finishSlots(project: Project, slots: ProgressSlot[]): Project {
  const next = { ...project, progress_slots: slots, progress_blocks: blocksOf(project) };
  if (hasProgressBlocks(next)) return { ...next, completion_percentage: effectiveCompletion(next) };
  return next;
}

export function updateProgressSlot(project: Project, slotId: string, patch: ProgressSlotPatch): Project {
  const slots = slotsOf(project);
  const slot = slots.find((item) => item.id === slotId);
  if (!slot) return project;
  const label = patch.label === undefined ? slot.label : patch.label.trim().slice(0, 40);
  if (!label) return project;
  const share = patch.share === undefined ? (slot.share ?? null) : normalizeShare(patch.share);
  const color = patch.color === undefined ? (slot.color ?? null) : normalizeColor(patch.color);
  if (label === slot.label && share === (slot.share ?? null) && color === (slot.color ?? null)) return project;
  return finishSlots(
    project,
    slots.map((item) => (item.id === slotId ? slotWith(item, label, share, color) : item)),
  );
}

export function addProgressFigure(project: Project): Project {
  const slots = slotsOf(project);
  const figures = slots.filter((slot) => slot.band === "figure");
  if (figures.length >= MAX_PROGRESS_FIGURES) return project;
  const order = figures.reduce((max, slot) => Math.max(max, slot.order), -1) + 1;
  const slot: ProgressSlot = {
    id: newProgressId("slot"),
    band: "figure",
    label: `主图${figures.length + 1}`,
    order,
  };
  return { ...project, progress_slots: [...slots, slot] };
}

export function addProgressPart(project: Project, band: ProgressBand): Project {
  if (band === "figure") return addProgressFigure(project);
  const slots = slotsOf(project);
  const rows = slots.filter((slot) => slot.band === band);
  if (rows.length >= MAX_PROGRESS_ROWS) return project;
  const order = rows.reduce((max, slot) => Math.max(max, slot.order), -1) + 1;
  const slot: ProgressSlot = {
    id: newProgressId("slot"),
    band,
    label: `${bandTitle(band)}${rows.length + 1}`,
    order,
    share: 0,
  };
  return { ...project, progress_slots: [...slots, slot], progress_blocks: blocksOf(project) };
}

export function removeProgressSlot(project: Project, slotId: string): Project {
  const slot = slotsOf(project).find((item) => item.id === slotId);
  if (!slot) return project;
  const before = blocksOf(project);
  const blocks = before.filter((block) => block.slot_id !== slotId);
  return withBlocks(
    { ...project, progress_slots: slotsOf(project).filter((item) => item.id !== slotId) },
    blocks,
    blocks.length !== before.length,
  );
}

export function resetProgressLayout(project: Project, field: "share" | "color"): Project {
  const slots = slotsOf(project);
  switch (field) {
    case "share": {
      const cleared = finishSlots(
        project,
        slots.map((slot) => slotWith(slot, slot.label, null, slot.color ?? null)),
      );
      if (project.figure_share === undefined && !slots.some((slot) => slot.share !== undefined)) return project;
      if (cleared.figure_share === undefined && project.figure_share === undefined) return cleared;
      const next: Project = { ...cleared };
      delete next.figure_share;
      if (hasProgressBlocks(next)) return { ...next, completion_percentage: effectiveCompletion(next) };
      return next;
    }
    case "color":
      if (!slots.some((slot) => slot.color !== undefined)) return project;
      return finishSlots(
        project,
        slots.map((slot) => slotWith(slot, slot.label, slot.share ?? null, null)),
      );
    default: {
      const unexpected: never = field;
      return unexpected;
    }
  }
}

export function removeProgressFigure(project: Project, slotId: string): Project {
  const slot = slotsOf(project).find((item) => item.id === slotId);
  if (!slot || slot.band !== "figure") return project;
  return removeProgressSlot(project, slotId);
}

export interface ProgressBlockPatch {
  title?: string;
  date?: string;
  due?: string | null;
  completed_on?: string | null;
  person_id?: string | null;
  grant_id?: string | null;
  note?: string;
  slot_id?: string;
}

export function addProgressBlock(
  project: Project,
  slotId: string,
  title: string,
  date: string,
  due: string,
  personId: string | null,
  grantId?: string | null,
): Project {
  if (!slotsOf(project).some((slot) => slot.id === slotId)) return project;
  const trimmed = title.trim().slice(0, 80);
  const parsed = parseIsoDate(date);
  const deadline = parseIsoDate(due);
  if (!trimmed || !parsed || !deadline) return project;
  const block: ProgressBlock = {
    id: newProgressId("blk"),
    slot_id: slotId,
    title: trimmed,
    date: parsed,
    due: deadline < parsed ? parsed : deadline,
    completed_on: null,
    person_id: personId && personId.trim() ? personId : null,
    note: "",
  };
  if (grantId && grantId.trim()) block.grant_id = grantId.trim();
  return withBlocks(project, [...blocksOf(project), block], false);
}

export function updateProgressBlock(project: Project, blockId: string, patch: ProgressBlockPatch): Project {
  const blocks = blocksOf(project);
  const current = blocks.find((block) => block.id === blockId);
  if (!current) return project;
  const nextBlock: ProgressBlock = { ...current };
  if (patch.title !== undefined) {
    const title = patch.title.trim().slice(0, 80);
    if (!title) return project;
    nextBlock.title = title;
  }
  if (patch.date !== undefined) {
    const date = parseIsoDate(patch.date);
    if (!date) return project;
    nextBlock.date = date;
  }
  if (patch.due !== undefined) {
    if (patch.due === null) delete nextBlock.due;
    else {
      const due = parseIsoDate(patch.due);
      if (!due) return project;
      nextBlock.due = due;
    }
  }
  if (patch.completed_on !== undefined) {
    if (patch.completed_on === null) nextBlock.completed_on = null;
    else {
      const completed = parseIsoDate(patch.completed_on);
      if (!completed) return project;
      nextBlock.completed_on = completed;
    }
  }
  if (patch.person_id !== undefined) nextBlock.person_id = patch.person_id;
  if (patch.grant_id !== undefined) {
    if (patch.grant_id && patch.grant_id.trim()) nextBlock.grant_id = patch.grant_id.trim();
    else delete nextBlock.grant_id;
  }
  if (patch.note !== undefined) nextBlock.note = patch.note.trim().slice(0, 200);
  if (patch.slot_id !== undefined) {
    if (!slotsOf(project).some((slot) => slot.id === patch.slot_id)) return project;
    nextBlock.slot_id = patch.slot_id;
  }
  if (nextBlock.due && nextBlock.due < nextBlock.date) nextBlock.due = nextBlock.date;
  if (
    nextBlock.title === current.title &&
    nextBlock.date === current.date &&
    (nextBlock.due ?? null) === (current.due ?? null) &&
    (nextBlock.completed_on ?? null) === (current.completed_on ?? null) &&
    nextBlock.person_id === current.person_id &&
    (nextBlock.grant_id ?? null) === (current.grant_id ?? null) &&
    nextBlock.note === current.note &&
    nextBlock.slot_id === current.slot_id
  ) {
    return project;
  }
  const nextBlocks = blocks.map((block) => (block.id === blockId ? nextBlock : block));
  const progressChanged =
    nextBlock.slot_id !== current.slot_id || (nextBlock.completed_on ?? null) !== (current.completed_on ?? null);
  if (progressChanged) return withBlocks(project, nextBlocks, false);
  return { ...project, progress_blocks: nextBlocks };
}

export function removeProgressBlock(project: Project, blockId: string): Project {
  const blocks = blocksOf(project);
  if (!blocks.some((block) => block.id === blockId)) return project;
  return withBlocks(
    project,
    blocks.filter((block) => block.id !== blockId),
    true,
  );
}

export interface PersonProgress {
  blockId: string;
  projectId: string;
  projectName: string;
  slotLabel: string;
  title: string;
  date: string;
  due: string | null;
  completedOn: string | null;
  completion: number;
}

export interface GrantTodo {
  blockId: string;
  projectId: string;
  projectName: string;
  title: string;
  date: string;
  due: string | null;
  completedOn: string | null;
}

/** 挂在这项基金上的待办，未完成的排在前面。 */
export function blocksForGrant(projects: Record<string, Project>, grantId: string): GrantTodo[] {
  const rows: GrantTodo[] = [];
  for (const project of Object.values(projects)) {
    const slots = new Set(slotsOf(project).map((slot) => slot.id));
    for (const block of blocksOf(project)) {
      if (block.grant_id !== grantId || !slots.has(block.slot_id)) continue;
      rows.push({
        blockId: block.id,
        projectId: project.id,
        projectName: project.name.trim() || "未命名项目",
        title: block.title,
        date: block.date,
        due: parseIsoDate(block.due),
        completedOn: parseIsoDate(block.completed_on),
      });
    }
  }
  rows.sort((a, b) => {
    const open = Number(a.completedOn !== null) - Number(b.completedOn !== null);
    if (open !== 0) return open;
    return a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "zh");
  });
  return rows;
}

export function blocksForPerson(projects: Record<string, Project>, personId: string): PersonProgress[] {
  const rows: PersonProgress[] = [];
  for (const project of Object.values(projects)) {
    const slots = new Map(slotsOf(project).map((slot) => [slot.id, slot]));
    for (const block of blocksOf(project)) {
      if (block.person_id !== personId) continue;
      const slot = slots.get(block.slot_id);
      if (!slot) continue;
      rows.push({
        blockId: block.id,
        projectId: project.id,
        projectName: project.name.trim() || "未命名项目",
        slotLabel: slot.label,
        title: block.title,
        date: block.date,
        due: parseIsoDate(block.due),
        completedOn: parseIsoDate(block.completed_on),
        completion: effectiveCompletion(project),
      });
    }
  }
  rows.sort(
    (a, b) => b.date.localeCompare(a.date) || a.projectName.localeCompare(b.projectName, "zh") || a.title.localeCompare(b.title, "zh"),
  );
  return rows;
}

export type ProgressReportSpan = "day" | "week" | "month" | "year";

/** 回看时收进来的日期。缺省时由 `defaultReportWindow` 取从开始到目前或结束。 */
export interface ProgressReportWindow {
  from: string | null;
  to: string | null;
}

/**
 * 默认看全部：从最早一块方块开始，到今天、预期完成日和最后一块方块里最晚的那天结束。
 */
export function defaultReportWindow(project: Project, today: string): ProgressReportWindow {
  const dates = blocksOf(project)
    .map((block) => block.date)
    .filter((date) => parseIsoDate(date) !== null)
    .sort();
  const dues = blocksOf(project)
    .map((block) => parseIsoDate(block.due))
    .filter((date): date is string => date !== null)
    .sort();
  const start = dates[0] ?? null;
  const last = dates.length > 0 ? dates[dates.length - 1] ?? null : null;
  const lastDue = dues.length > 0 ? dues[dues.length - 1] ?? null : null;
  const expected = parseIsoDate(project.expected_completion_date);
  const todayDate = parseIsoDate(today);
  const ends = [todayDate, last, lastDue, expected].filter((date): date is string => date !== null);
  const end = ends.length > 0 ? ends.sort()[ends.length - 1] ?? null : null;
  return { from: start, to: end };
}

function blockInWindow(block: ProgressBlock, window: ProgressReportWindow | null | undefined): boolean {
  if (!window) return true;
  const end = block.due && block.due > block.date ? block.due : block.date;
  if (window.from && end < window.from) return false;
  if (window.to && block.date > window.to) return false;
  return true;
}

export interface ProgressReportEntry {
  block: ProgressBlock;
  slot: ProgressSlot;
}

export interface ProgressReportGroup {
  key: string;
  label: string;
  entries: ProgressReportEntry[];
}

export interface ProgressReportLine {
  projectId: string;
  projectName: string;
  block: ProgressBlock;
  slot: ProgressSlot;
}

function mondayOf(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

function periodKey(date: string, span: ProgressReportSpan): string {
  switch (span) {
    case "day":
      return date;
    case "month":
      return date.slice(0, 7);
    case "year":
      return date.slice(0, 4);
    case "week":
      return mondayOf(date);
    default: {
      const unexpected: never = span;
      return unexpected;
    }
  }
}

function periodLabel(key: string, span: ProgressReportSpan): string {
  switch (span) {
    case "day":
      return key;
    case "week":
      return `${key} 当周`;
    case "month":
      return key;
    case "year":
      return key;
    default: {
      const unexpected: never = span;
      return unexpected;
    }
  }
}

export function reportSpanLabel(span: ProgressReportSpan): string {
  switch (span) {
    case "day":
      return "日";
    case "week":
      return "周";
    case "month":
      return "月";
    case "year":
      return "年";
    default: {
      const unexpected: never = span;
      return unexpected;
    }
  }
}

function reportStatus(block: ProgressBlock, today: string): string {
  if (isBlockDone(block)) {
    const on = parseIsoDate(block.completed_on);
    return on ? `已完成 ${on}` : "已完成";
  }
  const left = remainingDays(block, today);
  if (left === null) return "未完成";
  if (left < 0) return `逾期 ${-left} 天`;
  return `剩余 ${left} 天`;
}

/** 把当前回看范围写成一份纯文本报告。 */
export function progressReportText(
  project: Project,
  span: ProgressReportSpan,
  window: ProgressReportWindow,
  today: string,
  personName: (personId: string | null) => string,
): string {
  const groups = progressReport(project, span, window);
  const lines = [
    "回看报告",
    `项目：${project.name.trim() || "未命名项目"}`,
    `完成度：${effectiveCompletion(project)}%`,
    `范围：${window.from ?? "不限"} 至 ${window.to ?? "不限"}`,
    `按：${reportSpanLabel(span)}`,
    `截至：${today}`,
    "",
  ];
  if (groups.length === 0) {
    lines.push("这段时间里没有待办。");
    return `${lines.join("\n")}\n`;
  }
  for (const group of groups) {
    lines.push(group.label);
    for (const entry of group.entries) {
      const when = entry.block.due ? `${entry.block.date} → ${entry.block.due}` : entry.block.date;
      const spanDays = scheduledDays(entry.block);
      lines.push(`${entry.block.title}（${reportStatus(entry.block, today)}）`);
      lines.push(`${entry.slot.label} · ${personName(entry.block.person_id)}`);
      lines.push(when);
      if (spanDays !== null) lines.push(`开始到期限 ${spanDays} 天`);
      if (entry.block.note.trim()) lines.push(`备注：${entry.block.note.trim()}`);
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function progressReportFileName(projectName: string, today: string): string {
  const name = (projectName.trim() || "未命名项目").replace(/[\\/:*?"<>|\s]+/g, "") || "未命名项目";
  return `${name}-回看-${today}.txt`;
}

export function progressReport(
  project: Project,
  span: ProgressReportSpan,
  window?: ProgressReportWindow | null,
): ProgressReportGroup[] {
  const slots = new Map(slotsOf(project).map((slot) => [slot.id, slot]));
  const ordered = [...blocksOf(project)].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const groups: ProgressReportGroup[] = [];
  const index = new Map<string, ProgressReportGroup>();
  for (const block of ordered) {
    if (!blockInWindow(block, window)) continue;
    const slot = slots.get(block.slot_id);
    if (!slot) continue;
    const key = periodKey(block.date, span);
    let group = index.get(key);
    if (!group) {
      group = { key, label: periodLabel(key, span), entries: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.entries.push({ block, slot });
  }
  return groups;
}

/** 把所有项目的方块按日、周、月、年收成一份，供日报到年报查询。 */
export function progressReportAcross(
  projects: Record<string, Project>,
  span: ProgressReportSpan,
  window?: ProgressReportWindow | null,
): { key: string; label: string; lines: ProgressReportLine[] }[] {
  const lines: ProgressReportLine[] = [];
  for (const project of Object.values(projects)) {
    const slots = new Map(slotsOf(project).map((slot) => [slot.id, slot]));
    for (const block of blocksOf(project)) {
      if (!blockInWindow(block, window)) continue;
      const slot = slots.get(block.slot_id);
      if (!slot) continue;
      lines.push({
        projectId: project.id,
        projectName: project.name.trim() || "未命名项目",
        block,
        slot,
      });
    }
  }
  lines.sort((a, b) => b.block.date.localeCompare(a.block.date) || a.projectName.localeCompare(b.projectName, "zh"));
  const groups: { key: string; label: string; lines: ProgressReportLine[] }[] = [];
  const index = new Map<string, { key: string; label: string; lines: ProgressReportLine[] }>();
  for (const line of lines) {
    const key = periodKey(line.block.date, span);
    let group = index.get(key);
    if (!group) {
      group = { key, label: periodLabel(key, span), lines: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.lines.push(line);
  }
  return groups;
}

function readShare(raw: unknown): number | null {
  return typeof raw === "number" ? normalizeShare(raw) : null;
}

function readColor(raw: unknown): string | null {
  return typeof raw === "string" ? normalizeColor(raw) : null;
}

function bandOf(raw: unknown): ProgressBand | null {
  switch (raw) {
    case "method":
    case "poc":
    case "figure":
    case "paper":
      return raw;
    default:
      return null;
  }
}

export function sanitizeProjectProgress(
  project: Project,
  people: Record<string, Person>,
  grantIds: Set<string>,
): void {
  const rawSlots = Array.isArray(project.progress_slots) ? project.progress_slots : [];
  const slots: ProgressSlot[] = [];
  const seenSlots = new Set<string>();
  for (const raw of rawSlots) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<ProgressSlot>;
    const band = bandOf(item.band);
    if (typeof item.id !== "string" || !item.id || seenSlots.has(item.id) || !band) continue;
    const label = typeof item.label === "string" ? item.label.trim().slice(0, 40) : "";
    if (!label) continue;
    const order =
      typeof item.order === "number" && Number.isFinite(item.order)
        ? Math.max(0, Math.round(item.order))
        : slots.filter((slot) => slot.band === band).length;
    seenSlots.add(item.id);
    const share = readShare(item.share);
    const color = readColor(item.color);
    const slot: ProgressSlot = { id: item.id, band, label, order };
    if (share !== null) slot.share = share;
    if (color !== null) slot.color = color;
    slots.push(slot);
  }
  const slotIds = new Set(slots.map((slot) => slot.id));
  const peopleIds = new Set(Object.keys(people));
  const rawBlocks = Array.isArray(project.progress_blocks) ? project.progress_blocks : [];
  const blocks: ProgressBlock[] = [];
  const seenBlocks = new Set<string>();
  for (const raw of rawBlocks) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<ProgressBlock>;
    if (typeof item.id !== "string" || !item.id || seenBlocks.has(item.id)) continue;
    if (typeof item.slot_id !== "string" || !slotIds.has(item.slot_id)) continue;
    const title = typeof item.title === "string" ? item.title.trim().slice(0, 80) : "";
    const date = parseIsoDate(item.date);
    if (!title || !date) continue;
    const personId = typeof item.person_id === "string" && peopleIds.has(item.person_id) ? item.person_id : null;
    const grantId = typeof item.grant_id === "string" && grantIds.has(item.grant_id) ? item.grant_id : null;
    const note = typeof item.note === "string" ? item.note.trim().slice(0, 200) : "";
    const due = parseIsoDate(item.due);
    const completedOn = Object.prototype.hasOwnProperty.call(item, "completed_on") ? parseIsoDate(item.completed_on) : date;
    seenBlocks.add(item.id);
    const block: ProgressBlock = {
      id: item.id,
      slot_id: item.slot_id,
      title,
      date,
      completed_on: completedOn,
      person_id: personId,
      note,
    };
    if (due) block.due = due < date ? date : due;
    if (grantId) block.grant_id = grantId;
    blocks.push(block);
  }
  project.progress_slots = slots;
  project.progress_blocks = blocks;
  const figureShare = readShare(project.figure_share);
  if (figureShare === null) delete project.figure_share;
  else project.figure_share = figureShare;
  const legacy = project as Project & {
    progress_stages?: unknown;
    progress_tasks?: unknown;
    progress_events?: unknown;
  };
  delete legacy.progress_stages;
  delete legacy.progress_tasks;
  delete legacy.progress_events;
  if (blocks.length > 0) project.completion_percentage = effectiveCompletion(project);
}
