import { isElectronRenderer } from "../viz/stagePixelRatio";
import type { AppSettings } from "../types";

export const LS_SVG_VIZ = "venncv_svg_viz";
export const LS_FORCE_CANVAS_PR1 = "venncv_force_canvas_pr1";

/** 与 localStorage 同步的可视化相关设置（不写 workspace.json） */
export type VisualizationRenderPrefs = Pick<
  AppSettings,
  "visualization_use_svg" | "visualization_force_konva_pixel_ratio_1"
>;

export function readVisualizationRenderPrefsFromStorage(): Partial<VisualizationRenderPrefs> {
  const out: Partial<VisualizationRenderPrefs> = {};
  try {
    const sv = globalThis.localStorage?.getItem(LS_SVG_VIZ);
    if (sv === "1") out.visualization_use_svg = true;
    else if (sv === "0") out.visualization_use_svg = false;

    const pr = globalThis.localStorage?.getItem(LS_FORCE_CANVAS_PR1);
    if (pr === "1") out.visualization_force_konva_pixel_ratio_1 = true;
    else if (pr === "0") out.visualization_force_konva_pixel_ratio_1 = false;
  } catch {
    /* ignore */
  }

  if (out.visualization_use_svg === undefined) {
    if (typeof navigator !== "undefined" && /\bElectron\b/i.test(navigator.userAgent)) {
      out.visualization_use_svg = true;
    } else if (isElectronRenderer()) {
      out.visualization_use_svg = true;
    }
  }

  return out;
}

export function writeVisualizationRenderPrefsToStorage(prefs: VisualizationRenderPrefs): void {
  try {
    globalThis.localStorage?.setItem(LS_SVG_VIZ, prefs.visualization_use_svg ? "1" : "0");
    globalThis.localStorage?.setItem(
      LS_FORCE_CANVAS_PR1,
      prefs.visualization_force_konva_pixel_ratio_1 ? "1" : "0",
    );
  } catch {
    /* ignore */
  }
}
