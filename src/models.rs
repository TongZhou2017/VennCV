use serde::{Deserialize, Serialize};
use indexmap::IndexMap;

/// 项目状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProjectStatus {
    Published,      // 已发表 - 绿色
    Submitted,     // 投稿中 - 蓝色
    HighPriority,  // 优先做 - 红色
    SteadyProgress, // 稳步做 - 橙色
    ToBeStarted,   // 待启动 - 白色
}

impl ProjectStatus {
    pub fn color(&self) -> egui::Color32 {
        match self {
            ProjectStatus::Published => egui::Color32::from_rgb(76, 175, 80),      // 绿色
            ProjectStatus::Submitted => egui::Color32::from_rgb(33, 150, 243),    // 蓝色
            ProjectStatus::HighPriority => egui::Color32::from_rgb(244, 67, 54),  // 红色
            ProjectStatus::SteadyProgress => egui::Color32::from_rgb(255, 152, 0), // 橙色
            ProjectStatus::ToBeStarted => egui::Color32::from_rgb(255, 255, 255), // 白色
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            ProjectStatus::Published => "已发表",
            ProjectStatus::Submitted => "投稿中",
            ProjectStatus::HighPriority => "优先做",
            ProjectStatus::SteadyProgress => "稳步做",
            ProjectStatus::ToBeStarted => "待启动",
        }
    }
}

/// 研究方向（大圈）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchField {
    pub id: String,
    pub name: String,
    pub description: String,
    pub position: (f32, f32),  // 圆心位置
    pub radius: f32,           // 半径
}

/// 投稿关键时间点类型。`Custom` 的名称写在 `SubmissionMilestone.label`。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum SubmissionMilestoneKind {
    SubmissionStart,
    Revision,
    Accepted,
    Published,
    Rejected,
    Custom,
}

/// 投稿关键时间点。日期为 `YYYY-MM-DD`。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SubmissionMilestone {
    pub id: String,
    pub kind: SubmissionMilestoneKind,
    #[serde(default)]
    pub label: String,
    pub date: String,
    #[serde(default)]
    pub note: String,
}

/// 一次期刊投递或一条预印本。`url` 是对外展示版本。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct JournalSubmission {
    pub id: String,
    #[serde(default)]
    pub venue: String,
    #[serde(default)]
    pub is_preprint: bool,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub milestones: Vec<SubmissionMilestone>,
}

/// 项目（小圈）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub status: ProjectStatus,
    pub field_ids: Vec<String>,  // 所属的研究领域
    pub position: (f32, f32),    // 在可视化中的位置
    pub radius: f32,             // 半径
    pub completion_percentage: f32,  // 完成度百分比 (0.0 - 100.0)。100 表示开始投稿。
    /// 预期完成日 `YYYY-MM-DD`。旧 JSON 缺省为无。
    #[serde(default)]
    pub expected_completion_date: Option<String>,
    /// 未投稿项目计划投递的期刊。旧 JSON 缺省为无。
    #[serde(default)]
    pub expected_journal: Option<String>,
    /// 投稿关键时间点。旧 JSON 缺省为空。由 `journal_submissions` 汇总。
    #[serde(default)]
    pub submission_milestones: Vec<SubmissionMilestone>,
    /// 按期刊或预印本分开的投递。旧 JSON 缺省为空。
    #[serde(default)]
    pub journal_submissions: Vec<JournalSubmission>,
    /// 进度楼的格子。旧 JSON 缺省为空。
    #[serde(default)]
    pub progress_slots: Vec<ProgressSlot>,
    /// 格子里的方块。旧 JSON 缺省为空。
    #[serde(default)]
    pub progress_blocks: Vec<ProgressBlock>,
    /// 主图这一层铺满时一共占的完成度。缺省为 30，由各张主图平分。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub figure_share: Option<f64>,
}

/// 进度楼的一层：方法、POC、主图或论文。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProgressBand {
    Method,
    Poc,
    Figure,
    Paper,
}

/// 方法、POC、一张主图或论文中的一格。主图的 `label` 是主题。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProgressSlot {
    pub id: String,
    pub band: ProgressBand,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub order: u32,
    /// 这一格铺满时占的完成度。缺省时由示例比例决定。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub share: Option<f64>,
    /// 这一格的颜色。缺省时跟所属层。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

