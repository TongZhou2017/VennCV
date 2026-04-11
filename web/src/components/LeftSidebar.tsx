import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useAppStore } from "../store/appStore";
import { projectStatusVisual } from "../types";

const ROW_H = 28;
const DRAG_THRESHOLD_PX = 6;

type ReorderDrag =
  | { kind: "field"; id: string }
  | { kind: "project"; id: string };

export function LeftSidebar() {
  const data = useAppStore((s) => s.data);
  const fieldOrder = useAppStore((s) => s.fieldOrder);
  const projectOrder = useAppStore((s) => s.projectOrder);
  const addField = useAppStore((s) => s.addField);
  const removeField = useAppStore((s) => s.removeField);
  const renameField = useAppStore((s) => s.renameField);
  const reorderFields = useAppStore((s) => s.reorderFields);
  const reorderProjects = useAppStore((s) => s.reorderProjects);
  const addProject = useAppStore((s) => s.addProject);
  const removeProject = useAppStore((s) => s.removeProject);
  const selectProject = useAppStore((s) => s.selectProject);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const multiSelectedProjectIds = useAppStore((s) => s.multiSelectedProjectIds);
  const restoreProjectFromTrash = useAppStore((s) => s.restoreProjectFromTrash);
  const purgeProjectFromTrash = useAppStore((s) => s.purgeProjectFromTrash);

  const [fieldSectionH, setFieldSectionH] = useState(160);
  const [trashOpen, setTrashOpen] = useState(false);

  const dragRef = useRef<ReorderDrag | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasDragMovedRef = useRef(false);
  const suppressProjectRowClickRef = useRef(false);

  const finishReorderPointer = useCallback(
    (ev: PointerEvent) => {
      const d = dragRef.current;
      const moved = hasDragMovedRef.current;
      dragRef.current = null;
      pointerStartRef.current = null;
      hasDragMovedRef.current = false;

      if (!d || !moved) return;

      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!el) return;

      if (d.kind === "field") {
        const row = el.closest("[data-reorder-field]");
        const toId = row?.getAttribute("data-reorder-field");
        if (toId && toId !== d.id) reorderFields(d.id, toId);
        return;
      }

      const row = el.closest("[data-reorder-project]");
      const toId = row?.getAttribute("data-reorder-project");
      if (toId && toId !== d.id) {
        reorderProjects(d.id, toId);
        suppressProjectRowClickRef.current = true;
      }
    },
    [reorderFields, reorderProjects],
  );

  const attachReorderPointer = useCallback(
    (d: ReorderDrag, startEv: ReactPointerEvent) => {
      if (startEv.button !== 0) return;
      startEv.preventDefault();
      startEv.stopPropagation();

      dragRef.current = d;
      pointerStartRef.current = { x: startEv.clientX, y: startEv.clientY };
      hasDragMovedRef.current = false;

      const onMove = (ev: PointerEvent) => {
        const p0 = pointerStartRef.current;
        if (!p0 || !dragRef.current) return;
        if (Math.hypot(ev.clientX - p0.x, ev.clientY - p0.y) > DRAG_THRESHOLD_PX) {
          hasDragMovedRef.current = true;
        }
      };

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        finishReorderPointer(ev);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [finishReorderPointer],
  );

  const orderedFields = fieldOrder.filter((id) => data.fields[id]);

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid #ddd",
        background: "#fafafa",
        minWidth: 0,
      }}
    >
      <div style={{ padding: "8px 10px", borderBottom: "1px solid #eee" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#666" }}>领域</span>
          <button type="button" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => addField()}>
            +
          </button>
        </div>
      </div>
      <div style={{ height: fieldSectionH, minHeight: 60, overflow: "auto" }}>
        {orderedFields.map((fid, idx) => {
          const f = data.fields[fid];
          return (
            <div
              key={fid}
              data-reorder-field={fid}
              style={{
                display: "grid",
                gridTemplateColumns: "16px 28px 1fr 22px",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                minHeight: ROW_H,
              }}
            >
              <span
                role="presentation"
                onPointerDown={(e) => attachReorderPointer({ kind: "field", id: fid }, e)}
                style={{
                  cursor: "grab",
                  color: "#999",
                  fontSize: 12,
                  userSelect: "none",
                  touchAction: "none",
                }}
                title="拖动排序"
              >
                ⋮
              </span>
              <span style={{ fontSize: 11, color: "#888", textAlign: "right" }}>{idx + 1}.</span>
              <input
                className="minw0"
                value={f.name}
                onChange={(e) => renameField(fid, e.target.value)}
                style={{
                  width: "100%",
                  minWidth: 0,
                  padding: "2px 4px",
                  fontSize: 12,
                  border: "1px solid #ddd",
                  borderRadius: 2,
                }}
              />
              <button
                type="button"
                style={{ fontSize: 14, lineHeight: 1, padding: 0, border: "none", background: "none" }}
                onClick={() => removeField(fid)}
                title="删除"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div
        role="separator"
        onMouseDown={(e) => {
          const startY = e.clientY;
          const startH = fieldSectionH;
          const onMove = (ev: MouseEvent) => {
            setFieldSectionH(Math.min(280, Math.max(60, startH + ev.clientY - startY)));
          };
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
        style={{
          height: 8,
          cursor: "row-resize",
          background: "linear-gradient(transparent, #ddd, transparent)",
        }}
      />
      <div style={{ padding: "8px 10px", borderBottom: "1px solid #eee" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#666" }}>项目</span>
          <button type="button" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => addProject()}>
            +
          </button>
        </div>
        <div style={{ fontSize: 10, color: "#999", marginTop: 4, lineHeight: 1.35 }}>
          Shift+点击多选；× 移入回收站（可复原）。画布隐藏见右侧属性。
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ flex: 1, overflow: "auto" }}>
          {projectOrder
            .filter((id) => data.projects[id])
            .map((pid, idx) => {
              const p = data.projects[pid];
              const meta = projectStatusVisual(p.status);
              const sel = selectedProjectId === pid;
              const inMulti = multiSelectedProjectIds.includes(pid);
              return (
                <div
                  key={pid}
                  role="button"
                  tabIndex={0}
                  data-reorder-project={pid}
                  onClick={(e) => {
                    if (suppressProjectRowClickRef.current) {
                      suppressProjectRowClickRef.current = false;
                      return;
                    }
                    selectProject(pid, { additive: e.shiftKey });
                  }}
                  onKeyDown={(e) => e.key === "Enter" && selectProject(pid)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "16px 28px 1fr auto auto",
                    gap: 4,
                    alignItems: "center",
                    padding: "6px 8px",
                    cursor: "pointer",
                    background: sel ? "#d4e8fc" : inMulti ? "#fff3e0" : "transparent",
                    borderBottom: "1px solid #eee",
                    minWidth: 0,
                    opacity: p.canvas_hidden === true ? 0.55 : 1,
                  }}
                >
                  <span
                    role="presentation"
                    onPointerDown={(e) => attachReorderPointer({ kind: "project", id: pid }, e)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      cursor: "grab",
                      color: "#999",
                      fontSize: 12,
                      userSelect: "none",
                      touchAction: "none",
                    }}
                    title="拖动排序"
                  >
                    ⋮
                  </span>
                  <span style={{ fontSize: 11, color: "#888", textAlign: "right", userSelect: "none" }}>
                    {idx + 1}.
                  </span>
                  <span className="minw0" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.name}
                    {p.canvas_hidden === true ? (
                      <span style={{ fontSize: 10, color: "#999", marginLeft: 4 }}>（画布隐藏）</span>
                    ) : null}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 2,
                      background: meta.fill,
                      color: meta.text,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {meta.label}
                  </span>
                  <button
                    type="button"
                    style={{
                      fontSize: 14,
                      lineHeight: 1,
                      padding: "0 4px",
                      border: "none",
                      background: "none",
                      color: "#999",
                      cursor: "pointer",
                    }}
                    title="移入回收站"
                    aria-label="移入回收站"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeProject(pid);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
        </div>
        <div
          style={{
            borderTop: "1px solid #e0e0e0",
            background: "#f5f5f5",
            flexShrink: 0,
            maxHeight: trashOpen ? 200 : "auto",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <button
            type="button"
            onClick={() => setTrashOpen((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "8px 10px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 11,
              color: "#555",
            }}
          >
            <span>
              🗑 回收站（{Object.keys(data.deleted_projects ?? {}).length}）
            </span>
            <span style={{ color: "#999" }}>{trashOpen ? "▼" : "▶"}</span>
          </button>
          {trashOpen ? (
            <div style={{ overflow: "auto", maxHeight: 160, padding: "0 8px 8px" }}>
              {Object.keys(data.deleted_projects ?? {}).length === 0 ? (
                <div style={{ fontSize: 11, color: "#aaa", padding: "4px 2px" }}>暂无已删除项目</div>
              ) : (
                Object.entries(data.deleted_projects ?? {}).map(([tid, tp]) => (
                  <div
                    key={tid}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 4px",
                      borderBottom: "1px solid #eee",
                      fontSize: 12,
                    }}
                  >
                    <span className="minw0" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {tp.name}
                    </span>
                    <button
                      type="button"
                      style={{ fontSize: 11, padding: "2px 6px", cursor: "pointer" }}
                      onClick={() => restoreProjectFromTrash(tid)}
                    >
                      复原
                    </button>
                    <button
                      type="button"
                      style={{ fontSize: 11, padding: "2px 6px", cursor: "pointer", color: "#c62828" }}
                      title="永久删除"
                      onClick={() => purgeProjectFromTrash(tid)}
                    >
                      删净
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
