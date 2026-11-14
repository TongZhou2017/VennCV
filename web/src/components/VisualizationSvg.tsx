import { flushSync } from "react-dom";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useAppStore } from "../store/appStore";
import type { AppDataJson, AppSettings, ResearchField } from "../types";
import { PROJECT_STATUS_META, projectStatusVisual, rgbaToCss } from "../types";
import {
  completionLegendSwatchStroke,
  completionPercentageToCss,
} from "../viz/completionColor";
import {
  dataToScreen,
  hitTestProjectScreen,
  screenToData,
  type VizLayout,
} from "../viz/layout";
import { projectAuthorSatellites } from "../domain/authors";
import { effectiveCompletion } from "../domain/progress";
import { textWidth } from "../viz/projectLabelLayout";
import { FIELD_LABEL_FONT, LEGEND_BOX, type SceneLabels } from "../viz/sceneSpace";
import {
  relationLabelPoint,
  SELECTION_RING,
  type SceneDragPhase,
  type ScenePose,
} from "../viz/sceneMotion";

function clientToSvgCoords(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const r = svg.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

type Props = {
  svgRef: RefObject<SVGSVGElement | null>;
  size: { w: number; h: number };
  data: AppDataJson;
  layout: VizLayout;
  zoom: number;
  pan: { x: number; y: number };
  settings: AppSettings;
  fieldsToDraw: ResearchField[];
  selectedProjectId: string | null;
  multiSelectedProjectIds: string[];
  relationDraftFromId: string | null;
  wireEnd: { x: number; y: number } | null;
  wireIndirectPreview: boolean;
  sceneLabels: SceneLabels;
  pose: ScenePose | null;
  onDragProject: (phase: SceneDragPhase, id: string, pos: [number, number]) => void;
  setWireEnd: (p: { x: number; y: number } | null) => void;
  setWireIndirectPreview: (v: boolean) => void;
  onBeginPan: (clientX: number, clientY: number, pointerId: number) => void;
  onLegendPointerDown: (clientX: number, clientY: number) => void;
};

export function VisualizationSvg({
  svgRef,
  size,
  data,
  layout,
  zoom,
  pan,
  settings,
  fieldsToDraw,
  selectedProjectId,
  multiSelectedProjectIds,
  relationDraftFromId,
  wireEnd,
  wireIndirectPreview,
  sceneLabels,
  pose,
  onDragProject,
  setWireEnd,
  setWireIndirectPreview,
  onBeginPan,
  onLegendPointerDown,
}: Props) {
  const authorDisplay = useAppStore((s) => s.authorDisplay);
  const selectedPersonId = useAppStore((s) => s.selectedPersonId);
  const selectPerson = useAppStore((s) => s.selectPerson);
  const projectOnCanvas = (p: { canvas_hidden?: boolean }) => p.canvas_hidden !== true;
  const bg = rgbaToCss(settings.visualization_bg_color);
  const layoutRef = useRef(layout);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const dataRef = useRef(data);
  layoutRef.current = layout;
  zoomRef.current = zoom;
  panRef.current = pan;
  dataRef.current = data;
  const screenOf = (project: { id: string; position: [number, number] }) => {
    const pos = pose?.[project.id] ?? project.position;
    return dataToScreen(pos[0], pos[1], layout, zoom, pan);
  };

  const suppressNextClickRef = useRef(false);
  const onDragProjectRef = useRef(onDragProject);
  onDragProjectRef.current = onDragProject;

  const onWirePointerMove = useCallback(
    (e: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg || !useAppStore.getState().relationDraftFromId) return;
      const p = clientToSvgCoords(svg, e.clientX, e.clientY);
      setWireEnd(p);
      setWireIndirectPreview(e.shiftKey);
    },
    [setWireEnd, setWireIndirectPreview, svgRef],
  );

  const onWirePointerUp = useCallback(
    (e: PointerEvent) => {
      const st = useAppStore.getState();
      const draft = st.relationDraftFromId;
      if (!draft) return;
      const svg = svgRef.current;
      st.setRelationDraftFrom(null);
      setWireEnd(null);
      setWireIndirectPreview(false);
      if (svg) {
        const pos = clientToSvgCoords(svg, e.clientX, e.clientY);
        const toId = hitTestProjectScreen(
          pos.x,
          pos.y,
          dataRef.current,
          layoutRef.current,
          zoomRef.current,
          panRef.current,
        );
        if (toId && toId !== draft) {
          st.createRelation(draft, toId, { indirect: e.shiftKey });
        }
      }
    },
    [setWireEnd, setWireIndirectPreview, svgRef],
  );

  useEffect(() => {
    if (!relationDraftFromId) return;
    window.addEventListener("pointermove", onWirePointerMove);
    window.addEventListener("pointerup", onWirePointerUp);
    window.addEventListener("pointercancel", onWirePointerUp);
    return () => {
      window.removeEventListener("pointermove", onWirePointerMove);
      window.removeEventListener("pointerup", onWirePointerUp);
      window.removeEventListener("pointercancel", onWirePointerUp);
    };
  }, [relationDraftFromId, onWirePointerMove, onWirePointerUp]);

  const startProjectDrag = useCallback(
    (projId: string, startClientX: number, startClientY: number) => {
      let moved = false;
      const project = dataRef.current.projects[projId];
      const origin = project?.position ?? [0, 0];
      onDragProjectRef.current("start", projId, origin);
      const onMove = (ev: PointerEvent) => {
        const svg = svgRef.current;
        if (!svg) return;
        if (Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) > 4) {
          moved = true;
        }
        const p = clientToSvgCoords(svg, ev.clientX, ev.clientY);
        const [dx, dy] = screenToData(p.x, p.y, layoutRef.current, zoomRef.current, panRef.current);
        onDragProjectRef.current("move", projId, [dx, dy]);
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (!moved) {
          onDragProjectRef.current("cancel", projId, origin);
          return;
        }
        suppressNextClickRef.current = true;
        const svg = svgRef.current;
        if (!svg) {
          onDragProjectRef.current("cancel", projId, origin);
          return;
        }
        const p = clientToSvgCoords(svg, ev.clientX, ev.clientY);
        const [dx, dy] = screenToData(p.x, p.y, layoutRef.current, zoomRef.current, panRef.current);
        onDragProjectRef.current("end", projId, [dx, dy]);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [svgRef],
  );

  return (
    <svg
      ref={svgRef}
      width={size.w}
      height={size.h}
      style={{
        display: "block",
        touchAction: "none",
        userSelect: "none",
      }}
      role="img"
      aria-label="可视化画布"
    >
      <title>可视化</title>
      <rect
        x={0}
        y={0}
        width={size.w}
        height={size.h}
        fill={bg}
        style={{ cursor: "grab", touchAction: "none" }}
        onPointerDown={(e) => {
          if (e.button === 2) return;
          if (e.button === 0 && (e.metaKey || e.ctrlKey || e.shiftKey)) return;
          if (e.button !== 0 && e.button !== 1) return;
          e.preventDefault();
          onBeginPan(e.clientX, e.clientY, e.pointerId);
        }}
      />

      <g className="venncv-fields" pointerEvents="none">
        {fieldsToDraw.map((field) => {
          const [cx, cy] = dataToScreen(field.position[0], field.position[1], layout, zoom, pan);
          const r = field.radius * layout.autoScale * zoom;
          return (
            <circle
              key={field.id}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="#888"
              strokeWidth={settings.field_border_width}
            />
          );
        })}
      </g>

      <g className="venncv-field-labels" pointerEvents="none">
        {sceneLabels.fieldLabels.map((label) => {
          const field = fieldsToDraw.find((item) => item.id === label.id);
          if (!field) return null;
          return (
            <text
              key={`${field.id}-l`}
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={FIELD_LABEL_FONT}
              fill="#111"
            >
              {field.name}
            </text>
          );
        })}
      </g>

      <g className="venncv-relations" pointerEvents="none">
        {data.relations.map((rel, i) => {
          const from = data.projects[rel.from_id];
          const to = data.projects[rel.to_id];
          if (!from || !to || !projectOnCanvas(from) || !projectOnCanvas(to)) return null;
          const [fx, fy] = screenOf(from);
          const [tx, ty] = screenOf(to);
          const fr = from.radius * layout.autoScale * zoom;
          const tr = to.radius * layout.autoScale * zoom;
          const dx = tx - fx;
          const dy = ty - fy;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const x1 = fx + ux * fr;
          const y1 = fy + uy * fr;
          const x2 = tx - ux * tr;
          const y2 = ty - uy * tr;
          const col = rgbaToCss(rel.color);
          const dash = rel.relation_type === "Indirect" ? "5 5" : undefined;
          const arr = 10;
          const px = -uy;
          const py = ux;
          const tip1x = x2 - ux * arr + px * (arr * 0.5);
          const tip1y = y2 - uy * arr + py * (arr * 0.5);
          const tip2x = x2 - ux * arr - px * (arr * 0.5);
          const tip2y = y2 - uy * arr - py * (arr * 0.5);
          return (
            <g key={`rel-${i}-${rel.from_id}-${rel.to_id}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={col}
                strokeWidth={rel.width}
                strokeLinecap="round"
                strokeDasharray={dash}
              />
              <polygon
                points={`${x2},${y2} ${tip1x},${tip1y} ${tip2x},${tip2y}`}
                fill={col}
              />
            </g>
          );
        })}
      </g>

      <g className="venncv-rel-tags" pointerEvents="none">
        {data.relations.map((rel, i) => {
          const from = data.projects[rel.from_id];
          const to = data.projects[rel.to_id];
          if (!from || !to || rel.tags.length === 0) return null;
          if (!projectOnCanvas(from) || !projectOnCanvas(to)) return null;
          if (selectedProjectId !== from.id && selectedProjectId !== to.id) return null;
          const [fx, fy] = screenOf(from);
          const [tx, ty] = screenOf(to);
          const fr = from.radius * layout.autoScale * zoom;
          const tr = to.radius * layout.autoScale * zoom;
          const dx = tx - fx;
          const dy = ty - fy;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const x1 = fx + ux * fr;
          const y1 = fy + uy * fr;
          const x2 = tx - ux * tr;
          const y2 = ty - uy * tr;
          const labelAt = relationLabelPoint(x1, y1, x2, y2);
          const text = rel.tags.join(", ");
          const labelW = textWidth(text, 10);
          return (
            <g key={`rel-t-${i}`}>
              <rect
                x={labelAt.x - labelW / 2 - 4}
                y={labelAt.y - 8}
                width={labelW + 8}
                height={16}
                rx={3}
                fill="rgba(255,255,255,0.92)"
              />
              <text
                x={labelAt.x}
                y={labelAt.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fill="#444"
              >
                {text}
              </text>
            </g>
          );
        })}
      </g>

      {relationDraftFromId && wireEnd ? (() => {
        const from = data.projects[relationDraftFromId];
        if (!from) return null;
        const [x1, y1] = screenOf(from);
        return (
          <line
            x1={x1}
            y1={y1}
            x2={wireEnd.x}
            y2={wireEnd.y}
            stroke={SELECTION_RING}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={wireIndirectPreview ? "6 6" : undefined}
            pointerEvents="none"
          />
        );
      })() : null}

      <g className="venncv-projects">
        {Object.values(data.projects)
          .filter(projectOnCanvas)
          .map((proj) => {
          const [cx, cy] = screenOf(proj);
          const r = proj.radius * layout.autoScale * zoom;
          const meta = projectStatusVisual(proj.status);
          const strokeW = settings.project_border_width;
          const sel = selectedProjectId === proj.id;
          const inMulti = multiSelectedProjectIds.includes(proj.id);
          const completionStroke = completionPercentageToCss(effectiveCompletion(proj));
          return (
            <g key={proj.id}>
              {inMulti ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + 5}
                  fill="none"
                  stroke="#ff9800"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              ) : null}
              {sel ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + 3}
                  fill="none"
                  stroke={SELECTION_RING}
                  strokeWidth={3}
                  pointerEvents="none"
                />
              ) : null}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={meta.fill}
                stroke={completionStroke}
                strokeWidth={strokeW}
                style={{
                  cursor: relationDraftFromId ? "crosshair" : "grab",
                  touchAction: "none",
                }}
                onPointerDown={(e) => {
                if (relationDraftFromId) return;
                const ev = e.nativeEvent;
                if (ev.shiftKey) return;
                if (ev.metaKey || ev.ctrlKey) {
                  if (selectedProjectId !== proj.id) return;
                  e.preventDefault();
                  flushSync(() => {
                    useAppStore.getState().setRelationDraftFrom(proj.id);
                  });
                  const svg = svgRef.current;
                  if (svg) {
                    const p = clientToSvgCoords(svg, ev.clientX, ev.clientY);
                    setWireEnd(p);
                    setWireIndirectPreview(ev.shiftKey);
                  }
                  return;
                }
                e.preventDefault();
                startProjectDrag(proj.id, ev.clientX, ev.clientY);
              }}
              onClick={(e) => {
                if (suppressNextClickRef.current) {
                  suppressNextClickRef.current = false;
                  return;
                }
                const ev = e.nativeEvent;
                if (ev.metaKey || ev.ctrlKey) {
                  if (selectedProjectId && selectedProjectId !== proj.id) {
                    useAppStore.getState().createRelation(selectedProjectId, proj.id, {
                      indirect: ev.shiftKey,
                    });
                  }
                  return;
                }
                if (ev.shiftKey) {
                  useAppStore.getState().selectProject(proj.id, { additive: true });
                  return;
                }
                useAppStore.getState().selectProject(proj.id);
              }}
              />
              {projectAuthorSatellites(proj, data, authorDisplay).map((sat) => {
                const scale = layout.autoScale * zoom;
                const sr = sat.radius * scale;
                const fontSize = Math.max(8, sr * 0.55);
                const highlighted = selectedPersonId === sat.personId;
                return (
                  <g key={sat.personId} transform={`translate(${cx + sat.dx * scale} ${cy + sat.dy * scale})`}>
                    <circle
                      r={sr}
                      fill={sat.color}
                      stroke={highlighted ? "#1c2430" : "#ffffff"}
                      strokeWidth={highlighted ? 2.5 : 1}
                      style={{ cursor: "pointer" }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectPerson(sat.personId);
                      }}
                    >
                      <title>{sat.name}</title>
                    </circle>
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#ffffff"
                      fontSize={fontSize}
                      pointerEvents="none"
                    >
                      {sat.shortName}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </g>

      {settings.show_project_names ? (
        <g className="venncv-project-names" pointerEvents="none">
          {sceneLabels.names.map((place) => {
            const proj = data.projects[place.id];
            if (!proj) return null;
            return (
              <text
                key={`${proj.id}-n`}
                x={place.x}
                y={place.y}
                textAnchor={place.anchor}
                dominantBaseline="middle"
                fontSize={place.fontSize}
                fill="#111"
              >
                {proj.name}
              </text>
            );
          })}
        </g>
      ) : null}

      {settings.show_legend ? (() => {
        const statusKeys = Object.keys(PROJECT_STATUS_META) as (keyof typeof PROJECT_STATUS_META)[];
        const legendW = LEGEND_BOX.w;
        const legendH = LEGEND_BOX.h;
        const legendX = sceneLabels.legendAt.x;
        const legendY = sceneLabels.legendAt.y;
        const titleY = legendY + 14;
        const statusLabelY = legendY + 28;
        const statusRow0 = legendY + 42;
        const rowStep = 18;
        const completionTitleY = statusRow0 + statusKeys.length * rowStep + 8;
        const completionRow0 = completionTitleY + 14;
        const completionExamples = [0, 50, 100] as const;
        const cx0 = legendX + 16;
        return (
          <g
            className="venncv-legend"
            style={{ cursor: "grab", touchAction: "none" }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              onLegendPointerDown(event.clientX, event.clientY);
            }}
          >
            <rect
              x={legendX}
              y={legendY}
              width={legendW}
              height={legendH}
              fill="rgba(255,255,255,0.92)"
              stroke="#ccc"
              rx={4}
              ry={4}
            />
            <text x={legendX + legendW / 2} y={titleY} fontSize={12} fill="#111" textAnchor="middle">
              图例
            </text>
            <text x={legendX + 10} y={statusLabelY} fontSize={10} fill="#555">
              项目状态
            </text>
            {statusKeys.map((k, idx) => {
              const v = PROJECT_STATUS_META[k];
              return (
                <text key={k} x={legendX + 10} y={statusRow0 + idx * rowStep} fontSize={10} fill="#111">
                  <tspan fill={v.fill}>■</tspan>
                  <tspan> {v.label}</tspan>
                </text>
              );
            })}
            <text x={legendX + 10} y={completionTitleY} fontSize={10} fill="#555">
              完成度（白→黑）
            </text>
            {completionExamples.map((pct, idx) => {
              const rowY = completionRow0 + idx * rowStep;
              const col = completionPercentageToCss(pct);
              const legStroke = completionLegendSwatchStroke(pct);
              return (
                <g key={pct}>
                  <circle
                    cx={cx0}
                    cy={rowY}
                    r={5}
                    fill={col}
                    stroke={legStroke}
                    strokeWidth={legStroke ? 1 : 0}
                  />
                  <text
                    x={cx0 + 12}
                    y={rowY}
                    fontSize={10}
                    fill="#111"
                    dominantBaseline="middle"
                  >
                    {`${pct}%`}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })() : null}
    </svg>
  );
}
