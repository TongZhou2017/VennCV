import { useAppStore } from "../store/appStore";
import { MAX_PROGRESS_FIGURES, slotsOf } from "../domain/progress";

export function FigurePlan(props: { projectId: string }) {
  const project = useAppStore((s) => s.data.projects[props.projectId]);
  const updateSlot = useAppStore((s) => s.updateProgressSlot);
  const addFigure = useAppStore((s) => s.addProgressFigure);
  const removeFigure = useAppStore((s) => s.removeProgressFigure);
  if (!project) return null;
  const figures = slotsOf(project).filter((slot) => slot.band === "figure");
  return (
    <section className="task-card">
      <div className="task-card-head">
        <h3>主图</h3>
        <button
          type="button"
          className="task-text"
          disabled={figures.length >= MAX_PROGRESS_FIGURES}
          onClick={() => addFigure(project.id)}
        >
          添加
        </button>
      </div>
      <p className="task-hint">{`当前 ${figures.length} 张。主图默认整体占 30%。待办页往这些主图上放方块。`}</p>
      {figures.map((slot) => (
        <div key={slot.id} className="pub-figure">
          <input
            aria-label={`${slot.label}的主题`}
            value={slot.label}
            onChange={(event) => updateSlot(project.id, slot.id, { label: event.target.value })}
          />
          <button
            type="button"
            className="task-icon"
            aria-label={`去掉${slot.label}`}
            onClick={() => removeFigure(project.id, slot.id)}
          >
            ×
          </button>
        </div>
      ))}
    </section>
  );
}
