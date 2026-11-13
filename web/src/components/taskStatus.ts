import { isBlockDone, remainingDays } from "../domain/progress";
import type { ProgressBlock } from "../types";

export type TaskTone = "done" | "late" | "open";

export function taskMark(
  block: Pick<ProgressBlock, "completed_on" | "due">,
  today: string,
): { text: string; tone: TaskTone } {
  if (isBlockDone(block)) return { text: "已完成", tone: "done" };
  const left = remainingDays(block, today);
  if (left === null) return { text: "未完成", tone: "open" };
  if (left < 0) return { text: `逾期 ${-left} 天`, tone: "late" };
  return { text: `剩余 ${left} 天`, tone: "open" };
}

export function toneClass(tone: TaskTone): string {
  switch (tone) {
    case "done":
      return "is-done";
    case "late":
      return "is-late";
    case "open":
      return "";
    default: {
      const unexpected: never = tone;
      return unexpected;
    }
  }
}
