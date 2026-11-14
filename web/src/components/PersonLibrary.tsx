import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "../store/appStore";
import type { Lab, LabStage, Person } from "../types";
import { JOB_TITLES, personAdvisesLab, personIsLabHead } from "../domain/authors";
import { labPathSlug } from "../domain/labHome";
import { publishLabTabHandoff } from "../storage/labTabSession";
import { LabStageChoices } from "./LabStageChoices";
import { LabHome } from "./LabHome";
import "./person-library.css";

const UNASSIGNED_LAB = "";

function personListGroups(
  people: Person[],
  labs: Lab[],
): { key: string; name: string; people: Person[] }[] {
  const byLab = new Map<string, Person[]>();
  const loose: Person[] = [];
  const known = new Set(labs.map((lab) => lab.id));
  for (const person of people) {
    const ids = person.lab_ids.filter((id) => known.has(id));
    if (ids.length === 0) {
      loose.push(person);
      continue;
    }
    for (const id of ids) {
      const list = byLab.get(id) ?? [];
      list.push(person);
      byLab.set(id, list);
    }
  }
  const groups = labs
    .filter((lab) => byLab.has(lab.id))
    .map((lab) => ({ key: lab.id, name: lab.name, people: byLab.get(lab.id) ?? [] }));
  if (loose.length > 0) groups.push({ key: UNASSIGNED_LAB, name: "未归入实验室", people: loose });
  return groups;
}