/// 从某一天开始、限期内要做完的一件事。标成完成才计入进度。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProgressBlock {
    pub id: String,
    #[serde(default)]
    pub slot_id: String,
    #[serde(default)]
    pub title: String,
    /// 开始日期。
    #[serde(default)]
    pub date: String,
    /// 要在这一天之前做完。旧 JSON 缺省为无。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due: Option<String>,
    /// 标记完成的日期。缺省为无，表示还没完成。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_on: Option<String>,
    #[serde(default)]
    pub person_id: Option<String>,
    #[serde(default)]
    pub note: String,
}

/// 作者角色。旧数据缺省为其他。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum AuthorRole {
    First,
    Corresponding,
    Coauthor,
    #[default]
    Other,
}

/// CRediT 贡献角色。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CreditRole {
    Conceptualization,
    DataCuration,
    FormalAnalysis,
    FundingAcquisition,
    Investigation,
    Methodology,
    ProjectAdministration,
    Resources,
    Software,
    Supervision,
    Validation,
    Visualization,
    WritingOriginalDraft,
    WritingReviewEditing,
}

fn default_lab_color() -> String {
    "#5c6bc0".to_string()
}

/// 实验室
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Lab {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default = "default_lab_color")]
    pub color: String,
}

#[derive(Debug, Clone, Deserialize)]
struct PersonDe {
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    lab_id: Option<String>,
    #[serde(default)]
    lab_ids: Vec<String>,
    #[serde(default)]
    family_name: String,
    #[serde(default)]
    given_name: String,
}

/// 人物。不是登录账号。`lab_id` 是旧字段，读入后并入 `lab_ids`。
#[derive(Debug, Clone, Serialize)]
#[serde(from = "PersonDe")]
pub struct Person {
    pub id: String,
    pub name: String,
    pub lab_ids: Vec<String>,
    pub family_name: String,
    pub given_name: String,
}

impl From<PersonDe> for Person {
    fn from(raw: PersonDe) -> Self {
        let mut lab_ids = raw.lab_ids;
        if let Some(id) = raw.lab_id {
            if !id.is_empty() && !lab_ids.iter().any(|item| item == &id) {
                lab_ids.insert(0, id);
            }
        }
        Self {
            id: raw.id,
            name: raw.name,
            lab_ids,
            family_name: raw.family_name,
            given_name: raw.given_name,
        }
    }
}

/// 人物在项目上的身份。`role` 只用于读旧数据。`responsibility` 留给以后的任务系统。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectAuthorship {
    pub project_id: String,
    pub person_id: String,
    #[serde(default)]
    pub role: AuthorRole,
    #[serde(default)]
    pub position: u32,
    #[serde(default)]
    pub corresponding: bool,
    #[serde(default)]
    pub credit_roles: Vec<CreditRole>,
    #[serde(default)]
    pub primary: bool,
    #[serde(default)]
    pub responsibility: String,
}

/// 项目关系（箭头）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectRelation {
    pub from_id: String,
    pub to_id: String,
    pub relation_type: RelationType,
    #[serde(default)]
    pub tags: Vec<String>,  // 关系标签（代表意义）
    #[serde(default = "default_relation_color")]
    pub color: [u8; 4],  // 关系颜色 RGBA
    #[serde(default = "default_relation_width")]
    pub width: f32,  // 线宽
}

pub fn default_relation_color() -> [u8; 4] {
    [0, 0, 0, 255]  // 默认黑色
}

pub fn default_relation_width() -> f32 {
    2.0  // 默认线宽
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RelationType {
    Direct,    // 实线箭头
    Indirect,  // 虚线箭头
}

impl Default for ProjectRelation {
    fn default() -> Self {
        Self {
            from_id: String::new(),
            to_id: String::new(),
            relation_type: RelationType::Direct,
            tags: Vec::new(),
            color: default_relation_color(),
            width: default_relation_width(),
        }
    }
}

/// 用户数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub username: String,
    pub password_hash: String,  // 简单实现，实际应使用加密
}

/// 用户配置（存储在config.yaml）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserConfig {
    pub users: Vec<UserConfigEntry>,
}

/// 用户配置条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserConfigEntry {
    pub username: String,
    pub password_hash: String,
    pub data_storage_path: Option<String>,  // 数据存储路径
    #[serde(default)]
    pub last_edited_file: Option<String>,  // 最近编辑的文件路径
}

