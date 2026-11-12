import { isTauriApp } from "../platform/tauri";
import { getDataDirectory } from "./fs";

export type RuntimeStorageInfo = {
  /** 运行形态 */
  kind: string;
  /** 用户库与运行形态分离的说明 */
  isolationHint: string;
  /** 页面来源（浏览器） */
  origin: string;
  /** 本机用户库目录 */
  dataDirectory: string;
};

export function getRuntimeStorageInfo(): RuntimeStorageInfo {
  const dataDirectory = getDataDirectory();
  if (typeof window === "undefined") {
    return {
      kind: "未知",
      isolationHint: "",
      origin: "",
      dataDirectory,
    };
  }
  const kind = isTauriApp() ? "桌面窗口" : "浏览器";
  return {
    kind,
    isolationHint: dataDirectory
      ? "账号和工作区保存在本机用户库，用浏览器或桌面窗口打开是同一份数据。换一台电脑时请用导出 / 导入。"
      : "尚未连接到本机用户库。",
    origin: window.location.origin || "",
    dataDirectory,
  };
}

/** 逻辑路径对应的本机文件路径，仅用于界面展示。 */
export function diskPathForLogical(logicalPath: string): string {
  const root = getDataDirectory().replace(/[\\/]+$/, "");
  const logical = logicalPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!root) return logical;
  return `${root}/${logical}`;
}
