import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveWorkspaceStorageKey } from "../storage/config";
import { listUserWorkspaceJsonFiles } from "../storage/fs";
import {
  fullLocalStorageKeyForLogicalPath,
  getRuntimeStorageInfo,
} from "../storage/runtimeStorage";
import { useAppStore } from "../store/appStore";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SettingsModal({ open, onClose }: Props) {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const currentUsername = useAppStore((s) => s.currentUsername);
  const switchWorkspaceStorageFile = useAppStore((s) => s.switchWorkspaceStorageFile);
  const duplicateCurrentWorkspaceAsNewFile = useAppStore(
    (s) => s.duplicateCurrentWorkspaceAsNewFile,
  );
  const showBannerNotice = useAppStore((s) => s.showBannerNotice);

  const [workspaceCandidates, setWorkspaceCandidates] = useState<string[]>([]);
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState("");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [storageBusy, setStorageBusy] = useState(false);

  const runtime = useMemo(() => getRuntimeStorageInfo(), []);

  const refreshWorkspaceList = useCallback(() => {
    if (!currentUsername) {
      setWorkspaceCandidates([]);
      return;
    }
    const found = listUserWorkspaceJsonFiles(currentUsername);
    const current = resolveWorkspaceStorageKey(currentUsername);
    const merged = [...new Set([current, ...found])].sort();
    setWorkspaceCandidates(merged);
    setSelectedWorkspacePath(current);
  }, [currentUsername]);

  useEffect(() => {
    if (!open) return;
    refreshWorkspaceList();
  }, [open, refreshWorkspaceList]);

  if (!open) return null;

  const row = (label: string, children: ReactNode) => (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        fontSize: 13,
        cursor: "pointer",
        marginBottom: 12,
      }}
    >
      {children}
      <span>{label}</span>
    </label>
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1001,
      }}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="settings-title"
        style={{
          width: "min(520px, 94vw)",
          maxHeight: "85vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 8,
          padding: 20,
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="settings-title" style={{ margin: "0 0 16px", fontSize: 16 }}>
          设置
        </h2>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 14 }}>
          画布渲染等选项与下方「工作区文件」无关；地址栏仍可使用 ?svg_viz=1 / ?canvas_pr=1 覆盖一次。
        </div>

        {currentUsername ? (
          <div
            style={{
              border: "1px solid #e0e0e0",
              borderRadius: 6,
              padding: 12,
              marginBottom: 16,
              background: "#fafafa",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>工作区与存储位置</div>
            <div style={{ fontSize: 11, color: "#555", lineHeight: 1.5, marginBottom: 10 }}>
              <div>
                <span style={{ color: "#888" }}>运行环境：</span>
                {runtime.kind}
                {runtime.origin ? `（${runtime.origin}）` : null}
              </div>
              <div style={{ marginTop: 6 }}>{runtime.isolationHint}</div>
            </div>
            <div style={{ fontSize: 11, color: "#333", marginBottom: 6 }}>
              <span style={{ color: "#888" }}>当前逻辑路径：</span>
              <code style={{ fontSize: 11, wordBreak: "break-all" }}>
                {resolveWorkspaceStorageKey(currentUsername)}
              </code>
            </div>
            <div style={{ fontSize: 11, color: "#333", marginBottom: 12 }}>
              <span style={{ color: "#888" }}>localStorage 键：</span>
              <code style={{ fontSize: 11, wordBreak: "break-all" }}>
                {fullLocalStorageKeyForLogicalPath(resolveWorkspaceStorageKey(currentUsername))}
              </code>
            </div>

            <label style={{ fontSize: 12, display: "block", marginBottom: 6 }}>切换到已有工作区文件</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <select
                value={selectedWorkspacePath}
                onChange={(e) => setSelectedWorkspacePath(e.target.value)}
                style={{ flex: "1 1 200px", fontSize: 12, padding: "6px 8px", maxWidth: "100%" }}
              >
                {workspaceCandidates.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={
                  storageBusy ||
                  !selectedWorkspacePath ||
                  selectedWorkspacePath === resolveWorkspaceStorageKey(currentUsername)
                }
                onClick={() => {
                  setStorageBusy(true);
                  const r = switchWorkspaceStorageFile(selectedWorkspacePath);
                  setStorageBusy(false);
                  if (r.ok) {
                    showBannerNotice("已切换工作区并重新载入");
                    refreshWorkspaceList();
                  } else {
                    showBannerNotice(r.message, true);
                  }
                }}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                  background: "#fff",
                  cursor: storageBusy ? "wait" : "pointer",
                }}
              >
                切换并载入
              </button>
            </div>

            <div style={{ fontSize: 11, color: "#888", margin: "10px 0 6px", lineHeight: 1.5 }}>
              Web 版将工作区等内容写入同源{" "}
              <code style={{ fontSize: 10 }}>localStorage</code>（键前缀{" "}
              <code style={{ fontSize: 10 }}>venncv_fs:</code>
              ），同站点多次访问与刷新可延续；无痕模式或清除站点数据会丢失。与桌面版磁盘数据不互通，跨环境请用工具栏「导出 JSON / 导入 JSON」。
            </div>

            <label style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
              将当前内容复制到新文件并切换
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                placeholder="例如 browser-backup 或 desktop-copy"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                style={{ flex: "1 1 180px", fontSize: 12, padding: "6px 8px" }}
              />
              <button
                type="button"
                disabled={storageBusy || !newWorkspaceName.trim()}
                onClick={() => {
                  setStorageBusy(true);
                  const r = duplicateCurrentWorkspaceAsNewFile(newWorkspaceName);
                  setStorageBusy(false);
                  if (r.ok) {
                    showBannerNotice("已写入新工作区并切换");
                    setNewWorkspaceName("");
                    refreshWorkspaceList();
                  } else {
                    showBannerNotice(r.message, true);
                  }
                }}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                  background: "#fff",
                  cursor: storageBusy ? "wait" : "pointer",
                }}
              >
                复制并切换
              </button>
            </div>
          </div>
        ) : null}

        {row("显示项目名称", (
          <input
            type="checkbox"
            checked={settings.show_project_names}
            onChange={(e) => setSettings({ show_project_names: e.target.checked })}
          />
        ))}
        {row("显示图例（状态与完成度）", (
          <input
            type="checkbox"
            checked={settings.show_legend}
            onChange={(e) => setSettings({ show_legend: e.target.checked })}
          />
        ))}

        <div style={{ borderTop: "1px solid #eee", margin: "16px 0", paddingTop: 14 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>画布渲染</div>
          {row("使用 SVG 绘制（Cursor 等内嵌浏览器推荐）", (
            <input
              type="checkbox"
              checked={settings.visualization_use_svg}
              onChange={(e) => setSettings({ visualization_use_svg: e.target.checked })}
            />
          ))}
          {row("Konva 模式：画布 1× 像素比（排查显示问题时可选）", (
            <input
              type="checkbox"
              checked={settings.visualization_force_konva_pixel_ratio_1}
              onChange={(e) =>
                setSettings({ visualization_force_konva_pixel_ratio_1: e.target.checked })
              }
            />
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 8,
            padding: "8px 16px",
            fontSize: 13,
            border: "1px solid #ccc",
            borderRadius: 4,
            background: "#f5f5f5",
            cursor: "pointer",
          }}
        >
          关闭
        </button>
      </div>
    </div>
  );
}
