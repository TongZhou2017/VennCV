import type { Grant, Project, ProjectStatus } from "../types";
import { catalogWorks, grantPhaseLabel, publicationsForGrant } from "./grants";
import { blocksForGrant, blocksOf, effectiveCompletion, projectThroughDate, slotsOf } from "./progress";
import {
  milestoneDisplayLabel,
  parseIsoDate,
  projectOnSubmissionTrack,
} from "./projectTime";

export interface TimelinePoint {
  key: string;
  date: string;
  title: string;
  detail: string;
  /** 总完成度在轨道里的上下位置。0 在下，100 在上。 */
  level: number | null;
  projectId?: string;
  blockId?: string;
  /** 还没完成的待办。 */
  muted?: boolean;
}

export interface TimelineTrack {
  key: string;
  label: string;
  preprint: boolean;
  url: string;
  /** 投稿前的总完成度。悬停某个点可以看到当时的进度楼。 */
  progress: boolean;
  points: TimelinePoint[];
}

export interface TimelineLane {
  projectId: string;
  name: string;
  status: ProjectStatus;
  completion: number;
  tracks: TimelineTrack[];
  points: TimelinePoint[];
  sortDate: string;
}

export interface TimelineUndated {
  projectId: string;
  name: string;
  status: ProjectStatus;
  expectedJournal: string;
}

export interface TimelineGrantLane {
  grantId: string;
  name: string;
  phaseLabel: string;
  tracks: TimelineTrack[];
  points: TimelinePoint[];
  sortDate: string;
}

export interface TimelineUndatedGrant {
  grantId: string;
  name: string;
  phaseLabel: string;
}

export interface TimelineModel {
  lanes: TimelineLane[];
  undated: TimelineUndated[];
  grantLanes: TimelineGrantLane[];
  undatedGrants: TimelineUndatedGrant[];
  minDate: string | null;
  maxDate: string | null;
  grantMinDate: string | null;
  grantMaxDate: string | null;
}

function projectName(project: Project): string {
  const name = project.name.trim();
  return name || "未命名项目";
}

function tracksForSubmissionProject(project: Project): TimelineTrack[] {
  const stored = project.journal_submissions ?? [];
  const submissions =
    stored.length > 0
      ? stored
      : (project.submission_milestones?.length ?? 0) > 0
        ? [
            {
              id: `${project.id}:legacy`,
              venue: "",
              is_preprint: false,
              url: "",
              milestones: project.submission_milestones ?? [],
            },
          ]
        : [];
  return submissions
    .map((submission) => ({
      key: submission.id,
      label: submission.venue.trim() || (submission.is_preprint ? "预印本" : "期刊"),
      preprint: submission.is_preprint,
      url: submission.url.trim(),
      progress: false,
      points: (submission.milestones ?? []).map((milestone) => ({
        key: milestone.id,
        date: milestone.date,
        title: milestoneDisplayLabel(milestone),
        detail: milestone.note,
        level: null,
      })),
    }))
    .filter((track) => track.points.length > 0);
}

function progressTrackFor(project: Project): TimelineTrack | null {
  const blocks = blocksOf(project);
  if (blocks.length === 0 || slotsOf(project).length === 0) return null;
  const dates = [
    ...new Set(blocks.flatMap((block) => (block.completed_on ? [block.date, block.completed_on] : [block.date]))),
  ].sort();
  return {
    key: `${project.id}:progress`,
    label: "总完成度",
    preprint: false,
    url: "",
    progress: true,
    points: dates.map((date) => {
      const level = effectiveCompletion(projectThroughDate(project, date));
      const titles = [
        ...new Set(blocks.filter((block) => block.date === date || block.completed_on === date).map((block) => block.title)),
      ];
      return {
        key: `${project.id}:progress:${date}`,
        date,
        title: `${level}%`,
        detail: titles.join("、"),
        level,
      };
    }),
  };
}

