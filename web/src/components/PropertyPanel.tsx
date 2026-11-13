import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAppStore } from "../store/appStore";
import type { ProjectStatus, RelationType } from "../types";
import { PROJECT_STATUS_META, coerceProjectStatus, rgbaToCss } from "../types";
import { effectiveCompletion, hasProgressBlocks } from "../domain/progress";
import { ProjectTimeFields } from "./ProjectTimeFields";
import { AuthorPanel } from "./AuthorPanel";
import { ProgressEditor } from "./ProgressEditor";
import { ProgressBoard } from "./ProgressBoard";
import { FigurePlan } from "./FigurePlan";
import "./property-panel.css";

const STATUSES: ProjectStatus[] = [
  "Published",
  "Submitted",
  "HighPriority",
  "SteadyProgress",
  "ToBeStarted",
];

type PropertyTab = "properties" | "tasks" | "publication" | "authors";

const PROPERTY_TABS: PropertyTab[] = ["properties", "tasks", "publication", "authors"];

function propertyTabLabel(tab: PropertyTab): string {
  switch (tab) {
    case "properties":
      return "属性";
    case "tasks":
      return "待办事项";
    case "publication":
      return "发表";
    case "authors":
      return "作者";
    default: {
      const unexpected: never = tab;
      return unexpected;
    }
  }
}

function PanelFrame(props: {
  tab: PropertyTab;
  counts: Record<PropertyTab, number>;
  onTab: (tab: PropertyTab) => void;
  children: ReactNode;
}) {
  const { tab, counts, onTab, children } = props;
  return (
    <aside className="property-panel">
      <div
        className="property-tabs"
        role="tablist"
        aria-label="右侧栏"
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const index = PROPERTY_TABS.indexOf(tab);
          const delta = event.key === "ArrowRight" ? 1 : -1;
          const next = PROPERTY_TABS[(index + delta + PROPERTY_TABS.length) % PROPERTY_TABS.length];
          if (next) onTab(next);
        }}
      >
        {PROPERTY_TABS.map((id) => {
          const count = counts[id];
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`property-tab-${id}`}
              className={tab === id ? "property-tab is-active" : "property-tab"}
              aria-selected={tab === id}
              aria-controls="property-panel"
              onClick={() => onTab(id)}
            >
              {propertyTabLabel(id)}
              {count > 0 ? <span className="property-tab-count">{count}</span> : null}
            </button>
          );
        })}
      </div>
      <form
        id="property-panel"
        role="tabpanel"
        aria-labelledby={`property-tab-${tab}`}
        className="property-body"
        onSubmit={(event) => event.preventDefault()}
      >
        {children}
      </form>
    </aside>
  );
}

function RelationTagsEditor(props: {
  fromId: string;
  toId: string;
  tags: string[];
}) {
  const { fromId, toId, tags } = props;
  const tagsJoined = tags.join(", ");
  const [v, setV] = useState(() => tagsJoined);
  useEffect(() => {
    setV(tagsJoined);
  }, [fromId, toId, tagsJoined]);
  const updateRelationAt = useAppStore((s) => s.updateRelationAt);
  const ensureGlobalRelationTag = useAppStore((s) => s.ensureGlobalRelationTag);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const nextTags = v
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean);
        for (const t of nextTags) ensureGlobalRelationTag(t);
        const i = useAppStore.getState().data.relations.findIndex(
          (r) => r.from_id === fromId && r.to_id === toId,
        );
        if (i >= 0) updateRelationAt(i, { tags: nextTags });
      }}
      style={{ width: "100%", padding: 6, marginBottom: 8, fontSize: 12 }}
    />
  );
}

const PROP_AUTOSAVE_MS = 450;

