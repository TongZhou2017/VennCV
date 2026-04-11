/** 与 Rust `serde` 默认字段名一致（snake_case） */

export type ProjectStatus =
  | "Published"
  | "Submitted"
  | "HighPriority"
  | "SteadyProgress"
  | "ToBeStarted";

export type RelationType = "Direct" | "Indirect";

export interface ResearchField {
  id: string;
  name: string;
  description: string;
  position: [number, number];
  radius: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  field_ids: string[];
  position: [number, number];
  radius: number;
  completion_percentage: number;
  /** 为 true 时画布不绘制该项目圆与名称；侧栏仍列出，便于批量管理 */
  canvas_hidden?: boolean;
}

export interface ProjectRelation {
  from_id: string;
  to_id: string;
  relation_type: RelationType;
  tags: string[];
  color: [number, number, number, number];
  width: number;
}

/** 与 Rust `AppData` JSON 一致（可 `JSON.parse` 后直接对齐） */
export interface AppDataJson {
  fields: Record<string, ResearchField>;
  projects: Record<string, Project>;
  relations: ProjectRelation[];
  relation_tags: string[];
  /** 回收站：已移出主列表的项目，可复原；键与 projects 不重复 */
  deleted_projects?: Record<string, Project>;
  /** 移入回收站时暂存的、涉及被删项目的连线，复原项目时写回 */
  deleted_relation_stash?: ProjectRelation[];
}

export interface UserConfigEntry {
  username: string;
  password_hash: string;
  data_storage_path?: string | null;
  /** 当前工作区在虚拟文件系统中的路径，如 users/admin/workspace.json（与 venncv_fs: 存储键对应） */
  last_edited_file?: string | null;
}

export interface UserConfig {
  users: UserConfigEntry[];
}

export interface AppSettings {
  auto_save: boolean;
  auto_save_interval: number;
  default_zoom: number;
  max_history_size: number;
  show_project_numbers: boolean;
  show_project_names: boolean;
  field_border_width: number;
  project_border_width: number;
  visualization_bg_color: [number, number, number, number];
  show_legend: boolean;
  /** 使用 SVG 绘制画布（内嵌浏览器兼容）；与 localStorage venncv_svg_viz 同步 */
  visualization_use_svg: boolean;
  /** Konva 模式强制 pixelRatio=1；与 localStorage venncv_force_canvas_pr1 同步 */
  visualization_force_konva_pixel_ratio_1: boolean;
}

export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; fill: string; text: string }
> = {
  Published: { label: "已发表", fill: "#4caf50", text: "#fff" },
  Submitted: { label: "投稿中", fill: "#2196f3", text: "#fff" },
  HighPriority: { label: "优先做", fill: "#f44336", text: "#fff" },
  SteadyProgress: { label: "稳步做", fill: "#ff9800", text: "#fff" },
  ToBeStarted: { label: "待启动", fill: "#ffffff", text: "#333" },
};

/** 导入/合并 JSON 或损坏数据时 status 可能非法；不处理则 `PROJECT_STATUS_META[s]` 为 undefined，画布/侧栏渲染会整页崩溃。 */
export function coerceProjectStatus(raw: unknown): ProjectStatus {
  if (raw === "Published") return "Published";
  if (raw === "Submitted") return "Submitted";
  if (raw === "HighPriority") return "HighPriority";
  if (raw === "SteadyProgress") return "SteadyProgress";
  if (raw === "ToBeStarted") return "ToBeStarted";
  return "ToBeStarted";
}

export function coerceRelationType(raw: unknown): RelationType {
  return raw === "Indirect" ? "Indirect" : "Direct";
}

/** 始终返回合法 meta，供 Konva/SVG/列表渲染使用 */
export function projectStatusVisual(status: unknown) {
  return PROJECT_STATUS_META[coerceProjectStatus(status)];
}

export function defaultAppSettings(): AppSettings {
  return {
    auto_save: false,
    auto_save_interval: 300,
    default_zoom: 1,
    max_history_size: 50,
    show_project_numbers: true,
    show_project_names: true,
    field_border_width: 2,
    project_border_width: 3,
    visualization_bg_color: [255, 255, 255, 255],
    show_legend: true,
    visualization_use_svg: false,
    visualization_force_konva_pixel_ratio_1: false,
  };
}

export function rgbaToCss(c: [number, number, number, number]): string {
  const [r, g, b, a] = c;
  return `rgba(${r},${g},${b},${a / 255})`;
}
