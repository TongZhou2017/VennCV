import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useAppStore } from "../store/appStore";
import { projectStatusVisual } from "../types";
import {
  buildTimelineModel,
  fitTimelineWindow,
  nextTimelineSpan,
  shiftTimelineWindow,
  timelineDateRatio,
  timelineWindowRange,
  timelineWindowTicks,
  todayIso,
  windowForProjectRange,
  type TimelinePoint,
  type TimelineWindow,
} from "../domain/timeline";
import { projectThroughDate } from "../domain/progress";
import { ProgressMosaic } from "./ProgressMosaic";
import "./timeline.css";

const TRACK_PAD = 28;
const PROGRESS_PLOT_TOP = 10;
const PROGRESS_PLOT_HEIGHT = 72;
const PROGRESS_DOT = 14;

function progressDotTop(level: number): number {
  return PROGRESS_PLOT_TOP + ((100 - level) / 100) * PROGRESS_PLOT_HEIGHT - PROGRESS_DOT / 2;
}

export function TimelineView() {
  const projects = useAppStore((s) => s.data.projects);
  const grants = useAppStore((s) => s.data.grants ?? {});
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const selectProject = useAppStore((s) => s.selectProject);
  const requestPropertyTab = useAppStore((s) => s.requestPropertyTab);
  const model = useMemo(() => buildTimelineModel(projects, grants), [grants, projects]);
  const projectCount = Object.keys(projects).length;
  const grantCount = Object.keys(grants).length;
  const fitted = useMemo(() => {
    const dates = [model.minDate, model.maxDate, model.grantMinDate, model.grantMaxDate]
      .filter((date): date is string => Boolean(date))
      .sort();
    const first = dates[0];
    const last = dates[dates.length - 1];
    if (!first || !last) return null;
    return fitTimelineWindow(first, last);
  }, [model.grantMaxDate, model.grantMinDate, model.maxDate, model.minDate]);
  const [timeWindow, setTimeWindow] = useState<TimelineWindow | null>(null);
  const activeWindow = timeWindow ?? fitted;
  const range = activeWindow ? timelineWindowRange(activeWindow) : null;
  const today = todayIso();
  const selectedDates = useMemo(() => {
    const lane = model.lanes.find((item) => item.projectId === selectedProjectId);
    return lane?.points.map((point) => point.date) ?? [];
  }, [model.lanes, selectedProjectId]);
  const projectWindow = windowForProjectRange(selectedDates);

  const openPoint = (point: TimelinePoint) => {
    if (!point.projectId) return;
    if (point.blockId) {
      selectProject(point.projectId, { blockId: point.blockId });
      requestPropertyTab("tasks");
      return;
    }
    selectProject(point.projectId);
    requestPropertyTab("publication");
  };

  if (projectCount === 0 && grantCount === 0) {
    return (
      <div className="timeline-page">
        <p className="timeline-empty">当前工作区还没有项目</p>
      </div>
    );
  }

  const ticks = range ? timelineWindowTicks(range.start, range.end) : [];
  const place = (date: string) => {
    const ratio = timelineDateRatio(date, range?.start ?? date, range?.end ?? date);
    return `calc(${TRACK_PAD}px + (100% - ${TRACK_PAD * 2}px) * ${ratio})`;
  };
  const pointLeft = (date: string) => place(date);
  const inWindow = (date: string) => {
    if (!range) return false;
    const ratio = timelineDateRatio(date, range.start, range.end);
    return ratio >= 0 && ratio <= 1;
  };
  const segmentStyle = (from: string, to: string) => {
    if (!range) return null;
    const startRatio = timelineDateRatio(from, range.start, range.end);
    const endRatio = timelineDateRatio(to, range.start, range.end);
    const left = Math.min(startRatio, endRatio);
    const right = Math.max(startRatio, endRatio);
    if (right < 0 || left > 1) return null;
    const clippedLeft = Math.max(0, left);
    const clippedRight = Math.min(1, right);
    return {
      left: `calc(${TRACK_PAD}px + (100% - ${TRACK_PAD * 2}px) * ${clippedLeft})`,
      width: `calc((100% - ${TRACK_PAD * 2}px) * ${Math.max(0, clippedRight - clippedLeft)})`,
    };
  };
  const showToday = range ? inWindow(today) : false;
  const zoomTime = (zoomIn: boolean) => {
    if (!activeWindow || !fitted) return;
    const next = nextTimelineSpan(activeWindow.spanDays, zoomIn, fitted.spanDays);
    if (next === null) {
      setTimeWindow(null);
      return;
    }
    setTimeWindow({ ...activeWindow, spanDays: next });
  };
  const onAxisPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeWindow || event.button !== 0) return;
    event.preventDefault();
    const width = event.currentTarget.getBoundingClientRect().width;
    const originX = event.clientX;
    const origin = activeWindow;
    const move = (ev: PointerEvent) => {
      const days = (-(ev.clientX - originX) / Math.max(width, 1)) * origin.spanDays;
      setTimeWindow(shiftTimelineWindow(origin, days));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const renderAxis = () => (
    <div className="timeline-axis" onPointerDown={onAxisPointerDown} title="拖动可移动时间窗口">
      {showToday ? <span className="timeline-today" style={{ left: pointLeft(today) }} title="今天" /> : null}
      {ticks.map((tick) => (
        <span key={tick.date} className="timeline-tick" style={{ left: pointLeft(tick.date) }}>
          {tick.label}
        </span>
      ))}
    </div>
  );

  return (
    <div className="timeline-page">
      {activeWindow ? (
        <div className="timeline-scale" role="toolbar" aria-label="时间尺度">
          <button type="button" aria-label="放大时间尺度" title="看更短的一段时间" onClick={() => zoomTime(true)}>
            +
          </button>
          <button type="button" aria-label="缩小时间尺度" title="看更长的一段时间，最多回到全部时间" onClick={() => zoomTime(false)}>
            −
          </button>
          <button
            type="button"
            aria-label="回到全局尺度"
            title="回到全部时间"
            disabled={timeWindow === null}
            onClick={() => setTimeWindow(null)}
          >
            全局
          </button>
          <button
            type="button"
            aria-label="跳到今天"
            title="窗口中心跳到今天"
            onClick={() => setTimeWindow({ center: today, spanDays: activeWindow.spanDays })}
          >
            今天
          </button>
          <button
            type="button"
            aria-label="跳到选中项目"
            title={projectWindow ? "窗口对准选中项目的时间范围" : "先选中一个有日期的项目"}
            disabled={!projectWindow}
            onClick={() => {
              if (projectWindow) setTimeWindow(projectWindow);
            }}
          >
            项目
          </button>
        </div>
      ) : null}
      <div className="timeline-scroll">
        {model.lanes.length === 0 && model.grantLanes.length === 0 ? (
          <p className="timeline-empty">横轴上还没有日期。没有填写时间的项目列在下方。</p>
        ) : (
          <>
          {model.lanes.length > 0 ? (
          <div className="timeline-board">
            {renderAxis()}
            {model.lanes.map((lane) => {
              const visual = projectStatusVisual(lane.status);
              const selected = lane.projectId === selectedProjectId;
              const project = projects[lane.projectId];
              return (
                <button
                  key={lane.projectId}
                  type="button"
                  className={selected ? "timeline-lane is-selected" : "timeline-lane"}
                  onClick={() => selectProject(lane.projectId)}
                >
                  <span>
                    <span className="timeline-lane-name">{lane.name}</span>
                    <span className="timeline-lane-meta">
                      {visual.label}
                      {lane.points.length === 1 && lane.points[0]?.title === "预期完成"
                        ? ` · ${lane.points[0].detail}`
                        : ""}
                    </span>
                  </span>
                  <span className="timeline-tracks">
                    {lane.tracks.map((track) =>
                      track.progress && project ? (
                        <span key={track.key} className="timeline-track is-progress">
                          <span className="timeline-progress-plot">
                            <span className="timeline-track-label">总完成度</span>
                            <svg
                              className="timeline-progress-svg"
                              viewBox="0 0 100 100"
                              preserveAspectRatio="none"
                              aria-hidden="true"
                            >
                              {track.points.length > 1 ? (
                                <polyline
                                  points={track.points
                                    .map((point) => {
                                      const x =
                                        timelineDateRatio(point.date, range?.start ?? point.date, range?.end ?? point.date) * 100;
                                      return `${x},${100 - (point.level ?? 0)}`;
                                    })
                                    .join(" ")}
                                  fill="none"
                                  stroke="#8d8680"
                                  strokeWidth="1.5"
                                  vectorEffect="non-scaling-stroke"
                                />
                              ) : null}
                            </svg>
                            {track.points.filter((point) => inWindow(point.date)).map((point) => (
                              <span
                                key={point.key}
                                className="timeline-point is-progress"
                                style={{ left: pointLeft(point.date), top: `${progressDotTop(point.level ?? 0)}px` }}
                              >
                                <span
                                  className="timeline-dot"
                                  style={{
                                    background: visual.fill,
                                    borderColor: visual.text === "#fff" ? visual.fill : "#333",
                                  }}
                                />
                                <span className="timeline-point-title">{point.title}</span>
                                <span className="timeline-progress-hover" aria-hidden="true">
                                  <ProgressMosaic
                                    project={projectThroughDate(project, point.date)}
                                    asOf={point.date}
                                    compact
                                  />
                                  {point.detail ? <span className="timeline-progress-hover-note">{point.detail}</span> : null}
                                </span>
                              </span>
                            ))}
                          </span>
                        </span>
                      ) : (
                      <span key={track.key} className="timeline-track">
                        {track.label === "预期完成" ? null : (
                          <span className="timeline-track-label">
                            {track.preprint ? <i className="timeline-preprint">预印本</i> : null}
                            {track.label === "预印本" ? null : track.label}
                            {track.url ? <span className="timeline-url">{track.url}</span> : null}
                          </span>
                        )}
                        {track.points.length > 1 && segmentStyle(track.points[0].date, track.points[track.points.length - 1].date) ? (
                          <span
                            className="timeline-line"
                            style={segmentStyle(track.points[0].date, track.points[track.points.length - 1].date) ?? undefined}
                          />
                        ) : null}
                        {track.points.filter((point) => inWindow(point.date)).map((point) => (
                          <span key={point.key} className="timeline-point" style={{ left: pointLeft(point.date) }}>
                            <span
                              className="timeline-dot"
                              style={{
                                background: track.preprint ? "#6a1b9a" : visual.fill,
                                borderColor: track.preprint || visual.text === "#fff" ? (track.preprint ? "#6a1b9a" : visual.fill) : "#333",
                              }}
                            />
                            <span className="timeline-point-title">{point.title}</span>
                            {point.detail && point.title !== "预期完成" ? (
                              <span className="timeline-point-detail">{point.detail}</span>
                            ) : null}
                          </span>
                        ))}
                      </span>
                      )
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          ) : null}
          {model.grantLanes.length > 0 ? (
            <div className="timeline-board">
            <h2 className="timeline-section">基金</h2>
            {renderAxis()}
            {model.grantLanes.map((lane) => (
              <div key={lane.grantId} className="timeline-lane is-grant">
                <span>
                  <span className="timeline-lane-name">{lane.name}</span>
                  <span className="timeline-lane-meta">{lane.phaseLabel}</span>
                </span>
                <span className="timeline-tracks">
                  {lane.tracks.map((track) => (
                    <span key={track.key} className="timeline-track">
                      <span className="timeline-track-label">{track.label}</span>
                      {track.points.length > 1 && segmentStyle(track.points[0].date, track.points[track.points.length - 1].date) ? (
                        <span
                          className="timeline-line"
                          style={segmentStyle(track.points[0].date, track.points[track.points.length - 1].date) ?? undefined}
                        />
                      ) : null}
                      {track.points.filter((point) => inWindow(point.date)).map((point) => (
                        <button
                          key={point.key}
                          type="button"
                          className={point.muted ? "timeline-point is-muted" : "timeline-point"}
                          style={{ left: pointLeft(point.date) }}
                          onClick={() => openPoint(point)}
                        >
                          <span
                            className="timeline-dot"
                            style={{
                              background: point.muted ? "#c5bfb8" : "#0f6e6e",
                              borderColor: point.muted ? "#c5bfb8" : "#0f6e6e",
                            }}
                          />
                          <span className="timeline-point-title">{point.title}</span>
                          {point.detail ? <span className="timeline-point-detail">{point.detail}</span> : null}
                        </button>
                      ))}
                    </span>
                  ))}
                </span>
              </div>
            ))}
            </div>
          ) : null}
          </>
        )}
      </div>
      {model.undated.length > 0 || model.undatedGrants.length > 0 ? (
        <section className="timeline-undated" aria-label="未填写时间">
          {model.undated.length > 0 ? <h2>未填写时间</h2> : null}
          <ul className="timeline-undated-list">
            {model.undated.map((item) => {
              const visual = projectStatusVisual(item.status);
              const selected = item.projectId === selectedProjectId;
              return (
                <li key={item.projectId}>
                  <button
                    type="button"
                    className={selected ? "timeline-undated-item is-selected" : "timeline-undated-item"}
                    onClick={() => selectProject(item.projectId)}
                  >
                    {item.name}
                    <span style={{ color: "#777" }}>
                      {" "}
                      · {visual.label}
                      {item.expectedJournal ? ` · 预期投稿 ${item.expectedJournal}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {model.undatedGrants.length > 0 ? (
            <>
              <h2>基金还没有日期</h2>
              <ul className="timeline-undated-list">
                {model.undatedGrants.map((item) => (
                  <li key={item.grantId}>
                    <span className="timeline-undated-item">
                      {item.name}
                      <span style={{ color: "#777" }}>{` · ${item.phaseLabel}`}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
