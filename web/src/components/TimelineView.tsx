import { useMemo } from "react";
import { useAppStore } from "../store/appStore";
import { projectStatusVisual } from "../types";
import { buildTimelineModel, timelineAxisTicks, timelineDateRatio } from "../domain/timeline";
import "./timeline.css";

const TRACK_PAD = 28;

export function TimelineView() {
  const projects = useAppStore((s) => s.data.projects);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const selectProject = useAppStore((s) => s.selectProject);
  const model = useMemo(() => buildTimelineModel(projects), [projects]);
  const projectCount = Object.keys(projects).length;

  if (projectCount === 0) {
    return (
      <div className="timeline-page">
        <p className="timeline-empty">当前工作区还没有项目</p>
      </div>
    );
  }

  const minDate = model.minDate;
  const maxDate = model.maxDate;
  const ticks = minDate && maxDate ? timelineAxisTicks(minDate, maxDate) : [];
  const pointLeft = (date: string) => {
    const ratio = timelineDateRatio(date, minDate ?? date, maxDate ?? date);
    return `calc(${TRACK_PAD}px + (100% - ${TRACK_PAD * 2}px) * ${ratio})`;
  };

  return (
    <div className="timeline-page">
      <div className="timeline-scroll">
        {model.lanes.length === 0 ? (
          <p className="timeline-empty">横轴上还没有日期。没有填写时间的项目列在下方。</p>
        ) : (
          <div className="timeline-board">
            <div className="timeline-axis">
              {ticks.map((tick) => (
                <span key={tick} className="timeline-tick" style={{ left: pointLeft(tick) }}>
                  {tick}
                </span>
              ))}
            </div>
            {model.lanes.map((lane) => {
              const visual = projectStatusVisual(lane.status);
              const selected = lane.projectId === selectedProjectId;
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
                    {lane.tracks.map((track) => (
                      <span key={track.key} className="timeline-track">
                        {track.label === "预期完成" ? null : (
                          <span className="timeline-track-label">
                            {track.preprint ? <i className="timeline-preprint">预印本</i> : null}
                            {track.label === "预印本" ? null : track.label}
                            {track.url ? <span className="timeline-url">{track.url}</span> : null}
                          </span>
                        )}
                        {track.points.length > 1 ? (
                          <span
                            className="timeline-line"
                            style={{
                              left: pointLeft(track.points[0].date),
                              width: `calc((100% - ${TRACK_PAD * 2}px) * ${
                                timelineDateRatio(
                                  track.points[track.points.length - 1].date,
                                  minDate ?? track.points[track.points.length - 1].date,
                                  maxDate ?? track.points[track.points.length - 1].date,
                                ) -
                                timelineDateRatio(
                                  track.points[0].date,
                                  minDate ?? track.points[0].date,
                                  maxDate ?? track.points[0].date,
                                )
                              })`,
                            }}
                          />
                        ) : null}
                        {track.points.map((point) => (
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
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {model.undated.length > 0 ? (
        <section className="timeline-undated" aria-label="未填写时间">
          <h2>未填写时间</h2>
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
        </section>
      ) : null}
    </div>
  );
}
