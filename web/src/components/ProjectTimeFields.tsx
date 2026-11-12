import type { JournalSubmission, Project, SubmissionMilestone, SubmissionMilestoneKind } from "../types";
import { DateField } from "./DateField";
import {
  coerceSubmissionMilestoneKind,
  milestoneDisplayLabel,
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
  const onTrack = projectOnSubmissionTrack(project.status);
  const submissions = project.journal_submissions ?? [];

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
    const kind: SubmissionMilestoneKind = submission.milestones.length === 0 ? "SubmissionStart" : "Revision";
    updateSubmission(submission.id, {
      milestones: sortMilestones([
        ...submission.milestones,
        { id: newMilestoneId(), kind, label: "", date: todayIsoDate(), note: "" },
      ]),
    });
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "#777", marginBottom: 10, lineHeight: 1.4 }}>
        100% 表示开始投稿
      </div>
      {onTrack ? (
        <div>
          <div style={{ fontSize: 12, marginBottom: 6 }}>期刊与预印本</div>
          <div style={{ fontSize: 11, color: "#777", marginBottom: 8, lineHeight: 1.4 }}>
            每次投递单独记录。预印本和最终发表都可以填写对外展示版本的网址。
          </div>
          {submissions.length === 0 ? (
            <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>还没有投递记录</div>
          ) : null}
          {submissions.map((submission) => (
            <div
              key={submission.id}
              style={{
                border: submission.is_preprint ? "1px solid #ce93d8" : "1px solid #e0e0e0",
                borderRadius: 6,
                padding: 8,
                marginBottom: 8,
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
                <strong style={{ fontSize: 12 }}>
                  {submission.is_preprint ? <span style={{ color: "#6a1b9a" }}>预印本</span> : "期刊"}
                  {submission.venue.trim() ? ` · ${submission.venue.trim()}` : ""}
                </strong>
                <button
                  type="button"
                  aria-label={`删除${submissionVenueLabel(submission)}`}
                  onClick={() => writeSubmissions(submissions.filter((item) => item.id !== submission.id))}
                >
                  删除
                </button>
              </div>
              <input
                aria-label={submission.is_preprint ? "预印本平台" : "期刊名称"}
                type="text"
                value={submission.venue}
                placeholder={submission.is_preprint ? "预印本平台，如 bioRxiv" : "期刊名称"}
                onChange={(event) => updateSubmission(submission.id, { venue: event.target.value })}
                style={{ width: "100%", padding: 4, marginBottom: 6, boxSizing: "border-box" }}
              />
              <input
                aria-label={`${submissionVenueLabel(submission)}展示版本链接`}
                type="url"
                value={submission.url}
                placeholder="展示版本链接"
                onChange={(event) => updateSubmission(submission.id, { url: event.target.value })}
                style={{ width: "100%", padding: 4, marginBottom: 8, boxSizing: "border-box" }}
              />
              {submission.milestones.map((milestone, index) => (
                <div key={milestone.id} style={{ borderTop: "1px solid #eee", paddingTop: 6, marginBottom: 6 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <select
                      aria-label={`${submissionVenueLabel(submission)}时间点 ${index + 1} 类型`}
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
                      style={{ flex: 1, padding: 4 }}
                    >
                      {MILESTONE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {submissionMilestoneKindLabel(kind)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label={`删除${milestoneDisplayLabel(milestone)}`}
                      onClick={() =>
                        updateSubmission(submission.id, {
                          milestones: submission.milestones.filter((item) => item.id !== milestone.id),
                        })
                      }
                    >
                      删除
                    </button>
                  </div>
                  {milestone.kind === "Custom" ? (
                    <input
                      aria-label={`${submissionVenueLabel(submission)}时间点 ${index + 1} 名称`}
                      type="text"
                      value={milestone.label}
                      placeholder="自拟名称"
                      onChange={(event) => {
                        const label = event.target.value;
                        updateSubmission(submission.id, {
                          milestones: submission.milestones.map((item) =>
                            item.id === milestone.id ? { ...item, label } : item,
                          ),
                        });
                      }}
                      style={{ width: "100%", padding: 4, marginBottom: 6, boxSizing: "border-box" }}
                    />
                  ) : null}
                  <DateField
                    ariaLabel={`${submissionVenueLabel(submission)}时间点 ${index + 1} 日期`}
                    value={milestone.date}
                    allowEmpty={false}
                    onChange={(date) => {
                      if (!date) return;
                      updateSubmission(submission.id, {
                        milestones: sortMilestones(
                          submission.milestones.map((item) => (item.id === milestone.id ? { ...item, date } : item)),
                        ),
                      });
                    }}
                  />
                  <input
                    aria-label={`${submissionVenueLabel(submission)}时间点 ${index + 1} 备注`}
                    type="text"
                    value={milestone.note}
                    placeholder="备注（可选）"
                    onChange={(event) => {
                      const note = event.target.value;
                      updateSubmission(submission.id, {
                        milestones: submission.milestones.map((item) =>
                          item.id === milestone.id ? { ...item, note } : item,
                        ),
                      });
                    }}
                    style={{ width: "100%", padding: 4, boxSizing: "border-box" }}
                  />
                </div>
              ))}
              <button type="button" onClick={() => addMilestone(submission)}>
                添加时间点
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => addSubmission(false)}>
              添加期刊
            </button>
            <button type="button" onClick={() => addSubmission(true)}>
              添加预印本
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, display: "block", marginBottom: 10 }}>
            预期完成
            <DateField
              ariaLabel="预期完成"
              value={project.expected_completion_date ?? null}
              onChange={(date) => onChange({ expected_completion_date: date })}
            />
          </div>
          <label style={{ fontSize: 12, display: "block" }}>
            预期投稿期刊
            <input
              type="text"
              aria-label="预期投稿期刊"
              value={project.expected_journal ?? ""}
              placeholder="计划投稿的期刊"
              onChange={(event) => {
                onChange({ expected_journal: event.target.value });
              }}
              onBlur={(event) => {
                const journal = event.currentTarget.value.trim();
                onChange({ expected_journal: journal || null });
              }}
              style={{ display: "block", width: "100%", padding: 6, marginTop: 4, boxSizing: "border-box" }}
            />
          </label>
        </>
      )}
    </div>
  );
}
