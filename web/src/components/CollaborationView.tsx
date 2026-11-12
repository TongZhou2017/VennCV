import { useMemo } from "react";
import { useAppStore } from "../store/appStore";
import { buildCollaborationLayout } from "../domain/authors";
import "./collaboration.css";

const NODE_R = 22;

export function CollaborationView() {
  const data = useAppStore((s) => s.data);
  const selectedPersonId = useAppStore((s) => s.selectedPersonId);
  const selectPerson = useAppStore((s) => s.selectPerson);
  const model = useMemo(() => buildCollaborationLayout(data), [data]);

  if (model.nodes.length === 0) {
    return (
      <div className="collab-page">
        <p className="collab-empty">还没有挂到项目上的人物。在右侧「作者」页把人物加入项目后，这里会按共同项目连线。</p>
      </div>
    );
  }

  const byId = new Map(model.nodes.map((node) => [node.personId, node]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of model.nodes) {
    minX = Math.min(minX, node.x - NODE_R - 36);
    minY = Math.min(minY, node.y - NODE_R - 28);
    maxX = Math.max(maxX, node.x + NODE_R + 36);
    maxY = Math.max(maxY, node.y + NODE_R + 28);
  }
  const labs = new Map<string, { name: string; color: string }>();
  for (const node of model.nodes) {
    labs.set(node.labId ?? "", { name: node.labName, color: node.color });
  }

  return (
    <div className="collab-page">
      <div className="collab-legend">
        {[...labs.entries()].map(([id, lab]) => (
          <span key={id || "none"} className="collab-legend-item">
            <i style={{ background: lab.color }} />
            {lab.name}
          </span>
        ))}
      </div>
      <svg
        className="collab-svg"
        viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
        role="img"
        aria-label="合作关系"
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
        {model.nodes.map((node) => {
          const selected = node.personId === selectedPersonId;
          return (
            <g
              key={node.personId}
              transform={`translate(${node.x} ${node.y})`}
              className="collab-node"
              onClick={() => selectPerson(node.personId)}
            >
              <circle r={NODE_R} fill={node.color} stroke={selected ? "#1c2430" : "#ffffff"} strokeWidth={selected ? 3 : 1.5} />
              <text textAnchor="middle" y={NODE_R + 14} fill="#333" fontSize={11}>
                {node.name}
              </text>
              <title>{`${node.name} · ${node.labName}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
