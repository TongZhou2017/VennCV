import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useAppStore } from "../store/appStore";
import { buildCollaborationLayout, type CollabNode } from "../domain/authors";
import { blocksForPerson, type PersonProgress } from "../domain/progress";
import { todayIsoDate } from "../domain/projectTime";
import { taskMark } from "./taskStatus";
import "./collaboration.css";

const NODE_R = 22;

function tasksByProject(rows: PersonProgress[]): PersonProgress[][] {
  const groups = new Map<string, PersonProgress[]>();
  for (const row of rows) {
    const list = groups.get(row.projectId);
    if (list) list.push(row);
    else groups.set(row.projectId, [row]);
  }
  return [...groups.values()];
}

function boundsOf(nodes: CollabNode[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const radius = node.center ? NODE_R + 10 : NODE_R;
    minX = Math.min(minX, node.x - radius - 48);
    minY = Math.min(minY, node.y - radius - 36);
    maxX = Math.max(maxX, node.x + radius + 48);
    maxY = Math.max(maxY, node.y + radius + 36);
  }
  return { minX, minY, width: Math.max(120, maxX - minX), height: Math.max(120, maxY - minY) };
}

export function CollaborationView() {
  const data = useAppStore((s) => s.data);
  const selectedPersonId = useAppStore((s) => s.selectedPersonId);
  const selectPerson = useAppStore((s) => s.selectPerson);
  const selectProject = useAppStore((s) => s.selectProject);
  const updatePerson = useAppStore((s) => s.updatePerson);
  const resetCollaborationPositions = useAppStore((s) => s.resetCollaborationPositions);
  const setPersonLibraryOpen = useAppStore((s) => s.setPersonLibraryOpen);
  const requestPropertyTab = useAppStore((s) => s.requestPropertyTab);
  const model = useMemo(() => buildCollaborationLayout(data), [data]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [frozen, setFrozen] = useState<{ minX: number; minY: number; width: number; height: number } | null>(null);
  const dragRef = useRef<
    | {
        kind: "node";
        id: string;
        startX: number;
        startY: number;
        originX: number;
        originY: number;
        x: number;
        y: number;
        moved: boolean;
      }
    | {
        kind: "pan";
        startClientX: number;
        startClientY: number;
        panX: number;
        panY: number;
        width: number;
        height: number;
      }
    | null
  >(null);
  const todos = useMemo(
    () => (selectedPersonId ? blocksForPerson(data.projects, selectedPersonId) : []),
    [data.projects, selectedPersonId],
  );
  const nodes = model.nodes.map((node) => (live?.id === node.personId ? { ...node, x: live.x, y: live.y } : node));
  const frame = frozen ?? (nodes.length > 0 ? boundsOf(nodes) : { minX: 0, minY: 0, width: 320, height: 240 });
  const selected = selectedPersonId ? data.people[selectedPersonId] : undefined;

  const svgPoint = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: event.clientX, y: event.clientY };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: event.clientX, y: event.clientY };
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  };

  const trackPointer = () => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.kind === "node") {
        const point = svgPoint(event);
        const x = drag.originX + point.x - drag.startX;
        const y = drag.originY + point.y - drag.startY;
        if (Math.hypot(point.x - drag.startX, point.y - drag.startY) > 3) drag.moved = true;
        drag.x = x;
        drag.y = y;
        setLive({ id: drag.id, x, y });
        return;
      }
      const svg = svgRef.current;
      if (!svg) return;
      const scale = svg.clientWidth / Math.max(drag.width, 1);
      setPan({
        x: drag.panX - (event.clientX - drag.startClientX) / Math.max(scale, 0.01),
        y: drag.panY - (event.clientY - drag.startClientY) / Math.max(scale, 0.01),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const drag = dragRef.current;
      dragRef.current = null;
      setFrozen(null);
      if (!drag || drag.kind !== "node") return;
      if (!drag.moved) {
        const current = useAppStore.getState().selectedPersonId;
        selectPerson(current === drag.id ? null : drag.id);
        setLive(null);
        return;
      }
      setLive(null);
      updatePerson(drag.id, { network_x: drag.x, network_y: drag.y });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onNodePointerDown = (event: ReactPointerEvent<SVGGElement>, node: CollabNode) => {
    event.stopPropagation();
    const start = svgPoint(event);
    setFrozen(boundsOf(nodes));
    dragRef.current = {
      kind: "node",
      id: node.personId,
      startX: start.x,
      startY: start.y,
      originX: node.x,
      originY: node.y,
      x: node.x,
      y: node.y,
      moved: false,
    };
    trackPointer();
  };

  const onBoardPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    setFrozen(frame);
    dragRef.current = {
      kind: "pan",
      startClientX: event.clientX,
      startClientY: event.clientY,
      panX: pan.x,
      panY: pan.y,
      width: frame.width,
      height: frame.height,
    };
    trackPointer();
  };

  const taskPanel = (
    <aside className="collab-tasks" aria-label="进展">
      <h2>进展</h2>
      {!selectedPersonId ? (
        <p className="collab-empty">点一个人物，查看他记下的进展。</p>
      ) : todos.length === 0 ? (
        <p className="collab-empty">这个人还没有记下的进展</p>
      ) : (
        tasksByProject(todos).map((group) => {
          const first = group[0];
          if (!first) return null;
          return (
            <section key={first.projectId} className="collab-task-project">
              <h3>
                {first.projectName}
                <span>{`${Math.round(first.completion)}%`}</span>
              </h3>
              {group.map((task) => {
                const mark = taskMark({ completed_on: task.completedOn, due: task.due }, todayIsoDate());
                return (
                  <button
                    key={task.blockId}
                    type="button"
                    className="collab-task"
                    onClick={() => {
                      selectProject(task.projectId, { blockId: task.blockId });
                      requestPropertyTab("tasks");
                    }}
                  >
                    <span>{task.title}</span>
                    <span>{task.slotLabel}</span>
                    <span>{mark.text}</span>
                  </button>
                );
              })}
            </section>
          );
        })
      )}
    </aside>
  );

  const tools = (
    <div className="collab-tools">
      <button type="button" onClick={() => setPersonLibraryOpen(true)}>
        人物库
      </button>
      <button
        type="button"
        disabled={!selected}
        onClick={() => {
          if (!selected) return;
          updatePerson(selected.id, {
            network_center: selected.network_center !== true,
            network_x: null,
            network_y: null,
          });
        }}
      >
        {selected?.network_center ? "取消中心" : "设为中心"}
      </button>
      <button
        type="button"
        onClick={() => {
          resetCollaborationPositions();
          setPan({ x: 0, y: 0 });
        }}
      >
        重置位置
      </button>
      <span>拖动人物。空白处拖动可以挪动画布。设为中心的人排在中间。</span>
    </div>
  );

  if (model.nodes.length === 0) {
    return (
      <div className="collab-page">
        <div className="collab-board">
          {tools}
          <p className="collab-empty">还没有挂到项目上的人物。在人物库里加人，再到作者页把他们加入项目后，这里会按共同项目连线。</p>
        </div>
        {taskPanel}
      </div>
    );
  }

  const byId = new Map(nodes.map((node) => [node.personId, node]));
  const labs = new Map<string, { name: string; color: string }>();
  for (const node of nodes) {
    labs.set(node.labId ?? "", { name: node.labName, color: node.color });
  }

  return (
    <div className="collab-page">
      <div className="collab-board">
        {tools}
        <div className="collab-legend">
          {[...labs.entries()].map(([id, lab]) => (
            <span key={id || "none"} className="collab-legend-item">
              <i style={{ background: lab.color }} />
              {lab.name}
            </span>
          ))}
        </div>
        <svg
          ref={svgRef}
          className="collab-svg"
          viewBox={`${frame.minX + pan.x} ${frame.minY + pan.y} ${frame.width} ${frame.height}`}
          role="img"
          aria-label="合作关系"
          onPointerDown={onBoardPointerDown}
        >
          {model.edges.map((edge) => {
            const from = byId.get(edge.a);
            const to = byId.get(edge.b);
            if (!from || !to) return null;
            return (
              <line
                key={`${edge.a}-${edge.b}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#8d8680"
                strokeWidth={Math.min(6, edge.shared + 0.5)}
              >
                <title>{`${edge.shared} 个共同项目`}</title>
              </line>
            );
          })}
          {nodes.map((node) => {
            const picked = node.personId === selectedPersonId;
            const radius = node.center ? NODE_R + 4 : NODE_R;
            return (
              <g
                key={node.personId}
                transform={`translate(${node.x} ${node.y})`}
                className="collab-node"
                onPointerDown={(event) => onNodePointerDown(event, node)}
              >
                {node.center ? <circle r={radius + 7} fill="none" stroke="#0f6e6e" strokeWidth={1.5} /> : null}
                <circle r={radius} fill={node.color} stroke={picked ? "#1c2430" : "#ffffff"} strokeWidth={picked ? 3 : 1.5} />
                <text textAnchor="middle" y={radius + 14} fill="#333" fontSize={11}>
                  {node.name}
                </text>
                <title>{`${node.name} · ${node.labName}${node.center ? " · 中心" : ""}`}</title>
              </g>
            );
          })}
        </svg>
      </div>
      {taskPanel}
    </div>
  );
}
