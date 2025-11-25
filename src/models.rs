use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
            ProjectStatus::SteadyProgress => "进行中",
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
    pub completion_percentage: f32,  // 完成度百分比 (0.0 - 100.0)
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
        }
    }
}

/// 应用数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppData {
    pub fields: HashMap<String, ResearchField>,
    pub projects: HashMap<String, Project>,
    pub relations: Vec<ProjectRelation>,
    #[serde(default)]
    pub relation_tags: Vec<String>,  // 关系标签列表（全局标签库）
}

impl Default for AppData {
    fn default() -> Self {
        let mut fields = HashMap::new();
        let mut projects = HashMap::new();
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
        }
    }
}

impl AppData {
    /// 创建空的数据（用于新用户）
    pub fn default_empty() -> Self {
        // 新用户不提供任何领域信息
        Self {
            fields: HashMap::new(),
            projects: HashMap::new(),
            relations: Vec::new(),
            relation_tags: Vec::new(),
        }
    }
}