export function PropertyPanel() {
  const data = useAppStore((s) => s.data);
  const projectOrder = useAppStore((s) => s.projectOrder);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const multiSelectedProjectIds = useAppStore((s) => s.multiSelectedProjectIds);
  const projectEditBuffer = useAppStore((s) => s.projectEditBuffer);
  const setProjectEditBuffer = useAppStore((s) => s.setProjectEditBuffer);
  const createRelation = useAppStore((s) => s.createRelation);
  const removeRelationAt = useAppStore((s) => s.removeRelationAt);
  const updateRelationAt = useAppStore((s) => s.updateRelationAt);

  const persistedProject = useAppStore((s) =>
    s.selectedProjectId ? s.data.projects[s.selectedProjectId] : undefined,
  );

  useEffect(() => {
    if (!selectedProjectId || !projectEditBuffer || !persistedProject) return;
    if (JSON.stringify(projectEditBuffer) === JSON.stringify(persistedProject)) return;
    const t = window.setTimeout(() => {
      useAppStore.getState().applyProjectBufferToData({ skipHistory: true });
    }, PROP_AUTOSAVE_MS);
    return () => {
      window.clearTimeout(t);
      const st = useAppStore.getState();
      if (!st.selectedProjectId || !st.projectEditBuffer) return;
      const p = st.data.projects[st.selectedProjectId];
      if (p && JSON.stringify(st.projectEditBuffer) !== JSON.stringify(p)) {
        st.applyProjectBufferToData({ skipHistory: true });
      }
    };
  }, [projectEditBuffer, selectedProjectId, persistedProject]);

  const [newRelToId, setNewRelToId] = useState("");
  const [newRelIndirect, setNewRelIndirect] = useState(false);
  const [tab, setTab] = useState<PropertyTab>("properties");
  const selectedPersonId = useAppStore((s) => s.selectedPersonId);

  useEffect(() => {
    if (selectedPersonId) setTab("authors");
  }, [selectedPersonId]);

  const relatedRelations = useMemo(() => {
    if (!selectedProjectId) return [];
    return data.relations
      .map((rel, index) => ({ rel, index }))
      .filter(
        ({ rel }) => rel.from_id === selectedProjectId || rel.to_id === selectedProjectId,
      );
  }, [data.relations, selectedProjectId]);

  const otherProjectIds = useMemo(() => {
    if (!selectedProjectId) return [];
    return projectOrder.filter((id) => id !== selectedProjectId && data.projects[id]);
  }, [data.projects, projectOrder, selectedProjectId]);

  const crossProjectIds = useMemo(() => {
    const live = projectOrder.filter((id) => data.projects[id]);
    const multi = multiSelectedProjectIds.filter((id) => data.projects[id]);
    if (selectedProjectId && multi.length <= 1) return null;
    const allow = multi.length > 1 ? new Set(multi) : null;
    const ordered = live.filter((id) => !allow || allow.has(id));
    if (!allow) return ordered;
    return [...ordered, ...multi.filter((id) => !ordered.includes(id))];
  }, [data.projects, multiSelectedProjectIds, projectOrder, selectedProjectId]);

  const taskCount = (ids: string[]) =>
    ids.reduce((sum, id) => sum + (data.projects[id]?.progress_blocks?.length ?? 0), 0);

  if (!selectedProjectId || !projectEditBuffer) {
    const ids = crossProjectIds ?? projectOrder.filter((id) => data.projects[id]);
    return (
      <PanelFrame
        tab={tab}
        counts={{ properties: 0, tasks: taskCount(ids), publication: 0, authors: 0 }}
        onTab={setTab}
      >
        {(() => {
          switch (tab) {
            case "authors":
              return <AuthorPanel />;
            case "tasks":
              return <ProgressBoard projectIds={ids} mode="all" />;
            case "properties":
            case "publication":
              return <p className="property-empty">选中画布或列表中的项目以编辑属性</p>;
            default: {
              const unexpected: never = tab;
              return unexpected;
            }
          }
        })()}
      </PanelFrame>
    );
  }

  const buf = projectEditBuffer;
  const fieldIds = Object.keys(data.fields);
  const counts: Record<PropertyTab, number> = {
    properties: relatedRelations.length,
    tasks: crossProjectIds ? taskCount(crossProjectIds) : (data.projects[selectedProjectId]?.progress_blocks?.length ?? 0),
    publication: buf.journal_submissions?.length ?? 0,
    authors: data.authorships.filter((link) => link.project_id === selectedProjectId).length,
  };

  const update = (patch: Partial<typeof buf>) => {
    setProjectEditBuffer({ ...buf, ...patch });
  };

  const toggleField = (fid: string) => {
    const set = new Set(buf.field_ids);
    if (set.has(fid)) set.delete(fid);
    else set.add(fid);
    update({ field_ids: [...set] });
  };

  const renderTab = () => {
    switch (tab) {
      case "properties":
        return (
          <>
            <p className="property-note">名称、描述、状态约半秒内自动保存。期刊和时间点在「发表」页。</p>
            <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>名称</label>
            <input
              type="text"
              value={buf.name}
              onChange={(e) => update({ name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              style={{ width: "100%", padding: 6, marginBottom: 12 }}
            />
            <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>描述</label>
            <textarea
              value={buf.description}
              onChange={(e) => update({ description: e.target.value })}
              rows={4}
              style={{ width: "100%", padding: 6, marginBottom: 12, resize: "vertical" }}
            />
            <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>状态</label>
            <select
              value={coerceProjectStatus(buf.status)}
              onChange={(e) => update({ status: e.target.value as ProjectStatus })}
              style={{ width: "100%", padding: 6, marginBottom: 12 }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_META[s].label}
                </option>
              ))}
            </select>
            <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>完成度 %</label>
            {(() => {
              const live = data.projects[selectedProjectId] ?? buf;
              const tracked = hasProgressBlocks(live);
              const shown = tracked ? effectiveCompletion(live) : buf.completion_percentage;
              return (
                <>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    readOnly={tracked}
                    value={Number.isFinite(shown) ? shown : 0}
                    onChange={(e) => {
                      if (tracked) return;
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      update({ completion_percentage: Math.max(0, Math.min(100, n)) });
                    }}
                    style={{ width: "100%", padding: 6, marginBottom: 4 }}
                  />
                  <p className="property-note">
                    {tracked
                      ? "完成度只累计已经标成完成的待办，最高 100%。100% 表示开始投稿。"
                      : "100% 表示开始投稿。具体事项写在「待办事项」。"}
                  </p>
                </>
              );
            })()}
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={buf.canvas_hidden !== true}
                onChange={(e) => {
                  const next = { ...buf };
                  if (e.target.checked) delete next.canvas_hidden;
                  else next.canvas_hidden = true;
                  setProjectEditBuffer(next);
                }}
              />
              <span>在画布上显示该项目圆圈</span>
            </label>
            <label style={{ fontSize: 12, display: "block", marginBottom: 8 }}>所属领域</label>
            <div>
              {fieldIds.map((fid) => (
                <label key={fid} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <input
                    type="checkbox"
                    checked={buf.field_ids.includes(fid)}
                    onChange={() => toggleField(fid)}
                  />
                  <span style={{ fontSize: 12 }}>{data.fields[fid]?.name ?? fid}</span>
                </label>
              ))}
            </div>
            <div className="author-section-title">关系</div>
            <p className="property-note">与当前项目相连的边会立即保存。</p>
            {relatedRelations.length === 0 ? (
              <div style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>暂无关系</div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                {relatedRelations.map(({ rel, index }) => {
                  const out = rel.from_id === selectedProjectId;
                  const otherId = out ? rel.to_id : rel.from_id;
                  const otherName = data.projects[otherId]?.name ?? otherId;
                  return (
                    <div
                      key={`${index}-${rel.from_id}-${rel.to_id}`}
                      style={{
                        border: "1px solid #e0e0e0",
                        borderRadius: 4,
                        padding: 8,
                        marginBottom: 8,
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
                        {out ? "→" : "←"} {otherName}
                      </div>
                      <label style={{ fontSize: 11, display: "block", marginBottom: 4 }}>类型</label>
                      <select
                        value={rel.relation_type}
                        onChange={(e) =>
                          updateRelationAt(index, { relation_type: e.target.value as RelationType })
                        }
                        style={{ width: "100%", padding: 4, marginBottom: 8, fontSize: 12 }}
                      >
                        <option value="Direct">实线（直接）</option>
                        <option value="Indirect">虚线（间接）</option>
                      </select>
                      <label style={{ fontSize: 11, display: "block", marginBottom: 4 }}>标签（逗号分隔）</label>
                      <RelationTagsEditor fromId={rel.from_id} toId={rel.to_id} tags={rel.tags} />
                      <label style={{ fontSize: 11, display: "block", marginBottom: 4 }}>颜色 RGBA</label>
                      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
                        {([0, 1, 2, 3] as const).map((ci) => (
                          <input
                            key={ci}
                            type="number"
                            min={0}
                            max={255}
                            value={rel.color[ci]}
                            title={ci === 3 ? "A (0–255)" : "RGB"}
                            onChange={(e) => {
                              const v = Math.min(255, Math.max(0, Math.round(Number(e.target.value) || 0)));
                              const c = [...rel.color] as [number, number, number, number];
                              c[ci] = v;
                              updateRelationAt(index, { color: c });
                            }}
                            style={{ width: 52, padding: 4, fontSize: 11 }}
                          />
                        ))}
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 4,
                            border: "1px solid #ccc",
                            background: rgbaToCss(rel.color),
                          }}
                          title="预览"
                        />
                      </div>
                      <label style={{ fontSize: 11, display: "block", marginBottom: 4 }}>线宽</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        step={0.5}
                        value={rel.width}
                        onChange={(e) =>
                          updateRelationAt(index, { width: Math.max(1, Number(e.target.value) || 1) })
                        }
                        style={{ width: "100%", padding: 6, marginBottom: 8, fontSize: 12 }}
                      />
                      <button
                        type="button"
                        onClick={() => removeRelationAt(index)}
                        style={{
                          width: "100%",
                          padding: "6px",
                          fontSize: 12,
                          background: "#f5f5f5",
                          border: "1px solid #ddd",
                          borderRadius: 4,
                        }}
                      >
                        删除此关系
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>新建关系</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              <select
                value={newRelToId}
                onChange={(e) => setNewRelToId(e.target.value)}
                style={{ width: "100%", padding: 6, fontSize: 12 }}
              >
                <option value="">选择目标项目…</option>
                {otherProjectIds.map((id) => (
                  <option key={id} value={id}>
                    {data.projects[id]?.name ?? id}
                  </option>
                ))}
              </select>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={newRelIndirect}
                  onChange={(e) => setNewRelIndirect(e.target.checked)}
                />
                间接（虚线）
              </label>
              <button
                type="button"
                disabled={!newRelToId}
                onClick={() => {
                  if (!selectedProjectId || !newRelToId) return;
                  createRelation(selectedProjectId, newRelToId, { indirect: newRelIndirect });
                  setNewRelToId("");
                  setNewRelIndirect(false);
                }}
                style={{
                  padding: "8px",
                  fontSize: 12,
                  background: newRelToId ? "#e3f2fd" : "#eee",
                  border: "1px solid #90caf9",
                  borderRadius: 4,
                  cursor: newRelToId ? "pointer" : "not-allowed",
                }}
              >
                添加关系
              </button>
            </div>
          </>
        );
      case "tasks":
        return crossProjectIds ? (
          <ProgressBoard projectIds={crossProjectIds} mode="selection" />
        ) : (
          <ProgressEditor key={selectedProjectId} projectId={selectedProjectId} />
        );
      case "publication":
        return (
          <>
            <FigurePlan projectId={selectedProjectId} />
            <ProjectTimeFields project={buf} onChange={update} />
          </>
        );
      case "authors":
        return <AuthorPanel />;
      default: {
        const unexpected: never = tab;
        return unexpected;
      }
    }
  };

  return (
    <PanelFrame tab={tab} counts={counts} onTab={setTab}>
      {renderTab()}
    </PanelFrame>
  );
}
