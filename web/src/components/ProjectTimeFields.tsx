import { useEffect, useState } from "react";
import { useAppStore } from "../store/appStore";
import type { JournalSubmission, Project, SubmissionMilestone, SubmissionMilestoneKind } from "../types";
import { DateField } from "./DateField";
import { loadDoiCreators, resolvePublicationDoi } from "../domain/doiAuthors";
import {
  coerceSubmissionMilestoneKind,
  milestoneDisplayLabel,
  ARTICLE_TYPE_SLUGS,
  articleTypeLabel,
  newMilestoneId,
  newSubmissionId,
  projectOnSubmissionTrack,
  submissionMilestoneKindLabel,
  submissionVenueLabel,
  todayIsoDate,
} from "../domain/projectTime";

const MILESTONE_KINDS: SubmissionMilestoneKind[] = [
  "SubmissionStart",
  "Revision",
  "Accepted",
  "Published",
  "Rejected",
  "Custom",
];

type Props = {
  project: Project;
  onChange: (patch: Partial<Project>) => void;
};

function sortMilestones(milestones: SubmissionMilestone[]): SubmissionMilestone[] {
  return [...milestones].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function ProjectTimeFields({ project, onChange }: Props) {
  const fillProjectAuthors = useAppStore((s) => s.fillProjectAuthors);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const onTrack = projectOnSubmissionTrack(project.status);
  const submissions = project.journal_submissions ?? [];

  useEffect(() => {
    setBusyId("");
    setNotice(null);
    setMenuId(null);
    setEditId(null);
  }, [project.id]);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuId]);

  const writeSubmissions = (next: JournalSubmission[]) => {
    onChange({
      journal_submissions: next,
      submission_milestones: sortMilestones(next.flatMap((item) => item.milestones)),
    });
  };

  const updateSubmission = (id: string, patch: Partial<JournalSubmission>) => {
    writeSubmissions(submissions.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addSubmission = (preprint: boolean) => {
    writeSubmissions([
      ...submissions,
      {
        id: newSubmissionId(),
        venue: !preprint && submissions.length === 0 ? (project.expected_journal ?? "").trim() : "",
        is_preprint: preprint,
        url: "",
        milestones: [],
      },
    ]);
  };

  const addMilestone = (submission: JournalSubmission) => {
    const id = newMilestoneId();
    const kind: SubmissionMilestoneKind = submission.milestones.length === 0 ? "SubmissionStart" : "Revision";
    updateSubmission(submission.id, {
      milestones: sortMilestones([
        ...submission.milestones,
        { id, kind, label: "", date: todayIsoDate(), note: "" },
      ]),
    });
    setMenuId(null);
    setEditId(id);
  };

  const recognize = async (submission: JournalSubmission) => {
    if (busyId) return;
    const url = submission.url.trim();
    if (!url) {
      setNotice({ id: submission.id, text: "先填写展示链接。" });
      return;
    }
    const projectId = project.id;
    setBusyId(submission.id);
    setNotice(null);
    useAppStore.getState().applyProjectBufferToData({ skipHistory: true });
    const doi = await resolvePublicationDoi(url);
    if (useAppStore.getState().selectedProjectId !== projectId) {
      setBusyId("");
      return;
    }
    if (!doi) {
      setNotice({ id: submission.id, text: "这条链接里认不出 DOI。" });
      setBusyId("");
      return;
    }
    const loaded = await loadDoiCreators(doi);
    if (useAppStore.getState().selectedProjectId !== projectId) {
      setBusyId("");
      return;
    }
    if (!loaded.ok) {
      setNotice({ id: submission.id, text: loaded.message });
      setBusyId("");
      return;
    }
    const applied = fillProjectAuthors(projectId, loaded.creators, {
      url,
      doi,
      dates: loaded.dates,
      articleType: loaded.articleType,
      awards: loaded.awards,
    });
    if (!applied) setNotice({ id: submission.id, text: "这篇文献没有作者" });
    else {
      const created = applied.created > 0 ? `，新建 ${applied.created} 位` : "";
      const credit = applied.credited > 0 ? `，写入 ${applied.credited} 位的 CRediT` : "";
      const dated = applied.dated > 0 ? `，写入 ${applied.dated} 个时间点` : "";
      const kind = applied.articleType ? `，类型为${articleTypeLabel(applied.articleType)}` : "";
      const funded = applied.funded > 0 ? `，写入 ${applied.funded} 个基金号` : "";
      setNotice({
        id: submission.id,
        text: `已从 ${doi} 填入 ${applied.total} 位作者${created}${credit}${dated}${kind}${funded}。`,
      });
    }
    setBusyId("");
  };

  if (!onTrack) {
    return (
      <section className="task-card">
        <div className="task-card-head">
          <h3>发表</h3>
        </div>
        <p className="task-hint">开始投稿之后，在这里填展示链接，再点识别。</p>
        <label className="task-field">
          <span>预期完成</span>
          <DateField
            ariaLabel="预期完成"
            value={project.expected_completion_date ?? null}
            onChange={(date) => onChange({ expected_completion_date: date })}
          />
        </label>
        <label className="task-field">
          <span>预期投稿期刊</span>
          <input
            type="text"
            aria-label="预期投稿期刊"
            value={project.expected_journal ?? ""}
            placeholder="计划投稿的期刊"
            onChange={(event) => onChange({ expected_journal: event.target.value })}
            onBlur={(event) => {
              const journal = event.currentTarget.value.trim();
              onChange({ expected_journal: journal || null });
            }}
          />
        </label>
      </section>
    );
  }

  return (
    <>
      <section className="task-card">
        <div className="task-card-head">
          <h3>投稿</h3>
          <div className="task-card-actions">
            <button type="button" className="task-text" onClick={() => addSubmission(false)}>
              期刊
            </button>
            <button type="button" className="task-text" onClick={() => addSubmission(true)}>
              预印本
            </button>
          </div>
        </div>
        <p className="task-hint">填一条展示链接，点识别。作者、类型、时间和基金号会一起写入。</p>
        {submissions.length === 0 ? <p className="task-hint">还没有投递记录。</p> : null}
      </section>
      {submissions.map((submission) => {
        const venue = submissionVenueLabel(submission);
        const title = [
          submission.is_preprint ? "预印本" : "期刊",
          submission.venue.trim(),
          submission.article_type?.trim() ? articleTypeLabel(submission.article_type) : "",
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <section key={submission.id} className="task-card">
            <div className="task-card-head">
              <h3>{title}</h3>
              <button
                type="button"
                className="task-text"
                aria-label={`删除${venue}`}
                onClick={() => writeSubmissions(submissions.filter((item) => item.id !== submission.id))}
              >
                删除
              </button>
            </div>
            <label className="task-field">
              <span>{submission.is_preprint ? "平台" : "期刊"}</span>
              <input
                aria-label={submission.is_preprint ? "预印本平台" : "期刊名称"}
                type="text"
                value={submission.venue}
                placeholder={submission.is_preprint ? "预印本平台，如 bioRxiv" : "期刊名称"}
                onChange={(event) => updateSubmission(submission.id, { venue: event.target.value })}
              />
            </label>
            <label className="task-field">
              <span>展示链接</span>
              <input
                aria-label={`${venue}展示版本链接`}
                type="url"
                value={submission.url}
                placeholder="https://"
                onChange={(event) => updateSubmission(submission.id, { url: event.target.value })}
              />
            </label>
            <button
              type="button"
              className="task-primary"
              aria-label={`${venue}识别`}
              disabled={busyId !== ""}
              onClick={() => void recognize(submission)}
            >
              {busyId === submission.id ? "读取中" : "识别"}
            </button>
            {notice?.id === submission.id ? <p className="task-hint">{notice.text}</p> : null}
            <label className="task-field">
              <span>文章类型</span>
              <select
                aria-label={`${venue}文章类型`}
                value={submission.article_type ?? ""}
                onChange={(event) => updateSubmission(submission.id, { article_type: event.target.value })}
              >
                <option value="">未标明</option>
                {ARTICLE_TYPE_SLUGS.map((kind) => (
                  <option key={kind} value={kind}>
                    {articleTypeLabel(kind)}
                  </option>
                ))}
                {submission.article_type &&
                !(ARTICLE_TYPE_SLUGS as readonly string[]).includes(submission.article_type) ? (
                  <option value={submission.article_type}>{articleTypeLabel(submission.article_type)}</option>
                ) : null}
              </select>
            </label>
            {(submission.awards ?? []).map((award) => (
              <div key={award.number} className="task-row">
                <span className="task-row-title">
                  {award.funder ? `${award.funder} ` : ""}
                  {award.number}
                </span>
                <button
                  type="button"
                  className="task-icon"
                  aria-label={`删除基金 ${award.number}`}
                  onClick={() =>
                    updateSubmission(submission.id, {
                      awards: (submission.awards ?? []).filter((item) => item.number !== award.number),
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            {submission.milestones.length > 0 ? (
              <p className="task-hint">按日期排列。点 ⋮ 再编辑。</p>
            ) : null}
            {submission.milestones.map((milestone, index) => {
              const label = milestoneDisplayLabel(milestone);
              const menuOpen = menuId === milestone.id;
              const editing = editId === milestone.id;
              return (
                <div key={milestone.id}>
                  <div
                    className={editing ? "task-row is-selected" : "task-row"}
                    onPointerDown={menuOpen ? (event) => event.stopPropagation() : undefined}
                  >
                    <span className="task-row-title">{label}</span>
                    <span className="task-badge">{milestone.date}</span>
                    <button
                      type="button"
                      className="task-icon author-more"
                      aria-label={`${label} ${milestone.date} 的操作`}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      onClick={() => setMenuId(menuOpen ? null : milestone.id)}
                    >
                      ⋮
                    </button>
                    {menuOpen ? (
                      <div className="author-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuId(null);
                            setEditId(editing ? null : milestone.id);
                          }}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          aria-label={`删除${label} ${milestone.date}`}
                          onClick={() => {
                            updateSubmission(submission.id, {
                              milestones: submission.milestones.filter((item) => item.id !== milestone.id),
                            });
                            setMenuId(null);
                            if (editing) setEditId(null);
                          }}
                        >
                          删除
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {editing ? (
                    <div className="task-detail">
                      <label className="task-field">
                        <span>类型</span>
                        <select
                          aria-label={`${venue}时间点 ${index + 1} 类型`}
                          value={milestone.kind}
                          onChange={(event) => {
                            const kind = coerceSubmissionMilestoneKind(event.target.value);
                            if (!kind) return;
                            updateSubmission(submission.id, {
                              milestones: submission.milestones.map((item) =>
                                item.id === milestone.id ? { ...item, kind } : item,
                              ),
                            });
                          }}
                        >
                          {MILESTONE_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {submissionMilestoneKindLabel(kind)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {milestone.kind === "Custom" ? (
                        <label className="task-field">
                          <span>名称</span>
                          <input
                            aria-label={`${venue}时间点 ${index + 1} 名称`}
                            type="text"
                            value={milestone.label}
                            placeholder="自拟名称"
                            onChange={(event) => {
                              const next = event.target.value;
                              updateSubmission(submission.id, {
                                milestones: submission.milestones.map((item) =>
                                  item.id === milestone.id ? { ...item, label: next } : item,
                                ),
                              });
                            }}
                          />
                        </label>
                      ) : null}
                      <label className="task-field">
                        <span>日期</span>
                        <DateField
                          ariaLabel={`${venue}时间点 ${index + 1} 日期`}
                          value={milestone.date}
                          allowEmpty={false}
                          onChange={(date) => {
                            if (!date) return;
                            updateSubmission(submission.id, {
                              milestones: sortMilestones(
                                submission.milestones.map((item) =>
                                  item.id === milestone.id ? { ...item, date } : item,
                                ),
                              ),
                            });
                          }}
                        />
                      </label>
                      <label className="task-field">
                        <span>备注</span>
                        <input
                          aria-label={`${venue}时间点 ${index + 1} 备注`}
                          type="text"
                          value={milestone.note}
                          placeholder="可选"
                          onChange={(event) => {
                            const note = event.target.value;
                            updateSubmission(submission.id, {
                              milestones: submission.milestones.map((item) =>
                                item.id === milestone.id ? { ...item, note } : item,
                              ),
                            });
                          }}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })}
            <button type="button" className="task-text pub-add" onClick={() => addMilestone(submission)}>
              添加时间点
            </button>
          </section>
        );
      })}
    </>
  );
}
