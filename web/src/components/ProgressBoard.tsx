import { useAppStore } from "../store/appStore";
import type { ProgressBlock, Project } from "../types";
import { blocksForPerson, blocksOf, effectiveCompletion, isBlockDone, remainingDays, slotsOf } from "../domain/progress";
import { todayIsoDate } from "../domain/projectTime";
import { taskMark, toneClass } from "./taskStatus";

function compareBlocks(a: ProgressBlock, b: ProgressBlock, today: string): number {
  const openRank = (block: ProgressBlock) => (isBlockDone(block) ? 1 : 0);
  const byOpen = openRank(a) - openRank(b);
  if (byOpen !== 0) return byOpen;
  if (!isBlockDone(a) && !isBlockDone(b)) {
    const leftA = remainingDays(a, today) ?? Number.POSITIVE_INFINITY;
    const leftB = remainingDays(b, today) ?? Number.POSITIVE_INFINITY;
    if (leftA !== leftB) return leftA - leftB;
  }
  return b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
}

/** 合作网络里点中的人：按项目列出他记下的待办。 */
export function PersonTaskList(props: { personId: string }) {
  const projects = useAppStore((s) => s.data.projects);
  const people = useAppStore((s) => s.data.people);
  const selectProject = useAppStore((s) => s.selectProject);
  const today = todayIsoDate();
  const name = people[props.personId]?.name.trim() || "这个人";
  const rows = blocksForPerson(projects, props.personId);
  const grouped = new Map<string, { projectId: string; projectName: string; completion: number; rows: typeof rows }>();
  for (const row of rows) {
    const current = grouped.get(row.projectId);
    if (current) current.rows.push(row);
    else grouped.set(row.projectId, { projectId: row.projectId, projectName: row.projectName, completion: row.completion, rows: [row] });
  }
  const groups = [...grouped.values()];

  return (
    <div className="task-page">
      <section className="task-card">
        <h3>{`${name}的进展`}</h3>
        <p className="task-hint">点一条就打开那个项目的待办。</p>
        {groups.length === 0 ? <p className="task-hint">这个人还没有记下的进展</p> : null}
        {groups.map((group) => (
          <div key={group.projectId} className="task-group">
            <h4>{`${group.projectName} · ${Math.round(group.completion)}%`}</h4>
            {group.rows.map((row) => {
              const mark = taskMark({ completed_on: row.completedOn, due: row.due }, today);
              const when = row.due ? `${row.date} → ${row.due}` : row.date;
              return (
                <button
                  key={row.blockId}
                  type="button"
                  className="task-row"
                  onClick={() => selectProject(row.projectId, { blockId: row.blockId })}
                >
                  <span className="task-row-title">{row.title}</span>
                  <span className={`task-badge ${toneClass(mark.tone)}`}>{mark.text}</span>
                  <span className="task-row-meta">{row.slotLabel}</span>
                  <span className="task-row-meta">{when}</span>
                </button>
              );
            })}
          </div>
        ))}
      </section>
    </div>
  );
}

export function ProgressBoard(props: { projectIds: string[]; mode: "all" | "selection" }) {
  const projects = useAppStore((s) => s.data.projects);
  const people = useAppStore((s) => s.data.people);
  const grants = useAppStore((s) => s.data.grants ?? {});
  const selectProject = useAppStore((s) => s.selectProject);
  const today = todayIsoDate();
  const rows = props.projectIds
    .map((id) => projects[id])
    .filter((project): project is Project => Boolean(project))
    .map((project) => ({
      project,
      blocks: blocksOf(project)
        .filter((block) => slotsOf(project).some((slot) => slot.id === block.slot_id))
        .sort((a, b) => compareBlocks(a, b, today)),
    }))
    .filter((row) => props.mode === "selection" || row.blocks.length > 0);

  const hint =
    props.mode === "selection"
      ? `选中了 ${props.projectIds.length} 个项目，下面是它们的待办。点一条就打开那个项目。`
      : "没有选中项目，下面是全部待办。点一条就打开那个项目。";

  return (
    <div className="task-page">
      <section className="task-card">
        <h3>待办</h3>
        <p className="task-hint">{hint}</p>
        {rows.length === 0 ? <p className="task-hint">还没有待办。</p> : null}
        {rows.map(({ project, blocks }) => (
          <div key={project.id} className="task-group">
            <h4>{`${project.name.trim() || "未命名项目"} · ${effectiveCompletion(project)}%`}</h4>
            {blocks.length === 0 ? <p className="task-hint">还没有待办。</p> : null}
            {blocks.map((block) => {
              const slot = slotsOf(project).find((item) => item.id === block.slot_id);
              const person = block.person_id ? people[block.person_id] : null;
              const fund = block.grant_id ? grants[block.grant_id] : null;
              const fundName = fund ? fund.name.trim() || fund.number || "未命名基金" : "";
              const mark = taskMark(block, today);
              const when = block.due ? `${block.date} → ${block.due}` : block.date;
              return (
                <button
                  key={block.id}
                  type="button"
                  className="task-row"
                  onClick={() => selectProject(project.id, { blockId: block.id })}
                >
                  <span className="task-row-title">{block.title}</span>
                  <span className={`task-badge ${toneClass(mark.tone)}`}>{mark.text}</span>
                  <span className="task-row-meta">{`${slot?.label ?? "未分区"} · ${person?.name || "未指定"}${fundName ? ` · ${fundName}` : ""}`}</span>
                  <span className="task-row-meta">{when}</span>
                </button>
              );
            })}
          </div>
        ))}
      </section>
    </div>
  );
}
