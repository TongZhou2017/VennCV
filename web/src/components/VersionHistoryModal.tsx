import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { useAppStore } from "../store/appStore";
import {
  allBranchLineages,
  loadVersionStore,
  MAX_VERSION_SNAPSHOTS,
  type VersionSnapshot,
} from "../storage/versionStore";

type Props = {
  open: boolean;
  onClose: () => void;
};

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function qid(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

/** 父子快照边；箭头由旧指向新（parent → child） */
function buildMermaidGraph(store: ReturnType<typeof loadVersionStore>): string {
  const lines = ["flowchart TD"];
  const ids = new Set(Object.keys(store.snapshots));
  for (const id of ids) {
    const lab = (store.snapshots[id].label || id).replace(/"/g, "'").slice(0, 20);
    lines.push(`  ${qid(id)}["${lab}"]`);
  }
  for (const s of Object.values(store.snapshots)) {
    if (s.parentId && ids.has(s.parentId)) {
      lines.push(`  ${qid(s.parentId)} --> ${qid(s.id)}`);
    }
  }
  return lines.join("\n");
}

export function VersionHistoryModal({ open, onClose }: Props) {
  const username = useAppStore((s) => s.currentUsername);
  const createVersionSnapshot = useAppStore((s) => s.createVersionSnapshot);
  const restoreVersionSnapshot = useAppStore((s) => s.restoreVersionSnapshot);
  const forkVersionBranch = useAppStore((s) => s.forkVersionBranch);
  const switchVersionBranch = useAppStore((s) => s.switchVersionBranch);
  const renameVersionBranch = useAppStore((s) => s.renameVersionBranch);
  const deleteVersionBranch = useAppStore((s) => s.deleteVersionBranch);

  const [snapLabel, setSnapLabel] = useState("");
  const [backupBeforeRestore, setBackupBeforeRestore] = useState(true);
  const [forkName, setForkName] = useState("");
  const [forkFromId, setForkFromId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((x) => x + 1), []);

  const store = useMemo(() => {
    if (!username) return null;
    void tick;
    return loadVersionStore(username);
  }, [username, tick]);

  const lineages = useMemo(() => (store ? allBranchLineages(store) : []), [store]);
  const mermaidSrc = useMemo(() => (store ? buildMermaidGraph(store) : ""), [store]);

  const showToast = (msg: string, ok: boolean) => {
    setToast(ok ? `✓ ${msg}` : msg);
    window.setTimeout(() => setToast(null), 4000);
  };

  if (!open) return null;

  if (!username || !store) {
    return (
      <div style={overlayStyle} role="presentation" onClick={onClose}>
        <div role="dialog" style={dialogStyle} onClick={(e) => e.stopPropagation()}>
          <p style={{ margin: 0, fontSize: 13 }}>请先登录后再使用版本与分支。</p>
          <button type="button" style={btnSecondary} onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    );
  }

  const onSnapshot = () => {
    const r = createVersionSnapshot(snapLabel);
    if (r.ok) {
      setSnapLabel("");
      showToast("已创建快照", true);
      refresh();
    } else showToast(r.message, false);
  };

  const onRestore = (id: string) => {
    if (!window.confirm("用该快照覆盖当前工作区？未导出前请谨慎操作。")) return;
    const r = restoreVersionSnapshot(id, backupBeforeRestore);
    if (r.ok) {
      showToast("已恢复", true);
      refresh();
    } else showToast(r.message, false);
  };

  const onFork = () => {
    if (!forkFromId || !forkName.trim()) {
      showToast("请填写新分支名称", false);
      return;
    }
    const r = forkVersionBranch(forkFromId, forkName.trim());
    if (r.ok) {
      setForkName("");
      setForkFromId(null);
      showToast("已新建分支并加载该快照数据", true);
      refresh();
    } else showToast(r.message, false);
  };

  const onSwitchBranch = (branchId: string) => {
    if (!window.confirm("将工作区切换为该分支最新快照的内容？")) return;
    const r = switchVersionBranch(branchId);
    if (r.ok) {
      showToast("已切换分支", true);
      refresh();
    } else showToast(r.message, false);
  };

  const onRename = (branchId: string) => {
    const name = renameDraft[branchId] ?? store.branchNames[branchId] ?? branchId;
    const r = renameVersionBranch(branchId, name);
    if (r.ok) {
      showToast("分支名称已更新", true);
      refresh();
    } else showToast(r.message, false);
  };

  const onDeleteBranch = (branchId: string) => {
    if (branchId === "main") {
      showToast("不能删除主分支", false);
      return;
    }
    if (
      !window.confirm(
        "将删除该分支记录及其不再被任何分支引用的快照，且不可恢复。是否继续？",
      )
    ) {
      return;
    }
    const r = deleteVersionBranch(branchId);
    if (r.ok) {
      showToast("已删除分支", true);
      refresh();
    } else showToast(r.message, false);
  };

  return (
    <div style={overlayStyle} role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-labelledby="ver-title"
        style={{ ...dialogStyle, maxWidth: 720, width: "min(720px, 96vw)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="ver-title" style={{ margin: "0 0 12px", fontSize: 17 }}>
          版本与分支
        </h2>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#666", lineHeight: 1.45 }}>
          快照保存在本机（与 workspace 相同存储）。最多保留约 {MAX_VERSION_SNAPSHOTS}{" "}
          个快照，会自动丢弃最旧的无用节点。
          当前工作分支：<strong>{store.branchNames[store.currentBranchId] ?? store.currentBranchId}</strong>
          。工具栏 🕐 可一键生成带时间的「检查点」快照（并合并侧栏属性到撤销栈）。
        </p>

        {toast ? (
          <div
            style={{
              marginBottom: 12,
              padding: "8px 10px",
              background: toast.startsWith("✓") ? "#e8f5e9" : "#ffebee",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            {toast}
          </div>
        ) : null}

        <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #eee" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>新建快照（追加到当前分支）</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={snapLabel}
              onChange={(e) => setSnapLabel(e.target.value)}
              placeholder="快照说明（可选）"
              style={{ flex: "1 1 200px", padding: 8, fontSize: 13 }}
            />
            <button type="button" style={btnPrimary} onClick={onSnapshot}>
              创建快照
            </button>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={backupBeforeRestore}
              onChange={(e) => setBackupBeforeRestore(e.target.checked)}
            />
            恢复快照前，自动把当前工作区也存成快照（推荐）
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>分支路线总览（Mermaid）</div>
          <pre
            style={{
              margin: 0,
              padding: 10,
              background: "#f5f5f5",
              borderRadius: 4,
              fontSize: 10,
              overflow: "auto",
              maxHeight: 160,
              lineHeight: 1.35,
            }}
          >
            {mermaidSrc || "（尚无快照）"}
          </pre>
          <div style={{ fontSize: 10, color: "#999", marginTop: 4 }}>
            可将上文复制到支持 Mermaid 的编辑器中渲染为流程图。
          </div>
        </div>

        <div style={{ maxHeight: "min(42vh, 380px)", overflow: "auto" }}>
          {lineages.map(({ branchId, name, chain }) => (
            <div
              key={branchId}
              style={{
                marginBottom: 14,
                padding: 10,
                border: "1px solid #e0e0e0",
                borderRadius: 6,
                background: branchId === store.currentBranchId ? "#f1f8ff" : "#fafafa",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <strong style={{ fontSize: 13 }}>{name}</strong>
                <code style={{ fontSize: 10, color: "#888" }}>{branchId}</code>
                {branchId === store.currentBranchId ? (
                  <span style={{ fontSize: 10, color: "#1976d2" }}>当前</span>
                ) : (
                  <button type="button" style={btnSmall} onClick={() => onSwitchBranch(branchId)}>
                    切换到该分支
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                <input
                  value={renameDraft[branchId] ?? name}
                  onChange={(e) =>
                    setRenameDraft((d) => ({ ...d, [branchId]: e.target.value }))
                  }
                  style={{ flex: "1 1 140px", padding: 4, fontSize: 12 }}
                />
                <button type="button" style={btnSmall} onClick={() => onRename(branchId)}>
                  改名
                </button>
                <button
                  type="button"
                  style={btnDanger}
                  disabled={branchId === "main"}
                  title={branchId === "main" ? "主分支不可删除" : "删除该分支"}
                  onClick={() => onDeleteBranch(branchId)}
                >
                  删除分支
                </button>
              </div>
              {chain.length === 0 ? (
                <div style={{ fontSize: 12, color: "#999" }}>该分支尚无快照；创建快照后会显示在此。</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                  {chain.map((s: VersionSnapshot) => (
                    <li key={s.id} style={{ marginBottom: 6 }}>
                      <span style={{ color: "#666" }}>{formatTime(s.createdAt)}</span> — {s.label}
                      <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <button type="button" style={btnSmall} onClick={() => onRestore(s.id)}>
                          恢复到此版本
                        </button>
                        <button
                          type="button"
                          style={btnSmall}
                          onClick={() => {
                            setForkFromId(s.id);
                            setForkName("");
                          }}
                        >
                          从此快照新建分支…
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {forkFromId ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              background: "#fff8e1",
              borderRadius: 6,
              border: "1px solid #ffcc80",
            }}
          >
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              从快照 <code>{forkFromId}</code> 分叉出新分支（工作区将加载该快照数据）：
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={forkName}
                onChange={(e) => setForkName(e.target.value)}
                placeholder="新分支显示名称"
                style={{ flex: "1 1 180px", padding: 8 }}
              />
              <button type="button" style={btnPrimary} onClick={onFork}>
                创建分支
              </button>
              <button type="button" style={btnSecondary} onClick={() => setForkFromId(null)}>
                取消
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button type="button" style={btnSecondary} onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1002,
  padding: 12,
};

const dialogStyle: CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  padding: 20,
  boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
  maxHeight: "90vh",
  overflow: "auto",
};

const btnPrimary: CSSProperties = {
  padding: "8px 14px",
  fontSize: 13,
  background: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};

const btnSecondary: CSSProperties = {
  padding: "8px 14px",
  fontSize: 13,
  background: "#f5f5f5",
  border: "1px solid #ccc",
  borderRadius: 4,
  cursor: "pointer",
};

const btnSmall: CSSProperties = {
  padding: "4px 8px",
  fontSize: 11,
  background: "#fff",
  border: "1px solid #ccc",
  borderRadius: 4,
  cursor: "pointer",
};

const btnDanger: CSSProperties = {
  padding: "4px 8px",
  fontSize: 11,
  background: "#fff",
  border: "1px solid #e57373",
  color: "#c62828",
  borderRadius: 4,
  cursor: "pointer",
};
