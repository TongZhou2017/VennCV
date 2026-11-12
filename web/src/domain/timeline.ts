import type { Project, ProjectStatus } from "../types";
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
}

export interface TimelineTrack {
  key: string;
  label: string;
  preprint: boolean;
  url: string;
  points: TimelinePoint[];
}

export interface TimelineLane {
  projectId: string;
  name: string;
  status: ProjectStatus;
  completion: number;
  tracks: TimelineTrack[];
  points: TimelinePoint[];
}

export interface TimelineUndated {
  projectId: string;
  name: string;
  status: ProjectStatus;
  expectedJournal: string;
}

export interface TimelineModel {
  lanes: TimelineLane[];
  undated: TimelineUndated[];
  minDate: string | null;
  maxDate: string | null;
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
      points: (submission.milestones ?? []).map((milestone) => ({
        key: milestone.id,
        date: milestone.date,
        title: milestoneDisplayLabel(milestone),
        detail: milestone.note,
      })),
    }))
    .filter((track) => track.points.length > 0);
}

function laneFor(project: Project): TimelineLane | null {
  if (projectOnSubmissionTrack(project.status)) {
    const tracks = tracksForSubmissionProject(project);
    const points = tracks.flatMap((track) => track.points);
    if (points.length === 0) return null;
    return {
      projectId: project.id,
      name: projectName(project),
      status: project.status,
      completion: project.completion_percentage,
      tracks,
      points,
    };
  }
  const date = parseIsoDate(project.expected_completion_date);
  if (!date) return null;
  const completion = Number.isFinite(project.completion_percentage)
    ? Math.max(0, Math.min(100, project.completion_percentage))
    : 0;
  const journal = (project.expected_journal ?? "").trim();
  const points = [
    {
      key: `${project.id}:expected`,
      date,
      title: "预期完成",
      detail: journal ? `${completion}% · ${journal}` : `${completion}%`,
    },
  ];
  return {
    projectId: project.id,
    name: projectName(project),
    status: project.status,
    completion,
    tracks: [
      {
        key: `${project.id}:expected`,
        label: journal || "预期完成",
        preprint: false,
        url: "",
        points,
      },
    ],
    points,
  };
}

export function buildTimelineModel(projects: Record<string, Project>): TimelineModel {
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
  lanes.sort((a, b) => {
    const aDate = [...a.points].sort((left, right) => left.date.localeCompare(right.date))[0]?.date ?? "";
    const bDate = [...b.points].sort((left, right) => left.date.localeCompare(right.date))[0]?.date ?? "";
    return aDate.localeCompare(bDate) || a.name.localeCompare(b.name, "zh");
  });
  undated.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  const dates = lanes.flatMap((lane) => lane.points.map((point) => point.date));
  dates.sort();
  return {
    lanes,
    undated,
    minDate: dates[0] ?? null,
    maxDate: dates[dates.length - 1] ?? null,
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
