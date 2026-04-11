#[cfg(not(target_arch = "wasm32"))]
use chrono::Local;
#[cfg(not(target_arch = "wasm32"))]
use log::{Level, LevelFilter};
#[cfg(target_arch = "wasm32")]
use log::Level;
#[cfg(not(target_arch = "wasm32"))]
use simplelog::*;
#[cfg(not(target_arch = "wasm32"))]
use std::fs::File;
use std::path::PathBuf;
use std::sync::Mutex;

/// 检查点ID枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Checkpoint {
    // 应用启动和初始化
    AppStart,
    FontLoad,
    ConfigLoad,
    SettingsLoad,
    UserListLoad,
    AppReady,
    
    // 用户认证
    LoginStart,
    LoginVerify,
    LoginSuccess,
    LoginFailed,
    Logout,
    UserCreateStart,
    UserCreateSuccess,
    UserCreateFailed,
    
    // 文件操作
    FileLoadStart,
    FileLoadSuccess,
    FileLoadFailed,
    FileSaveStart,
    FileSaveSuccess,
    FileSaveFailed,
    FileImportStart,
    FileImportSuccess,
    FileExportStart,
    FileExportSuccess,
    DataSerializeStart,
    DataSerializeSuccess,
    DataDeserializeStart,
    DataDeserializeSuccess,
    
    // 数据操作
    ProjectCreate,
    ProjectUpdate,
    ProjectDelete,
    ProjectSelect,
    FieldCreate,
    FieldUpdate,
    FieldDelete,
    FieldDrag,
    RelationCreate,
    RelationDelete,
    RelationUpdate,
    
    // 布局和可视化
    LayoutCalculateStart,
    LayoutCalculateSuccess,
    LayoutPositionValidate,
    LayoutPositionFix,
    LayoutPhysicsStart,
    LayoutPhysicsSuccess,
    FieldExpand,
    VisualizationRenderStart,
    VisualizationRenderSuccess,
    
    // 用户交互
    ProjectDragStart,
    ProjectDragUpdate,
    ProjectDragEnd,
    CanvasPan,
    CanvasZoom,
    KeyboardShortcut,
    ButtonClick,
    
    // 撤销/重做
    HistorySave,
    HistoryUndo,
    HistoryRedo,
    HistoryClear,
    
    // 数据验证
    DataValidateStart,
    DataValidateFieldRef,
    DataValidateRelationRef,
    DataValidateFix,
    DataValidateSuccess,
    
    // 性能监控
    PerfOperationStart,
    PerfOperationEnd,
    PerfFileSize,
    PerfDataCount,
}

impl Checkpoint {
    /// 获取检查点的默认日志级别
    pub fn default_level(&self) -> Level {
        match self {
            Checkpoint::AppStart
            | Checkpoint::LoginSuccess
            | Checkpoint::FileLoadSuccess
            | Checkpoint::FileSaveSuccess
            | Checkpoint::ProjectCreate
            | Checkpoint::ProjectDelete
            | Checkpoint::DataValidateSuccess => Level::Info,
            
            Checkpoint::LoginFailed
            | Checkpoint::FileLoadFailed
            | Checkpoint::FileSaveFailed
            | Checkpoint::UserCreateFailed => Level::Error,
            
            Checkpoint::LoginStart
            | Checkpoint::FileLoadStart
            | Checkpoint::FileSaveStart
            | Checkpoint::ProjectUpdate
            | Checkpoint::LayoutCalculateStart => Level::Debug,
            
            Checkpoint::LoginVerify
            | Checkpoint::DataSerializeStart
            | Checkpoint::DataDeserializeStart
            | Checkpoint::LayoutPositionValidate => Level::Trace,
            
            _ => Level::Debug,
        }
    }
    
