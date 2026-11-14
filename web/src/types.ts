/** 与 Rust `serde` 默认字段名一致（snake_case） */

export type ProjectStatus =
  | "Published"
  | "Submitted"
  | "HighPriority"
  | "SteadyProgress"
  | "ToBeStarted";

export type RelationType = "Direct" | "Indirect";

/** 维恩图上人物球的显示范围。只存在本地界面设置里，不写入工作区。 */
export type AuthorDisplayMode = "off" | "todo" | "primary" | "all";

/** 读入旧数据时用。保存后不再写回。 */
export type AuthorRole = "First" | "Corresponding" | "Coauthor" | "Other";

/** CRediT 贡献角色。一个人在同一项目上可以有多项。 */
export type CreditRole =
  | "Conceptualization"
  | "DataCuration"
  | "FormalAnalysis"
  | "FundingAcquisition"
  | "Investigation"
  | "Methodology"
  | "ProjectAdministration"
  | "Resources"
  | "Software"
  | "Supervision"
  | "Validation"
  | "Visualization"
  | "WritingOriginalDraft"
  | "WritingReviewEditing";

/** 导出作者贡献文本时的姓名写法。 */
export type AuthorNameStyle = "full" | "familyInitials" | "initialsFamily";

export interface Lab {
  id: string;
  /** 实验室显示名，用 PI 的名字。有中文名时用中文名。 */
  name: string;
  /** PI 的中文名。 */
  name_zh?: string;
  /** PI 的英文名。 */
  name_en?: string;
  /** `#rrggbb` */
  color: string;
  /**
   * 这个实验室自己添加的身份，和硕士生、博士生一样留着。
   * 缺省表示还没整理过，读入时会从已经记下的身份补上。空数组表示整理过、目前没有额外身份。
   */
  identities?: string[];
}

/** 文章里认出的单位地址，记在人身上。中文和英文是同一条地址的两种写法。 */
export interface PersonAffiliation {
  name_zh?: string;
  name_en?: string;
}

/** 人在一个实验室里的身份。实验室负责人自动是 PI，不在这张表里点。 */
export type LabStage = "master" | "phd" | "postdoc" | "assistant" | "pi";

/** 某人在某个实验室的身份。`stages` 可以同时有多项，例如硕博连读、博士后留任。`tags` 是这个实验室永久身份里被选中的那些。`advisor_id` 是这个实验室里带他的 PI。 */
export interface LabStageRecord {
  lab_id: string;
  stages?: LabStage[];
  tags?: string[];
  advisor_id?: string;
}

export interface Person {
  id: string;
  name: string;
  /** 可同时属于多个实验室 */
  lab_ids: string[];
  /** 缩写用。空则从姓名推断：空格前为姓，汉字则首字为姓 */
  family_name: string;
  given_name: string;
  /** 英文名中姓和名之间的部分，如 James Dewey Watson 里的 Dewey。 */
  middle_name?: string;
  /** 同一人的其他写法，如中文名或期刊里的另一种顺序 */
  aliases: string[];
  /** 文章里的单位地址。不拿来当实验室。 */
  affiliations?: PersonAffiliation[];
  /** 现在在各实验室的身份。某篇投稿当时的身份记在那篇作者上。 */
  lab_roles?: LabStageRecord[];
  /** 这个人是 PI，但不必有自己的实验室。大实验室里的内部 PI 也记在这里。 */
  pi?: boolean;
  /** 职称，如教授、研究员。和在哪个实验室无关。 */
  job?: string;
  /** 有则用来认定是同一个人，不随期刊改名 */
  orcid: string;
  /** 合作网络的中心。缺省不是中心。 */
  network_center?: boolean;
  /** 合作网络里拖好的位置。缺省时按中心自动排列。 */
  network_x?: number;
  network_y?: number;
}

/** 人物在某个项目上的身份。以后的任务用 project_id + person_id 挂钩。 */
export interface ProjectAuthorship {
  project_id: string;
  person_id: string;
  /** 作者位次，从 1 起 */
  position: number;
  corresponding: boolean;
  credit_roles: CreditRole[];
  /** 共同第一或通讯作者。图上的「主要」还要这个人有未完成待办。 */
  primary: boolean;
  /** 与其他人并列第一 */
  co_first: boolean;
  responsibility: string;
  /** 这篇投稿时，此人在各实验室的身份。 */
  paper_roles?: LabStageRecord[];
}

export function coerceAuthorRole(raw: unknown): AuthorRole {
  if (raw === "First") return "First";
  if (raw === "Corresponding") return "Corresponding";
  if (raw === "Coauthor") return "Coauthor";
  if (raw === "Other") return "Other";
  return "Other";
}

export function coerceAuthorDisplayMode(raw: unknown): AuthorDisplayMode {
  if (raw === "todo") return "todo";
  if (raw === "primary") return "primary";
  if (raw === "all") return "all";
  if (raw === "off") return "off";
  return "todo";
}

