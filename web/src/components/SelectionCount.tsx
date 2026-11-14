import { useAppStore } from "../store/appStore";
import "./venn-menu.css";

export function SelectionCount() {
  const count = useAppStore((s) => s.multiSelectedProjectIds.length);
  const clearMultiProjectSelection = useAppStore((s) => s.clearMultiProjectSelection);
  if (count < 1) return null;
  return (
    <div className="viz-selection">
      <span>{`已选${count}`}</span>
      {count > 1 ? (
        <button type="button" onClick={() => clearMultiProjectSelection()} title="只保留当前主选一项">
          单选
        </button>
      ) : null}
    </div>
  );
}
