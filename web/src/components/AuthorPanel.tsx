import { useEffect, useState } from "react";
import { useAppStore } from "../store/appStore";
import type { AuthorNameStyle, CreditRole, LabStage, LabStageRecord, Person } from "../types";
import { projectStatusVisual } from "../types";
import {
  CREDIT_ROLES,
  authorContributionText,
  creditRoleLabel,
  creditSortKey,
  formatLabStage,
  formatPaperRoles,
  hasOpenAuthorTodo,
  personIsLabHead,
  sortProjectAuthors,
  type AuthorTableSort,
} from "../domain/authors";
import { effectiveCompletion } from "../domain/progress";
import { LabStageChoices } from "./LabStageChoices";

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

type AuthorRowMode = "view" | "edit";

function PaperRoles(props: {
  person: Pick<Person, "name" | "family_name" | "given_name" | "middle_name" | "aliases" | "lab_ids">;
  roles: LabStageRecord[] | undefined;
  current: LabStageRecord[] | undefined;
  labs: Record<string, { name: string; name_zh?: string; name_en?: string; identities?: string[] } | undefined>;
  onChange: (roles: LabStageRecord[]) => void;
}) {
  const updateLab = useAppStore((s) => s.updateLab);
  const [openLabId, setOpenLabId] = useState<string | null>(null);
  const [pendingLabId, setPendingLabId] = useState("");
  const [addLabId, setAddLabId] = useState("");
  const recorded = (props.roles ?? []).filter((role) => props.labs[role.lab_id]);
  const listed = new Set(recorded.map((role) => role.lab_id));
  if (pendingLabId && props.labs[pendingLabId]) listed.add(pendingLabId);
  const labIds = [...recorded.map((role) => role.lab_id), ...(pendingLabId && !recorded.some((role) => role.lab_id === pendingLabId) ? [pendingLabId] : [])];
  const addable = Object.entries(props.labs)
    .filter((entry): entry is [string, { name: string }] => Boolean(entry[1]) && !listed.has(entry[0]))
    .sort((a, b) => a[1].name.localeCompare(b[1].name, "zh"));
  const setRole = (labId: string, stages: LabStage[], tags: string[]) => {
    const rest = recorded.filter((role) => role.lab_id !== labId);
    const trimmed = tags.map((tag) => tag.trim()).filter(Boolean);
    if (pendingLabId === labId) setPendingLabId("");
    const prev = recorded.find((role) => role.lab_id === labId);
    const advisor = prev?.advisor_id;
    if (stages.length === 0 && trimmed.length === 0 && !advisor) {
      props.onChange(rest);
      setOpenLabId(null);
      return;
    }
    props.onChange([
      ...rest,
      {
        lab_id: labId,
        ...(stages.length > 0 ? { stages } : {}),
        ...(trimmed.length > 0 ? { tags: trimmed } : {}),
        ...(advisor ? { advisor_id: advisor } : {}),
      },
    ]);
  };
  const addLab = () => {
    const lab = props.labs[addLabId];
    if (!lab) return;
    if (personIsLabHead(props.person, lab)) {
      props.onChange([...recorded, { lab_id: addLabId, stages: ["pi"] }]);
    } else {
      setPendingLabId(addLabId);
    }
    setOpenLabId(addLabId);
    setAddLabId("");
  };
  const removeLab = (labId: string) => {
    if (pendingLabId === labId) setPendingLabId("");
    if (openLabId === labId) setOpenLabId(null);
    props.onChange(recorded.filter((role) => role.lab_id !== labId));
  };
  return (
    <div className="paper-role-list">
      {labIds.length === 0 ? <p className="task-hint">这篇投稿还没记实验室。</p> : null}
      {labIds.map((labId) => {
        const lab = props.labs[labId];
        if (!lab) return null;
        const role = recorded.find((item) => item.lab_id === labId);
        const locked = personIsLabHead(props.person, lab);
        const open = openLabId === labId;
        const label = locked ? "PI" : formatLabStage(role);
        return (
          <div key={labId} className={open ? "paper-role is-open" : "paper-role"}>
            <div className="paper-role-row">
              <strong>{lab.name}</strong>
              <span>{label || "还没记身份"}</span>
              <button type="button" className="task-text" aria-expanded={open} onClick={() => setOpenLabId(open ? null : labId)}>
                {open ? "收起" : "修改"}
              </button>
              <button type="button" className="task-text" onClick={() => removeLab(labId)}>
                去掉
              </button>
            </div>
            {open ? (
              <LabStageChoices
                stages={role?.stages ?? []}
                tags={role?.tags ?? []}
                identities={lab.identities ?? []}
                lockedPi={locked}
                ariaPrefix={`${lab.name} 这篇投稿`}
                onChange={(stages, tags) => setRole(labId, stages, tags)}
                onAddIdentity={(label) => updateLab(labId, { identities: [...(lab.identities ?? []), label] })}
              />
            ) : null}
          </div>
        );
      })}
      {addable.length > 0 ? (
        <div className="lab-stage-add">
          <select aria-label="添加当时的实验室" value={addLabId} onChange={(event) => setAddLabId(event.target.value)}>
            <option value="">添加当时的实验室</option>
            {addable.map(([id, lab]) => (
              <option key={id} value={id}>
                {lab.name}
              </option>
            ))}
          </select>
          <button type="button" disabled={!addLabId} onClick={addLab}>
            添加
          </button>
        </div>
      ) : null}
      {(props.current ?? []).length > 0 ? (
        <button type="button" className="task-text" onClick={() => props.onChange(props.current ?? [])}>
          填入现在的身份
        </button>
      ) : null}
    </div>
  );
}

