type WinProcess = { versions?: { electron?: string } };

/** Cursor / VS Code 等内嵌预览常为 Electron 渲染进程 */
export function isElectronRenderer(): boolean {
  if (typeof window === "undefined") return false;
  const p = (window as unknown as { process?: WinProcess }).process;
  return Boolean(p?.versions?.electron);
}

/**
 * Konva Stage 的 pixelRatio。Electron / 嵌入式 WebView（含 Cursor 内置预览）里
 * 高 devicePixelRatio 时 2D Canvas 缩放偶发不绘制内容，强制 1 可恢复显示（略降锐度）。
 */
export function getKonvaStagePixelRatio(): number {
  if (typeof window === "undefined") return 1;
  const raw = window.devicePixelRatio;
  const dpr = Number.isFinite(raw) && raw > 0 ? raw : 1;
  const ua = navigator.userAgent;
  if (isElectronRenderer() || /\bElectron\b/i.test(ua)) return 1;
  return Math.min(dpr, 2);
}
