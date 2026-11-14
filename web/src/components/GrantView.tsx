import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/appStore";
import type { CatalogWork } from "../domain/grants";
import {
  catalogWorks,
  FOUNDATION_CAP,
  grantPhaseLabel,
  publicationsForGrant,
  REPRESENTATIVE_CAP,
  toggleWorkKey,
  unmatchedAwardNumbers,
  workLabel,
} from "../domain/grants";
import { blocksForGrant, type GrantTodo } from "../domain/progress";
import type { Grant, GrantPhase } from "../types";
import "./grant.css";
import "./property-panel.css";

const PHASES: GrantPhase[] = ["proposal", "active", "closed"];

function grantTitle(grant: Grant): string {
  return grant.name.trim() || grant.number || "未命名基金";
}

export function GrantView() {
  const data = useAppStore((s) => s.data);
  const addGrant = useAppStore((s) => s.addGrant);
  const updateGrant = useAppStore((s) => s.updateGrant);
  const removeGrant = useAppStore((s) => s.removeGrant);
  const selectProject = useAppStore((s) => s.selectProject);
  const requestPropertyTab = useAppStore((s) => s.requestPropertyTab);
  const grants = useMemo(() => Object.values(data.grants ?? {}), [data.grants]);
  const works = useMemo(() => catalogWorks(data), [data]);
  const pending = useMemo(() => unmatchedAwardNumbers(works, data.grants ?? {}), [works, data.grants]);
  const byKey = useMemo(() => new Map(works.map((work) => [work.key, work])), [works]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const todos = useMemo(
    () => (selectedId ? blocksForGrant(data.projects, selectedId) : []),
    [data.projects, selectedId],
  );
  const [picking, setPicking] = useState<"representative" | "foundation" | null>(null);
  const selected = grants.find((grant) => grant.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !data.grants?.[selectedId]) setSelectedId(null);
  }, [data.grants, selectedId]);

  const openGrant = (id: string) => {
    setSelectedId(id);
    setPicking(null);
  };

  return (
    <div className="task-page">
      <section className="task-card">
        <div className="task-card-head">
          <h3>基金</h3>
          <button type="button" className="task-text" onClick={() => openGrant(addGrant({ phase: "proposal" }))}>
            新建
          </button>
        </div>
        <p className="task-hint">
          {grants.length === 0
            ? pending.length > 0
              ? "还没有基金。下面是发表页里已经认出、还没建档的基金号。"
              : "申报选代表作和项目基础成果。结题按基金号汇总发表。"
            : "点一项基金，编辑申报和结题。"}
        </p>
        {grants.map((grant) => (
          <button
            key={grant.id}
            type="button"
            className={grant.id === selectedId ? "task-row is-selected" : "task-row"}
            aria-pressed={grant.id === selectedId}
            onClick={() => openGrant(grant.id)}
          >
            <span className="task-row-title">{grantTitle(grant)}</span>
            <span className="task-badge">{grantPhaseLabel(grant.phase)}</span>
          </button>
        ))}
        <Discovered
          numbers={pending}
          onCreate={(item) =>
            openGrant(addGrant({ name: item.funder || item.number, number: item.number, funder: item.funder, phase: "closed" }))
          }
        />
      </section>
      {selected ? (
        <GrantDetail
          grant={selected}
          works={works}
          byKey={byKey}
          picking={picking}
          onPick={setPicking}
          onChange={(patch) => updateGrant(selected.id, patch)}
          onRemove={() => removeGrant(selected.id)}
          onOpenProject={selectProject}
          todos={todos}
          onOpenTodo={(projectId, blockId) => {
            selectProject(projectId, { blockId });
            requestPropertyTab("tasks");
          }}
        />
      ) : null}
    </div>
  );
}

function Discovered(props: {
  numbers: Array<{ number: string; funder: string }>;
  onCreate: (item: { number: string; funder: string }) => void;
}) {
  if (props.numbers.length === 0) return null;
  return (
    <div className="grant-chip">
      {props.numbers.map((item) => (
        <button key={item.number} type="button" onClick={() => props.onCreate(item)}>
          {item.funder ? `${item.funder} ` : ""}
          {item.number}
        </button>
      ))}
    </div>
  );
}

