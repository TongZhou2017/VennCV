import { isTauriApp } from "../platform/tauri";
import { storageKey } from "./fs";

export type RuntimeStorageInfo = {
  /** 运行形态 */
  kind: string;
  /** 与 localStorage 隔离说明 */
  isolationHint: string;
  /** 页面来源（浏览器） */
  origin: string;
};

export function getRuntimeStorageInfo(): RuntimeStorageInfo {
  if (typeof window === "undefined") {
    return {
      kind: "未知",
      isolationHint: "",
      origin: "",
    };
  }
  if (isTauriApp()) {
    return {
      kind: "Tauri 桌面应用",
      isolationHint:
        "数据保存在本应用内嵌 WebView 的 localStorage，与 Chrome/Safari 等系统浏览器中打开同一站点时的数据相互独立。",
      origin: window.location.origin || "",
    };
  }
  return {
    kind: "浏览器",
    isolationHint:
      "数据保存在当前浏览器、当前站点来源下的 localStorage；换浏览器、隐私模式或另一桌面封装应用会看到另一份数据。",
    origin: window.location.origin || "",
  };
}

/** 展示用：完整 localStorage 键名 */
export function fullLocalStorageKeyForLogicalPath(logicalPath: string): string {
  return storageKey(logicalPath.replace(/\\/g, "/"));
}
