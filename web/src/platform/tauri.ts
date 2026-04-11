/** 是否在 Tauri WebView 中运行（浏览器中无此对象）。 */
export function isTauriApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