function laneFor(project: Project): TimelineLane | null {
  const completion = effectiveCompletion(project);
  const tracks: TimelineTrack[] = [];
  const progress = progressTrackFor(project);
  if (progress) tracks.push(progress);
  if (projectOnSubmissionTrack(project.status)) {
    tracks.push(...tracksForSubmissionProject(project));
  } else {
    const date = parseIsoDate(project.expected_completion_date);
    if (date) {
      const journal = (project.expected_journal ?? "").trim();
      const points = [
        {
          key: `${project.id}:expected`,
          date,
          title: "预期完成",
          detail: journal ? `${completion}% · ${journal}` : `${completion}%`,
          level: null,
        },
      ];
      tracks.push({
        key: `${project.id}:expected`,
        label: journal || "预期完成",
        preprint: false,
        url: "",
        progress: false,
        points,
      });
    }
  }
  const points = tracks.flatMap((track) => track.points);
  if (points.length === 0) return null;
  const pointDates = points.map((point) => point.date).sort();
  return {
    projectId: project.id,
    name: projectName(project),
    status: project.status,
    completion,
    tracks,
    points,
    sortDate: pointDates[0] ?? "9999-99-99",
  };
}

function grantName(grant: Grant): string {
  return grant.name.trim() || grant.number.trim() || "未命名基金";
}

function tracksForGrant(grant: Grant, projects: Record<string, Project>, works: ReturnType<typeof catalogWorks>): TimelineTrack[] {
  const tracks: TimelineTrack[] = [];
  const todos = blocksForGrant(projects, grant.id);
  if (todos.length > 0) {
    tracks.push({
      key: `${grant.id}:todos`,
      label: "待办",
      preprint: false,
      url: "",
      progress: false,
      points: [...todos]
        .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "zh"))
        .map((todo) => ({
          key: `${grant.id}:${todo.blockId}`,
          date: todo.date,
          title: todo.title,
          detail: todo.projectName,
          level: null,
          projectId: todo.projectId,
          blockId: todo.blockId,
          muted: todo.completedOn === null,
        })),
    });
  }
  const papers = publicationsForGrant(grant.number, works)
    .filter((work) => work.publishedOn)
    .sort((a, b) => a.publishedOn.localeCompare(b.publishedOn) || a.projectName.localeCompare(b.projectName, "zh"));
  if (papers.length > 0) {
    tracks.push({
      key: `${grant.id}:papers`,
      label: "发表",
      preprint: false,
      url: "",
      progress: false,
      points: papers.map((work) => ({
        key: `${grant.id}:${work.key}`,
        date: work.publishedOn,
        title: "发表",
        detail: work.projectName,
        level: null,
        projectId: work.projectId,
      })),
    });
  }
  return tracks;
}

function grantLaneFor(
  grant: Grant,
  projects: Record<string, Project>,
  works: ReturnType<typeof catalogWorks>,
): TimelineGrantLane | null {
  const tracks = tracksForGrant(grant, projects, works);
  const points = tracks.flatMap((track) => track.points);
  if (points.length === 0) return null;
  const pointDates = points.map((point) => point.date).sort();
  return {
    grantId: grant.id,
    name: grantName(grant),
    phaseLabel: grantPhaseLabel(grant.phase),
    tracks,
    points,
    sortDate: pointDates[0] ?? "9999-99-99",
  };
}