export function AuthorPanel() {
  const data = useAppStore((s) => s.data);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const selectedPersonId = useAppStore((s) => s.selectedPersonId);
  const selectPerson = useAppStore((s) => s.selectPerson);
  const selectProject = useAppStore((s) => s.selectProject);
  const addPerson = useAppStore((s) => s.addPerson);
  const updatePerson = useAppStore((s) => s.updatePerson);
  const addProjectAuthor = useAppStore((s) => s.addProjectAuthor);
  const updateProjectAuthor = useAppStore((s) => s.updateProjectAuthor);
  const removeProjectAuthor = useAppStore((s) => s.removeProjectAuthor);

  const [personDraft, setPersonDraft] = useState("");
  const [personFamily, setPersonFamily] = useState("");
  const [personGiven, setPersonGiven] = useState("");
  const [personLabIds, setPersonLabIds] = useState<string[]>([]);
  const [joinPersonId, setJoinPersonId] = useState("");
  const [sort, setSort] = useState<AuthorTableSort>("position");
  const [nameStyle, setNameStyle] = useState<AuthorNameStyle>("full");
  const [exported, setExported] = useState("");
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ id: string; mode: AuthorRowMode } | null>(null);
  const setPersonLibraryOpen = useAppStore((s) => s.setPersonLibraryOpen);

  useEffect(() => {
    setCreating(false);
    setExportOpen(false);
    setMenuId(null);
    setPanel(null);
    setExported("");
    setCopied(false);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuId]);

  const person = selectedPersonId ? data.people[selectedPersonId] : undefined;
  const project = selectedProjectId ? data.projects[selectedProjectId] : undefined;
  const progress = person
    ? data.authorships
        .filter((link) => link.person_id === person.id && data.projects[link.project_id])
        .map((link) => ({ link, project: data.projects[link.project_id] }))
        .sort((a, b) => a.project.name.localeCompare(b.project.name, "zh"))
    : [];
  const projectLinks = project
    ? sortProjectAuthors(
        data.authorships.filter((link) => link.project_id === project.id && data.people[link.person_id]),
        data,
        sort,
      )
    : [];
  const joinedIds = new Set(projectLinks.map((link) => link.person_id));
  const availablePeople = Object.values(data.people)
    .filter((item) => !joinedIds.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name, "zh"));
  const labs = Object.values(data.labs);
  const panelLink = panel ? (projectLinks.find((link) => link.person_id === panel.id) ?? null) : null;
  const editing = panel?.mode === "edit" ? panelLink : null;
  const viewing = panel?.mode === "view" ? panelLink : null;

  const openRow = (personId: string, mode: AuthorRowMode) => {
    setMenuId(null);
    setPanel((current) => (current?.id === personId && current.mode === mode ? null : { id: personId, mode }));
  };

  const toggleCredit = (personId: string, role: CreditRole, checked: boolean) => {
    if (!project) return;
    const link = data.authorships.find((item) => item.project_id === project.id && item.person_id === personId);
    if (!link) return;
    const next = checked ? [...link.credit_roles, role] : link.credit_roles.filter((item) => item !== role);
    updateProjectAuthor(project.id, personId, {
      credit_roles: CREDIT_ROLES.filter((item) => next.includes(item)),
    });
  };

  const exportContribution = async () => {
    if (!project) return;
    const text = authorContributionText(data, project.id, nameStyle);
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
              const next = event.target.checked ? [...selected, lab.id] : selected.filter((id) => id !== lab.id);
              onChange(next);
            }}
          />
          {lab.name}
        </label>
      ))}
    </div>
  );


  const viewingPerson = viewing ? data.people[viewing.person_id] : undefined;
  const viewDetail =
    project && viewing && viewingPerson ? (
      <div className="task-detail">
        <div className="task-card-head">
          <h3>{viewingPerson.name}</h3>
          <button type="button" className="task-text" onClick={() => setPanel(null)}>
            收起
          </button>
        </div>
        <p className="task-hint">
          人物库里现在在：{labNames(viewingPerson.lab_ids, data.labs)}
          {viewingPerson.pi || viewingPerson.job ? `。${[viewingPerson.pi ? "PI" : "", viewingPerson.job ?? ""].filter(Boolean).join("，")}` : ""}
        </p>
        {formatPaperRoles(viewing.paper_roles, data.labs, data.people) ? (
          <p className="task-hint">这篇投稿时：{formatPaperRoles(viewing.paper_roles, data.labs, data.people)}</p>
        ) : null}
        {(viewingPerson.affiliations ?? []).length > 0 ? (
          <p className="task-hint">
            地址：
            {(viewingPerson.affiliations ?? [])
              .map((item) => item.name_zh || item.name_en || "")
              .filter(Boolean)
              .join("；")}
          </p>
        ) : null}
        <p className="task-hint">贡献：{creditSortKey(viewing.credit_roles) || "未填"}</p>
        {viewing.responsibility.trim() ? <p className="task-hint">分工：{viewing.responsibility}</p> : null}
        {viewingPerson.aliases.length > 0 ? <p className="task-hint">也叫 {viewingPerson.aliases.join("、")}</p> : null}
      </div>
    ) : null;

  const editingPerson = editing ? data.people[editing.person_id] : undefined;
  const detail =
    project && editing && editingPerson ? (
      <div className="task-detail">
        <div className="task-card-head">
          <h3>{editingPerson.name}</h3>
          <button type="button" className="task-text" onClick={() => setPanel(null)}>
            收起
          </button>
        </div>
        {editingPerson.aliases.length > 0 ? <p className="task-hint">也叫 {editingPerson.aliases.join("、")}</p> : null}
        <label className="task-field">
          <span>位次</span>
          <input
            type="number"
            min={1}
            aria-label={`${editingPerson.name} 位次`}
            value={editing.position}
            onChange={(event) => updateProjectAuthor(project.id, editingPerson.id, { position: Number(event.target.value) })}
          />
        </label>
        <div className="task-field-pair">
          <label className="task-field">
            <span>姓</span>
            <input
              aria-label={`${editingPerson.name} 姓`}
              key={`${editingPerson.id}-family-${editingPerson.family_name}`}
              defaultValue={editingPerson.family_name}
              onBlur={(event) => updatePerson(editingPerson.id, { family_name: event.target.value })}
            />
          </label>
          <label className="task-field">
            <span>名</span>
            <input
              aria-label={`${editingPerson.name} 名`}
              key={`${editingPerson.id}-given-${editingPerson.given_name}`}
              defaultValue={editingPerson.given_name}
              onBlur={(event) => updatePerson(editingPerson.id, { given_name: event.target.value })}
            />
          </label>
        </div>
        <div className="task-field">
          <span>这篇投稿时</span>
          <p className="task-hint">只记写这篇文章时的实验室，默认收着。人物库里现在的实验室不会出现在这里。实验室负责人在自己的实验室里是 PI。</p>
          <PaperRoles
            person={editingPerson}
            roles={editing.paper_roles}
            labs={data.labs}
            current={editingPerson.lab_roles}
            onChange={(roles) => updateProjectAuthor(project.id, editingPerson.id, { paper_roles: roles })}
          />
        </div>
        <div className="task-field">
          <span>CRediT</span>
          <div className="author-checks">
            {CREDIT_ROLES.map((role) => (
              <label key={role}>
                <input
                  type="checkbox"
                  checked={editing.credit_roles.includes(role)}
                  onChange={(event) => toggleCredit(editingPerson.id, role, event.target.checked)}
                />
                {creditRoleLabel(role)}
              </label>
            ))}
          </div>
        </div>
        <label className="task-field">
          <span>分工</span>
          <input
            aria-label={`${editingPerson.name} 分工`}
            key={`${editingPerson.id}-duty-${editing.responsibility}`}
            defaultValue={editing.responsibility}
            onBlur={(event) => updateProjectAuthor(project.id, editingPerson.id, { responsibility: event.target.value })}
          />
        </label>
        <div className="author-checks">
          <label>
            <input
              type="checkbox"
              aria-label={`${editingPerson.name} 共同第一`}
              checked={editing.co_first}
              onChange={(event) => updateProjectAuthor(project.id, editingPerson.id, { co_first: event.target.checked })}
            />
            共同第一
          </label>
          <label>
            <input
              type="checkbox"
              aria-label={`${editingPerson.name} 通讯作者`}
              checked={editing.corresponding}
              onChange={(event) =>
                updateProjectAuthor(project.id, editingPerson.id, { corresponding: event.target.checked })
              }
            />
            通讯作者
          </label>
        </div>
        <button type="button" className="progress-remove" onClick={() => removeProjectAuthor(project.id, editingPerson.id)}>
          移出项目
        </button>
      </div>
    ) : null;

  return (
    <>
      {person ? (
        <section className="task-card">
          <div className="task-card-head">
            <h3>{person.name}</h3>
            <button type="button" className="task-text" onClick={() => selectPerson(null)}>
              取消选中
            </button>
          </div>
          <p className="task-hint">{labNames(person.lab_ids, data.labs)}</p>
          {progress.length === 0 ? (
            <p className="task-hint">还没有参与中的项目。回收站里的项目不在这里列出。</p>
          ) : (
            progress.map(({ link, project: item }) => {
              const meta = projectStatusVisual(item.status);
              return (
                <button key={item.id} type="button" className="author-project" onClick={() => selectProject(item.id)}>
                  <span>{item.name}</span>
                  <span style={{ color: meta.fill === "#ffffff" ? "#333" : meta.fill }}>{meta.label}</span>
                  <span>{Math.round(effectiveCompletion(item))}%</span>
                  {formatPaperRoles(link.paper_roles, data.labs, data.people) ? (
                    <span>{formatPaperRoles(link.paper_roles, data.labs, data.people)}</span>
                  ) : null}
                  {link.responsibility ? <span>{link.responsibility}</span> : null}
                </button>
              );
            })
          )}
        </section>
      ) : null}

      {project ? (
        <>
          <section className="task-card">
            <div className="author-strip" aria-label="作者位次">
              {projectLinks.length === 0 ? <p className="task-hint">还没有作者。</p> : null}
              {projectLinks.map((link) => {
                const member = data.people[link.person_id];
                const picked = selectedPersonId === member.id;
                return (
                  <button
                    key={member.id}
                    type="button"
                    className={picked ? "is-selected" : undefined}
                    aria-pressed={picked}
                    onClick={() => selectPerson(picked ? null : member.id)}
                  >
                    <span>{link.position}</span>
                    {member.name}
                    {link.co_first ? "†" : ""}
                    {link.corresponding ? "*" : ""}
                  </button>
                );
              })}
            </div>
            <p className="task-hint">按位次排列。名单里点 ⋮ 再查看或编辑。共同第一后有 †，通讯作者后有 *。</p>
          </section>
          <section className="task-card">
            <div className="task-card-head">
              <h3>作者</h3>
              <div className="task-card-actions">
                <button type="button" className="task-text" aria-pressed={creating} onClick={() => setCreating((open) => !open)}>
                  创建
                </button>
                <button type="button" className="task-text" aria-pressed={exportOpen} onClick={() => setExportOpen((open) => !open)}>
                  导出
                </button>
                <button type="button" className="task-text" onClick={() => setPersonLibraryOpen(true)}>
                  人物库
                </button>
              </div>
            </div>
            {creating ? (
              <div className="task-fold">
                <label className="task-field">
                  <span>姓名</span>
                  <input
                    aria-label="新建并加入的姓名"
                    value={personDraft}
                    placeholder="姓名"
                    onChange={(event) => setPersonDraft(event.target.value)}
                  />
                </label>
                <div className="task-field-pair">
                  <label className="task-field">
                    <span>姓</span>
                    <input aria-label="新建人物的姓" value={personFamily} onChange={(event) => setPersonFamily(event.target.value)} />
                  </label>
                  <label className="task-field">
                    <span>名</span>
                    <input aria-label="新建人物的名" value={personGiven} onChange={(event) => setPersonGiven(event.target.value)} />
                  </label>
                </div>
                {labChoices(personLabIds, setPersonLabIds)}
                <button
                  type="button"
                  className="task-primary"
                  disabled={!personDraft.trim()}
                  onClick={() => {
                    const id = addPerson(personDraft, personLabIds);
                    if (!id || !project) return;
                    if (personFamily || personGiven) updatePerson(id, { family_name: personFamily, given_name: personGiven });
                    addProjectAuthor(project.id, id);
                    setPersonDraft("");
                    setPersonFamily("");
                    setPersonGiven("");
                    setPersonLabIds([]);
                    setCreating(false);
                    setPanel({ id, mode: "edit" });
                  }}
                >
                  新建并加入
                </button>
                <label className="task-field">
                  <span>已有人物</span>
                  <select aria-label="加入已有人物" value={joinPersonId} onChange={(event) => setJoinPersonId(event.target.value)}>
                    <option value="">选择人物…</option>
                    {availablePeople.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="task-primary"
                  disabled={!joinPersonId}
                  onClick={() => {
                    if (!joinPersonId || !project) return;
                    addProjectAuthor(project.id, joinPersonId);
                    setJoinPersonId("");
                    setCreating(false);
                  }}
                >
                  加入
                </button>
              </div>
            ) : null}
            {exportOpen ? (
              <div className="task-fold">
                <label className="task-field">
                  <span>姓名写法</span>
                  <select
                    aria-label="作者名缩写规则"
                    value={nameStyle}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "full" || value === "familyInitials" || value === "initialsFamily") setNameStyle(value);
                    }}
                  >
                    <option value="full">原名</option>
                    <option value="familyInitials">姓在前，名缩写（Zhang S）</option>
                    <option value="initialsFamily">名缩写在前（S Zhang）</option>
                  </select>
                </label>
                <button type="button" className="task-primary" onClick={() => void exportContribution()}>
                  导出贡献文本
                </button>
                {copied ? <p className="task-hint">已复制到剪贴板。</p> : null}
                {exported ? <textarea className="author-export" readOnly value={exported} aria-label="作者贡献文本" /> : null}
              </div>
            ) : null}
            <label className="task-field">
              <span>排序</span>
              <select
                aria-label="作者排序"
                value={sort}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "position" || value === "lab" || value === "credit") setSort(value);
                }}
              >
                {(["position", "lab", "credit"] as const).map((key) => (
                  <option key={key} value={key}>
                    {sortLabel(key)}
                  </option>
                ))}
              </select>
            </label>
            {projectLinks.length === 0 ? <p className="task-hint">这个项目还没有作者。</p> : null}
            {projectLinks.map((link) => {
              const member = data.people[link.person_id];
              const open = panel?.id === member.id;
              const menuOpen = menuId === member.id;
              return (
                <div key={member.id}>
                  <div
                    className={open ? "task-row is-selected" : "task-row"}
                    onPointerDown={menuOpen ? (event) => event.stopPropagation() : undefined}
                  >
                    <span className="task-row-title">
                      {link.position}. {member.name}
                      {link.co_first ? "†" : ""}
                      {link.corresponding ? "*" : ""}
                    </span>
                    <span className="task-badge">
                      {[link.co_first ? "共一" : "", link.primary && hasOpenAuthorTodo(project, member.id) ? "主要" : ""]
                        .filter(Boolean)
                        .join(" ")}
                    </span>
                    <button
                      type="button"
                      className="task-icon author-more"
                      aria-label={`${member.name} 的操作`}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      onClick={() => setMenuId(menuOpen ? null : member.id)}
                    >
                      ⋮
                    </button>
                    {menuOpen ? (
                      <div className="author-menu" role="menu">
                        <button type="button" role="menuitem" onClick={() => openRow(member.id, "view")}>
                          查看
                        </button>
                        <button type="button" role="menuitem" onClick={() => openRow(member.id, "edit")}>
                          编辑
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            removeProjectAuthor(project.id, member.id);
                            setMenuId(null);
                            if (panel?.id === member.id) setPanel(null);
                          }}
                        >
                          移出
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {open && panel?.mode === "view" ? viewDetail : null}
                  {open && panel?.mode === "edit" ? detail : null}
                </div>
              );
            })}
          </section>
        </>
      ) : (
        <section className="task-card">
          <div className="task-card-head">
            <h3>作者</h3>
            <button type="button" className="task-text" onClick={() => setPersonLibraryOpen(true)}>
              人物库
            </button>
          </div>
          <p className="task-hint">选中一个项目后，在这里排作者。发表页填好链接后可以一次识别。人物和同人多名在人物库里改。</p>
        </section>
      )}
    </>
  );
}
