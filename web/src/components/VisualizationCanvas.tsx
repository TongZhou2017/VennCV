import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type Konva from "konva";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { useAppStore } from "../store/appStore";
import { PROJECT_STATUS_META, projectStatusVisual, rgbaToCss } from "../types";
import {
  completionLegendSwatchStroke,
  completionPercentageToCss,
} from "../viz/completionColor";
import { computeVizLayout, dataToScreen, hitTestProjectScreen, screenToData } from "../viz/layout";
import { VisualizationSvg } from "./VisualizationSvg";
import { VennContextMenu } from "./VennContextMenu";
import {
  blobFromDataUrl,
  copyImageToClipboard,
  downloadBlob,
  pngBlobFromSvg,
  serializeSvg,
  svgWrappingPng,
} from "../viz/figureExport";
import { measureCanvasHost } from "../viz/measureHost";
import { getKonvaStagePixelRatio } from "../viz/stagePixelRatio";
import { textWidth } from "../viz/projectLabelLayout";
import { FIELD_LABEL_FONT, LEGEND_BOX, canvasChrome, clampLegendPosition, placeFieldLabels, placeLegend, placeProjectNames } from "../viz/sceneSpace";
import {
  relationLabelPoint,
  SELECTION_RING,
  positionsFromData,
  useScenePose,
  type SceneDragPhase,
} from "../viz/sceneMotion";
import { projectAuthorSatellites } from "../domain/authors";
import { effectiveCompletion } from "../domain/progress";
import { LS_FORCE_CANVAS_PR1, LS_SVG_VIZ, readLegendPosFromStorage, writeLegendPosToStorage } from "../storage/uiPrefs";