/// 应用设置（存储在app_settings.yaml）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_auto_save")]
    pub auto_save: bool,  // 自动保存
    #[serde(default = "default_auto_save_interval")]
    pub auto_save_interval: u64,  // 自动保存间隔（秒）
    #[serde(default = "default_default_zoom")]
    pub default_zoom: f32,  // 默认缩放级别
    #[serde(default = "default_max_history_size")]
    pub max_history_size: usize,  // 最大历史记录数
    #[serde(default = "default_show_project_numbers")]
    pub show_project_numbers: bool,  // 显示项目编号
    #[serde(default = "default_show_project_names")]
    pub show_project_names: bool,  // 显示项目名称
    #[serde(default = "default_field_border_width")]
    pub field_border_width: f32,  // 领域边框宽度
    #[serde(default = "default_project_border_width")]
    pub project_border_width: f32,  // 项目边框宽度
    #[serde(default = "default_visualization_bg_color")]
    pub visualization_bg_color: [u8; 4],  // 可视化背景颜色 RGBA
    #[serde(default = "default_show_legend")]
    pub show_legend: bool,  // 是否显示图例
    /// 桌面端：用户库根目录（其下存放 config.yaml 与 users/）。空字符串表示使用程序当前工作目录。
    #[serde(default)]
    pub user_files_directory: String,
}

fn default_auto_save() -> bool { false }
fn default_auto_save_interval() -> u64 { 300 }  // 5分钟
fn default_default_zoom() -> f32 { 1.0 }
fn default_max_history_size() -> usize { 50 }
fn default_show_project_numbers() -> bool { true }
fn default_show_project_names() -> bool { true }
fn default_field_border_width() -> f32 { 2.0 }
fn default_project_border_width() -> f32 { 3.0 }
fn default_visualization_bg_color() -> [u8; 4] { [255, 255, 255, 255] }  // 白色
fn default_show_legend() -> bool { true }

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_save: false,
            auto_save_interval: 300,
            default_zoom: 1.0,
            max_history_size: 50,
            show_project_numbers: true,
            show_project_names: true,
            field_border_width: 2.0,
            project_border_width: 3.0,
            visualization_bg_color: [255, 255, 255, 255],
            show_legend: true,
            user_files_directory: String::new(),
        }
    }
}

/// 应用数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppData {
    pub fields: IndexMap<String, ResearchField>,  // 使用IndexMap保持领域顺序
    pub projects: IndexMap<String, Project>,  // 使用IndexMap保持插入顺序
    pub relations: Vec<ProjectRelation>,
    #[serde(default)]
    pub relation_tags: Vec<String>,  // 关系标签列表（全局标签库）
    #[serde(default)]
    pub labs: IndexMap<String, Lab>,
    #[serde(default)]
    pub people: IndexMap<String, Person>,
    #[serde(default)]
    pub authorships: Vec<ProjectAuthorship>,
}

impl Default for AppData {
    fn default() -> Self {
        let mut fields = IndexMap::new();
        let mut projects = IndexMap::new();
        let mut relations = Vec::new();

        // 初始化三个研究方向
        fields.insert("rna_structure".to_string(), ResearchField {
            id: "rna_structure".to_string(),
            name: "RNA结构".to_string(),
            description: "RNA结构研究".to_string(),
            position: (400.0, 200.0),
            radius: 200.0,
        });

        fields.insert("microbial_ecology".to_string(), ResearchField {
            id: "microbial_ecology".to_string(),
            name: "微生物生态".to_string(),
            description: "微生物生态研究".to_string(),
            position: (200.0, 500.0),
            radius: 200.0,
        });

        fields.insert("bioinfo_tools".to_string(), ResearchField {
            id: "bioinfo_tools".to_string(),
            name: "生信工具开发".to_string(),
            description: "生物信息学工具开发".to_string(),
            position: (600.0, 500.0),
            radius: 200.0,
        });

        // 添加一些示例项目
        projects.insert("project_1".to_string(), Project {
            id: "project_1".to_string(),
            name: "itol.toolkit".to_string(),
            description: "iTOL工具包".to_string(),
            status: ProjectStatus::Published,
            field_ids: vec!["bioinfo_tools".to_string()],
            position: (550.0, 450.0),
            radius: 20.0,
            completion_percentage: 100.0,
            expected_completion_date: None,
            expected_journal: None,
            submission_milestones: Vec::new(),
            journal_submissions: Vec::new(),
            progress_slots: Vec::new(),
            progress_blocks: Vec::new(),
            figure_share: None,
        });

        projects.insert("project_2".to_string(), Project {
            id: "project_2".to_string(),
            name: "VnFinder".to_string(),
            description: "VnFinder工具".to_string(),
            status: ProjectStatus::Published,
            field_ids: vec!["microbial_ecology".to_string()],
            position: (250.0, 450.0),
            radius: 20.0,
            completion_percentage: 100.0,
            expected_completion_date: None,
            expected_journal: None,
            submission_milestones: Vec::new(),
            journal_submissions: Vec::new(),
            progress_slots: Vec::new(),
            progress_blocks: Vec::new(),
            figure_share: None,
        });

        // 添加关系
        relations.push(ProjectRelation {
            from_id: "project_1".to_string(),
            to_id: "project_2".to_string(),
            relation_type: RelationType::Direct,
            tags: Vec::new(),
            color: default_relation_color(),
            width: default_relation_width(),
        });

        Self {
            fields,
            projects,
            relations,
            relation_tags: Vec::new(),
            labs: IndexMap::new(),
            people: IndexMap::new(),
            authorships: Vec::new(),
        }
    }
}

