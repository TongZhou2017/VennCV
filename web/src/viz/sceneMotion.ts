import { useEffect, useRef, useState } from "react";
import type { AppDataJson } from "../types";

/** 松手后滑到停稳位置的时长 */
export const SETTLED_MOTION_MS = 260;

export const SELECTION_RING = "#0f6e6e";

export type ScenePose = Record<string, [number, number]>;

export type SceneDragPhase = "start" | "move" | "end" | "cancel";

export function positionsFromData(data: AppDataJson): ScenePose {
  const pose: ScenePose = {};
  for (const project of Object.values(data.projects)) {
    pose[project.id] = [project.position[0], project.position[1]];
  }
  return pose;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** 缓出，起点是当前姿态，终点是求解结果。 */
export function lerpScene(from: ScenePose, to: ScenePose, t: number): ScenePose {
  const eased = 1 - (1 - clamp01(t)) ** 3;
  const ids = new Set([...Object.keys(from), ...Object.keys(to)]);
  const pose: ScenePose = {};
  for (const id of ids) {
    const start = from[id] ?? to[id];
    const end = to[id] ?? start;
    if (!start || !end) continue;
    pose[id] = [start[0] + (end[0] - start[0]) * eased, start[1] + (end[1] - start[1]) * eased];
  }
  return pose;
}

export function sceneClose(a: ScenePose, b: ScenePose, epsilon = 0.4): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    const left = a[id];
    const right = b[id];
    if (!left || !right) return false;
    if (Math.hypot(left[0] - right[0], left[1] - right[1]) > epsilon) return false;
  }
  return true;
}

/** 关系标签离开连线中点，沿法向偏出一段。 */
export function relationLabelPoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  offset = 22,
): { x: number; y: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: (x1 + x2) / 2 + (-dy / len) * offset,
    y: (y1 + y2) / 2 + (dx / len) * offset,
  };
}

/**
 * 画布上的项目坐标。拖动时只改这份姿态；松手后插到求解结果，再一次性写入工作区。
 */
export function useScenePose(
  data: AppDataJson,
  settle: (id: string, pos: [number, number]) => ScenePose,
  commit: (pose: ScenePose) => void,
): {
  pose: ScenePose | null;
  positionOf: (id: string, fallback: [number, number]) => [number, number];
  beginDrag: (id: string) => void;
  moveDrag: (id: string, pos: [number, number]) => void;
  endDrag: (id: string, pos: [number, number]) => void;
  cancelDrag: () => void;
} {
  const [pose, setPose] = useState<ScenePose | null>(null);
  const poseRef = useRef<ScenePose | null>(null);
  const committedRef = useRef<ScenePose | null>(null);
  const draggingRef = useRef(false);
  const ignoreRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const settleRef = useRef(settle);
  const commitRef = useRef(commit);
  settleRef.current = settle;
  commitRef.current = commit;

  const writePose = (next: ScenePose | null) => {
    poseRef.current = next;
    setPose(next);
  };

  const cancelAnim = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const animate = (from: ScenePose, to: ScenePose, done?: () => void) => {
    cancelAnim();
    const start = performance.now();
    const frame = (now: number) => {
      const t = (now - start) / SETTLED_MOTION_MS;
      if (t >= 1) {
        rafRef.current = null;
        writePose(to);
        done?.();
        return;
      }
      writePose(lerpScene(from, to, t));
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  useEffect(() => {
    const next = positionsFromData(data);
    const prev = committedRef.current;
    committedRef.current = next;
    if (!prev || draggingRef.current) return;
    if (ignoreRef.current) {
      ignoreRef.current = false;
      writePose(null);
      return;
    }
    if (sceneClose(prev, next)) return;
    animate(poseRef.current ?? prev, next);
    return () => cancelAnim();
  }, [data]);

  useEffect(() => () => cancelAnim(), []);

  const beginDrag = (id: string) => {
    draggingRef.current = true;
    cancelAnim();
    const base = { ...(committedRef.current ?? positionsFromData(data)) };
    if (!base[id]) {
      const project = data.projects[id];
      if (project) base[id] = [project.position[0], project.position[1]];
    }
    writePose(base);
  };

  const moveDrag = (id: string, pos: [number, number]) => {
    const base = poseRef.current ?? committedRef.current ?? positionsFromData(data);
    writePose({ ...base, [id]: pos });
  };

  const cancelDrag = () => {
    draggingRef.current = false;
    cancelAnim();
    writePose(null);
  };

  const endDrag = (id: string, pos: [number, number]) => {
    draggingRef.current = false;
    const from = { ...(poseRef.current ?? committedRef.current ?? positionsFromData(data)), [id]: pos };
    const to = settleRef.current(id, pos);
    animate(from, to, () => {
      ignoreRef.current = true;
      commitRef.current(to);
    });
  };

  const positionOf = (id: string, fallback: [number, number]) => pose?.[id] ?? fallback;

  return { pose, positionOf, beginDrag, moveDrag, endDrag, cancelDrag };
}
