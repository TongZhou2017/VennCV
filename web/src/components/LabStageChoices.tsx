import { useState } from "react";
import type { LabStage } from "../types";
import { LAB_STAGES, compactPersonName, labStageLabel } from "../domain/authors";
import "./lab-stage.css";

const PRESET_FROM_LABEL: Record<string, LabStage> = {
  硕士生: "master",
  博士生: "phd",
  博后: "postdoc",
  科研助理: "assistant",
  PI: "pi",
};

export function LabStageChoices(props: {
  stages: LabStage[];
  tags: string[];
  identities: string[];
  lockedPi: boolean;
  ariaPrefix: string;
  onChange: (stages: LabStage[], tags: string[]) => void;
  onAddIdentity: (label: string) => void;
}) {
  const [draft, setDraft] = useState("");
  if (props.lockedPi) {
    return (
      <div className="lab-stage">
        <div className="lab-stage-choices" role="group" aria-label={`${props.ariaPrefix} 身份`}>
          <span className="lab-stage-lock">PI</span>
        </div>
        <p className="lab-stage-note">实验室负责人</p>
      </div>
    );
  }
  const selected = (label: string) => props.tags.some((tag) => compactPersonName(tag) === compactPersonName(label));
  const toggleIdentity = (label: string) => {
    const key = compactPersonName(label);
    const next = selected(label) ? props.tags.filter((tag) => compactPersonName(tag) !== key) : [...props.tags, label];
    props.onChange(props.stages, next);
  };
  const toggleStage = (stage: LabStage) => {
    const next = props.stages.includes(stage) ? props.stages.filter((item) => item !== stage) : [...props.stages, stage];
    props.onChange(next, props.tags);
  };
  const addIdentity = () => {
    const text = draft.trim();
    if (!text) return;
    const preset = PRESET_FROM_LABEL[text];
    if (preset) {
      if (!props.stages.includes(preset)) props.onChange([...props.stages, preset], props.tags);
      setDraft("");
      return;
    }
    if (!props.identities.some((item) => compactPersonName(item) === compactPersonName(text))) props.onAddIdentity(text);
    if (!selected(text)) props.onChange(props.stages, [...props.tags, text]);
    setDraft("");
  };
  const extras = props.tags.filter((tag) => !props.identities.some((item) => compactPersonName(item) === compactPersonName(tag)));
  return (
    <div className="lab-stage">
      <div className="lab-stage-choices" role="group" aria-label={`${props.ariaPrefix} 身份`}>
        {LAB_STAGES.map((stage) => (
          <button
            key={stage}
            type="button"
            aria-pressed={props.stages.includes(stage)}
            onClick={() => toggleStage(stage)}
          >
            {labStageLabel(stage)}
          </button>
        ))}
        {props.identities.map((identity) => (
          <button key={identity} type="button" aria-pressed={selected(identity)} onClick={() => toggleIdentity(identity)}>
            {identity}
          </button>
        ))}
        {extras.map((identity) => (
          <button key={identity} type="button" aria-pressed={true} onClick={() => toggleIdentity(identity)}>
            {identity}
          </button>
        ))}
      </div>
      <div className="lab-stage-add">
        <input
          aria-label={`${props.ariaPrefix} 添加身份`}
          value={draft}
          placeholder="添加身份"
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            addIdentity();
          }}
        />
        <button type="button" onClick={addIdentity}>
          添加
        </button>
      </div>
    </div>
  );
}