    /// 获取检查点的模块名
    pub fn module(&self) -> &'static str {
        match self {
            Checkpoint::AppStart
            | Checkpoint::FontLoad
            | Checkpoint::ConfigLoad
            | Checkpoint::SettingsLoad
            | Checkpoint::AppReady => "init",
            
            Checkpoint::LoginStart
            | Checkpoint::LoginVerify
            | Checkpoint::LoginSuccess
            | Checkpoint::LoginFailed
            | Checkpoint::Logout
            | Checkpoint::UserCreateStart
            | Checkpoint::UserCreateSuccess
            | Checkpoint::UserCreateFailed => "auth",
            
            Checkpoint::FileLoadStart
            | Checkpoint::FileLoadSuccess
            | Checkpoint::FileLoadFailed
            | Checkpoint::FileSaveStart
            | Checkpoint::FileSaveSuccess
            | Checkpoint::FileSaveFailed
            | Checkpoint::FileImportStart
            | Checkpoint::FileImportSuccess
            | Checkpoint::FileExportStart
            | Checkpoint::FileExportSuccess
            | Checkpoint::DataSerializeStart
            | Checkpoint::DataSerializeSuccess
            | Checkpoint::DataDeserializeStart
            | Checkpoint::DataDeserializeSuccess => "file",
            
            Checkpoint::ProjectCreate
            | Checkpoint::ProjectUpdate
            | Checkpoint::ProjectDelete
            | Checkpoint::ProjectSelect
            | Checkpoint::FieldCreate
            | Checkpoint::FieldUpdate
            | Checkpoint::FieldDelete
            | Checkpoint::FieldDrag
            | Checkpoint::RelationCreate
            | Checkpoint::RelationDelete
            | Checkpoint::RelationUpdate => "data",
            
            Checkpoint::LayoutCalculateStart
            | Checkpoint::LayoutCalculateSuccess
            | Checkpoint::LayoutPositionValidate
            | Checkpoint::LayoutPositionFix
            | Checkpoint::LayoutPhysicsStart
            | Checkpoint::LayoutPhysicsSuccess
            | Checkpoint::FieldExpand
            | Checkpoint::VisualizationRenderStart
            | Checkpoint::VisualizationRenderSuccess => "layout",
            
            Checkpoint::ProjectDragStart
            | Checkpoint::ProjectDragUpdate
            | Checkpoint::ProjectDragEnd
            | Checkpoint::CanvasPan
            | Checkpoint::CanvasZoom
            | Checkpoint::KeyboardShortcut
            | Checkpoint::ButtonClick => "interaction",
            
            Checkpoint::HistorySave
            | Checkpoint::HistoryUndo
            | Checkpoint::HistoryRedo
            | Checkpoint::HistoryClear => "history",
            
            Checkpoint::DataValidateStart
            | Checkpoint::DataValidateFieldRef
            | Checkpoint::DataValidateRelationRef
            | Checkpoint::DataValidateFix
            | Checkpoint::DataValidateSuccess => "validation",
            
            Checkpoint::PerfOperationStart
            | Checkpoint::PerfOperationEnd
            | Checkpoint::PerfFileSize
            | Checkpoint::PerfDataCount => "perf",
            
            Checkpoint::UserListLoad => "config",
        }
    }
}

