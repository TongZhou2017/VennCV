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
  onHelpClick: () => void;
  onVersionsClick: () => void;
  /** macOS Tauri：为交通灯预留左侧内边距（px），避免工具栏与窗口按钮重叠 */
  leadingInsetPx?: number;
};

export function Toolbar({
  onImportClick,
  onExportClick,
  onSettingsClick,
  onHelpClick,
  onVersionsClick,
  leadingInsetPx = 0,
}: Props) {
  const saveWorkspace = useAppStore((s) => s.saveWorkspace);
  const checkpointTimestamped = useAppStore((s) => s.checkpointTimestamped);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const logout = useAppStore((s) => s.logout);
  const currentUsername = useAppStore((s) => s.currentUsername);
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
      {iconBtn("帮助", () => onHelpClick(), "?", "使用说明")}
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
