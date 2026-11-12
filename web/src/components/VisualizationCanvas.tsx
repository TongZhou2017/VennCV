import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { useAppStore } from "../store/appStore";
import { PROJECT_STATUS_META, projectStatusVisual, rgbaToCss } from "../types";
import {
  completionLegendSwatchStroke,
  completionPercentageToCss,
} from "../viz/completionColor";
import { computeVizLayout, dataToScreen, hitTestProjectScreen, screenToData } from "../viz/layout";
import { VisualizationSvg } from "./VisualizationSvg";
import { measureCanvasHost } from "../viz/measureHost";
import { getKonvaStagePixelRatio } from "../viz/stagePixelRatio";
import { computeProjectNameLabelOffsets } from "../viz/projectLabelLayout";
import { projectAuthorSatellites } from "../domain/authors";
import { LS_FORCE_CANVAS_PR1, LS_SVG_VIZ } from "../storage/uiPrefs";

export function VisualizationCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const data = useAppStore((s) => s.data);
  const fieldOrder = useAppStore((s) => s.fieldOrder);
  const settings = useAppStore((s) => s.settings);
  const zoom = useAppStore((s) => s.visualizationZoom);
  const pan = useAppStore((s) => s.visualizationOffset);
  const setPan = useAppStore((s) => s.setVisualizationOffset);
  const setProjectPosition = useAppStore((s) => s.setProjectPosition);
  const selectProject = useAppStore((s) => s.selectProject);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const multiSelectedProjectIds = useAppStore((s) => s.multiSelectedProjectIds);
  const relationDraftFromId = useAppStore((s) => s.relationDraftFromId);
  const createRelation = useAppStore((s) => s.createRelation);
  const authorDisplay = useAppStore((s) => s.authorDisplay);
  const selectedPersonId = useAppStore((s) => s.selectedPersonId);
  const selectPerson = useAppStore((s) => s.selectPerson);

  const [wireEnd, setWireEnd] = useState<{ x: number; y: number } | null>(null);
  const [wireIndirectPreview, setWireIndirectPreview] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const setSettings = useAppStore((s) => s.setSettings);

  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const applyHostSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { w, h } = measureCanvasHost(el);
    setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
  }, []);

  useLayoutEffect(() => {
    applyHostSize();
  }, [applyHostSize]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => applyHostSize());
    ro.observe(el);
    const t0 = window.setTimeout(applyHostSize, 0);
    const t1 = window.setTimeout(applyHostSize, 200);
    const t2 = window.setTimeout(applyHostSize, 600);
    window.addEventListener("resize", applyHostSize);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", applyHostSize);
    vv?.addEventListener("scroll", applyHostSize);
    return () => {
      ro.disconnect();
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", applyHostSize);
      vv?.removeEventListener("resize", applyHostSize);
      vv?.removeEventListener("scroll", applyHostSize);
    };
  }, [applyHostSize]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      const st = useAppStore.getState();
      const z0 = st.visualizationZoom;
      const p0 = st.visualizationOffset;
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const factor = Math.exp(-ev.deltaY * 0.0014);
      const z1 = Math.min(6, Math.max(0.08, z0 * factor));
      if (Math.abs(z1 - z0) < 1e-9) return;
      const layout0 = computeVizLayout(st.data, w, h, z0, p0);
      const [wx, wy] = screenToData(px, py, layout0, z0, p0);
      const layout1 = computeVizLayout(st.data, w, h, z1, p0);
      const sx = layout1.offsetX + wx * layout1.autoScale * z1 + p0.x;
      const sy = layout1.offsetY + wy * layout1.autoScale * z1 + p0.y;
      st.setVisualizationZoom(z1);
      st.setVisualizationOffset({ x: p0.x + px - sx, y: p0.y + py - sy });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    try {
      const q = new URLSearchParams(globalThis.location?.search ?? "");
      const patch: Partial<{
        visualization_force_konva_pixel_ratio_1: boolean;
        visualization_use_svg: boolean;
      }> = {};
      if (q.get("canvas_pr") === "1" || q.get("venncv_pr1") === "1") {
        globalThis.localStorage?.setItem(LS_FORCE_CANVAS_PR1, "1");
        patch.visualization_force_konva_pixel_ratio_1 = true;
      }
      const sv = q.get("svg_viz");
      if (sv === "1") {
        globalThis.localStorage?.setItem(LS_SVG_VIZ, "1");
        patch.visualization_use_svg = true;
      } else if (sv === "0") {
        globalThis.localStorage?.setItem(LS_SVG_VIZ, "0");
        patch.visualization_use_svg = false;
      }
      if (Object.keys(patch).length) setSettings(patch);
    } catch {
      /* ignore */
    }
  }, [setSettings]);

  const layout = useMemo(
    () => computeVizLayout(data, size.w, size.h, zoom, pan),
    [data, size.w, size.h, zoom, pan],
  );

  const useSvgViz = settings.visualization_use_svg;
  const stagePixelRatio = useMemo(() => {
    if (settings.visualization_force_konva_pixel_ratio_1) return 1;
    return getKonvaStagePixelRatio();
  }, [settings.visualization_force_konva_pixel_ratio_1]);

  const projectList = useMemo(
    () => Object.values(data.projects).filter((p) => p.canvas_hidden !== true),
    [data.projects],
  );
  const nameLabelDy = useMemo(
    () =>
      settings.show_project_names
        ? computeProjectNameLabelOffsets(projectList, layout, zoom, pan)
        : {},
    [layout, pan, projectList, settings.show_project_names, zoom],
  );

  const bg = rgbaToCss(settings.visualization_bg_color);

  const onPanMove = useCallback(
    (clientX: number, clientY: number) => {
      const p = panRef.current;
      if (!p) return;
      setPan({
        x: p.ox + (clientX - p.x),
        y: p.oy + (clientY - p.y),
      });
    },
    [setPan],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => onPanMove(e.clientX, e.clientY);
    const onUp = () => {
      panRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onPanMove]);

  useEffect(() => {
    if (!relationDraftFromId) {
      setWireEnd(null);
      setWireIndirectPreview(false);
    }
  }, [relationDraftFromId]);

  /** Konva：在画布外松开取消连线草稿。SVG 模式由 VisualizationSvg 的 window pointerup 处理 */
  useEffect(() => {
    if (!relationDraftFromId || useSvgViz) return;
    const onWindowUp = () => {
      const st = useAppStore.getState();
      if (st.relationDraftFromId) {
        st.setRelationDraftFrom(null);
        setWireEnd(null);
        setWireIndirectPreview(false);
      }
    };
    window.addEventListener("mouseup", onWindowUp);
    return () => window.removeEventListener("mouseup", onWindowUp);
  }, [relationDraftFromId, useSvgViz]);

  /** 始终绘制全部领域圆（维恩底图）；不再要求「至少有一个项目归属」才显示 */
  const fieldsToDraw = useMemo(() => {
    const byOrder = fieldOrder
      .map((id) => data.fields[id])
      .filter((f): f is NonNullable<typeof f> => Boolean(f));
    const inOrder = new Set(fieldOrder);
    const extra = Object.values(data.fields).filter((f) => !inOrder.has(f.id));
    return [...byOrder, ...extra];
  }, [data.fields, fieldOrder]);

  const onBeginPan = useCallback(
    (clientX: number, clientY: number) => {
      panRef.current = {
        x: clientX,
        y: clientY,
        ox: pan.x,
        oy: pan.y,
      };
    },
    [pan.x, pan.y],
  );

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        width: "100%",
        background: "#2b2b2b",
        position: "relative",
      }}
    >
      {useSvgViz ? (
        <VisualizationSvg
          svgRef={svgRef}
          size={size}
          data={data}
          layout={layout}
          zoom={zoom}
          pan={pan}
          settings={settings}
          fieldsToDraw={fieldsToDraw}
          selectedProjectId={selectedProjectId}
          multiSelectedProjectIds={multiSelectedProjectIds}
          relationDraftFromId={relationDraftFromId}
          wireEnd={wireEnd}
          wireIndirectPreview={wireIndirectPreview}
          nameLabelDy={nameLabelDy}
          setWireEnd={setWireEnd}
          setWireIndirectPreview={setWireIndirectPreview}
          onBeginPan={onBeginPan}
        />
      ) : (
      <Stage
        key={`konva-pr-${stagePixelRatio}-${size.w}x${size.h}`}
        width={size.w}
        height={size.h}
        pixelRatio={stagePixelRatio}
        onMouseDown={(e) => {
          if (e.evt.button === 1 || (e.evt.button === 0 && e.evt.altKey)) {
            panRef.current = {
              x: e.evt.clientX,
              y: e.evt.clientY,
              ox: pan.x,
              oy: pan.y,
            };
          }
        }}
        onMouseMove={(e) => {
          const draft = useAppStore.getState().relationDraftFromId;
          if (!draft) return;
          const pos = e.target.getStage()?.getPointerPosition();
          if (pos) setWireEnd(pos);
          setWireIndirectPreview(e.evt.shiftKey);
        }}
        onMouseUp={(e) => {
          const draft = useAppStore.getState().relationDraftFromId;
          if (!draft) return;
          const pos = e.target.getStage()?.getPointerPosition();
          useAppStore.getState().setRelationDraftFrom(null);
          setWireEnd(null);
          setWireIndirectPreview(false);
          if (pos) {
            const toId = hitTestProjectScreen(pos.x, pos.y, data, layout, zoom, pan);
            if (toId && toId !== draft) {
              useAppStore.getState().createRelation(draft, toId, { indirect: e.evt.shiftKey });
            }
          }
        }}
      >
        <Layer>
          <Rect x={0} y={0} width={size.w} height={size.h} fill={bg} listening={false} />
        </Layer>
        <Layer listening={false}>
          {fieldsToDraw.map((field) => {
            const [cx, cy] = dataToScreen(
              field.position[0],
              field.position[1],
              layout,
              zoom,
              pan,
            );
            const r = field.radius * layout.autoScale * zoom;
            return (
              <Circle
                key={field.id}
                x={cx}
                y={cy}
                radius={r}
                stroke="#888"
                strokeWidth={settings.field_border_width}
                fillEnabled={false}
              />
            );
          })}
        </Layer>
        <Layer listening={false}>
          {fieldsToDraw.map((field) => {
            const [cx, cy] = dataToScreen(
              field.position[0],
              field.position[1],
              layout,
              zoom,
              pan,
            );
            const r = field.radius * layout.autoScale * zoom;
            const ty = cy - r - 18;
            return (
              <Text
                key={`${field.id}-label`}
                x={cx}
                y={ty}
                text={field.name}
                fontSize={14}
                fill="#111"
                align="center"
                offsetX={field.name.length * 3.5}
              />
            );
          })}
        </Layer>
        <Layer listening={false}>
          {data.relations.map((rel, i) => {
            const from = data.projects[rel.from_id];
            const to = data.projects[rel.to_id];
            if (!from || !to || from.canvas_hidden === true || to.canvas_hidden === true) return null;
            const [fx, fy] = dataToScreen(from.position[0], from.position[1], layout, zoom, pan);
            const [tx, ty] = dataToScreen(to.position[0], to.position[1], layout, zoom, pan);
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
            const dash = rel.relation_type === "Indirect" ? [5, 5] : undefined;
            const arr = 10;
            const px = -uy;
            const py = ux;
            const tip1x = x2 - ux * arr + px * (arr * 0.5);
            const tip1y = y2 - uy * arr + py * (arr * 0.5);
            const tip2x = x2 - ux * arr - px * (arr * 0.5);
            const tip2y = y2 - uy * arr - py * (arr * 0.5);
            return (
              <Line
                key={`rel-${i}-${rel.from_id}-${rel.to_id}`}
                points={[
                  x1,
                  y1,
                  x2,
                  y2,
                  x2,
                  y2,
                  tip1x,
                  tip1y,
                  x2,
                  y2,
                  tip2x,
                  tip2y,
                ]}
                stroke={col}
                strokeWidth={rel.width}
                dash={dash}
                lineCap="round"
                lineJoin="round"
              />
            );
          })}
        </Layer>
        <Layer listening={false}>
          {data.relations.map((rel, i) => {
            const from = data.projects[rel.from_id];
            const to = data.projects[rel.to_id];
            if (!from || !to || rel.tags.length === 0) return null;
            if (from.canvas_hidden === true || to.canvas_hidden === true) return null;
            const [fx, fy] = dataToScreen(from.position[0], from.position[1], layout, zoom, pan);
            const [tx, ty] = dataToScreen(to.position[0], to.position[1], layout, zoom, pan);
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
            const px = -uy;
            const py = ux;
            const mx = (x1 + x2) / 2 + px * 15;
            const my = (y1 + y2) / 2 + py * 15;
            const text = rel.tags.join(", ");
            return (
              <Text
                key={`rel-t-${i}`}
                x={mx}
                y={my}
                text={text}
                fontSize={10}
                fill="#444"
                align="center"
                offsetX={text.length * 2.5}
              />
            );
          })}
        </Layer>
        <Layer listening={false}>
          {relationDraftFromId && wireEnd ? (() => {
            const from = data.projects[relationDraftFromId];
            if (!from) return null;
            const [x1, y1] = dataToScreen(from.position[0], from.position[1], layout, zoom, pan);
            return (
              <Line
                points={[x1, y1, wireEnd.x, wireEnd.y]}
                stroke="#007acc"
                strokeWidth={2}
                dash={wireIndirectPreview ? [6, 6] : undefined}
                lineCap="round"
              />
            );
          })() : null}
        </Layer>
        <Layer>
          {projectList.map((proj) => {
            const [sx, sy] = dataToScreen(proj.position[0], proj.position[1], layout, zoom, pan);
            const r = proj.radius * layout.autoScale * zoom;
            const meta = projectStatusVisual(proj.status);
            const strokeW = settings.project_border_width;
            const sel = selectedProjectId === proj.id;
            const inMulti = multiSelectedProjectIds.includes(proj.id);
            const completionStroke = completionPercentageToCss(proj.completion_percentage);
            return (
              <Group
                key={proj.id}
                x={sx}
                y={sy}
                draggable={!relationDraftFromId}
                onDragStart={(e) => {
                  if (e.evt.shiftKey) e.target.stopDrag();
                }}
                onDragEnd={(e) => {
                  const g = e.target;
                  const nx = g.x();
                  const ny = g.y();
                  const [dx, dy] = screenToData(nx, ny, layout, zoom, pan);
                  setProjectPosition(proj.id, [dx, dy]);
                  g.position({ x: sx, y: sy });
                }}
              >
                {inMulti && !sel ? (
                  <Circle
                    x={0}
                    y={0}
                    radius={r + 4}
                    stroke="#ff9800"
                    strokeWidth={2}
                    fill="rgba(0,0,0,0)"
                    listening={false}
                  />
                ) : null}
                {sel ? (
                  <Circle
                    x={0}
                    y={0}
                    radius={r + 3}
                    stroke="#007acc"
                    strokeWidth={3}
                    fill="rgba(0,0,0,0)"
                    listening={false}
                  />
                ) : null}
                <Circle
                  x={0}
                  y={0}
                  radius={r}
                  fill={meta.fill}
                  stroke={completionStroke}
                  strokeWidth={strokeW}
                  onMouseDown={(e) => {
                    const ev = e.evt;
                    if (ev.shiftKey) return;
                    if (!(ev.metaKey || ev.ctrlKey)) return;
                    if (selectedProjectId !== proj.id) return;
                    ev.preventDefault();
                    flushSync(() => {
                      useAppStore.getState().setRelationDraftFrom(proj.id);
                    });
                    const p = e.target.getStage()?.getPointerPosition();
                    if (p) setWireEnd(p);
                    setWireIndirectPreview(ev.shiftKey);
                  }}
                  onClick={(e) => {
                    const ev = e.evt;
                    if (ev.metaKey || ev.ctrlKey) {
                      if (selectedProjectId && selectedProjectId !== proj.id) {
                        createRelation(selectedProjectId, proj.id, { indirect: ev.shiftKey });
                      }
                      return;
                    }
                    if (ev.shiftKey) {
                      selectProject(proj.id, { additive: true });
                      return;
                    }
                    selectProject(proj.id);
                  }}
                  onTap={(e) => {
                    const ev = e.evt as MouseEvent | TouchEvent | undefined;
                    const mouse = ev && "metaKey" in ev ? ev : null;
                    if (mouse && (mouse.metaKey || mouse.ctrlKey)) {
                      if (selectedProjectId && selectedProjectId !== proj.id) {
                        createRelation(selectedProjectId, proj.id, {
                          indirect: "shiftKey" in mouse && mouse.shiftKey,
                        });
                      }
                      return;
                    }
                    if (mouse && "shiftKey" in mouse && mouse.shiftKey) {
                      selectProject(proj.id, { additive: true });
                      return;
                    }
                    selectProject(proj.id);
                  }}
                />
                {projectAuthorSatellites(proj, data, authorDisplay).map((sat) => {
                  const scale = layout.autoScale * zoom;
                  const sr = sat.radius * scale;
                  const fontSize = Math.max(8, sr * 0.7);
                  const highlighted = selectedPersonId === sat.personId;
                  return (
                    <Group key={sat.personId} x={sat.dx * scale} y={sat.dy * scale}>
                      <Circle
                        radius={sr}
                        fill={sat.color}
                        stroke={highlighted ? "#1c2430" : "#ffffff"}
                        strokeWidth={highlighted ? 2.5 : 1}
                        onMouseDown={(event) => {
                          event.cancelBubble = true;
                        }}
                        onClick={(event) => {
                          event.cancelBubble = true;
                          selectPerson(sat.personId);
                        }}
                        onTap={(event) => {
                          event.cancelBubble = true;
                          selectPerson(sat.personId);
                        }}
                      />
                      <Text
                        text={sat.shortName}
                        fontSize={fontSize}
                        fill="#ffffff"
                        width={sr * 2}
                        offsetX={sr}
                        offsetY={fontSize / 2}
                        align="center"
                        listening={false}
                      />
                    </Group>
                  );
                })}
              </Group>
            );
          })}
        </Layer>
        {settings.show_project_names ? (
          <Layer listening={false}>
            {projectList.map((proj) => {
              const [sx, sy] = dataToScreen(proj.position[0], proj.position[1], layout, zoom, pan);
              const r = proj.radius * layout.autoScale * zoom;
              const extraY = nameLabelDy[proj.id] ?? 0;
              return (
                <Text
                  key={`${proj.id}-name`}
                  x={sx}
                  y={sy + r + 14 + extraY}
                  text={proj.name}
                  fontSize={12}
                  fill="#111"
                  align="center"
                  offsetX={proj.name.length * 3}
                />
              );
            })}
          </Layer>
        ) : null}
        {settings.show_legend ? (() => {
          const statusKeys = Object.keys(PROJECT_STATUS_META) as (keyof typeof PROJECT_STATUS_META)[];
          const legendW = 126;
          const legendX = size.w - legendW - 10;
          const legendY = 12;
          const titleY = 22;
          const statusLabelY = 36;
          const statusRow0 = 50;
          const rowStep = 18;
          const completionTitleY = statusRow0 + statusKeys.length * rowStep + 8;
          const completionRow0 = completionTitleY + 12;
          const completionExamples = [0, 50, 100] as const;
          const legendH =
            completionRow0 + completionExamples.length * rowStep + 8 - legendY;
          const cx0 = legendX + 16;
          return (
            <Layer listening={false}>
              <Rect
                x={legendX}
                y={legendY}
                width={legendW}
                height={legendH}
                fill="rgba(255,255,255,0.92)"
                stroke="#ccc"
                cornerRadius={4}
              />
              <Text
                x={legendX + legendW / 2}
                y={titleY}
                text="图例"
                fontSize={12}
                fill="#111"
                align="center"
              />
              <Text x={legendX + 10} y={statusLabelY} text="项目状态" fontSize={10} fill="#555" />
              {statusKeys.map((k, idx) => {
                const v = PROJECT_STATUS_META[k];
                return (
                  <Text
                    key={k}
                    x={legendX + 10}
                    y={statusRow0 + idx * rowStep}
                    text={`■ ${v.label}`}
                    fontSize={10}
                    fill={v.fill}
                  />
                );
              })}
              <Text
                x={legendX + 10}
                y={completionTitleY}
                text="完成度（白→黑）"
                fontSize={10}
                fill="#555"
              />
              {completionExamples.map((pct, idx) => {
                const rowY = completionRow0 + idx * rowStep;
                const fill = completionPercentageToCss(pct);
                const legStroke = completionLegendSwatchStroke(pct);
                return (
                  <Group key={pct} listening={false}>
                    <Circle
                      x={cx0}
                      y={rowY}
                      radius={5}
                      fill={fill}
                      stroke={legStroke}
                      strokeWidth={1}
                      strokeEnabled={!!legStroke}
                    />
                    <Text
                      x={cx0 + 12}
                      y={rowY}
                      text={`${pct}%`}
                      fontSize={10}
                      fill="#111"
                      verticalAlign="middle"
                    />
                  </Group>
                );
              })}
            </Layer>
          );
        })() : null}
      </Stage>
      )}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: 8,
          right: 8,
          fontSize: 11,
          color: "#aaa",
          pointerEvents: "none",
        }}
      >
        Alt+拖动 或中键平移 · 滚轮缩放 · ⌘/Ctrl+点击另一项目连线（⇧ 虚线）· ⌘/Ctrl+在已选圆上按下拖拽到目标松手 ·
        画布选项见工具栏「设置」
      </div>
    </div>
  );
}