export function VisualizationCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [legendPos, setLegendPos] = useState<{ x: number; y: number } | null>(() => readLegendPosFromStorage());
  const legendDragRef = useRef<{ x: number; y: number; ox: number; oy: number; last: { x: number; y: number } } | null>(null);
  const legendLatchRef = useRef<{ key: string; at: { x: number; y: number } } | null>(null);

  const data = useAppStore((s) => s.data);
  const fieldOrder = useAppStore((s) => s.fieldOrder);
  const settings = useAppStore((s) => s.settings);
  const zoom = useAppStore((s) => s.visualizationZoom);
  const pan = useAppStore((s) => s.visualizationOffset);
  const setPan = useAppStore((s) => s.setVisualizationOffset);
  const selectProject = useAppStore((s) => s.selectProject);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const multiSelectedProjectIds = useAppStore((s) => s.multiSelectedProjectIds);
  const relationDraftFromId = useAppStore((s) => s.relationDraftFromId);
  const createRelation = useAppStore((s) => s.createRelation);
  const authorDisplay = useAppStore((s) => s.authorDisplay);
  const selectedPersonId = useAppStore((s) => s.selectedPersonId);
  const selectPerson = useAppStore((s) => s.selectPerson);
  const showBannerNotice = useAppStore((s) => s.showBannerNotice);
  const relayoutFieldsAsVenn = useAppStore((s) => s.relayoutFieldsAsVenn);
  const selectProjectsWithSameStatus = useAppStore((s) => s.selectProjectsWithSameStatus);
  const selectProjectsWithSameFieldSet = useAppStore((s) => s.selectProjectsWithSameFieldSet);
  const selectProjectsWithSamePrefix = useAppStore((s) => s.selectProjectsWithSamePrefix);
  const selectProjectsWithSameVennRelation = useAppStore((s) => s.selectProjectsWithSameVennRelation);

  const [wireEnd, setWireEnd] = useState<{ x: number; y: number } | null>(null);
  const [wireIndirectPreview, setWireIndirectPreview] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const setSettings = useAppStore((s) => s.setSettings);

  const panRef = useRef<{ x: number; y: number; ox: number; oy: number; pointerId: number } | null>(null);
  const [panning, setPanning] = useState(false);

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
  const settledDataRef = useRef<typeof data | null>(null);
  const { pose, positionOf, beginDrag, moveDrag, endDrag, cancelDrag } = useScenePose(
    data,
    (id, pos) => {
      const solved = useAppStore.getState().previewDrag(id, pos);
      settledDataRef.current = solved;
      return solved ? positionsFromData(solved) : positionsFromData(useAppStore.getState().data);
    },
    () => {
      const solved = settledDataRef.current;
      if (solved) useAppStore.getState().commitSettled(solved);
    },
  );
  const posedProjects = useMemo(
    () =>
      projectList.map((project) => {
        const position = pose?.[project.id] ?? project.position;
        if (position[0] === project.position[0] && position[1] === project.position[1]) return project;
        return { ...project, position };
      }),
    [pose, projectList],
  );
  const onDragProject = useCallback((phase: SceneDragPhase, id: string, pos: [number, number]) => {
    switch (phase) {
      case "start":
        beginDrag(id);
        return;
      case "move":
        moveDrag(id, pos);
        return;
      case "end":
        endDrag(id, pos);
        return;
      case "cancel":
        cancelDrag();
        return;
      default: {
        const unreachable: never = phase;
        return unreachable;
      }
    }
  }, [beginDrag, cancelDrag, endDrag, moveDrag]);

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
    const endPan = (pointerId: number | null) => {
      const current = panRef.current;
      if (!current) return;
      if (pointerId !== null && current.pointerId >= 0 && current.pointerId !== pointerId) return;
      panRef.current = null;
      setPanning(false);
      const host = containerRef.current;
      if (!host || current.pointerId < 0) return;
      try {
        if (host.hasPointerCapture(current.pointerId)) host.releasePointerCapture(current.pointerId);
      } catch {
        // 松开时捕获可能已经结束。
      }
    };
    const onMove = (event: PointerEvent) => {
      const current = panRef.current;
      if (!current || (current.pointerId >= 0 && event.pointerId !== current.pointerId)) return;
      if ((event.buttons & 5) === 0) {
        endPan(event.pointerId);
        return;
      }
      onPanMove(event.clientX, event.clientY);
    };
    const onUp = (event: PointerEvent) => endPan(event.pointerId);
    const onBlur = () => endPan(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onBlur);
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

  const sceneLabels = useMemo(() => {
    const projects = posedProjects.map((project) => {
      const [x, y] = dataToScreen(project.position[0], project.position[1], layout, zoom, pan);
      return {
        id: project.id,
        x,
        y,
        r: project.radius * layout.autoScale * zoom,
        name: project.name,
        fieldIds: project.field_ids,
      };
    });
    const fields = fieldsToDraw.map((field) => {
      const [x, y] = dataToScreen(field.position[0], field.position[1], layout, zoom, pan);
      return { id: field.id, name: field.name, x, y, r: field.radius * layout.autoScale * zoom };
    });
    const fieldLabels = placeFieldLabels(fields);
    const chrome = canvasChrome(size.w, size.h);
    const latchKey = `${size.w}x${size.h}|${zoom}|${fields.map((field) => field.id).join(",")}`;
    const autoLegend = () =>
      placeLegend(
        size.w,
        size.h,
        LEGEND_BOX.w,
        LEGEND_BOX.h,
        [
          ...fields.map((field) => ({ x: field.x, y: field.y, r: field.r })),
          ...projects.map((project) => ({ x: project.x, y: project.y, r: project.r })),
          ...fieldLabels.map((label) => ({ x: label.x, y: label.y, r: 22 })),
        ],
        chrome,
      );
    let legendAt = legendPos
      ? clampLegendPosition(legendPos.x, legendPos.y, size.w, size.h, LEGEND_BOX.w, LEGEND_BOX.h, chrome)
      : legendLatchRef.current?.key === latchKey
        ? legendLatchRef.current.at
        : autoLegend();
    if (!legendPos && legendLatchRef.current?.key !== latchKey) {
      legendLatchRef.current = { key: latchKey, at: legendAt };
    }
    const obstacles = [
      ...chrome,
      ...fieldLabels.map((label) => {
        const name = fields.find((field) => field.id === label.id)?.name ?? "";
        const w = textWidth(name, FIELD_LABEL_FONT);
        return { x: label.x - w / 2, y: label.y - 9, w, h: 18 };
      }),
      ...(settings.show_legend
        ? [{ x: legendAt.x, y: legendAt.y, w: LEGEND_BOX.w, h: LEGEND_BOX.h }]
        : []),
    ];
    const placed = new Map(projects.map((project) => [project.id, project]));
    const arrows = data.relations.flatMap((rel) => {
      const from = placed.get(rel.from_id);
      const to = placed.get(rel.to_id);
      if (!from || !to) return [];
      return [{ x1: from.x, y1: from.y, x2: to.x, y2: to.y }];
    });
    const names = settings.show_project_names ? placeProjectNames(projects, obstacles, fields, arrows) : [];
    return { fieldLabels, names, legendAt };
  }, [data.relations, fieldsToDraw, layout, legendPos, pan, posedProjects, settings.show_legend, settings.show_project_names, size.h, size.w, zoom]);

  useEffect(() => {
    if (!menuAt) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuAt(null);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.querySelector(".venn-menu")?.contains(target)) return;
      setMenuAt(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [menuAt]);

  const pngBlob = useCallback(async () => {
    if (useSvgViz) {
      const svg = svgRef.current;
      if (!svg) throw new Error("没有画布");
      return pngBlobFromSvg(svg, size.w, size.h);
    }
    const stage = stageRef.current;
    if (!stage) throw new Error("没有画布");
    return blobFromDataUrl(stage.toDataURL({ mimeType: "image/png", pixelRatio: 2 }));
  }, [size.h, size.w, useSvgViz]);

  const reportExportError = useCallback(
    (error: unknown) => {
      showBannerNotice(error instanceof Error ? error.message : "无法导出图片", true);
    },
    [showBannerNotice],
  );

  const exportPng = useCallback(() => {
    setMenuAt(null);
    void pngBlob()
      .then((blob) => {
        downloadBlob(blob, "venncv.png");
        showBannerNotice("已导出 PNG");
      })
      .catch(reportExportError);
  }, [pngBlob, reportExportError, showBannerNotice]);

  const exportSvg = useCallback(() => {
    setMenuAt(null);
    const task = (async () => {
      if (useSvgViz && svgRef.current) {
        const markup = serializeSvg(svgRef.current);
        downloadBlob(new Blob([markup], { type: "image/svg+xml" }), "venncv.svg");
        return;
      }
      const stage = stageRef.current;
      if (!stage) throw new Error("没有画布");
      const url = stage.toDataURL({ mimeType: "image/png", pixelRatio: 2 });
      const markup = svgWrappingPng(url, size.w, size.h);
      downloadBlob(new Blob([markup], { type: "image/svg+xml" }), "venncv.svg");
    })();
    void task.then(() => showBannerNotice("已导出 SVG")).catch(reportExportError);
  }, [reportExportError, showBannerNotice, size.h, size.w, useSvgViz]);

  const copyImage = useCallback(() => {
    setMenuAt(null);
    void pngBlob()
      .then((blob) => copyImageToClipboard(blob))
      .then(() => showBannerNotice("图片已复制"))
      .catch(reportExportError);
  }, [pngBlob, reportExportError, showBannerNotice]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = legendDragRef.current;
      if (!drag) return;
      const host = containerRef.current?.getBoundingClientRect();
      if (!host) return;
      const next = clampLegendPosition(
        drag.ox + event.clientX - drag.x,
        drag.oy + event.clientY - drag.y,
        host.width,
        host.height,
        LEGEND_BOX.w,
        LEGEND_BOX.h,
        canvasChrome(host.width, host.height),
      );
      drag.last = next;
      setLegendPos(next);
    };
    const onUp = () => {
      const drag = legendDragRef.current;
      if (!drag) return;
      legendDragRef.current = null;
      writeLegendPosToStorage(drag.last);
      setLegendPos(drag.last);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const onLegendPointerDown = useCallback((clientX: number, clientY: number) => {
    const origin = sceneLabels.legendAt;
    legendDragRef.current = { x: clientX, y: clientY, ox: origin.x, oy: origin.y, last: origin };
  }, [sceneLabels.legendAt]);

  const onBeginPan = useCallback(
    (clientX: number, clientY: number, pointerId: number) => {
      panRef.current = {
        x: clientX,
        y: clientY,
        ox: pan.x,
        oy: pan.y,
        pointerId,
      };
      setPanning(true);
      const host = containerRef.current;
      if (!host || pointerId < 0) return;
      try {
        host.setPointerCapture(pointerId);
      } catch {
        // 指针已经松开时捕获会失败，随后的移动会按按钮状态结束。
      }
    },
    [pan.x, pan.y],
  );

  return (
    <div
      ref={containerRef}
      onContextMenu={(event) => {
        event.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setMenuAt({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      }}
      style={{
        flex: 1,
        minHeight: 0,
        width: "100%",
        background: "#2b2b2b",
        position: "relative",
        cursor: panning ? "grabbing" : "grab",
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
          sceneLabels={sceneLabels}
          pose={pose}
          onDragProject={onDragProject}
          setWireEnd={setWireEnd}
          setWireIndirectPreview={setWireIndirectPreview}
          onBeginPan={onBeginPan}
          onLegendPointerDown={onLegendPointerDown}
        />
      ) : (
      <Stage
        ref={stageRef}
        key={`konva-pr-${stagePixelRatio}-${size.w}x${size.h}`}
        width={size.w}
        height={size.h}
        pixelRatio={stagePixelRatio}
        onMouseDown={(e) => {
          const ev = e.evt;
          if (ev.button === 2) return;
          if (ev.button === 0 && (ev.metaKey || ev.ctrlKey || ev.shiftKey)) return;
          if (ev.button !== 0 && ev.button !== 1) return;
          const pointerId = ev instanceof PointerEvent ? ev.pointerId : -1;
          onBeginPan(ev.clientX, ev.clientY, pointerId);
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
          {sceneLabels.fieldLabels.map((label) => {
            const field = fieldsToDraw.find((item) => item.id === label.id);
            if (!field) return null;
            return (
              <Text
                key={`${field.id}-label`}
                x={label.x}
                y={label.y}
                text={field.name}
                fontSize={FIELD_LABEL_FONT}
                fill="#111"
                align="center"
                offsetX={textWidth(field.name, FIELD_LABEL_FONT) / 2}
                offsetY={FIELD_LABEL_FONT / 2}
              />
            );
          })}
        </Layer>
        <Layer listening={false}>
          {data.relations.map((rel, i) => {
            const from = data.projects[rel.from_id];
            const to = data.projects[rel.to_id];
            if (!from || !to || from.canvas_hidden === true || to.canvas_hidden === true) return null;
            const fromPos = positionOf(from.id, from.position);
            const toPos = positionOf(to.id, to.position);
            const [fx, fy] = dataToScreen(fromPos[0], fromPos[1], layout, zoom, pan);
            const [tx, ty] = dataToScreen(toPos[0], toPos[1], layout, zoom, pan);
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
            if (selectedProjectId !== from.id && selectedProjectId !== to.id) return null;
            const fromPos = positionOf(from.id, from.position);
            const toPos = positionOf(to.id, to.position);
            const [fx, fy] = dataToScreen(fromPos[0], fromPos[1], layout, zoom, pan);
            const [tx, ty] = dataToScreen(toPos[0], toPos[1], layout, zoom, pan);
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
              <Group key={`rel-t-${i}`} x={labelAt.x} y={labelAt.y} listening={false}>
                <Rect
                  x={-labelW / 2 - 4}
                  y={-9}
                  width={labelW + 8}
                  height={16}
                  fill="rgba(255,255,255,0.92)"
                  cornerRadius={3}
                />
                <Text
                  x={0}
                  y={-1}
                  text={text}
                  fontSize={10}
                  fill="#444"
                  align="center"
                  offsetX={labelW / 2}
                />
              </Group>
            );
          })}
        </Layer>
        <Layer listening={false}>
          {relationDraftFromId && wireEnd ? (() => {
            const from = data.projects[relationDraftFromId];
            if (!from) return null;
            const fromPos = positionOf(from.id, from.position);
            const [x1, y1] = dataToScreen(fromPos[0], fromPos[1], layout, zoom, pan);
            return (
              <Line
                points={[x1, y1, wireEnd.x, wireEnd.y]}
                stroke={SELECTION_RING}
                strokeWidth={2}
                dash={wireIndirectPreview ? [6, 6] : undefined}
                lineCap="round"
              />
            );
          })() : null}
        </Layer>
        <Layer>
          {projectList.map((proj) => {
            const shown = positionOf(proj.id, proj.position);
            const [sx, sy] = dataToScreen(shown[0], shown[1], layout, zoom, pan);
            const r = proj.radius * layout.autoScale * zoom;
            const meta = projectStatusVisual(proj.status);
            const strokeW = settings.project_border_width;
            const sel = selectedProjectId === proj.id;
            const inMulti = multiSelectedProjectIds.includes(proj.id);
            const completionStroke = completionPercentageToCss(effectiveCompletion(proj));
            return (
              <Group key={proj.id} x={sx} y={sy}>
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
                    stroke={SELECTION_RING}
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
                    if (ev.shiftKey || ev.button === 1 || ev.altKey) return;
                    if (ev.metaKey || ev.ctrlKey) {
                      if (selectedProjectId !== proj.id) return;
                      ev.preventDefault();
                      flushSync(() => {
                        useAppStore.getState().setRelationDraftFrom(proj.id);
                      });
                      const p = e.target.getStage()?.getPointerPosition();
                      if (p) setWireEnd(p);
                      setWireIndirectPreview(ev.shiftKey);
                      return;
                    }
                    if (relationDraftFromId) return;
                    const stage = e.target.getStage();
                    const container = stage?.container();
                    if (!stage || !container) return;
                    e.cancelBubble = true;
                    beginDrag(proj.id);
                    const startX = ev.clientX;
                    const startY = ev.clientY;
                    let moved = false;
                    const pointerData = (clientX: number, clientY: number): [number, number] => {
                      const rect = container.getBoundingClientRect();
                      return screenToData(clientX - rect.left, clientY - rect.top, layout, zoom, pan);
                    };
                    const onMove = (moveEvent: MouseEvent) => {
                      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 4) moved = true;
                      moveDrag(proj.id, pointerData(moveEvent.clientX, moveEvent.clientY));
                    };
                    const onUp = (upEvent: MouseEvent) => {
                      window.removeEventListener("mousemove", onMove);
                      window.removeEventListener("mouseup", onUp);
                      if (!moved) {
                        cancelDrag();
                        return;
                      }
                      endDrag(proj.id, pointerData(upEvent.clientX, upEvent.clientY));
                    };
                    window.addEventListener("mousemove", onMove);
                    window.addEventListener("mouseup", onUp);
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
            {sceneLabels.names.map((place) => {
              const proj = data.projects[place.id];
              if (!proj) return null;
              const width = textWidth(proj.name, place.fontSize);
              const offsetX = place.anchor === "start" ? 0 : place.anchor === "end" ? width : width / 2;
              return (
                <Text
                  key={`${proj.id}-name`}
                  x={place.x}
                  y={place.y}
                  text={proj.name}
                  fontSize={place.fontSize}
                  fill="#111"
                  offsetX={offsetX}
                  offsetY={place.fontSize / 2}
                />
              );
            })}
          </Layer>
        ) : null}
        {settings.show_legend ? (() => {
          const statusKeys = Object.keys(PROJECT_STATUS_META) as (keyof typeof PROJECT_STATUS_META)[];
          const legendW = LEGEND_BOX.w;
          const legendH = LEGEND_BOX.h;
          const legendX = sceneLabels.legendAt.x;
          const legendY = sceneLabels.legendAt.y;
          const titleY = legendY + 10;
          const statusLabelY = legendY + 24;
          const statusRow0 = legendY + 38;
          const rowStep = 18;
          const completionTitleY = statusRow0 + statusKeys.length * rowStep + 8;
          const completionRow0 = completionTitleY + 12;
          const completionExamples = [0, 50, 100] as const;
          const cx0 = legendX + 16;
          return (
            <Layer>
              <Group
                onMouseDown={(event) => {
                  event.cancelBubble = true;
                  event.evt.preventDefault();
                  onLegendPointerDown(event.evt.clientX, event.evt.clientY);
                }}
              >
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
              </Group>
            </Layer>
          );
        })() : null}
      </Stage>
      )}
      {menuAt ? (
        <VennContextMenu
          x={menuAt.x}
          y={menuAt.y}
          canvasWidth={size.w}
          canvasHeight={size.h}
          onRefreshLayout={() => {
            setMenuAt(null);
            relayoutFieldsAsVenn();
          }}
          selectActions={[
            { label: "同状态", title: "选中状态相同的项目", onClick: () => { setMenuAt(null); selectProjectsWithSameStatus(); } },
            { label: "同领域", title: "选中所属领域勾选完全相同的项目", onClick: () => { setMenuAt(null); selectProjectsWithSameFieldSet(); } },
            { label: "同前缀", title: "按空格或连字符 - 前的一段选择", onClick: () => { setMenuAt(null); selectProjectsWithSamePrefix(); } },
            { label: "同维恩关系", title: "选中落在同一块交集里的项目", onClick: () => { setMenuAt(null); selectProjectsWithSameVennRelation(); } },
          ]}
          onExportPng={exportPng}
          onExportSvg={exportSvg}
          onCopyImage={copyImage}
        />
      ) : null}
    </div>
  );
}