/** 投稿关键时间点。`Custom` 的名称写在 `label`。 */
export type SubmissionMilestoneKind =
  | "SubmissionStart"
  | "Revision"
  | "Accepted"
  | "Published"
  | "Rejected"
  | "Custom";

export interface SubmissionMilestone {
  id: string;
  kind: SubmissionMilestoneKind;
  /** `Custom` 时的自拟名称；预设类型可留空 */
  label: string;
  /** YYYY-MM-DD */
  date: string;
  note: string;
}

/** 一项资助。`number` 是基金号。 */
export interface FundingAward {
  funder: string;
  number: string;
}

/** 基金所处阶段。 */
export type GrantPhase = "proposal" | "active" | "closed";

/**
 * 一项基金。
 * `representative_keys` 是申报代表作，最多五篇。
 * `foundation_keys` 是项目基础相关成果。
 * 键是 `项目 id/投稿 id`。结题按 `number` 对发表记录里的基金号。
 */
export interface Grant {
  id: string;
  name: string;
  number: string;
  funder: string;
  phase: GrantPhase;
  representative_keys: string[];
  foundation_keys: string[];
}

/** 一次期刊投递，或一条预印本。预印本和最终发表都可以绑定对外展示版本的网址。 */
export interface JournalSubmission {
  id: string;
  /** 期刊名，或预印本平台名 */
  venue: string;
  is_preprint: boolean;
  /** 对外展示版本 URL */
  url: string;
  /**
   * 文献类型。已知值如 `research-article`、`review`、`brief-report`。
   * 认不出的写法按原文留下。旧数据缺省为空。
   */
  article_type?: string;
  /** 基金号。旧数据缺省为空。 */
  awards?: FundingAward[];
  milestones: SubmissionMilestone[];
}

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
  /**
   * 预期完成日 `YYYY-MM-DD`。完成度 100% 表示开始投稿。
   * 旧工作区缺省为空。
   */
  expected_completion_date?: string | null;
  /**
   * 未投稿项目计划投递的期刊。旧工作区缺省为空。
   */
  expected_journal?: string | null;
  /**
   * 投稿关键时间点，按日期排序。供「投稿中 / 已发表」使用。
   * 旧工作区缺省为空列表。
   */
  submission_milestones?: SubmissionMilestone[];
  /**
   * 按期刊或预印本分开的投递记录。
   * 旧数据只有 `submission_milestones` 时，读入后归入一条未命名期刊记录。
   */
  journal_submissions?: JournalSubmission[];
  /** 为 true 时画布不绘制该项目圆与名称；侧栏仍列出，便于批量管理 */
  canvas_hidden?: boolean;
  /**
   * 进度楼的格子。从下往上是方法、POC、主图、论文。
   * 每个项目可以改主图数量和每张主图的主题。旧工作区缺省为空。
   */
  progress_slots?: ProgressSlot[];
  /**
   * 待办。从某一天开始，并约定在某一天之前做完。
   * 标成完成之后才计入进度，最高 100。100% 表示开始投稿。
   * 旧工作区缺省为空。
   */
  progress_blocks?: ProgressBlock[];
  /**
   * 主图这一层铺满时一共占的完成度，由各张主图平分。
   * 缺省为 30。旧工作区没有这一项。
   */
  figure_share?: number;
}

export type ProgressBand = "method" | "poc" | "figure" | "paper";

/** 方法、POC、一张主图或论文中的一格。主图的 `label` 是主题。 */
export interface ProgressSlot {
  id: string;
  band: ProgressBand;
  label: string;
  order: number;
  /**
   * 这一格铺满时占的完成度。缺省时沿用示例比例。
   * 旧工作区没有这一项。
   */
  share?: number;
  /** 这一格的颜色。缺省时跟所属层。旧工作区没有这一项。 */
  color?: string;
}

/** 从某一天开始、限期内要做完的一件事。 */
export interface ProgressBlock {
  id: string;
  slot_id: string;
  title: string;
  /** 开始日期 `YYYY-MM-DD`。 */
  date: string;
  /** 要在这一天之前做完。旧数据没有这一项。 */
  due?: string | null;
  /**
   * 标记完成的日期。没有则还没完成，不计进度，摘要图上是灰色块。
   * 旧数据没有这一项时，读入后算在开始那天完成。
   */
  completed_on?: string | null;
  person_id: string | null;
  /** 这项待办属于哪一项基金。旧数据缺省为空。 */
  grant_id?: string | null;
  note: string;
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
  /** 实验室。旧工作区缺省为空。 */
  labs: Record<string, Lab>;
  /** 人物。旧工作区缺省为空。 */
  people: Record<string, Person>;
  /** 人物与项目的关联。回收站项目可以保留关联，但不进入合作网络。 */
  authorships: ProjectAuthorship[];
  /** 基金。旧工作区缺省为空。 */
  grants?: Record<string, Grant>;
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
  ToBeStarted: { label: "待启动", fill: "#d4d4d4", text: "#333" },
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