/// 日志上下文信息
pub type LogContext = Vec<(&'static str, String)>;

/// 全局日志记录器（仅桌面端使用；WASM 上 `init` 为空操作）
#[cfg_attr(target_arch = "wasm32", allow(dead_code))]
static LOGGER: Mutex<Option<Logger>> = Mutex::new(None);

/// 日志记录器
#[cfg_attr(target_arch = "wasm32", allow(dead_code))]
pub struct Logger {
    log_dir: PathBuf,
    #[allow(dead_code)]
    current_log_file: PathBuf,
}

impl Logger {
    /// 初始化日志系统
    pub fn init() -> Result<(), String> {
        #[cfg(target_arch = "wasm32")]
        {
            return Ok(());
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            Self::init_native()
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    fn init_native() -> Result<(), String> {
        // 获取日志目录
        let log_dir = Self::get_log_dir()?;
        
        // 确保日志目录存在
        std::fs::create_dir_all(&log_dir)
            .map_err(|e| format!("创建日志目录失败: {}", e))?;
        
        // 创建日志文件路径
        let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S");
        let log_file_name = format!("venncv_{}.log", timestamp);
        let current_log_file = log_dir.join(&log_file_name);
        
        // 创建当前日志的符号链接（最新日志）
        let current_link = log_dir.join("venncv_current.log");
        let _ = std::fs::remove_file(&current_link); // 忽略错误
        let _ = std::fs::hard_link(&current_log_file, &current_link); // 尝试创建硬链接
        
        // 创建日志文件
        let file = File::create(&current_log_file)
            .map_err(|e| format!("创建日志文件失败: {}", e))?;
        
        // 初始化 simplelog（0.12+ 使用 time  crate，不再提供 set_time_format_str）
        let mut config_builder = ConfigBuilder::new();
        config_builder
            .set_time_format_rfc3339()
            .set_level_padding(LevelPadding::Right)
            .set_location_level(LevelFilter::Error)
            .set_thread_level(LevelFilter::Off)
            .set_target_level(LevelFilter::Error)
            .set_max_level(LevelFilter::Trace);
        let _ = config_builder.set_time_offset_to_local();
        let config = config_builder.build();
        
        // 根据环境变量确定日志级别
        let log_level = std::env::var("VENNCV_LOG_LEVEL")
            .ok()
            .and_then(|s| match s.to_uppercase().as_str() {
                "ERROR" => Some(LevelFilter::Error),
                "WARN" => Some(LevelFilter::Warn),
                "INFO" => Some(LevelFilter::Info),
                "DEBUG" => Some(LevelFilter::Debug),
                "TRACE" => Some(LevelFilter::Trace),
                _ => None,
            })
            .unwrap_or_else(|| {
                // 默认：debug 模式为 DEBUG，release 模式为 INFO
                if cfg!(debug_assertions) {
                    LevelFilter::Debug
                } else {
                    LevelFilter::Info
                }
            });
        
        // 是否输出到控制台
        let console = std::env::var("VENNCV_LOG_CONSOLE")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(cfg!(debug_assertions));
        
        // 初始化日志
        if console {
            CombinedLogger::init(vec![
                TermLogger::new(
                    log_level,
                    config.clone(),
                    TerminalMode::Mixed,
                    ColorChoice::Auto,
                ),
                WriteLogger::new(
                    log_level,
                    config,
                    file,
                ),
            ])
            .map_err(|e| format!("初始化日志失败: {}", e))?;
        } else {
            WriteLogger::init(log_level, config, file)
                .map_err(|e| format!("初始化日志失败: {}", e))?;
        }
        
        // 保存日志器实例
        let logger = Logger {
            log_dir,
            current_log_file,
        };
        
        *LOGGER.lock().unwrap() = Some(logger);
        
        Ok(())
    }
    
    /// 获取日志目录路径
    #[cfg(not(target_arch = "wasm32"))]
    fn get_log_dir() -> Result<PathBuf, String> {
        // 优先使用环境变量指定的日志目录
        if let Ok(custom_dir) = std::env::var("VENNCV_LOG_DIR") {
            return Ok(PathBuf::from(custom_dir));
        }
        
        // 尝试使用系统标准目录
        let base_dir = if cfg!(target_os = "macos") {
            if let Some(home) = dirs::home_dir() {
                home.join("Library")
                    .join("Application Support")
                    .join("VennCV")
                    .join("logs")
            } else {
                // 回退到当前目录
                PathBuf::from("logs")
            }
        } else if cfg!(target_os = "windows") {
            dirs::data_dir()
                .map(|d| d.join("VennCV").join("logs"))
                .unwrap_or_else(|| PathBuf::from("logs"))
        } else {
            // Linux
            dirs::data_dir()
                .map(|d| d.join("VennCV").join("logs"))
                .unwrap_or_else(|| PathBuf::from("logs"))
        };
        
        Ok(base_dir)
    }
    
    /// 记录检查点
    pub fn checkpoint(checkpoint: Checkpoint, message: &str, context: LogContext) {
        let level = checkpoint.default_level();
        let module = checkpoint.module();
        
        // 构建上下文字符串
        let context_str = if context.is_empty() {
            String::new()
        } else {
            let pairs: Vec<String> = context.iter()
                .map(|(k, v)| format!("{}: {}", k, v))
                .collect();
            format!(" | {}", pairs.join(", "))
        };
        
        // 格式化消息
        let full_message = format!("[{}] {}{}", checkpoint.as_str(), message, context_str);
        
        log::log!(target: module, level, "{}", full_message);
    }
    
    /// 记录简单的检查点（无上下文）
    pub fn checkpoint_simple(checkpoint: Checkpoint, message: &str) {
        Self::checkpoint(checkpoint, message, Vec::new());
    }
    
    /// 获取日志目录
    #[cfg(not(target_arch = "wasm32"))]
    pub fn log_dir() -> Option<PathBuf> {
        LOGGER.lock().unwrap().as_ref().map(|l| l.log_dir.clone())
    }
}

impl Checkpoint {
    /// 将检查点转换为字符串
    fn as_str(&self) -> &'static str {
        match self {
            Checkpoint::AppStart => "APP_START",
            Checkpoint::FontLoad => "FONT_LOAD",
            Checkpoint::ConfigLoad => "CONFIG_LOAD",
            Checkpoint::SettingsLoad => "SETTINGS_LOAD",
            Checkpoint::UserListLoad => "USER_LIST_LOAD",
            Checkpoint::AppReady => "APP_READY",
            Checkpoint::LoginStart => "LOGIN_START",
            Checkpoint::LoginVerify => "LOGIN_VERIFY",
            Checkpoint::LoginSuccess => "LOGIN_SUCCESS",
            Checkpoint::LoginFailed => "LOGIN_FAILED",
            Checkpoint::Logout => "LOGOUT",
            Checkpoint::UserCreateStart => "USER_CREATE_START",
            Checkpoint::UserCreateSuccess => "USER_CREATE_SUCCESS",
            Checkpoint::UserCreateFailed => "USER_CREATE_FAILED",
            Checkpoint::FileLoadStart => "FILE_LOAD_START",
            Checkpoint::FileLoadSuccess => "FILE_LOAD_SUCCESS",
            Checkpoint::FileLoadFailed => "FILE_LOAD_FAILED",
            Checkpoint::FileSaveStart => "FILE_SAVE_START",
            Checkpoint::FileSaveSuccess => "FILE_SAVE_SUCCESS",
            Checkpoint::FileSaveFailed => "FILE_SAVE_FAILED",
            Checkpoint::FileImportStart => "FILE_IMPORT_START",
            Checkpoint::FileImportSuccess => "FILE_IMPORT_SUCCESS",
            Checkpoint::FileExportStart => "FILE_EXPORT_START",
            Checkpoint::FileExportSuccess => "FILE_EXPORT_SUCCESS",
            Checkpoint::DataSerializeStart => "DATA_SERIALIZE_START",
            Checkpoint::DataSerializeSuccess => "DATA_SERIALIZE_SUCCESS",
            Checkpoint::DataDeserializeStart => "DATA_DESERIALIZE_START",
            Checkpoint::DataDeserializeSuccess => "DATA_DESERIALIZE_SUCCESS",
            Checkpoint::ProjectCreate => "PROJECT_CREATE",
            Checkpoint::ProjectUpdate => "PROJECT_UPDATE",
            Checkpoint::ProjectDelete => "PROJECT_DELETE",
            Checkpoint::ProjectSelect => "PROJECT_SELECT",
            Checkpoint::FieldCreate => "FIELD_CREATE",
            Checkpoint::FieldUpdate => "FIELD_UPDATE",
            Checkpoint::FieldDelete => "FIELD_DELETE",
            Checkpoint::FieldDrag => "FIELD_DRAG",
            Checkpoint::RelationCreate => "RELATION_CREATE",
            Checkpoint::RelationDelete => "RELATION_DELETE",
            Checkpoint::RelationUpdate => "RELATION_UPDATE",
            Checkpoint::LayoutCalculateStart => "LAYOUT_CALCULATE_START",
            Checkpoint::LayoutCalculateSuccess => "LAYOUT_CALCULATE_SUCCESS",
            Checkpoint::LayoutPositionValidate => "LAYOUT_POSITION_VALIDATE",
            Checkpoint::LayoutPositionFix => "LAYOUT_POSITION_FIX",
            Checkpoint::LayoutPhysicsStart => "LAYOUT_PHYSICS_START",
            Checkpoint::LayoutPhysicsSuccess => "LAYOUT_PHYSICS_SUCCESS",
            Checkpoint::FieldExpand => "FIELD_EXPAND",
            Checkpoint::VisualizationRenderStart => "VISUALIZATION_RENDER_START",
            Checkpoint::VisualizationRenderSuccess => "VISUALIZATION_RENDER_SUCCESS",
            Checkpoint::ProjectDragStart => "PROJECT_DRAG_START",
            Checkpoint::ProjectDragUpdate => "PROJECT_DRAG_UPDATE",
            Checkpoint::ProjectDragEnd => "PROJECT_DRAG_END",
            Checkpoint::CanvasPan => "CANVAS_PAN",
            Checkpoint::CanvasZoom => "CANVAS_ZOOM",
            Checkpoint::KeyboardShortcut => "KEYBOARD_SHORTCUT",
            Checkpoint::ButtonClick => "BUTTON_CLICK",
            Checkpoint::HistorySave => "HISTORY_SAVE",
            Checkpoint::HistoryUndo => "HISTORY_UNDO",
            Checkpoint::HistoryRedo => "HISTORY_REDO",
            Checkpoint::HistoryClear => "HISTORY_CLEAR",
            Checkpoint::DataValidateStart => "DATA_VALIDATE_START",
            Checkpoint::DataValidateFieldRef => "DATA_VALIDATE_FIELD_REF",
            Checkpoint::DataValidateRelationRef => "DATA_VALIDATE_RELATION_REF",
            Checkpoint::DataValidateFix => "DATA_VALIDATE_FIX",
            Checkpoint::DataValidateSuccess => "DATA_VALIDATE_SUCCESS",
            Checkpoint::PerfOperationStart => "PERF_OPERATION_START",
            Checkpoint::PerfOperationEnd => "PERF_OPERATION_END",
            Checkpoint::PerfFileSize => "PERF_FILE_SIZE",
            Checkpoint::PerfDataCount => "PERF_DATA_COUNT",
        }
    }
}

/// 便捷宏：记录检查点
#[macro_export]
macro_rules! checkpoint {
    ($checkpoint:expr, $msg:expr) => {
        $crate::logger::Logger::checkpoint_simple($checkpoint, $msg);
    };
    ($checkpoint:expr, $msg:expr, $( $key:ident: $val:expr ),*) => {
        {
            let mut ctx = $crate::logger::LogContext::new();
            $(
                ctx.push((stringify!($key), format!("{}", $val)));
            )*
            $crate::logger::Logger::checkpoint($checkpoint, $msg, ctx);
        }
    };
}

/// 便捷宏：记录性能检查点（带计时）
#[macro_export]
macro_rules! perf_checkpoint {
    ($checkpoint:expr, $operation:expr) => {
        {
            let start = std::time::Instant::now();
            checkpoint!($crate::logger::Checkpoint::PerfOperationStart, "操作开始", checkpoint: format!("{:?}", $checkpoint));
            let result = $operation;
            let duration = start.elapsed();
            checkpoint!($crate::logger::Checkpoint::PerfOperationEnd, "操作完成", checkpoint: format!("{:?}", $checkpoint), duration_ms: duration.as_millis());
            result
        }
    };
}

// 需要添加 dirs 依赖
// 暂时使用简化版本，直接使用当前目录下的 logs 目录
// 稍后可以添加 dirs 依赖

