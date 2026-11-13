import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";
import type { Person } from "../types";
import {
  addIsoDays,
  blocksOf,
  defaultReportWindow,
  isBlockDone,
  progressReport,
  slotsBottomUp,
  slotsOf,
  type ProgressReportSpan,
  type ProgressReportWindow,
} from "../domain/progress";
import { taskMark, toneClass } from "./taskStatus";
import { todayIsoDate } from "../domain/projectTime";
import { DateField } from "./DateField";
import { ProgressMosaic } from "./ProgressMosaic";
import { ProgressLayout } from "./ProgressLayout";

function peopleChoices(people: Record<string, Person>): Person[] {
  return Object.values(people).sort((a, b) => a.name.localeCompare(b.name, "zh") || a.id.localeCompare(b.id));
}

function spanName(span: ProgressReportSpan): string {
  switch (span) {
    case "day":
      return "日";
    case "week":
      return "周";
    case "month":
      return "月";
    case "year":
      return "年";
    default: {
      const unexpected: never = span;
      return unexpected;
    }
  }
}

export function ProgressEditor(props: { projectId: string }) {
  const project = useAppStore((s) => s.data.projects[props.projectId]);
  const people = useAppStore((s) => s.data.people);
  const applyTemplate = useAppStore((s) => s.applyProgressTemplate);
  const addBlock = useAppStore((s) => s.addProgressBlock);
  const updateBlock = useAppStore((s) => s.updateProgressBlock);
  const removeBlock = useAppStore((s) => s.removeProgressBlock);
  const [slotId, setSlotId] = useState("");
  const [draft, setDraft] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [due, setDue] = useState(addIsoDays(todayIsoDate(), 7));
  const [personId, setPersonId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [span, setSpan] = useState<ProgressReportSpan>("month");
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [scope, setScope] = useState<{ projectId: string; window: ProgressReportWindow | null }>({
    projectId: props.projectId,
    window: null,
  });
  const openedProgressBlockId = useAppStore((s) => s.openedProgressBlockId);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openedProgressBlockId) return;
    const current = useAppStore.getState().data.projects[props.projectId];
    if (!current || !blocksOf(current).some((block) => block.id === openedProgressBlockId)) return;
    setSelectedId(openedProgressBlockId);
    useAppStore.setState({ openedProgressBlockId: null });
  }, [openedProgressBlockId, props.projectId]);

  useEffect(() => {
    detailRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  if (!project) return null;
  const windowOverride = scope.projectId === project.id ? scope.window : null;
  const slots = slotsBottomUp(project);
  const activeSlot = slots.find((slot) => slot.id === slotId) ?? slots[0];
  const selected = blocksOf(project).find((block) => block.id === selectedId) ?? null;
  const selectedSlot = selected ? slotsOf(project).find((slot) => slot.id === selected.slot_id) : null;
  const today = todayIsoDate();
  const reportWindow = windowOverride ?? defaultReportWindow(project, today);
  const report = progressReport(project, span, reportWindow);
  const detailInList = selected ? report.some((group) => group.entries.some((entry) => entry.block.id === selected.id)) : false;

  function setReportWindow(next: ProgressReportWindow | null) {
    setScope({ projectId: project!.id, window: next });
  }
  const names = peopleChoices(people);

  function placeBlock() {
    if (!activeSlot || !date || !due) return;
    const title = draft.trim();
    if (!title) return;
    addBlock(project!.id, activeSlot.id, title, date, due, personId || null);
    setDraft("");
  }

  const selectedDetail =
    selected && selectedSlot ? (
      <div className="task-detail" ref={detailRef}>
        <div className="task-card-head">
          <h3>这一件</h3>
          <button type="button" className="task-text" onClick={() => setSelectedId(null)}>
            收起
          </button>
        </div>
        <label className="task-field">
          <span>事项</span>
          <input
            key={selected.id}
            aria-label="事项"
            defaultValue={selected.title}
            onBlur={(event) => updateBlock(project.id, selected.id, { title: event.target.value })}
          />
        </label>
        <label className="task-field">
          <span>所属部分</span>
          <select
            aria-label="所属部分"
            value={selected.slot_id}
            onChange={(event) => updateBlock(project.id, selected.id, { slot_id: event.target.value })}
          >
            {slots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.label}
              </option>
            ))}
          </select>
        </label>
        <label className="task-field">
          <span>人员</span>
          <select
            aria-label="事项人员"
            value={selected.person_id ?? ""}
            onChange={(event) => updateBlock(project.id, selected.id, { person_id: event.target.value || null })}
          >
            <option value="">未指定</option>
            {names.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label className="task-field">
          <span>定下</span>
          <DateField
            ariaLabel="定下日期"
            value={selected.date}
            allowEmpty={false}
            onChange={(next) => {
              if (next) updateBlock(project.id, selected.id, { date: next });
            }}
          />
        </label>
        <label className="task-field">
          <span>期限</span>
          <DateField
            ariaLabel="完成期限"
            value={selected.due ?? null}
            allowEmpty={false}
            onChange={(next) => {
              if (next) updateBlock(project.id, selected.id, { due: next });
            }}
          />
        </label>
        {isBlockDone(selected) ? (
          <label className="task-field">
            <span>完成于</span>
            <DateField
              ariaLabel="完成日期"
              value={selected.completed_on ?? null}
              allowEmpty={false}
              onChange={(next) => {
                if (next) updateBlock(project.id, selected.id, { completed_on: next });
              }}
            />
          </label>
        ) : null}
        <div className="task-actions">
          <button
            type="button"
            className="task-primary"
            onClick={() =>
              updateBlock(project.id, selected.id, {
                completed_on: isBlockDone(selected) ? null : todayIsoDate(),
              })
            }
          >
            {isBlockDone(selected) ? "标回未完成" : "标记完成"}
          </button>
          <button
            type="button"
            className="task-quiet"
            onClick={() => {
              removeBlock(project.id, selected.id);
              setSelectedId(null);
            }}
          >
            撤下
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div className="task-page">
      {slots.length === 0 ? (
        <section className="task-card">
          <h3>进度</h3>
          <p className="task-hint">先套用示例，铺好方法、POC、主图和论文。主图数量和主题在「发表」页。</p>
          <button type="button" className="task-primary" onClick={() => applyTemplate(project.id)}>
            套用示例
          </button>
        </section>
      ) : (
        <>
          <section className="task-card">
            <div className="task-card-head">
              <h3>进度</h3>
              <button type="button" className="task-text" onClick={() => setLayoutOpen(true)}>
                设置布局
              </button>
            </div>
            <ProgressMosaic
              project={project}
              selectedBlockId={selected?.id ?? null}
              onSelectBlock={setSelectedId}
            />
            <p className="task-hint">灰色块是还没做完的，数字是剩余天数。标成完成才计入进度。</p>
          </section>
          {layoutOpen ? <ProgressLayout projectId={project.id} onClose={() => setLayoutOpen(false)} /> : null}
          {selectedDetail && !detailInList ? <section className="task-card">{selectedDetail}</section> : null}
          <section className="task-card">
            <h3>记下待办</h3>
            <label className="task-field">
              <span>事项</span>
              <input
                aria-label="新事项"
                value={draft}
                placeholder="要做什么"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    placeBlock();
                  }
                }}
              />
            </label>
            <label className="task-field">
              <span>所属部分</span>
              <select
                aria-label="新待办所属部分"
                value={activeSlot?.id ?? ""}
                onChange={(event) => setSlotId(event.target.value)}
              >
                {slots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="task-field">
              <span>人员</span>
              <select aria-label="人员" value={personId} onChange={(event) => setPersonId(event.target.value)}>
                <option value="">不指定</option>
                {names.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="task-field-pair">
              <label className="task-field">
                <span>定下</span>
                <DateField
                  ariaLabel="新待办定下日期"
                  value={date || null}
                  allowEmpty={false}
                  onChange={(next) => {
                    if (!next) return;
                    setDate(next);
                    setDue((current) => (current < next ? next : current));
                  }}
                />
              </label>
              <label className="task-field">
                <span>期限</span>
                <DateField
                  ariaLabel="新待办完成期限"
                  value={due || null}
                  allowEmpty={false}
                  onChange={(next) => {
                    if (next) setDue(next < date ? date : next);
                  }}
                />
              </label>
            </div>
            <button type="button" className="task-primary" disabled={!draft.trim()} onClick={placeBlock}>
              记下待办
            </button>
          </section>
          <section className="task-card">
            <div className="task-card-head">
              <h3>回看</h3>
              <button
                type="button"
                className="task-text"
                aria-pressed={windowOverride === null}
                onClick={() => setReportWindow(null)}
              >
                全部
              </button>
            </div>
            <div className="task-span" role="group" aria-label="按时间回看">
              {(["day", "week", "month", "year"] as const).map((item) => (
                <button key={item} type="button" aria-pressed={span === item} onClick={() => setSpan(item)}>
                  {spanName(item)}
                </button>
              ))}
            </div>
            <div className="task-field-pair">
              <label className="task-field">
                <span>从</span>
                <DateField
                  ariaLabel="回看开始"
                  value={reportWindow.from}
                  allowEmpty
                  onChange={(next) => setReportWindow({ from: next, to: reportWindow.to })}
                />
              </label>
              <label className="task-field">
                <span>到</span>
                <DateField
                  ariaLabel="回看结束"
                  value={reportWindow.to}
                  allowEmpty
                  onChange={(next) => setReportWindow({ from: reportWindow.from, to: next })}
                />
              </label>
            </div>
            {report.length === 0 ? (
              <p className="task-hint">
                {blocksOf(project).length === 0 ? "还没有待办。" : "这段时间里没有待办。"}
              </p>
            ) : (
              report.map((group) => (
                <div key={group.key} className="task-group">
                  <h4>{group.label}</h4>
                  {group.entries.map((entry) => {
                    const person = entry.block.person_id ? people[entry.block.person_id] : null;
                    const mark = taskMark(entry.block, today);
                    const open = entry.block.id === selected?.id;
                    return (
                      <div key={entry.block.id}>
                        <button
                          type="button"
                          className={open ? "task-row is-selected" : "task-row"}
                          onClick={() => setSelectedId(open ? null : entry.block.id)}
                        >
                          <span className="task-row-title">{entry.block.title}</span>
                          <span className={`task-badge ${toneClass(mark.tone)}`}>{mark.text}</span>
                          <span className="task-row-meta">
                            {`${entry.slot.label} · ${person?.name || "未指定"}`}
                          </span>
                          <span className="task-row-meta">
                            {entry.block.due ? `${entry.block.date} → ${entry.block.due}` : entry.block.date}
                          </span>
                        </button>
                        {open ? selectedDetail : null}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