impl AppData {
    /// 创建空的数据（用于新用户）
    pub fn default_empty() -> Self {
        // 新用户不提供任何领域信息
        Self {
            fields: IndexMap::new(),
            projects: IndexMap::new(),
            relations: Vec::new(),
            relation_tags: Vec::new(),
            labs: IndexMap::new(),
            people: IndexMap::new(),
            authorships: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_status_name_stable() {
        assert_eq!(ProjectStatus::Published.name(), "已发表");
        assert_eq!(ProjectStatus::ToBeStarted.name(), "待启动");
    }

    #[test]
    fn appdata_default_empty_roundtrip_json() {
        let empty = AppData::default_empty();
        let json = serde_json::to_string(&empty).unwrap();
        let back: AppData = serde_json::from_str(&json).unwrap();
        assert!(back.fields.is_empty());
        assert!(back.projects.is_empty());
        assert!(back.relations.is_empty());
    }

    #[test]
    fn project_roundtrip_json() {
        let p = Project {
            id: "project_1".to_string(),
            name: "测试".to_string(),
            description: "d".to_string(),
            status: ProjectStatus::Submitted,
            field_ids: vec!["f1".to_string()],
            position: (10.0, 20.0),
            radius: 15.0,
            completion_percentage: 50.0,
            expected_completion_date: None,
            expected_journal: None,
            submission_milestones: Vec::new(),
            journal_submissions: Vec::new(),
            progress_slots: Vec::new(),
            progress_blocks: Vec::new(),
            figure_share: None,
        };
        let json = serde_json::to_string(&p).unwrap();
        let back: Project = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, p.id);
        assert!(matches!(back.status, ProjectStatus::Submitted));
        assert!(back.expected_completion_date.is_none());
        assert!(back.submission_milestones.is_empty());
    }

    #[test]
    fn project_without_timeline_fields_deserializes() {
        let json = r#"{"id":"p","name":"n","description":"","status":"ToBeStarted","field_ids":[],"position":[0.0,0.0],"radius":10.0,"completion_percentage":0.0}"#;
        let p: Project = serde_json::from_str(json).unwrap();
        assert!(p.expected_completion_date.is_none());
        assert!(p.submission_milestones.is_empty());
        assert!(p.progress_slots.is_empty());
        assert!(p.progress_blocks.is_empty());
    }

    #[test]
    fn appdata_without_authors_deserializes() {
        let json = r#"{"fields":{},"projects":{},"relations":[]}"#;
        let data: AppData = serde_json::from_str(json).unwrap();
        assert!(data.labs.is_empty());
        assert!(data.people.is_empty());
        assert!(data.authorships.is_empty());
    }

    #[test]
    fn relation_type_json_roundtrip() {
        let r = ProjectRelation {
            from_id: "a".to_string(),
            to_id: "b".to_string(),
            relation_type: RelationType::Indirect,
            tags: vec!["t".to_string()],
            color: [1, 2, 3, 255],
            width: 1.5,
        };
        let json = serde_json::to_string(&r).unwrap();
        let back: ProjectRelation = serde_json::from_str(&json).unwrap();
        assert_eq!(back.relation_type, RelationType::Indirect);
    }
}

