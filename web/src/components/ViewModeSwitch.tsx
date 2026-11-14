import { useAppStore, type WorkspaceView } from "../store/appStore";
import "./view-mode-switch.css";

const VIEWS: { id: WorkspaceView; label: string; title: string }[] = [
  { id: "venn", label: "维恩图", title: "维恩图" },
  { id: "timeline", label: "时间线", title: "时间线：预期完成日与投稿关键时间点" },
  { id: "collaboration", label: "合作", title: "合作关系：按共同项目把人物连成网络" },
];

function ViewIcon({ id }: { id: WorkspaceView }) {
  switch (id) {
    case "venn":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <circle cx="6.1" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="9.9" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case "timeline":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M2 4.5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M5 8h8.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M3 11.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "collaboration":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <circle cx="4.2" cy="8" r="1.55" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="11.6" cy="4.4" r="1.55" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="11.6" cy="11.6" r="1.55" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5.7 7.3 10.1 5.1M5.7 8.7l4.4 2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    default: {
      const unreachable: never = id;
      return unreachable;
    }
  }
}

/** 三种视图的图标切换，悬浮在可视化区域左上角。 */
export function ViewModeSwitch() {
  const workspaceView = useAppStore((s) => s.workspaceView);
  const setWorkspaceView = useAppStore((s) => s.setWorkspaceView);

  return (
    <div className="view-mode-switch" role="toolbar" aria-label="视图">
      {VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          title={view.title}
          aria-label={view.label}
          aria-pressed={workspaceView === view.id}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setWorkspaceView(view.id)}
        >
          <ViewIcon id={view.id} />
        </button>
      ))}
    </div>
  );
}
