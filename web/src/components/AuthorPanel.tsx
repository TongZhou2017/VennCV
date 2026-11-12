import { useState } from "react";
import { useAppStore } from "../store/appStore";
import type { AuthorNameStyle, CreditRole } from "../types";
import { projectStatusVisual } from "../types";
import {
  CREDIT_ROLES,
  authorContributionText,
  creditRoleLabel,
  creditSortKey,
  labSortKey,
  sortProjectAuthors,
  type AuthorTableSort,
} from "../domain/authors";

function labNames(labIds: string[], labs: { [id: string]: { name: string } | undefined }): string {
  const names = labIds.map((id) => labs[id]?.name).filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join("、") : "未归入实验室";
}

function sortLabel(sort: AuthorTableSort): string {
  switch (sort) {
    case "position":
      return "位次";
    case "lab":
      return "实验室";
    case "credit":
      return "CRediT";
    default: {
      const unexpected: never = sort;
      return unexpected;
    }
  }
}

export function AuthorPanel() {
  const data = useAppStore((s) => s.data);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const selectedPersonId = useAppStore((s) => s.selectedPersonId);
  const selectPerson = useAppStore((s) => s.selectPerson);
  const selectProject = useAppStore((s) => s.selectProject);
  const addLab = useAppStore((s) => s.addLab);
  const updateLab = useAppStore((s) => s.updateLab);
  const removeLab = useAppStore((s) => s.removeLab);
  const addPerson = useAppStore((s) => s.addPerson);
  const updatePerson = useAppStore((s) => s.updatePerson);
  const removePerson = useAppStore((s) => s.removePerson);
  const addProjectAuthor = useAppStore((s) => s.addProjectAuthor);
  const updateProjectAuthor = useAppStore((s) => s.updateProjectAuthor);
  const removeProjectAuthor = useAppStore((s) => s.removeProjectAuthor);

  const [labDraft, setLabDraft] = useState("");
  const [personDraft, setPersonDraft] = useState("");
  const [personLabIds, setPersonLabIds] = useState<string[]>([]);
  const [joinPersonId, setJoinPersonId] = useState("");
  const [projectPersonDraft, setProjectPersonDraft] = useState("");
  const [projectPersonLabIds, setProjectPersonLabIds] = useState<string[]>([]);
  const [sort, setSort] = useState<AuthorTableSort>("position");
  const [nameStyle, setNameStyle] = useState<AuthorNameStyle>("full");
  const [exported, setExported] = useState("");
  const [copied, setCopied] = useState(false);

  const person = selectedPersonId ? data.people[selectedPersonId] : undefined;
  const progress = person
    ? data.authorships
        .filter((link) => link.person_id === person.id && data.projects[link.project_id])
        .map((link) => ({ link, project: data.projects[link.project_id] }))
        .sort((a, b) => a.project.name.localeCompare(b.project.name, "zh"))
    : [];
  const projectLinks = selectedProjectId
    ? sortProjectAuthors(
        data.authorships.filter((link) => link.project_id === selectedProjectId && data.people[link.person_id]),
        data,
        sort,
      )
    : [];
  const joinedIds = new Set(
    data.authorships.filter((link) => link.project_id === selectedProjectId).map((link) => link.person_id),
  );
  const availablePeople = Object.values(data.people).filter((item) => !joinedIds.has(item.id));
  const labs = Object.values(data.labs);

  const togglePersonLab = (personId: string, labId: string, checked: boolean) => {
    const current = data.people[personId];
    if (!current) return;
    const next = checked ? [...current.lab_ids, labId] : current.lab_ids.filter((id) => id !== labId);
    updatePerson(personId, { lab_ids: next });
  };

  const toggleCredit = (personId: string, role: CreditRole, checked: boolean) => {
    if (!selectedProjectId) return;
    const link = data.authorships.find((item) => item.project_id === selectedProjectId && item.person_id === personId);
    if (!link) return;
    const next = checked ? [...link.credit_roles, role] : link.credit_roles.filter((item) => item !== role);
    updateProjectAuthor(selectedProjectId, personId, {
      credit_roles: CREDIT_ROLES.filter((item) => next.includes(item)),
    });
  };

  const exportContribution = async () => {
    if (!selectedProjectId) return;
    const text = authorContributionText(data, selectedProjectId, nameStyle);
    setExported(text);
    setCopied(false);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const labChoices = (selected: string[], onChange: (ids: string[]) => void) => (
    <div className="author-checks">
      {labs.length === 0 ? <span className="property-note">还没有实验室</span> : null}
      {labs.map((lab) => (
        <label key={lab.id}>
          <input
            type="checkbox"
            checked={selected.includes(lab.id)}
            onChange={(event) => {
              const next = event.target.checked
                ? [...selected, lab.id]
                : selected.filter((id) => id !== lab.id);
              onChange(next);
            }}
          />
          {lab.name}
        </label>
      ))}
    </div>
  );

  const catalog = (
    <>
      <p className="property-note">一个人可以属于多个实验室。姓和名用于导出时的缩写，不填则按姓名推断。</p>
      <div className="author-section-title">实验室</div>
      {labs.length === 0 ? <p className="property-empty">还没有实验室</p> : null}
      {labs.map((lab) => (
        <div key={lab.id} className="author-card">
          <div className="author-row">
            <input
              type="color"
              aria-label={`${lab.name} 颜色`}
              value={lab.color}
              onChange={(event) => updateLab(lab.id, { color: event.target.value })}
            />
            <input
              type="text"
              aria-label={`${lab.name} 名称`}
              defaultValue={lab.name}
              key={`${lab.id}-${lab.name}`}
              onBlur={(event) => {
                const next = event.currentTarget.value.trim();
                if (!next) {
                  event.currentTarget.value = lab.name;
                  return;
                }
                updateLab(lab.id, { name: next });
              }}
              style={{ flex: 1, minWidth: 0, padding: 4 }}
            />
            <button type="button" onClick={() => removeLab(lab.id)}>
              删除
            </button>
          </div>
        </div>
      ))}
      <div className="author-row">
        <input
          type="text"
          aria-label="新实验室名称"
          value={labDraft}
          placeholder="实验室名称"
          onChange={(event) => setLabDraft(event.target.value)}
          style={{ flex: 1, minWidth: 0, padding: 4 }}
        />
        <button
          type="button"
          onClick={() => {
            addLab(labDraft);
            setLabDraft("");
          }}
        >
          添加实验室
        </button>
      </div>

      <div className="author-section-title">人物</div>
      {Object.values(data.people).length === 0 ? <p className="property-empty">还没有人物</p> : null}
      {Object.values(data.people).map((item) => (
        <div key={item.id} className="author-card">
          <div className="author-row">
            <input
              type="text"
              aria-label={`${item.name} 姓名`}
              defaultValue={item.name}
              key={`${item.id}-${item.name}`}
              onBlur={(event) => {
                const next = event.currentTarget.value.trim();
                if (!next) {
                  event.currentTarget.value = item.name;
                  return;
                }
                updatePerson(item.id, { name: next });
              }}
              style={{ flex: 1, minWidth: 0, padding: 4 }}
            />
            <button type="button" onClick={() => removePerson(item.id)}>
              删除
            </button>
          </div>
          <div className="author-row">
            <input
              type="text"
              aria-label={`${item.name} 姓`}
              placeholder="姓"
              defaultValue={item.family_name}
              key={`${item.id}-family-${item.family_name}`}
              onBlur={(event) => updatePerson(item.id, { family_name: event.currentTarget.value })}
              style={{ width: 72, padding: 4 }}
            />
            <input
              type="text"
              aria-label={`${item.name} 名`}
              placeholder="名"
              defaultValue={item.given_name}
              key={`${item.id}-given-${item.given_name}`}
              onBlur={(event) => updatePerson(item.id, { given_name: event.currentTarget.value })}
              style={{ flex: 1, minWidth: 0, padding: 4 }}
            />
          </div>
          <div className="author-field">
            所属实验室
            {labChoices(item.lab_ids, (ids) => updatePerson(item.id, { lab_ids: ids }))}
          </div>
        </div>
      ))}
      <div className="author-field">
        <input
          type="text"
          aria-label="新人物姓名"
          value={personDraft}
          placeholder="姓名"
          onChange={(event) => setPersonDraft(event.target.value)}
          style={{ width: "100%", padding: 4, boxSizing: "border-box" }}
        />
        {labChoices(personLabIds, setPersonLabIds)}
        <button
          type="button"
          onClick={() => {
            const id = addPerson(personDraft, personLabIds);
            if (!id) return;
            setPersonDraft("");
            setPersonLabIds([]);
            selectPerson(id);
          }}
        >
          添加人物
        </button>
      </div>
    </>
  );

  return (
    <>
      {person ? (
        <section className="author-card">
          <div className="author-row">
            <strong style={{ flex: 1 }}>{person.name}</strong>
            <button type="button" onClick={() => selectPerson(null)}>
              取消选中
            </button>
          </div>
          <p className="property-note">{labNames(person.lab_ids, data.labs)}</p>
          {progress.length === 0 ? (
            <p className="property-empty">还没有参与中的项目。回收站里的项目不在这里列出。</p>
          ) : (
            progress.map(({ link, project }) => {
              const meta = projectStatusVisual(project.status);
              return (
                <button
                  key={project.id}
                  type="button"
                  className="author-project"
                  onClick={() => selectProject(project.id)}
                >
                  <span>{project.name}</span>
                  <span style={{ color: meta.fill === "#ffffff" ? "#333" : meta.fill }}>{meta.label}</span>
                  <span>{Math.round(project.completion_percentage)}%</span>
                  {link.responsibility ? <span>{link.responsibility}</span> : null}
                </button>
              );
            })
          )}
        </section>
      ) : null}

      {selectedProjectId ? (
        <section>
          <p className="property-note">
            表头可以按位次、实验室或 CRediT 排序。位次决定导出顺序。勾选主要作者后，维恩图可以只贴出这些人。
          </p>
          <div className="author-row">
            <select
              aria-label="作者名缩写规则"
              value={nameStyle}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "full" || value === "familyInitials" || value === "initialsFamily") {
                  setNameStyle(value);
                }
              }}
            >
              <option value="full">原名</option>
              <option value="familyInitials">姓在前，名缩写（Zhang S）</option>
              <option value="initialsFamily">名缩写在前（S Zhang）</option>
            </select>
            <button type="button" onClick={() => void exportContribution()}>
              导出贡献文本
            </button>
          </div>
          {exported ? (
            <textarea className="author-export" readOnly value={exported} aria-label="作者贡献文本" />
          ) : null}
          {copied ? <p className="property-note">已复制到剪贴板。</p> : null}
          {projectLinks.length === 0 ? <p className="property-empty">这个项目还没有作者</p> : null}
          {projectLinks.length > 0 ? (
            <div className="author-table-wrap">
              <table className="author-table">
                <thead>
                  <tr>
                    {(["position", "lab", "credit"] as const).map((key) => (
                      <th key={key}>
                        <button
                          type="button"
                          className={sort === key ? "is-active" : undefined}
                          onClick={() => setSort(key)}
                        >
                          {sortLabel(key)}
                        </button>
                      </th>
                    ))}
                    <th>姓名</th>
                    <th>主要</th>
                    <th>通讯</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {projectLinks.map((link) => {
                    const member = data.people[link.person_id];
                    return (
                      <tr key={link.person_id}>
                        <td>
                          <input
                            type="number"
                            min={1}
                            aria-label={`${member.name} 位次`}
                            value={link.position}
                            onChange={(event) =>
                              updateProjectAuthor(selectedProjectId, member.id, { position: Number(event.target.value) })
                            }
                            style={{ width: 52 }}
                          />
                        </td>
                        <td>{labSortKey(member, data.labs) || "未归入"}</td>
                        <td>
                          <details>
                            <summary>{creditSortKey(link.credit_roles) || "选择"}</summary>
                            <div className="author-checks">
                              {CREDIT_ROLES.map((role) => (
                                <label key={role}>
                                  <input
                                    type="checkbox"
                                    checked={link.credit_roles.includes(role)}
                                    onChange={(event) => toggleCredit(member.id, role, event.target.checked)}
                                  />
                                  {creditRoleLabel(role)}
                                </label>
                              ))}
                            </div>
                          </details>
                        </td>
                        <td>
                          <button type="button" onClick={() => selectPerson(member.id)}>
                            {member.name}
                          </button>
                          <div className="author-row">
                            <input
                              type="text"
                              aria-label={`${member.name} 姓`}
                              placeholder="姓"
                              defaultValue={member.family_name}
                              key={`${member.id}-family-${member.family_name}`}
                              onBlur={(event) => updatePerson(member.id, { family_name: event.currentTarget.value })}
                              style={{ width: 56, padding: 2 }}
                            />
                            <input
                              type="text"
                              aria-label={`${member.name} 名`}
                              placeholder="名"
                              defaultValue={member.given_name}
                              key={`${member.id}-given-${member.given_name}`}
                              onBlur={(event) => updatePerson(member.id, { given_name: event.currentTarget.value })}
                              style={{ width: 72, padding: 2 }}
                            />
                          </div>
                          <div className="author-checks">
                            {labs.map((lab) => (
                              <label key={lab.id}>
                                <input
                                  type="checkbox"
                                  checked={member.lab_ids.includes(lab.id)}
                                  onChange={(event) => togglePersonLab(member.id, lab.id, event.target.checked)}
                                />
                                {lab.name}
                              </label>
                            ))}
                          </div>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`${member.name} 主要作者`}
                            checked={link.primary}
                            onChange={(event) =>
                              updateProjectAuthor(selectedProjectId, member.id, { primary: event.target.checked })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`${member.name} 通讯作者`}
                            checked={link.corresponding}
                            onChange={(event) =>
                              updateProjectAuthor(selectedProjectId, member.id, { corresponding: event.target.checked })
                            }
                          />
                        </td>
                        <td>
                          <button type="button" onClick={() => removeProjectAuthor(selectedProjectId, member.id)}>
                            移出
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="author-row">
            <select
              aria-label="加入已有人物"
              value={joinPersonId}
              onChange={(event) => setJoinPersonId(event.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            >
              <option value="">选择人物…</option>
              {availablePeople.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!joinPersonId}
              onClick={() => {
                if (!joinPersonId) return;
                addProjectAuthor(selectedProjectId, joinPersonId);
                setJoinPersonId("");
              }}
            >
              加入
            </button>
          </div>
          <div className="author-field">
            <input
              type="text"
              aria-label="新建并加入的姓名"
              value={projectPersonDraft}
              placeholder="新建人物姓名"
              onChange={(event) => setProjectPersonDraft(event.target.value)}
              style={{ width: "100%", padding: 4, boxSizing: "border-box" }}
            />
            {labChoices(projectPersonLabIds, setProjectPersonLabIds)}
            <button
              type="button"
              onClick={() => {
                const id = addPerson(projectPersonDraft, projectPersonLabIds);
                if (!id) return;
                addProjectAuthor(selectedProjectId, id);
                setProjectPersonDraft("");
                setProjectPersonLabIds([]);
                selectPerson(id);
              }}
            >
              新建并加入
            </button>
          </div>
        </section>
      ) : null}

      {selectedProjectId ? (
        <details className="author-catalog">
          <summary>人物库</summary>
          {catalog}
        </details>
      ) : (
        catalog
      )}
    </>
  );
}
