import { useAppStore } from "../store/appStore";
import "./view-mode-switch.css";

/** 维恩图的画面缩放。时间线用自己的时间尺度，不走这里。 */
export function VennZoom() {
  const zoomBy = useAppStore((s) => s.zoomBy);
  return (
    <div className="venn-zoom" role="toolbar" aria-label="缩放" onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" aria-label="放大" title="放大" onClick={() => zoomBy(1.1)}>
        +
      </button>
      <button type="button" aria-label="缩小" title="缩小" onClick={() => zoomBy(1 / 1.1)}>
        −
      </button>
    </div>
  );
}
