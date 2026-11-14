import "./sidebar-edge.css";

type Side = "left" | "right";

function pointsTowardSidebar(side: Side, open: boolean): boolean {
  switch (side) {
    case "left":
      return open;
    case "right":
      return !open;
    default: {
      const unreachable: never = side;
      return unreachable;
    }
  }
}

function edgeLabel(side: Side, open: boolean): string {
  switch (side) {
    case "left":
      return open ? "收起左侧栏" : "展开左侧栏";
    case "right":
      return open ? "收起右侧栏" : "展开右侧栏";
    default: {
      const unreachable: never = side;
      return unreachable;
    }
  }
}

/** 贴在可视化区域左右边缘的三角形，用来展开或收起侧栏。 */
export function SidebarEdge({
  side,
  open,
  onToggle,
}: {
  side: Side;
  open: boolean;
  onToggle: () => void;
}) {
  const label = edgeLabel(side, open);
  const towardSidebar = pointsTowardSidebar(side, open);
  return (
    <button
      type="button"
      className={`sidebar-edge sidebar-edge-${side}`}
      aria-label={label}
      title={label}
      aria-expanded={open}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onToggle}
    >
      <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden>
        <polygon points={towardSidebar ? "7,1 1.2,5 7,9" : "1,1 6.8,5 1,9"} fill="currentColor" />
      </svg>
    </button>
  );
}
