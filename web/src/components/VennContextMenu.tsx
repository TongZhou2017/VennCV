import "./venn-menu.css";

type Action = {
  label: string;
  title: string;
  onClick: () => void;
};

type Props = {
  x: number;
  y: number;
  canvasWidth: number;
  canvasHeight: number;
  onRefreshLayout: () => void;
  selectActions: Action[];
  onExportPng: () => void;
  onExportSvg: () => void;
  onCopyImage: () => void;
};

export function VennContextMenu({
  x,
  y,
  canvasWidth,
  canvasHeight,
  onRefreshLayout,
  selectActions,
  onExportPng,
  onExportSvg,
  onCopyImage,
}: Props) {
  const menuWidth = 176;
  const menuHeight = 148;
  const left = Math.max(8, Math.min(x, canvasWidth - menuWidth - 8));
  const top = Math.max(8, Math.min(y, canvasHeight - menuHeight - 8));
  const flip = left > canvasWidth - 340;

  return (
    <div
      className={flip ? "venn-menu is-flip" : "venn-menu"}
      role="menu"
      style={{ left, top }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={onRefreshLayout}>
        刷新布局
      </button>
      <div className="venn-menu-branch">
        <button type="button" role="menuitem" aria-haspopup="menu">
          选择
          <span className="venn-menu-caret" aria-hidden>
            ▸
          </span>
        </button>
        <div className="venn-menu-fly" role="menu" aria-label="选择">
          {selectActions.map((action) => (
            <button key={action.label} type="button" role="menuitem" title={action.title} onClick={action.onClick}>
              {action.label}
            </button>
          ))}
        </div>
      </div>
      <div className="venn-menu-rule" />
      <div className="venn-menu-branch">
        <button type="button" role="menuitem" aria-haspopup="menu">
          导出图片
          <span className="venn-menu-caret" aria-hidden>
            ▸
          </span>
        </button>
        <div className="venn-menu-fly" role="menu" aria-label="导出图片">
          <button type="button" role="menuitem" onClick={onExportPng}>
            PNG
          </button>
          <button type="button" role="menuitem" onClick={onExportSvg}>
            SVG
          </button>
        </div>
      </div>
      <button type="button" role="menuitem" onClick={onCopyImage}>
        复制图片
      </button>
    </div>
  );
}
