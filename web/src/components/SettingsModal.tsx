import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveWorkspaceStorageKey } from "../storage/config";
import { listUserWorkspaceJsonFiles } from "../storage/fs";
import { diskPathForLogical, getRuntimeStorageInfo } from "../storage/runtimeStorage";
import { useAppStore } from "../store/appStore";
import { coerceAuthorDisplayMode } from "../types";

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
  const authorDisplay = useAppStore((s) => s.authorDisplay);
  const setAuthorDisplay = useAppStore((s) => s.setAuthorDisplay);

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
                <span style={{ color: "#888" }}>打开方式：</span>
                {runtime.kind}
                {runtime.origin ? `（${runtime.origin}）` : null}
              </div>
              <div style={{ marginTop: 6 }}>{runtime.isolationHint}</div>
            </div>
            <div style={{ fontSize: 11, color: "#333", marginBottom: 6 }}>
              <span style={{ color: "#888" }}>当前工作区：</span>
              <code style={{ fontSize: 11, wordBreak: "break-all" }}>
                {resolveWorkspaceStorageKey(currentUsername)}
              </code>
            </div>
            <div style={{ fontSize: 11, color: "#333", marginBottom: 12 }}>
              <span style={{ color: "#888" }}>本机文件：</span>
              <code style={{ fontSize: 11, wordBreak: "break-all" }}>
                {diskPathForLogical(resolveWorkspaceStorageKey(currentUsername))}
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
              工作区写在本机用户库目录中，权限仅限当前系统用户。浏览器和桌面窗口读写同一目录。换电脑时用工具栏「导出 JSON / 导入 JSON」。
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

        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, marginBottom: 6 }}>
          <span>作者</span>
          <select
            aria-label="作者显示"
            value={authorDisplay}
            onChange={(event) => setAuthorDisplay(coerceAuthorDisplayMode(event.target.value))}
            style={{ fontSize: 13, padding: "4px 8px" }}
          >
            <option value="todo">有待办</option>
            <option value="primary">主要</option>
            <option value="all">全部</option>
            <option value="off">不显示</option>
          </select>
        </label>
        <p style={{ fontSize: 11, color: "#888", margin: "0 0 12px", lineHeight: 1.5 }}>
          默认只画出这个项目上还有未完成待办的人。主要是其中的共同第一和通讯作者。
        </p>
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