function GrantDetail(props: {
  grant: Grant;
  works: CatalogWork[];
  byKey: Map<string, CatalogWork>;
  picking: "representative" | "foundation" | null;
  onPick: (next: "representative" | "foundation" | null) => void;
  onChange: (patch: Partial<Pick<Grant, "name" | "number" | "funder" | "phase" | "representative_keys" | "foundation_keys">>) => void;
  onRemove: () => void;
  onOpenProject: (id: string) => void;
  todos: GrantTodo[];
  onOpenTodo: (projectId: string, blockId: string) => void;
}) {
  const { grant } = props;
  const supported = publicationsForGrant(grant.number, props.works);
  return (
    <>
      <section className="task-card">
        <div className="task-card-head">
          <h3>{grantTitle(grant)}</h3>
          <button type="button" className="task-text" aria-label={`删除${grantTitle(grant)}`} onClick={props.onRemove}>
            删除
          </button>
        </div>
        <label className="task-field">
          <span>名称</span>
          <input aria-label="基金名称" value={grant.name} onChange={(event) => props.onChange({ name: event.target.value })} />
        </label>
        <div className="task-field-pair">
          <label className="task-field">
            <span>资助机构</span>
            <input aria-label="资助机构" value={grant.funder} onChange={(event) => props.onChange({ funder: event.target.value })} />
          </label>
          <label className="task-field">
            <span>基金号</span>
            <input aria-label="基金号" value={grant.number} onChange={(event) => props.onChange({ number: event.target.value })} />
          </label>
        </div>
        <label className="task-field">
          <span>阶段</span>
          <select
            aria-label="基金阶段"
            value={grant.phase}
            onChange={(event) => {
              const phase = event.target.value;
              if (phase === "proposal" || phase === "active" || phase === "closed") props.onChange({ phase });
            }}
          >
            {PHASES.map((phase) => (
              <option key={phase} value={phase}>
                {grantPhaseLabel(phase)}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="task-card">
        <div className="task-card-head">
          <h3>{`待办 ${props.todos.length}`}</h3>
        </div>
        <p className="task-hint">在待办里把这项基金选上。点一条就打开那件待办。</p>
        {props.todos.length === 0 ? <p className="task-hint">还没有挂到这项基金上的待办。</p> : null}
        {props.todos.map((todo) => (
          <button
            key={todo.blockId}
            type="button"
            className="task-row"
            onClick={() => props.onOpenTodo(todo.projectId, todo.blockId)}
          >
            <span className="task-row-title">{todo.title}</span>
            <span className="task-badge">{todo.completedOn ? "已完成" : "未完成"}</span>
            <span className="task-row-meta">{todo.projectName}</span>
            <span className="task-row-meta">{todo.due ? `${todo.date} → ${todo.due}` : todo.date}</span>
          </button>
        ))}
      </section>
      <WorkList
        title={`代表作 ${grant.representative_keys.length}/${REPRESENTATIVE_CAP}`}
        hint="申报用。最多五篇。"
        keys={grant.representative_keys}
        cap={REPRESENTATIVE_CAP}
        open={props.picking === "representative"}
        works={props.works}
        byKey={props.byKey}
        onToggleOpen={() => props.onPick(props.picking === "representative" ? null : "representative")}
        onChange={(keys) => props.onChange({ representative_keys: keys })}
        onOpenProject={props.onOpenProject}
      />
      <WorkList
        title={`项目基础 ${grant.foundation_keys.length}`}
        hint="和这个基金相关的一系列成果。"
        keys={grant.foundation_keys}
        cap={FOUNDATION_CAP}
        open={props.picking === "foundation"}
        works={props.works}
        byKey={props.byKey}
        onToggleOpen={() => props.onPick(props.picking === "foundation" ? null : "foundation")}
        onChange={(keys) => props.onChange({ foundation_keys: keys })}
        onOpenProject={props.onOpenProject}
      />
      <section className="task-card">
        <div className="task-card-head">
          <h3>{grant.number.trim() ? `结题 ${supported.length} 篇` : "结题"}</h3>
        </div>
        <p className="task-hint">按基金号汇总发表页里已经识别到的资助。预印本不计入。</p>
        {!grant.number.trim() ? <p className="task-hint">先填写基金号。</p> : null}
        {grant.number.trim() && supported.length === 0 ? <p className="task-hint">还没有文章标了这个基金号。</p> : null}
        {supported.map((work) => (
          <button key={work.key} type="button" className="task-row" onClick={() => props.onOpenProject(work.projectId)}>
            <span className="task-row-title">{workLabel(work)}</span>
            <span className="task-badge">{work.publishedOn}</span>
          </button>
        ))}
      </section>
    </>
  );
}

function WorkList(props: {
  title: string;
  hint: string;
  keys: string[];
  cap: number;
  open: boolean;
  works: CatalogWork[];
  byKey: Map<string, CatalogWork>;
  onToggleOpen: () => void;
  onChange: (keys: string[]) => void;
  onOpenProject: (id: string) => void;
}) {
  const full = props.keys.length >= props.cap;
  return (
    <section className="task-card">
      <div className="task-card-head">
        <h3>{props.title}</h3>
        <button type="button" className="task-text" aria-pressed={props.open} onClick={props.onToggleOpen}>
          选择
        </button>
      </div>
      <p className="task-hint">{props.hint}</p>
      {props.keys.length === 0 ? <p className="task-hint">还没有选。</p> : null}
      {props.keys.map((key) => {
        const work = props.byKey.get(key);
        if (!work) return null;
        return (
          <div key={key} className="task-row">
            <button type="button" className="task-text" onClick={() => props.onOpenProject(work.projectId)}>
              {workLabel(work)}
            </button>
            <span className="task-badge">{work.publishedOn}</span>
            <button
              type="button"
              className="task-icon"
              aria-label={`移出 ${workLabel(work)}`}
              onClick={() => props.onChange(toggleWorkKey(props.keys, key, props.cap))}
            >
              ×
            </button>
          </div>
        );
      })}
      {props.open ? (
        <div className="grant-pick">
          {props.works.length === 0 ? <p className="task-hint">发表页还没有投稿。</p> : null}
          {props.works.map((work) => {
            const picked = props.keys.includes(work.key);
            return (
              <button
                key={work.key}
                type="button"
                aria-pressed={picked}
                disabled={!picked && full}
                onClick={() => props.onChange(toggleWorkKey(props.keys, work.key, props.cap))}
              >
                <span>
                  {workLabel(work)}
                  {work.preprint ? " · 预印本" : ""}
                </span>
                <span>{work.publishedOn}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
