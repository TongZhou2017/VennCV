import type { ProgressBlock, ProgressSlot, Project } from "../types";
import { blocksInSlot, houseBands, isBlockDone, remainingDays, scheduledDays, slotColor } from "../domain/progress";
import { todayIsoDate } from "../domain/projectTime";
import "./progress-mosaic.css";

function Stone(props: {
  block: ProgressBlock;
  slot: ProgressSlot;
  asOf: string;
  interactive: boolean;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  const open = !isBlockDone(props.block);
  const span = open ? scheduledDays(props.block) : null;
  const late = open && (remainingDays(props.block, props.asOf) ?? 0) < 0;
  const when = props.block.due ? `${props.block.date} → ${props.block.due}` : props.block.date;
  const tip = open
    ? `${when} ${props.slot.label}：${props.block.title}${span === null ? "" : `，开始到期限 ${span} 天`}${late ? "，已逾期" : ""}`
    : `${when} ${props.slot.label}：${props.block.title}，已完成`;
  const className = [
    "progress-stone",
    open ? "is-open" : "",
    late ? "is-late" : "",
    props.selected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const style = open ? undefined : { background: slotColor(props.slot) };
  if (!props.interactive) {
    return (
      <span className={className} title={tip} style={style}>
        {span === null ? null : span}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={className}
      title={tip}
      aria-label={tip}
      style={style}
      onClick={() => props.onSelect?.(props.block.id)}
    >
      {span === null ? null : span}
    </button>
  );
}

export function ProgressMosaic(props: {
  project: Project;
  compact?: boolean;
  asOf?: string;
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string) => void;
}) {
  const bands = houseBands(props.project);
  if (bands.length === 0) return null;
  const interactive = Boolean(props.onSelectBlock);
  const asOf = props.asOf || todayIsoDate();
  return (
    <div className={props.compact ? "progress-house is-compact" : "progress-house"} aria-label="进度楼">
      {bands.map((row) =>
        row.band === "figure" ? (
          <div key={row.band} className="progress-house-figures" data-band={row.band}>
            {row.slots.map((slot) => (
              <div key={slot.id} className="progress-house-column">
                <span className="progress-house-stack">
                  {blocksInSlot(props.project, slot.id).map((block) => (
                    <Stone
                      key={block.id}
                      block={block}
                      slot={slot}
                      asOf={asOf}
                      interactive={interactive}
                      selected={props.selectedBlockId === block.id}
                      onSelect={props.onSelectBlock}
                    />
                  ))}
                </span>
                <span className="progress-house-theme" title={slot.label} style={{ color: slotColor(slot) }}>
                  {slot.label}
                </span>
              </div>
            ))}
          </div>
        ) : (
          row.slots.map((slot) => (
            <div
              key={slot.id}
              className="progress-house-row"
              data-band={row.band}
              style={{ background: `color-mix(in srgb, ${slotColor(slot)} 16%, white)` }}
            >
              <span className="progress-house-label" title={slot.label}>
                {slot.label}
              </span>
              <span className="progress-house-stones">
                {blocksInSlot(props.project, slot.id).map((block) => (
                  <Stone
                    key={block.id}
                    block={block}
                    slot={slot}
                    asOf={asOf}
                    interactive={interactive}
                    selected={props.selectedBlockId === block.id}
                    onSelect={props.onSelectBlock}
                  />
                ))}
              </span>
            </div>
          ))
        ),
      )}
    </div>
  );
}
