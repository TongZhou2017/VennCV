/** 避免 undefined/null/NaN 经 Math.min 变成 NaN，进而产生非法 rgb 导致 Konva/WebKit 异常 */
function clampCompletionPercentage(percentage: unknown): number {
  const n = Number(percentage);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/** 与桌面端一致：完成度越低越接近白，越高越接近黑 */
export function completionPercentageToRgb(percentage: number): [number, number, number] {
  const p = clampCompletionPercentage(percentage) / 100;
  const v = Math.round(255 * (1 - p));
  return [v, v, v];
}

/** 图例浅色块需描边，否则白底上看不清 */
export function completionLegendSwatchStroke(percentage: number): string | undefined {
  const p = clampCompletionPercentage(percentage) / 100;
  return 255 * (1 - p) > 232 ? "#9e9e9e" : undefined;
}

export function completionPercentageToCss(percentage: number): string {
  const [r, g, b] = completionPercentageToRgb(percentage);
  return `rgb(${r},${g},${b})`;
}
