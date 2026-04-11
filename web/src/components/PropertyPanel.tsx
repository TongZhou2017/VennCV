import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/appStore";
import type { ProjectStatus, RelationType } from "../types";
import { PROJECT_STATUS_META, coerceProjectStatus, rgbaToCss } from "../types";

const STATUSES: ProjectStatus[] = [
  "Published",
  "Submitted",
  "HighPriority",
  "SteadyProgress",
  "ToBeStarted",
];

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

  if (!selectedProjectId || !projectEditBuffer) {
    return (
      <aside
        style={{
          width: 260,
          flexShrink: 0,
          borderLeft: "1px solid #ddd",
          background: "#fafafa",
          padding: 16,
          fontSize: 13,
          color: "#888",
        }}
      >
        选中画布或列表中的项目以编辑属性
      </aside>
    );
  }

  const buf = projectEditBuffer;
  const fieldIds = Object.keys(data.fields);

  const update = (patch: Partial<typeof buf>) => {
    setProjectEditBuffer({ ...buf, ...patch });
  };

  const toggleField = (fid: string) => {
    const set = new Set(buf.field_ids);
    if (set.has(fid)) set.delete(fid);
    else set.add(fid);
    update({ field_ids: [...set] });
  };

  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        borderLeft: "1px solid #ddd",
        background: "#fafafa",
        padding: 12,
        overflow: "auto",
      }}
    >
      {/* 防止回车触发表单默认提交（部分宿主/扩展会隐式包 form） */}
      <form
        onSubmit={(e) => e.preventDefault()}
        style={{ display: "contents" }}
      >
      <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>属性</div>
      <div style={{ fontSize: 10, color: "#999", marginBottom: 10, lineHeight: 1.35 }}>
        名称、描述、状态等约半秒内自动保存；关系编辑立即保存。需要撤销粒度或版本锚点时，请用工具栏「时间戳检查点」。
      </div>
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
      <input
        type="number"
        min={0}
        max={100}
        value={Number.isFinite(buf.completion_percentage) ? buf.completion_percentage : 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          update({ completion_percentage: Math.max(0, Math.min(100, n)) });
        }}
        style={{ width: "100%", padding: 6, marginBottom: 12 }}
      />
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
      <div style={{ marginBottom: 12 }}>
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

      <div style={{ fontSize: 11, color: "#666", margin: "16px 0 8px" }}>关系</div>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
        与当前项目相连的边；类型、标签、颜色、线宽会立即写入工作区（无需点「应用更改」）。
      </div>

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
      </form>
    </aside>
  );
}