export function PersonLibrary(props: { open: boolean; onClose: () => void }) {
  const data = useAppStore((s) => s.data);
  const selectedPersonId = useAppStore((s) => s.selectedPersonId);
  const selectPerson = useAppStore((s) => s.selectPerson);
  const addLab = useAppStore((s) => s.addLab);
  const updateLab = useAppStore((s) => s.updateLab);
  const removeLab = useAppStore((s) => s.removeLab);
  const addPerson = useAppStore((s) => s.addPerson);
  const updatePerson = useAppStore((s) => s.updatePerson);
  const removePerson = useAppStore((s) => s.removePerson);
  const mergePeople = useAppStore((s) => s.mergePeople);
  const [query, setQuery] = useState("");
  const [homeLabId, setHomeLabId] = useState<string | null>(null);
  const [editingLabId, setEditingLabId] = useState<string | null>(null);
  const [pane, setPane] = useState<"person" | "labs">("person");
  const [aliasDraft, setAliasDraft] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [personDraft, setPersonDraft] = useState("");
  const [labDraft, setLabDraft] = useState("");
  const [addingLab, setAddingLab] = useState(false);
  const [addressDraft, setAddressDraft] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const openedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const people = useMemo(
    () => Object.values(data.people).sort((a, b) => a.name.localeCompare(b.name, "zh") || a.id.localeCompare(b.id)),
    [data.people],
  );
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? people.filter((person) => {
        const haystack = [person.name, person.family_name, person.middle_name, person.given_name, ...person.aliases]
          .filter(Boolean)
          .join("\n")
          .toLowerCase();
        return haystack.includes(needle);
      })
    : people;
  const selected = (selectedPersonId && data.people[selectedPersonId]) || shown[0] || null;
  const labs = Object.values(data.labs).sort((a, b) => a.name.localeCompare(b.name, "zh"));
  const groups = useMemo(() => personListGroups(shown, labs), [shown, labs]);

  useEffect(() => {
    if (!props.open) {
      openedFor.current = null;
      return;
    }
    if (!selectedPersonId) return;
    const person = data.people[selectedPersonId];
    if (!person) return;
    const keys = person.lab_ids.filter((id) => data.labs[id]).sort();
    const mark = `${selectedPersonId}:${keys.join("\n")}`;
    if (openedFor.current === mark) return;
    openedFor.current = mark;
    const open = keys.length > 0 ? keys : [UNASSIGNED_LAB];
    setOpenGroups((prev) => {
      const next = new Set(prev);
      for (const key of open) next.add(key);
      return next;
    });
  }, [props.open, selectedPersonId, data.people, data.labs]);

  if (!props.open) return null;

  const toggleLab = (labId: string) => {
    if (!selected) return;
    const on = selected.lab_ids.includes(labId);
    const labIds = on ? selected.lab_ids.filter((id) => id !== labId) : [...selected.lab_ids, labId];
    const labRoles = (selected.lab_roles ?? []).filter((role) => labIds.includes(role.lab_id));
    updatePerson(selected.id, { lab_ids: labIds, lab_roles: labRoles });
  };

  const writeLabRole = (labId: string, stages: LabStage[], tags: string[], advisorId: string | undefined) => {
    if (!selected) return;
    const rest = (selected.lab_roles ?? []).filter((role) => role.lab_id !== labId);
    const trimmed = tags.map((tag) => tag.trim()).filter(Boolean);
    const advisor = advisorId?.trim() ?? "";
    const labRoles =
      stages.length > 0 || trimmed.length > 0 || advisor
        ? [
            ...rest,
            {
              lab_id: labId,
              ...(stages.length > 0 ? { stages } : {}),
              ...(trimmed.length > 0 ? { tags: trimmed } : {}),
              ...(advisor ? { advisor_id: advisor } : {}),
            },
          ]
        : rest;
    updatePerson(selected.id, { lab_roles: labRoles });
  };
  const setLabStage = (labId: string, stages: LabStage[], tags: string[]) => {
    const prev = (selected?.lab_roles ?? []).find((role) => role.lab_id === labId);
    writeLabRole(labId, stages, tags, prev?.advisor_id);
  };
  const setAdvisor = (labId: string, advisorId: string) => {
    const prev = (selected?.lab_roles ?? []).find((role) => role.lab_id === labId);
    writeLabRole(labId, prev?.stages ?? [], prev?.tags ?? [], advisorId);
  };

  const addAlias = () => {
    const next = aliasDraft.trim();
    if (!selected || !next) return;
    updatePerson(selected.id, { aliases: [...selected.aliases, next] });
    setAliasDraft("");
  };

  const library = createPortal(
    <div className="person-library-backdrop" role="presentation" onClick={props.onClose}>
      <div
        className="person-library"
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-library-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="person-library-head">
          <h2 id="person-library-title">人物库</h2>
          <div className="person-library-head-actions">
            <button type="button" aria-pressed={pane === "person"} onClick={() => setPane("person")}>
              人物
            </button>
            <button type="button" aria-pressed={pane === "labs"} onClick={() => setPane("labs")}>
              实验室
            </button>
            <button type="button" onClick={props.onClose}>
              关闭
            </button>
          </div>
        </div>
        <div className="person-library-body">
          <aside className="person-library-list">
            <input
              aria-label="查找人物"
              value={query}
              placeholder="按姓名或其他名字查找"
              onChange={(event) => setQuery(event.target.value)}
            />
            {shown.length === 0 ? <p>没有匹配的人。</p> : null}
            {groups.map((group) => {
              const open = needle !== "" || openGroups.has(group.key);
              return (
                <section key={group.key || "unassigned"} className="person-library-group">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => {
                      if (needle) return;
                      setOpenGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.key)) next.delete(group.key);
                        else next.add(group.key);
                        return next;
                      });
                    }}
                  >
                    <span>{group.name}</span>
                    <i>{group.people.length}</i>
                  </button>
                  {open
                    ? group.people.map((person) => (
                        <button
                          key={person.id}
                          type="button"
                          className={selected?.id === person.id && pane === "person" ? "is-selected" : undefined}
                          onClick={() => {
                            setPane("person");
                            selectPerson(person.id);
                            setAliasDraft("");
                            setMergeTarget("");
                          }}
                        >
                          <span>{person.name}</span>
                          {person.aliases.length > 0 ? <i>{`+${person.aliases.length}`}</i> : null}
                        </button>
                      ))
                    : null}
                </section>
              );
            })}
            <div className="person-library-add">
              <input
                aria-label="新人物姓名"
                value={personDraft}
                placeholder="新人物"
                onChange={(event) => setPersonDraft(event.target.value)}
              />
              <button
                type="button"
                disabled={!personDraft.trim()}
                onClick={() => {
                  const id = addPerson(personDraft, []);
                  if (!id) return;
                  setPersonDraft("");
                  setPane("person");
                  selectPerson(id);
                  setOpenGroups((prev) => new Set(prev).add(UNASSIGNED_LAB));
                }}
              >
                添加
              </button>
            </div>
          </aside>
          <div className="person-library-detail">
            {pane === "labs" ? (
              <>
                <div className="lab-pane-head">
                  <h3>实验室</h3>
                  <button
                    type="button"
                    className="lab-add-icon"
                    aria-label="添加实验室"
                    aria-expanded={addingLab}
                    onClick={() => {
                      const name = labDraft.trim();
                      if (!addingLab || !name) {
                        setAddingLab(true);
                        return;
                      }
                      addLab(name);
                      setLabDraft("");
                      setAddingLab(false);
                    }}
                  >
                    +
                  </button>
                </div>
                <p>名字点「编辑」再改。文章里的地址和身份记在人身上。</p>
                {addingLab ? (
                  <div className="person-library-add lab-add-row">
                    <input
                      aria-label="新实验室名称"
                      value={labDraft}
                      placeholder="PI 的名字"
                      autoFocus
                      onChange={(event) => setLabDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        const name = labDraft.trim();
                        if (!name) return;
                        addLab(name);
                        setLabDraft("");
                        setAddingLab(false);
                      }}
                    />
                  </div>
                ) : null}
                {labs.length === 0 ? <p>还没有实验室。</p> : null}
                {labs.map((lab) => (
                  <LabSettingsCard
                    key={lab.id}
                    lab={lab}
                    editing={editingLabId === lab.id}
                    onEdit={() => setEditingLabId(editingLabId === lab.id ? null : lab.id)}
                    onHome={() => setHomeLabId(lab.id)}
                    onRename={(patch) => updateLab(lab.id, patch)}
                    onColor={(color) => updateLab(lab.id, { color })}
                    onRemove={() => removeLab(lab.id)}
                  />
                ))}
              </>
            ) : selected ? (
              <>
                <h3>{selected.name}</h3>
                <label>
                  <span>姓名</span>
                  <input
                    aria-label="姓名"
                    key={`${selected.id}-${selected.name}`}
                    defaultValue={selected.name}
                    onBlur={(event) => {
                      const next = event.currentTarget.value.trim();
                      if (!next) {
                        event.currentTarget.value = selected.name;
                        return;
                      }
                      updatePerson(selected.id, { name: next });
                    }}
                  />
                </label>
                <div className="person-library-pair">
                  <label>
                    <span>姓</span>
                    <input
                      aria-label="姓"
                      key={`${selected.id}-family-${selected.family_name}`}
                      defaultValue={selected.family_name}
                      onBlur={(event) => updatePerson(selected.id, { family_name: event.currentTarget.value })}
                    />
                  </label>
                  <label>
                    <span>中间名</span>
                    <input
                      aria-label="中间名"
                      key={`${selected.id}-middle-${selected.middle_name ?? ""}`}
                      defaultValue={selected.middle_name ?? ""}
                      placeholder="英文名用"
                      onBlur={(event) => updatePerson(selected.id, { middle_name: event.currentTarget.value })}
                    />
                  </label>
                  <label>
                    <span>名</span>
                    <input
                      aria-label="名"
                      key={`${selected.id}-given-${selected.given_name}`}
                      defaultValue={selected.given_name}
                      onBlur={(event) => updatePerson(selected.id, { given_name: event.currentTarget.value })}
                    />
                  </label>
                </div>
                <div className="person-library-labs">
                  <span>身份</span>
                  <p>PI 和职位记在人身上。大实验室里的内部 PI 也在这里点，不必再建实验室。</p>
                  <div className="lab-stage-choices" role="group" aria-label="身份">
                    <button
                      type="button"
                      aria-pressed={selected.pi === true}
                      onClick={() => updatePerson(selected.id, { pi: selected.pi !== true })}
                    >
                      PI
                    </button>
                    {JOB_TITLES.map((title) => (
                      <button
                        key={title}
                        type="button"
                        aria-pressed={selected.job === title}
                        onClick={() => updatePerson(selected.id, { job: selected.job === title ? "" : title })}
                      >
                        {title}
                      </button>
                    ))}
                    {selected.job && !JOB_TITLES.some((title) => title === selected.job) ? (
                      <button type="button" aria-pressed={true} onClick={() => updatePerson(selected.id, { job: "" })}>
                        {selected.job}
                      </button>
                    ) : null}
                  </div>
                  <div className="person-library-add lab-add-row">
                    <input
                      aria-label="其他职位"
                      key={`${selected.id}-job`}
                      placeholder="其他职位"
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        const next = event.currentTarget.value.trim();
                        if (!next) return;
                        updatePerson(selected.id, { job: next });
                        event.currentTarget.value = "";
                      }}
                    />
                  </div>
                </div>
                <div className="person-library-labs">
                  <span>实验室</span>
                  <p>点一下就加入。实验室负责人记为 PI。身份可以多选。实验室里有多位 PI 时，学生再选导师。</p>
                  {labs.length === 0 ? <p>还没有实验室。可以先在上面的「实验室」里添加。</p> : null}
                  <div className="person-lab-grid">
                    {labs.map((lab) => {
                      const on = selected.lab_ids.includes(lab.id);
                      const role = (selected.lab_roles ?? []).find((item) => item.lab_id === lab.id);
                      const advisors = people.filter((person) => personAdvisesLab(person, lab));
                      const showAdvisor = advisors.length >= 2 && !advisors.some((person) => person.id === selected.id);
                      return (
                        <div key={lab.id} className={on ? "person-lab-card is-selected" : "person-lab-card"}>
                          <button type="button" className="person-lab-pick" aria-pressed={on} onClick={() => toggleLab(lab.id)}>
                            <span className="person-lab-dot" style={{ background: lab.color }} />
                            <span>
                              <strong>{lab.name}</strong>
                              {lab.name_en && lab.name_en !== lab.name ? <small>{lab.name_en}</small> : null}
                            </span>
                          </button>
                          {on ? (
                            <>
                              <LabStageChoices
                                stages={role?.stages ?? []}
                                tags={role?.tags ?? []}
                                identities={lab.identities ?? []}
                                lockedPi={personIsLabHead(selected, lab)}
                                ariaPrefix={lab.name}
                                onChange={(stages, tags) => setLabStage(lab.id, stages, tags)}
                                onAddIdentity={(label) => updateLab(lab.id, { identities: [...(lab.identities ?? []), label] })}
                              />
                              {showAdvisor ? (
                                <label>
                                  <span>导师</span>
                                  <select
                                    aria-label={`${lab.name} 导师`}
                                    value={role?.advisor_id ?? ""}
                                    onChange={(event) => setAdvisor(lab.id, event.target.value)}
                                  >
                                    <option value="">不指定</option>
                                    {advisors
                                      .filter((person) => person.id !== selected.id)
                                      .map((person) => (
                                        <option key={person.id} value={person.id}>
                                          {person.name}
                                          {person.job ? ` · ${person.job}` : ""}
                                        </option>
                                      ))}
                                  </select>
                                </label>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="person-library-aliases">
                  <span>地址</span>
                  <p>文章里认出的单位地址记在这个人身上。同一条可以写中文和英文。</p>
                  {(selected.affiliations ?? []).map((item, index) => (
                    <div key={`${item.name_zh ?? ""}-${item.name_en ?? ""}-${index}`} className="person-library-address">
                      <div className="person-library-lab-names">
                        <input
                          aria-label={`地址 ${index + 1} 中文`}
                          defaultValue={item.name_zh ?? ""}
                          key={`${selected.id}-addr-zh-${index}-${item.name_zh ?? ""}`}
                          placeholder="中文地址"
                          onBlur={(event) => {
                            const next = (selected.affiliations ?? []).map((row, rowIndex) =>
                              rowIndex === index ? { ...row, name_zh: event.currentTarget.value } : row,
                            );
                            updatePerson(selected.id, { affiliations: next });
                          }}
                        />
                        <input
                          aria-label={`地址 ${index + 1} 英文`}
                          defaultValue={item.name_en ?? ""}
                          key={`${selected.id}-addr-en-${index}-${item.name_en ?? ""}`}
                          placeholder="英文地址"
                          onBlur={(event) => {
                            const next = (selected.affiliations ?? []).map((row, rowIndex) =>
                              rowIndex === index ? { ...row, name_en: event.currentTarget.value } : row,
                            );
                            updatePerson(selected.id, { affiliations: next });
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updatePerson(selected.id, {
                            affiliations: (selected.affiliations ?? []).filter((_, rowIndex) => rowIndex !== index),
                          })
                        }
                      >
                        去掉
                      </button>
                    </div>
                  ))}
                  <div className="person-library-add">
                    <input
                      aria-label="新地址"
                      value={addressDraft}
                      placeholder="再记一条地址"
                      onChange={(event) => setAddressDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        const next = addressDraft.trim();
                        if (!next) return;
                        const row = /[\u3400-\u9fff]/.test(next) ? { name_zh: next } : { name_en: next };
                        updatePerson(selected.id, { affiliations: [...(selected.affiliations ?? []), row] });
                        setAddressDraft("");
                      }}
                    />
                    <button
                      type="button"
                      disabled={!addressDraft.trim()}
                      onClick={() => {
                        const next = addressDraft.trim();
                        if (!next) return;
                        const row = /[\u3400-\u9fff]/.test(next) ? { name_zh: next } : { name_en: next };
                        updatePerson(selected.id, { affiliations: [...(selected.affiliations ?? []), row] });
                        setAddressDraft("");
                      }}
                    >
                      记下
                    </button>
                  </div>
                </div>
                <div className="person-library-aliases">
                  <span>其他名字</span>
                  <p>中文名、期刊里的另一种写法都记在这里。下次识别会认成同一个人。</p>
                  <div>
                    {selected.aliases.map((alias) => (
                      <span key={alias} className="author-alias">
                        {alias}
                        <button
                          type="button"
                          aria-label={`去掉 ${alias}`}
                          onClick={() => updatePerson(selected.id, { aliases: selected.aliases.filter((name) => name !== alias) })}
                        >
                          去掉
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="person-library-add">
                    <input
                      aria-label="另一个名字"
                      value={aliasDraft}
                      placeholder="中文名或其他写法"
                      onChange={(event) => setAliasDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addAlias();
                        }
                      }}
                    />
                    <button type="button" disabled={!aliasDraft.trim()} onClick={addAlias}>
                      记下
                    </button>
                  </div>
                </div>
                {people.length > 1 ? (
                  <div className="person-library-add">
                    <select aria-label="并入哪一位" value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)}>
                      <option value="">把另一位并入此人…</option>
                      {people
                        .filter((person) => person.id !== selected.id)
                        .map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={!mergeTarget}
                      onClick={() => {
                        if (!mergeTarget) return;
                        mergePeople(selected.id, mergeTarget);
                        setMergeTarget("");
                      }}
                    >
                      并入
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="person-library-delete"
                  onClick={() => {
                    removePerson(selected.id);
                    setAliasDraft("");
                  }}
                >
                  删除这个人
                </button>
              </>
            ) : (
              <p>还没有人物。在左侧添加一位。</p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );

  const homeLab = homeLabId ? data.labs[homeLabId] : undefined;
  return (
    <>
      {library}
      {homeLab
        ? createPortal(
            <div className="lab-home-backdrop" onClick={() => setHomeLabId(null)}>
              <div
                className="lab-home-dialog"
                role="dialog"
                aria-label={`${homeLab.name} 主页`}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="lab-home-dialog-bar">
                  <a
                    href={`/${labPathSlug(homeLab, data.labs)}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      const username = useAppStore.getState().currentUsername;
                      if (username) publishLabTabHandoff(username, localStorage);
                    }}
                  >
                    在新标签页打开
                  </a>
                  <button type="button" onClick={() => setHomeLabId(null)}>
                    关闭
                  </button>
                </div>
                <LabHome labId={homeLab.id} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function LabSettingsCard(props: {
  lab: Lab;
  editing: boolean;
  onEdit: () => void;
  onHome: () => void;
  onRename: (patch: { name_zh?: string; name_en?: string }) => void;
  onColor: (color: string) => void;
  onRemove: () => void;
}) {
  const zh = props.lab.name_zh || props.lab.name;
  const en = props.lab.name_en && props.lab.name_en !== zh ? props.lab.name_en : "";
  return (
    <section className="lab-card">
      <div className="lab-card-main">
        <input
          className="lab-card-color"
          type="color"
          aria-label={`${props.lab.name} 颜色`}
          value={props.lab.color}
          onChange={(event) => props.onColor(event.target.value)}
        />
        <div className="lab-card-names">
          <strong>{zh}</strong>
          <span>{en || "还没有英文名"}</span>
        </div>
        <button type="button" onClick={props.onHome}>
          主页
        </button>
        <button type="button" aria-pressed={props.editing} onClick={props.onEdit}>
          {props.editing ? "完成" : "编辑"}
        </button>
        <button type="button" onClick={props.onRemove}>
          删除
        </button>
      </div>
      {props.editing ? (
        <div className="lab-card-edit">
          <input
            aria-label={`${props.lab.name} 中文名`}
            defaultValue={props.lab.name_zh ?? ""}
            key={`${props.lab.id}-zh-${props.lab.name_zh ?? ""}`}
            placeholder="中文名"
            onBlur={(event) => {
              const next = event.currentTarget.value.trim();
              if (!next && !props.lab.name_en) {
                event.currentTarget.value = props.lab.name_zh ?? props.lab.name;
                return;
              }
              props.onRename({ name_zh: next });
            }}
          />
          <input
            aria-label={`${props.lab.name} 英文名`}
            defaultValue={props.lab.name_en ?? ""}
            key={`${props.lab.id}-en-${props.lab.name_en ?? ""}`}
            placeholder="英文名"
            onBlur={(event) => {
              const next = event.currentTarget.value.trim();
              if (!next && !props.lab.name_zh) {
                event.currentTarget.value = props.lab.name_en ?? props.lab.name;
                return;
              }
              props.onRename({ name_en: next });
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