export function buildTimelineModel(
  projects: Record<string, Project>,
  grants: Record<string, Grant> = {},
): TimelineModel {
  const lanes: TimelineLane[] = [];
  const undated: TimelineUndated[] = [];
  for (const project of Object.values(projects)) {
    const lane = laneFor(project);
    if (!lane) {
      undated.push({
        projectId: project.id,
        name: projectName(project),
        status: project.status,
        expectedJournal: projectOnSubmissionTrack(project.status)
          ? ""
          : (project.expected_journal ?? "").trim(),
      });
      continue;
    }
    lanes.push(lane);
  }
  lanes.sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.name.localeCompare(b.name, "zh"));
  undated.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  const works = catalogWorks({ projects });
  const grantLanes: TimelineGrantLane[] = [];
  const undatedGrants: TimelineUndatedGrant[] = [];
  for (const grant of Object.values(grants)) {
    const lane = grantLaneFor(grant, projects, works);
    if (!lane) {
      undatedGrants.push({ grantId: grant.id, name: grantName(grant), phaseLabel: grantPhaseLabel(grant.phase) });
      continue;
    }
    grantLanes.push(lane);
  }
  grantLanes.sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.name.localeCompare(b.name, "zh"));
  undatedGrants.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  const dates = lanes.flatMap((lane) => lane.points.map((point) => point.date)).sort();
  const grantDates = grantLanes.flatMap((lane) => lane.points.map((point) => point.date)).sort();
  return {
    lanes,
    undated,
    grantLanes,
    undatedGrants,
    minDate: dates[0] ?? null,
    maxDate: dates[dates.length - 1] ?? null,
    grantMinDate: grantDates[0] ?? null,
    grantMaxDate: grantDates[grantDates.length - 1] ?? null,
  };
}

function utcDay(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export function timelineAxisTicks(minDate: string, maxDate: string, maxTicks = 6): string[] {
  const start = utcDay(minDate);
  const end = utcDay(maxDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [minDate];
  const span = Math.round((end - start) / 86_400_000);
  const count = Math.max(1, Math.min(maxTicks, span + 1));
  const ticks: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const day = start + Math.round((span * i) / Math.max(1, count - 1)) * 86_400_000;
    ticks.push(new Date(day).toISOString().slice(0, 10));
  }
  return [...new Set(ticks)];
}

export function timelineDateRatio(date: string, minDate: string, maxDate: string): number {
  const start = utcDay(minDate);
  const end = utcDay(maxDate);
  const at = utcDay(date);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(at) || end <= start) {
    return 0.5;
  }
  return (at - start) / (end - start);
}

const DAY_MS = 86_400_000;
const MIN_TIMELINE_SPAN_DAYS = 14;
const MAX_TIMELINE_SPAN_DAYS = 365 * 80;

/** 时间线窗口。center 落在轨道正中，spanDays 是窗口里能看到的天数。 */
export type TimelineWindow = { center: string; spanDays: number };

export type TimelineTick = { date: string; label: string };

function isoFromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 本地日历上的今天。时间跳转用这一天，不用 UTC 日期。 */
export function todayIso(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function timelineWindowRange(window: TimelineWindow): { start: string; end: string } {
  const mid = utcDay(window.center);
  const half = (window.spanDays / 2) * DAY_MS;
  return { start: isoFromUtc(mid - half), end: isoFromUtc(mid + half) };
}

/** 把起止日期放进窗口，两端留一点空白。 */
export function fitTimelineWindow(minDate: string, maxDate: string): TimelineWindow {
  const start = utcDay(minDate);
  const end = utcDay(maxDate);
  const span = Math.max(1, Math.round((end - start) / DAY_MS) + 1);
  const padded = Math.max(MIN_TIMELINE_SPAN_DAYS, span + 14, Math.round(span * 1.12));
  return {
    center: isoFromUtc(start + (end - start) / 2),
    spanDays: Math.min(MAX_TIMELINE_SPAN_DAYS, padded),
  };
}

/** zoomIn 为真时缩短窗口，中心日期不动。 */
export function zoomTimelineSpan(spanDays: number, zoomIn: boolean): number {
  const next = zoomIn ? spanDays / 1.6 : spanDays * 1.6;
  return Math.min(MAX_TIMELINE_SPAN_DAYS, Math.max(MIN_TIMELINE_SPAN_DAYS, Math.round(next)));
}

/**
 * 缩小的上限是全局跨度。下一步会盖住或超过全局时返回 null，调用方回到全局窗口。
 */
export function nextTimelineSpan(spanDays: number, zoomIn: boolean, globalSpanDays: number): number | null {
  if (!zoomIn && spanDays >= globalSpanDays) return null;
  const next = zoomTimelineSpan(spanDays, zoomIn);
  if (!zoomIn && next >= globalSpanDays) return null;
  return next;
}

export function shiftTimelineWindow(window: TimelineWindow, dayDelta: number): TimelineWindow {
  return { ...window, center: isoFromUtc(utcDay(window.center) + dayDelta * DAY_MS) };
}

/** 窗口中心取这些日期的中点，尺度收成能放下这段时间。 */
export function windowForProjectRange(dates: string[]): TimelineWindow | null {
  const sorted = dates.filter((date) => Number.isFinite(utcDay(date))).sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;
  const start = utcDay(first);
  const end = utcDay(last);
  const span = Math.max(0, Math.round((end - start) / DAY_MS));
  const padded = Math.max(60, Math.round(span * 1.35) + 14);
  return {
    center: isoFromUtc(start + (end - start) / 2),
    spanDays: Math.min(MAX_TIMELINE_SPAN_DAYS, Math.max(MIN_TIMELINE_SPAN_DAYS, padded)),
  };
}

function steppedTicks(start: string, end: string, stepDays: number, label: (iso: string) => string): TimelineTick[] {
  const from = utcDay(start);
  const to = utcDay(end);
  const ticks: TimelineTick[] = [];
  for (let at = from + stepDays * DAY_MS; at < to && ticks.length < 8; at += stepDays * DAY_MS) {
    const date = isoFromUtc(at);
    ticks.push({ date, label: label(date) });
  }
  return ticks;
}

function monthTicks(start: string, end: string, every: number): TimelineTick[] {
  const from = utcDay(start);
  const to = utcDay(end);
  const begin = new Date(from);
  let year = begin.getUTCFullYear();
  let month = begin.getUTCMonth() + 1;
  if (month > 11) {
    month = 0;
    year += 1;
  }
  const ticks: TimelineTick[] = [];
  let index = 0;
  while (ticks.length < 8) {
    const ms = Date.UTC(year, month, 1);
    if (ms >= to) break;
    if (ms > from && index % every === 0) {
      const date = isoFromUtc(ms);
      ticks.push({ date, label: date.slice(0, 7) });
    }
    index += 1;
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return ticks;
}

function yearTicks(start: string, end: string): TimelineTick[] {
  const from = utcDay(start);
  const to = utcDay(end);
  const spanYears = Math.max(1, Math.round((to - from) / (365 * DAY_MS)));
  const every = Math.max(1, Math.ceil(spanYears / 6));
  let year = new Date(from).getUTCFullYear();
  const ticks: TimelineTick[] = [];
  while (year < 3000 && ticks.length < 8) {
    const ms = Date.UTC(year, 0, 1);
    if (ms >= to) break;
    if (ms > from && year % every === 0) ticks.push({ date: isoFromUtc(ms), label: String(year) });
    year += 1;
  }
  return ticks;
}

/** 按窗口长短选刻度。短窗口标月-日，长窗口标年。 */
export function timelineWindowTicks(start: string, end: string): TimelineTick[] {
  const span = Math.max(1, Math.round((utcDay(end) - utcDay(start)) / DAY_MS));
  if (span <= 21) return steppedTicks(start, end, span <= 10 ? 1 : 2, (iso) => iso.slice(5));
  if (span <= 120) return steppedTicks(start, end, 14, (iso) => iso.slice(5));
  if (span <= 240) return monthTicks(start, end, 1);
  if (span <= 800) return monthTicks(start, end, 2);
  if (span <= 1600) return monthTicks(start, end, 3);
  return yearTicks(start, end);
}
