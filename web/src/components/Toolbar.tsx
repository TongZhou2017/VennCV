import { useSyncExternalStore, type CSSProperties } from "react";
import { useAppStore } from "../store/appStore";
import {
  getCloudPhase,
  keepCloudLocal,
  subscribeCloudPhase,
  syncUserNow,
  takeCloudCopy,
  type CloudPhase,
} from "../storage/userCloud";
import { coerceAuthorDisplayMode } from "../types";

function cloudPhaseLabel(phase: Exclude<CloudPhase, "off" | "conflict">): string {
  switch (phase) {
    case "syncing":
      return "同步中";
    case "synced":
      return "已同步";
    case "failed":
      return "失败";
    default: {
      const unreachable: never = phase;
      return unreachable;
    }
  }
}

type Props = {
  onImportClick: () => void;
  onExportClick: () => void;
  onSettingsClick: () => void;
  onVersionsClick: () => void;
  /** macOS Tauri：为交通灯预留左侧内边距（px），避免工具栏与窗口按钮重叠 */
  leadingInsetPx?: number;
};

export function Toolbar({
  onImportClick,
  onExportClick,
  onSettingsClick,
  onVersionsClick,
  leadingInsetPx = 0,
}: Props) {
  const saveWorkspace = useAppStore((s) => s.saveWorkspace);
  const checkpointTimestamped = useAppStore((s) => s.checkpointTimestamped);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const relayoutFieldsAsVenn = useAppStore((s) => s.relayoutFieldsAsVenn);
  const zoomBy = useAppStore((s) => s.zoomBy);
  const logout = useAppStore((s) => s.logout);
  const currentUsername = useAppStore((s) => s.currentUsername);
  const leftSidebarOpen = useAppStore((s) => s.leftSidebarOpen);
  const rightSidebarOpen = useAppStore((s) => s.rightSidebarOpen);
  const vizWorkspacePreview = useAppStore((s) => s.vizWorkspacePreview);
  const workspaceView = useAppStore((s) => s.workspaceView);
  const setWorkspaceView = useAppStore((s) => s.setWorkspaceView);
  const authorDisplay = useAppStore((s) => s.authorDisplay);
  const setAuthorDisplay = useAppStore((s) => s.setAuthorDisplay);
  const toggleLeftSidebar = useAppStore((s) => s.toggleLeftSidebar);
  const toggleRightSidebar = useAppStore((s) => s.toggleRightSidebar);
  const toggleVizWorkspacePreview = useAppStore((s) => s.toggleVizWorkspacePreview);
  const multiSelectedProjectIds = useAppStore((s) => s.multiSelectedProjectIds);
  const selectProjectsWithSameStatus = useAppStore((s) => s.selectProjectsWithSameStatus);
  const selectProjectsWithSameFieldSet = useAppStore((s) => s.selectProjectsWithSameFieldSet);
  const selectProjectsWithSameName = useAppStore((s) => s.selectProjectsWithSameName);
  const clearMultiProjectSelection = useAppStore((s) => s.clearMultiProjectSelection);
  const setProjectsCanvasHidden = useAppStore((s) => s.setProjectsCanvasHidden);
  const moveProjectsToTrash = useAppStore((s) => s.moveProjectsToTrash);
  const showBannerNotice = useAppStore((s) => s.showBannerNotice);
  const cloudPhase = useSyncExternalStore(subscribeCloudPhase, getCloudPhase);

  const btn: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 30,
    padding: 0,
    marginRight: 4,
    border: "1px solid #ccc",
    borderRadius: 4,
    background: "#f8f8f8",
    fontSize: 16,
    lineHeight: 1,
  };

  const iconBtn = (label: string, onClick: () => void, symbol: string, title: string) => (
    <button
      type="button"
      style={btn}
      onClick={onClick}
      title={title}
      aria-label={label}
    >
      <span style={{ fontSize: 17, lineHeight: 1, opacity: 0.92 }} aria-hidden>
        {symbol}
      </span>
    </button>
  );

  const panelBtn = (
    label: string,
    onClick: () => void,
    text: string,
    title: string,
    pressed: boolean,
  ) => (
    <button
      type="button"
      style={{
        ...btn,
        width: "auto",
        minWidth: 34,
        padding: "0 8px",
        fontSize: 12,
        fontWeight: 600,
        background: pressed ? "#e3f2fd" : "#f8f8f8",
        borderColor: pressed ? "#90caf9" : "#ccc",
      }}
      onClick={onClick}
      title={title}
      aria-label={label}
      aria-pressed={pressed}
    >
      {text}
    </button>
  );

  const vennLayoutTitle = "维恩布局：按侧栏顺序将领域摆成维恩图式相交布局";
  const batchCount = multiSelectedProjectIds.length;
  const textBtn = (label: string, onClick: () => void, text: string, title: string, disabled?: boolean) => (
    <button
      type="button"
      disabled={disabled}
      style={{
        ...btn,
        width: "auto",
        padding: "0 8px",
        fontSize: 11,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onClick={onClick}
      title={title}
      aria-label={label}
    >
      {text}
    </button>
  );

  return (
    <header
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        padding: "6px 10px",
        paddingLeft: 10 + leadingInsetPx,
        borderBottom: "1px solid #ddd",
        background: "#f8f8f8",
      }}
    >
      <span style={{ marginRight: 16, fontSize: 12, color: "#666" }}>{currentUsername}</span>
      {iconBtn("保存", () => saveWorkspace(), "💾", "保存（Ctrl/Cmd+S）")}
      {iconBtn("撤销", () => undo(), "↩", "撤销")}
      {iconBtn("重做", () => redo(), "↪", "重做")}
      <button
        type="button"
        style={btn}
        onClick={() => relayoutFieldsAsVenn()}
        title={vennLayoutTitle}
        aria-label="维恩布局"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden style={{ display: "block" }}>
          <circle cx="6.8" cy="9" r="4.8" fill="none" stroke="#444" strokeWidth="1.4" />
          <circle cx="11.2" cy="9" r="4.8" fill="none" stroke="#444" strokeWidth="1.4" />
        </svg>
      </button>
      {panelBtn(
        "维恩图",
        () => setWorkspaceView("venn"),
        "维恩",
        "维恩图视图",
        workspaceView === "venn",
      )}
      {panelBtn(
        "时间线",
        () => setWorkspaceView("timeline"),
        "时间线",
        "时间线视图：预期完成日与投稿关键时间点",
        workspaceView === "timeline",
      )}
      {panelBtn(
        "合作",
        () => setWorkspaceView("collaboration"),
        "合作",
        "合作关系：按共同项目把人物连成网络",
        workspaceView === "collaboration",
      )}
      {workspaceView === "venn" ? (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, marginRight: 6 }}>
          作者
          <select
            aria-label="作者显示"
            title="维恩图项目周围的人物球"
            value={authorDisplay}
            onChange={(event) => setAuthorDisplay(coerceAuthorDisplayMode(event.target.value))}
            style={{ fontSize: 12, padding: "2px 4px" }}
          >
            <option value="off">不显示</option>
            <option value="primary">主要</option>
            <option value="all">全部</option>
          </select>
        </label>
      ) : null}
      {textBtn("选同状态", () => selectProjectsWithSameStatus(), "同状态", "以当前选中项为基准，选中所有相同状态的项目")}
      {textBtn("选同领域", () => selectProjectsWithSameFieldSet(), "同领域", "选中与当前项「所属领域」集合完全相同的项目")}
      {textBtn("选同名", () => selectProjectsWithSameName(), "同名", "选中与当前项名称（去首尾空格）相同的项目")}
      {batchCount > 1
        ? textBtn("清多选", () => clearMultiProjectSelection(), "单选", "只保留当前主选一项")
        : null}
      {batchCount >= 1 ? (
        <span style={{ fontSize: 10, color: "#888", marginRight: 4 }}>已选{batchCount}</span>
      ) : null}
      {batchCount >= 1
        ? textBtn(
            "批量隐藏",
            () => setProjectsCanvasHidden(multiSelectedProjectIds, true),
            "隐画布",
            "批量：画布上不显示这些项目圆（侧栏仍保留，可复原显示）",
          )
        : null}
      {batchCount >= 1
        ? textBtn(
            "批量显示",
            () => setProjectsCanvasHidden(multiSelectedProjectIds, false),
            "显画布",
            "批量取消画布隐藏",
          )
        : null}
      {batchCount >= 1
        ? textBtn(
            "批量回收站",
            () => moveProjectsToTrash(multiSelectedProjectIds),
            "回收站",
            "将选中项移入侧栏回收站（关系会移除，可从回收站复原）",
          )
        : null}
      {iconBtn("导入 JSON", () => onImportClick(), "📥", "导入 JSON")}
      {iconBtn("导出 JSON", () => onExportClick(), "📤", "导出 JSON")}
      {iconBtn(
        "时间戳检查点",
        () => {
          checkpointTimestamped();
        },
        "🕐",
        "时间戳检查点：若有侧栏未合并的属性编辑，先记入撤销历史；并在当前分支追加一条带时间的版本快照（与「版本与分支」同源）",
      )}
      {iconBtn("版本与分支", () => onVersionsClick(), "🌿", "版本快照、恢复与分支")}
      {iconBtn("设置", () => onSettingsClick(), "⚙", "设置")}
      <span style={{ width: 1, height: 20, background: "#ccc", margin: "0 6px" }} />
      {iconBtn("放大", () => zoomBy(1.1), "➕", "放大")}
      {iconBtn("缩小", () => zoomBy(1 / 1.1), "➖", "缩小")}
      <span style={{ width: 1, height: 20, background: "#ccc", margin: "0 6px" }} />
      {panelBtn(
        "切换左侧栏",
        () => toggleLeftSidebar(),
        "左栏",
        leftSidebarOpen ? "收起左侧栏（领域/项目列表）" : "展开左侧栏",
        leftSidebarOpen,
      )}
      {panelBtn(
        "切换右侧栏",
        () => toggleRightSidebar(),
        "右栏",
        rightSidebarOpen ? "收起右侧属性栏" : "展开右侧属性栏",
        rightSidebarOpen,
      )}
      {panelBtn(
        "工作区预览",
        () => toggleVizWorkspacePreview(),
        "预览",
        vizWorkspacePreview
          ? "退出工作区全屏预览（可视化铺满主内容区）"
          : "工作区预览：可视化铺满主内容区（Esc 退出）",
        vizWorkspacePreview,
      )}
      <div style={{ flex: 1 }} />
      {cloudPhase.phase === "off" ? null : (
        <span style={{ display: "inline-flex", alignItems: "center", marginRight: 8 }} aria-live="polite">
          {cloudPhase.phase === "conflict" ? (
            <>
              {textBtn("冲突", () => undefined, "冲突", cloudPhase.message, true)}
              {textBtn(
                "保留本机",
                () => {
                  if (!currentUsername) return;
                  void keepCloudLocal(currentUsername).then((error) => {
                    if (error) showBannerNotice(error, true);
                  });
                },
                "保留本机",
                "把云端这份记进版本，再上传本机",
              )}
              {textBtn(
                "改用云端",
                () => {
                  if (!currentUsername) return;
                  const error = takeCloudCopy(currentUsername);
                  if (error) showBannerNotice(error, true);
                },
                "改用云端",
                "用已经取回的云端副本替换本机",
              )}
            </>
          ) : (
            textBtn(
              cloudPhaseLabel(cloudPhase.phase),
              () => {
                if (!currentUsername || cloudPhase.phase === "syncing") return;
                void syncUserNow(currentUsername);
              },
              cloudPhaseLabel(cloudPhase.phase),
              cloudPhase.message || "再同步一次",
              cloudPhase.phase === "syncing",
            )
          )}
        </span>
      )}
      {iconBtn("退出登录", () => logout(), "🚪", "退出登录")}
    </header>
  );
}
