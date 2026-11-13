import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "../store/appStore";
import type { ProgressBand, ProgressSlot } from "../types";
import {
  MAX_PROGRESS_FIGURES,
  MAX_PROGRESS_ROWS,
  PROGRESS_COLORS,
  bandColor,
  defaultSlotShare,
  figureShareOf,
  slotColor,
  slotsBottomUp,
} from "../domain/progress";

const BANDS: ProgressBand[] = ["method", "poc", "figure", "paper"];

const COLOR_NAMES: Record<(typeof PROGRESS_COLORS)[number], string> = {
  "#c62828": "红",
  "#f9a825": "黄",
  "#2e7d32": "绿",
  "#1565c0": "蓝",
  "#6a1b9a": "紫",
  "#00838f": "青",
  "#6d4c41": "棕",
};

function bandName(band: ProgressBand): string {
  switch (band) {
    case "method":
      return "方法";
    case "poc":
      return "POC";
    case "figure":
      return "主图";
    case "paper":
      return "论文";
    default: {
      const unexpected: never = band;
      return unexpected;
    }
  }
}

function ColorSwatches(props: { slot: ProgressSlot; onPick: (color: string | null) => void }) {
  const current = slotColor(props.slot);
  return (
    <div className="progress-swatches" role="group" aria-label={`${props.slot.label}的颜色`}>
      {PROGRESS_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className="progress-swatch"
          aria-label={COLOR_NAMES[color]}
          aria-pressed={current === color}
          style={{ background: color }}
          onClick={() => props.onPick(color === bandColor(props.slot.band) ? null : color)}
        />
      ))}
    </div>
  );
}

export function ProgressLayout(props: { projectId: string; onClose: () => void }) {
  const project = useAppStore((s) => s.data.projects[props.projectId]);
  const updateSlot = useAppStore((s) => s.updateProgressSlot);
  const addPart = useAppStore((s) => s.addProgressPart);
  const removeSlot = useAppStore((s) => s.removeProgressSlot);
  const resetLayout = useAppStore((s) => s.resetProgressLayout);
  const setFigureShare = useAppStore((s) => s.setFigureShare);
  const [band, setBand] = useState<ProgressBand>("method");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.onClose]);

  if (!project) return null;
  const slots = slotsBottomUp(project);
  const figures = slots.filter((slot) => slot.band === "figure");
  const count = slots.filter((slot) => slot.band === band).length;
  const capped = band === "figure" ? count >= MAX_PROGRESS_FIGURES : count >= MAX_PROGRESS_ROWS;
  let figuresShown = false;

  return createPortal(
    <div className="progress-layout-backdrop" role="presentation" onClick={props.onClose}>
      <div
        className="progress-layout-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="progress-layout-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="progress-layout-head">
          <h2 id="progress-layout-title">设置布局</h2>
          <button type="button" onClick={props.onClose}>
            关闭
          </button>
        </div>
        <p className="property-note">
          方法、POC 和论文按格设置占比。主图默认整体占 30%，只改这一个总占比，由各张主图平分。颜色从常用色里选。完成度最高 100%。
        </p>
        {slots.map((slot) => {
          if (slot.band === "figure") {
            if (figuresShown) return null;
            figuresShown = true;
            return (
              <section key="figures" className="progress-layout-figures">
                <div className="progress-layout-row">
                  <span>主图</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    aria-label="主图总占比"
                    value={figureShareOf(project)}
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (raw.trim() === "") {
                        setFigureShare(project.id, null);
                        return;
                      }
                      const value = Number(raw);
                      if (!Number.isFinite(value)) return;
                      setFigureShare(project.id, value);
                    }}
                  />
                </div>
                {figures.map((figure) => (
                  <div key={figure.id} className="progress-layout-row">
                    <ColorSwatches
                      slot={figure}
                      onPick={(color) => updateSlot(project.id, figure.id, { color })}
                    />
                    <input
                      aria-label={`${figure.label}的内容`}
                      value={figure.label}
                      onChange={(event) => updateSlot(project.id, figure.id, { label: event.target.value })}
                    />
                    <button
                      type="button"
                      className="progress-remove"
                      aria-label={`去掉${figure.label}`}
                      onClick={() => removeSlot(project.id, figure.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </section>
            );
          }
          return (
            <div key={slot.id} className="progress-layout-row">
              <ColorSwatches slot={slot} onPick={(color) => updateSlot(project.id, slot.id, { color })} />
              <input
                aria-label={`${slot.label}的内容`}
                value={slot.label}
                onChange={(event) => updateSlot(project.id, slot.id, { label: event.target.value })}
              />
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                aria-label={`${slot.label}的占比`}
                value={slot.share ?? defaultSlotShare(project, slot)}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw.trim() === "") {
                    updateSlot(project.id, slot.id, { share: null });
                    return;
                  }
                  const value = Number(raw);
                  if (!Number.isFinite(value)) return;
                  updateSlot(project.id, slot.id, { share: value });
                }}
              />
              <button
                type="button"
                className="progress-remove"
                aria-label={`去掉${slot.label}`}
                onClick={() => removeSlot(project.id, slot.id)}
              >
                ×
              </button>
            </div>
          );
        })}
        <div className="progress-layout-add">
          <select
            aria-label="新的部分"
            value={band}
            onChange={(event) => {
              const next = event.target.value;
              if (next === "method" || next === "poc" || next === "figure" || next === "paper") setBand(next);
            }}
          >
            {BANDS.map((item) => (
              <option key={item} value={item}>
                {bandName(item)}
              </option>
            ))}
          </select>
          <button type="button" disabled={capped} onClick={() => addPart(project.id, band)}>
            添加这一层
          </button>
          <button type="button" onClick={() => resetLayout(project.id, "share")}>
            恢复示例比例
          </button>
          <button type="button" onClick={() => resetLayout(project.id, "color")}>
            恢复默认颜色
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
