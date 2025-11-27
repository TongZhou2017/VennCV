use crate::models::*;
use egui::*;
use std::collections::HashMap;

// 导入默认值函数
use crate::models::{default_relation_color, default_relation_width};

// IDE风格主题系统 - 参考VSCode/Cursor设计
struct Theme {
    // 主色调 - VSCode风格
    primary: Color32,              // 主按钮颜色
    primary_hover: Color32,        // 主按钮悬停
    primary_active: Color32,       // 主按钮激活
    
    // 背景色 - 类似VSCode编辑器
    background: Color32,            // 主背景
    surface: Color32,              // 面板背景
    surface_hover: Color32,        // 悬停背景
    surface_selected: Color32,     // 选中背景
    
    // 文本颜色
    text_primary: Color32,         // 主文本
    text_secondary: Color32,       // 次要文本
    text_disabled: Color32,        // 禁用文本
    
    // 边框和分隔线
    border: Color32,               // 边框颜色
    divider: Color32,              // 分隔线
    
    // 状态颜色
    success: Color32,
    warning: Color32,
    error: Color32,
    info: Color32,
    
    // 特殊用途
    selection: Color32,            // 选中高亮
    selection_inactive: Color32,   // 非活动选中
}

impl Theme {
    // VSCode Light+ 风格主题
    fn light() -> Self {
        Self {
            primary: Color32::from_rgb(0, 122, 204),        // VSCode蓝色
            primary_hover: Color32::from_rgb(0, 102, 184),
            primary_active: Color32::from_rgb(0, 82, 164),
            
            background: Color32::from_rgb(255, 255, 255),   // 纯白背景
            surface: Color32::from_rgb(248, 248, 248),      // 浅灰面板
            surface_hover: Color32::from_rgb(240, 240, 240),
            surface_selected: Color32::from_rgb(230, 230, 230),
            
            text_primary: Color32::from_rgb(51, 51, 51),    // 深灰文本
            text_secondary: Color32::from_rgb(102, 102, 102),
            text_disabled: Color32::from_rgb(170, 170, 170),
            
            border: Color32::from_rgb(214, 214, 214),       // 浅灰边框
            divider: Color32::from_rgb(214, 214, 214),
            
            success: Color32::from_rgb(89, 185, 89),
            warning: Color32::from_rgb(252, 186, 3),
            error: Color32::from_rgb(244, 63, 94),
            info: Color32::from_rgb(0, 122, 204),
            
            selection: Color32::from_rgb(173, 214, 255),    // 浅蓝选中
            selection_inactive: Color32::from_rgb(230, 230, 230),
        }
    }
    
    // VSCode Dark+ 风格主题
    fn dark() -> Self {
        Self {
            primary: Color32::from_rgb(0, 122, 204),        // VSCode蓝色
            primary_hover: Color32::from_rgb(38, 139, 210),
            primary_active: Color32::from_rgb(0, 102, 184),
            
            background: Color32::from_rgb(30, 30, 30),      // 深灰背景
            surface: Color32::from_rgb(37, 37, 38),        // 面板背景
            surface_hover: Color32::from_rgb(45, 45, 45),
            surface_selected: Color32::from_rgb(58, 58, 58),
            
            text_primary: Color32::from_rgb(212, 212, 212), // 浅灰文本
            text_secondary: Color32::from_rgb(170, 170, 170),
            text_disabled: Color32::from_rgb(113, 113, 113),
            
            border: Color32::from_rgb(60, 60, 60),         // 深灰边框
            divider: Color32::from_rgb(60, 60, 60),
            
            success: Color32::from_rgb(89, 185, 89),
            warning: Color32::from_rgb(252, 186, 3),
            error: Color32::from_rgb(244, 63, 94),
            info: Color32::from_rgb(0, 122, 204),
            
            selection: Color32::from_rgb(38, 79, 120),      // 深蓝选中
            selection_inactive: Color32::from_rgb(58, 58, 58),
        }
    }
    
    fn apply_visuals(&self, ctx: &Context) {
        let mut style = (*ctx.style()).clone();
        
        // 按钮样式 - 更扁平化，小圆角
        style.visuals.widgets.inactive.bg_fill = self.primary;
        style.visuals.widgets.inactive.weak_bg_fill = self.surface;
        style.visuals.widgets.inactive.fg_stroke = Stroke::new(1.0, Color32::WHITE);
        style.visuals.widgets.inactive.rounding = Rounding::same(3.0); // 小圆角
        
        style.visuals.widgets.hovered.bg_fill = self.primary_hover;
        style.visuals.widgets.hovered.rounding = Rounding::same(3.0);
        
        style.visuals.widgets.active.bg_fill = self.primary_active;
        style.visuals.widgets.active.rounding = Rounding::same(3.0);
        
        // 文本样式 - 更专业的字体大小
        style.text_styles.get_mut(&TextStyle::Heading).unwrap().size = 20.0;
        style.text_styles.get_mut(&TextStyle::Body).unwrap().size = 13.0;
        style.text_styles.get_mut(&TextStyle::Button).unwrap().size = 13.0;
        style.text_styles.get_mut(&TextStyle::Small).unwrap().size = 11.0;
        
        // 间距 - 更紧凑
        style.spacing.item_spacing = vec2(6.0, 6.0);
        style.spacing.button_padding = vec2(12.0, 6.0);
        style.spacing.menu_margin = Margin::same(4.0);
        style.spacing.window_margin = Margin::same(8.0);
        
        // 交互
        style.interaction.resize_grab_radius_side = 6.0;
        
        // 禁用Tab键的默认焦点导航，由应用自行处理
        style.interaction.selectable_labels = false;
        
        // 整体视觉
        style.visuals.override_text_color = Some(self.text_primary);
        style.visuals.faint_bg_color = self.surface;
        style.visuals.extreme_bg_color = self.surface_hover;
        
        ctx.set_style(style);
    }
}

pub struct VennCVApp {
    // 用户状态
    pub is_logged_in: bool,
    pub current_user: Option<String>,
    pub login_username: String,
    pub login_password: String,
    pub login_error: String,
    pub user_data_storage_path: Option<String>,  // 用户数据存储路径
    pub available_users: Vec<String>,  // 可用用户列表
    pub show_create_user_dialog: bool,  // 是否显示创建用户对话框
    pub new_username: String,  // 新用户名
    pub new_password: String,  // 新密码
    pub create_user_error: String,  // 创建用户错误信息

    // 应用数据
    pub data: AppData,
    pub current_file_path: Option<std::path::PathBuf>,  // 当前打开的文件路径
    pub history: Vec<AppData>,  // 撤销历史
    pub history_index: usize,  // 当前历史索引
    pub max_history_size: usize,  // 最大历史记录数

    // UI 状态
    pub selected_project: Option<String>,
    pub selected_field: Option<String>,
    pub show_project_table: bool,
    pub show_visualization: bool,
    pub show_property_panel: bool,
    pub visualization_zoom: f32,
    pub visualization_offset: Vec2,

    // 编辑状态
    pub editing_project: Option<Project>,
    pub editing_field: Option<ResearchField>,
    pub expanded_relations: std::collections::HashMap<usize, bool>,  // 关系展开状态
    pub relation_tag_inputs: std::collections::HashMap<usize, String>,  // 每个关系的标签输入框内容
    
    // 设置
    pub show_settings_dialog: bool,  // 是否显示设置对话框
    pub settings: AppSettings,  // 应用设置
    
    // 图例状态
    pub legend_position: Vec2,  // 图例位置（相对于可视化区域右上角的偏移）
    pub legend_dragging: bool,  // 是否正在拖拽图例
    pub show_legend_settings: bool,  // 是否显示图例设置对话框
    
    // 项目拖拽状态
    pub dragging_project: Option<String>,  // 正在拖拽的项目ID
    
    // 领域列表拖拽状态
    pub dragging_field_idx: Option<usize>,  // 正在拖拽的领域索引
    pub field_drag_target_idx: Option<usize>,  // 拖拽目标位置
    
    // 面板宽度状态
    pub property_panel_width: f32,  // 属性面板宽度
    
    // 左边栏领域区域高度
    pub field_section_height: f32,  // 领域区域高度
    
    // 工具栏按钮选中状态
    pub toolbar_focus_index: Option<usize>,  // 当前选中的工具栏按钮索引
}

impl Default for VennCVApp {
    fn default() -> Self {
        Self {
            is_logged_in: false,
            current_user: None,
            login_username: String::new(),
            login_password: String::new(),
            login_error: String::new(),
            user_data_storage_path: None,
            available_users: Vec::new(),
            show_create_user_dialog: false,
            new_username: String::new(),
            new_password: String::new(),
            create_user_error: String::new(),
            data: AppData::default(),
            current_file_path: None,
            history: vec![AppData::default()],
            history_index: 0,
            max_history_size: 50,
            selected_project: None,
            selected_field: None,
            show_project_table: true,
            show_visualization: true,
            show_property_panel: true,
            visualization_zoom: 1.0,
            visualization_offset: Vec2::ZERO,
            editing_project: None,
            editing_field: None,
            expanded_relations: std::collections::HashMap::new(),
            relation_tag_inputs: std::collections::HashMap::new(),
            show_settings_dialog: false,
            settings: AppSettings::default(),
            legend_position: Vec2::ZERO,  // 默认在右上角
            legend_dragging: false,
            dragging_project: None,
            dragging_field_idx: None,
            field_drag_target_idx: None,
            property_panel_width: 250.0,  // 默认宽度
            show_legend_settings: false,
            field_section_height: 100.0,  // 领域区域默认高度
            toolbar_focus_index: None,  // 工具栏按钮无选中
        }
    }
}

impl VennCVApp {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        // 应用IDE风格主题（默认浅色主题）
        let theme = Theme::light();
        theme.apply_visuals(&cc.egui_ctx);
        
        let mut app = Self::default();
        app.load_available_users();
        app.load_settings();
        // 应用设置到应用状态
        app.max_history_size = app.settings.max_history_size;
        app.visualization_zoom = app.settings.default_zoom;
        app
    }

    /// 加载可用用户列表
    fn load_available_users(&mut self) {
        self.available_users.clear();
        if let Ok(config) = self.load_config() {
            for user in &config.users {
                self.available_users.push(user.username.clone());
            }
        }
    }

    fn login_ui(&mut self, ctx: &Context) {
        let theme = Theme::light();
        
        // 创建用户对话框
        if self.show_create_user_dialog {
            egui::Window::new("创建用户")
                .collapsible(false)
                .resizable(false)
                .default_size([400.0, 300.0])
                .show(ctx, |ui| {
                    ui.set_width(400.0);
                    ui.vertical_centered(|ui| {
                        ui.add_space(30.0);
                        ui.heading(RichText::new("创建新用户").size(22.0).color(theme.text_primary));
                        ui.add_space(30.0);

                        ui.horizontal(|ui| {
                            ui.label(RichText::new("用户名: ").color(theme.text_secondary));
                            ui.add_space(10.0);
                            ui.add(
                                TextEdit::singleline(&mut self.new_username)
                                    .desired_width(200.0)
                            );
                        });

                        ui.add_space(20.0);

                        ui.horizontal(|ui| {
                            ui.label(RichText::new("密码: ").color(theme.text_secondary));
                            ui.add_space(10.0);
                            ui.add(
                                TextEdit::singleline(&mut self.new_password)
                                    .password(true)
                                    .desired_width(200.0)
                            );
                        });

                        if !self.create_user_error.is_empty() {
                            ui.add_space(15.0);
                            ui.label(
                                RichText::new(&self.create_user_error)
                                    .color(theme.error)
                                    .size(12.0)
                            );
                        }

                        ui.add_space(30.0);

                        ui.horizontal(|ui| {
                            if ui.add_sized(
                                [120.0, 40.0],
                                Button::new(RichText::new("创建").size(14.0).color(Color32::WHITE))
                                    .fill(theme.primary)
                            ).clicked() {
                                let username = self.new_username.clone();
                                let password = self.new_password.clone();
                                
                                if username.is_empty() || password.is_empty() {
                                    self.create_user_error = "用户名和密码不能为空".to_string();
                                } else if self.available_users.contains(&username) {
                                    self.create_user_error = "用户名已存在".to_string();
                                } else {
                                    match self.create_user(&username, &password) {
                                        Ok(_) => {
                                            self.load_available_users();
                                            self.login_username = username;
                                            self.new_username.clear();
                                            self.new_password.clear();
                                            self.create_user_error.clear();
                                            self.show_create_user_dialog = false;
                                        }
                                        Err(e) => {
                                            self.create_user_error = format!("创建用户失败: {}", e);
                                        }
                                    }
                                }
                            }

                            ui.add_space(10.0);

                            if ui.add_sized(
                                [120.0, 40.0],
                                Button::new(RichText::new("取消").size(14.0).color(theme.text_primary))
                                    .fill(theme.border)
                            ).clicked() {
                                self.show_create_user_dialog = false;
                                self.new_username.clear();
                                self.new_password.clear();
                                self.create_user_error.clear();
                            }
                        });
                    });
                });
        }

        // 登录界面 - VSCode风格简洁设计
        CentralPanel::default()
            .frame(Frame::none().fill(theme.background))
            .show(ctx, |ui| {
                ui.vertical_centered(|ui| {
                    ui.add_space(120.0);
                    
                    // 简洁的标题区域
                    ui.vertical_centered(|ui| {
                        ui.set_max_width(400.0);
                        ui.heading(
                            RichText::new("VennCV")
                                .size(28.0)
                                .color(theme.text_primary)
                        );
                        ui.add_space(8.0);
                        ui.label(
                            RichText::new("科研项目管理系统")
                                .size(13.0)
                                .color(theme.text_secondary)
                        );
                        ui.add_space(40.0);

                        // 用户选择 - 更简洁的布局
                        ui.vertical(|ui| {
                            ui.label(
                                RichText::new("用户").size(12.0).color(theme.text_secondary)
                            );
                            ui.add_space(4.0);
                            if !self.available_users.is_empty() {
                                ComboBox::from_id_source("user_select")
                                    .selected_text(
                                        if self.login_username.is_empty() {
                                            "请选择用户".to_string()
                                        } else {
                                            self.login_username.clone()
                                        }
                                    )
                                    .width(ui.available_width())
                                    .show_ui(ui, |ui| {
                                        for username in &self.available_users {
                                            if ui.selectable_label(
                                                self.login_username == *username,
                                                username,
                                            )
                                            .clicked()
                                            {
                                                self.login_username = username.clone();
                                            }
                                        }
                                    });
                            } else {
                                ui.label(
                                    RichText::new("暂无用户").color(theme.text_secondary)
                                );
                            }
                        });

                        ui.add_space(16.0);

                        // 密码输入
                        ui.vertical(|ui| {
                            ui.label(
                                RichText::new("密码").size(12.0).color(theme.text_secondary)
                            );
                            ui.add_space(4.0);
                            ui.add(
                                TextEdit::singleline(&mut self.login_password)
                                    .password(true)
                                    .desired_width(ui.available_width())
                            );
                        });

                        if !self.login_error.is_empty() {
                            ui.add_space(12.0);
                            ui.label(
                                RichText::new(&self.login_error)
                                    .color(theme.error)
                                    .size(11.0)
                            );
                        }

                        ui.add_space(24.0);
                        
                        // 回车键触发登录
                        let enter_pressed = ctx.input(|i| i.key_pressed(Key::Enter));

                        // 按钮组 - 更简洁的样式
                        ui.horizontal(|ui| {
                            if enter_pressed || ui.add_sized(
                                [ui.available_width() / 2.0 - 4.0, 32.0],
                                Button::new(RichText::new("登录").size(13.0).color(Color32::WHITE))
                                    .fill(theme.primary)
                            ).clicked() {
                                if self.login_username.is_empty() || self.login_password.is_empty() {
                                    self.login_error = "用户名和密码不能为空".to_string();
                                } else {
                                    match self.verify_user(&self.login_username, &self.login_password) {
                                        Ok(Some((storage_path, last_edited_file))) => {
                                            self.is_logged_in = true;
                                            self.current_user = Some(self.login_username.clone());
                                            self.user_data_storage_path = storage_path;
                                            self.login_error.clear();
                                            
                                            // 自动加载最近编辑的文件
                                            if let Some(file_path) = last_edited_file {
                                                let path = std::path::PathBuf::from(&file_path);
                                                if path.exists() {
                                                    if let Ok(content) = std::fs::read_to_string(&path) {
                                                        match serde_json::from_str::<AppData>(&content) {
                                                            Ok(data) => {
                                                                self.data = data.clone();
                                                                self.current_file_path = Some(path);
                                                                self.selected_project = None;
                                                                self.editing_project = None;
                                                                // 验证并修正项目位置
                                                                self.validate_and_fix_project_positions();
                                                                // 重置历史（使用修正后的数据）
                                                                self.history = vec![self.data.clone()];
                                                                self.history_index = 0;
                                                            }
                                                            Err(e) => {
                                                                eprintln!("加载最近编辑文件失败: {}", e);
                                                            }
                                                        }
                                                    }
                                                }
                                            } else {
                                                // 如果没有最近编辑的文件，根据用户类型初始化数据
                                                if self.login_username == "admin" {
                                                    // admin用户：加载复杂的初始数据
                                                    self.data = self.create_admin_initial_data();
                                                    self.selected_project = None;
                                                    self.editing_project = None;
                                                    // 重置历史
                                                    self.history = vec![self.data.clone()];
                                                    self.history_index = 0;
                                                } else {
                                                    // 新用户：使用空数据
                                                    self.data = AppData::default_empty();
                                                    self.selected_project = None;
                                                    self.editing_project = None;
                                                    // 重置历史
                                                    self.history = vec![self.data.clone()];
                                                    self.history_index = 0;
                                                }
                                            }
                                        }
                                        Ok(None) => {
                                            self.login_error = "用户名或密码错误".to_string();
                                        }
                                        Err(e) => {
                                            self.login_error = format!("登录失败: {}", e);
                                        }
                                    }
                                }
                            }

                            ui.add_space(8.0);

                            if ui.add_sized(
                                [ui.available_width(), 32.0],
                                Button::new(RichText::new("创建用户").size(13.0).color(theme.text_primary))
                                    .fill(theme.surface)
                            ).clicked() {
                                self.show_create_user_dialog = true;
                                self.new_username.clear();
                                self.new_password.clear();
                                self.create_user_error.clear();
                            }
                        });
                    });
                });
            });
    }

    fn main_ui(&mut self, ctx: &Context) {
        // 处理快捷键
        self.handle_shortcuts(ctx);
        
        let theme = Theme::light();
        
        // 顶部菜单栏
        TopBottomPanel::top("menu_bar")
            .frame(Frame::none().fill(theme.surface).inner_margin(8.0))
            .show(ctx, |ui| {
                menu::bar(ui, |ui| {
                    ui.menu_button("文件", |ui| {
                    if ui.button("新建 (Ctrl+N)").clicked() {
                        self.new_file();
                    }
                    if ui.button("打开").clicked() {
                        self.load_data();
                    }
                    ui.separator();
                    if ui.button("保存 (Ctrl+S)").clicked() {
                        self.save_data();
                    }
                    if ui.button("另存为").clicked() {
                        self.save_data_as();
                    }
                    ui.separator();
                    if ui.button("导入数据").clicked() {
                        self.import_data();
                    }
                    if ui.button("导出数据").clicked() {
                        self.export_data();
                    }
                    ui.separator();
                    if ui.button("设置").clicked() {
                        self.show_settings_dialog = true;
                    }
                    if ui.button("切换用户").clicked() {
                        self.is_logged_in = false;
                        self.current_user = None;
                        // 清除当前文件路径，避免跨用户文件混乱
                        self.current_file_path = None;
                        self.user_data_storage_path = None;
                    }
                    ui.separator();
                    if ui.button("退出登录").clicked() {
                        self.is_logged_in = false;
                        self.current_user = None;
                        // 清除当前文件路径，避免跨用户文件混乱
                        self.current_file_path = None;
                        self.user_data_storage_path = None;
                    }
                });

                ui.menu_button("编辑", |ui| {
                    if ui.button("撤销 (Ctrl+Z)").clicked() {
                        self.undo();
                    }
                    if ui.button("重做 (Ctrl+Shift+Z)").clicked() {
                        self.redo();
                    }
                });

                ui.menu_button("视图", |ui| {
                    ui.checkbox(&mut self.show_project_table, "数据表");
                    ui.checkbox(&mut self.show_visualization, "可视化");
                    ui.checkbox(&mut self.show_property_panel, "属性面板");
                    ui.separator();
                    if ui.button("放大 (Ctrl+Plus)").clicked() {
                        self.zoom_in();
                    }
                    if ui.button("缩小 (Ctrl+Minus)").clicked() {
                        self.zoom_out();
                    }
                    if ui.button("重置缩放 (Ctrl+0)").clicked() {
                        self.zoom_reset();
                    }
                });

                ui.menu_button("布局", |ui| {
                    if ui.button("自动调整领域布局").clicked() {
                        self.adjust_field_layout();
                    }
                });


                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if let Some(user) = &self.current_user {
                        ui.label(format!("用户: {}", user));
                    }
                    if let Some(ref storage_path) = self.user_data_storage_path {
                        if let Some(path_name) = std::path::Path::new(storage_path).file_name() {
                            ui.label(format!("存储路径: {}", path_name.to_string_lossy()));
                        }
                    }
                    if let Some(ref path) = self.current_file_path {
                        if let Some(file_name) = path.file_name() {
                            ui.label(format!("文件: {}", file_name.to_string_lossy()));
                        }
                    } else {
                        ui.label("未保存");
                    }
                });
            });
        });
        
        // 工具栏 - 在菜单栏下方
        TopBottomPanel::top("toolbar")
            .frame(Frame::none().fill(theme.surface).inner_margin(4.0))
            .default_height(36.0)
            .show_animated(ctx, true, |ui| {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing = vec2(4.0, 0.0);
                    
                    // 工具栏按钮选中高亮色
                    let focus_fill = theme.primary;
                    
                    // 新建项目按钮（使用图标）- 索引0
                    let new_btn = ui.add_sized(
                        [32.0, 28.0],
                        Button::new(
                            RichText::new("➕")
                                .size(14.0)
                        )
                        .fill(if self.toolbar_focus_index == Some(0) { focus_fill } else { theme.surface })
                    );
                    if new_btn.clicked() {
                        self.create_new_project_shortcut();
                    }
                    new_btn.on_hover_text("新建项目 (Ctrl+N)");
                    
                    // 删除项目按钮（使用图标）- 索引1
                    let delete_btn = ui.add_sized(
                        [32.0, 28.0],
                        Button::new(
                            RichText::new("🗑")
                                .size(14.0)
                        )
                        .fill(if self.toolbar_focus_index == Some(1) { focus_fill } else { theme.surface })
                    );
                    if delete_btn.clicked() {
                        if let Some(id) = &self.selected_project {
                            // 删除项目
                            self.data.projects.shift_remove(id);
                            // 删除相关关系
                            self.data.relations.retain(|r| r.from_id != *id && r.to_id != *id);
                            // 清除选中状态
                            self.selected_project = None;
                            self.editing_project = None;
                            // 保存到历史
                            self.save_to_history();
                        }
                    }
                    delete_btn.on_hover_text("删除项目");
                    
                    ui.separator();
                    
                    // 保存按钮（使用图标）- 索引2
                    let save_btn = ui.add_sized(
                        [32.0, 28.0],
                        Button::new(
                            RichText::new("💾")
                                .size(14.0)
                        )
                        .fill(if self.toolbar_focus_index == Some(2) { focus_fill } else { theme.surface })
                    );
                    if save_btn.clicked() {
                        self.save_data();
                    }
                    save_btn.on_hover_text("保存 (Ctrl+S)");
                    
                    ui.separator();
                    
                    // 撤销按钮（使用文本图标）- 索引3
                    let undo_btn = ui.add_sized(
                        [50.0, 28.0],
                        Button::new(
                            RichText::new("↩")
                                .size(14.0)
                        )
                        .fill(if self.toolbar_focus_index == Some(3) { focus_fill } else { theme.surface })
                    );
                    if undo_btn.clicked() {
                        self.undo();
                    }
                    undo_btn.on_hover_text("撤销 (Ctrl+Z)");
                    
                    // 重做按钮（使用文本图标）- 索引4
                    let redo_btn = ui.add_sized(
                        [50.0, 28.0],
                        Button::new(
                            RichText::new("↪")
                                .size(14.0)
                        )
                        .fill(if self.toolbar_focus_index == Some(4) { focus_fill } else { theme.surface })
                    );
                    if redo_btn.clicked() {
                        self.redo();
                    }
                    redo_btn.on_hover_text("重做 (Ctrl+Shift+Z)");
                    
                    ui.separator();
                    
                    // 重新布局按钮（使用文本图标）- 索引5
                    let relayout_btn = ui.add_sized(
                        [50.0, 28.0],
                        Button::new(
                            RichText::new("⟳")
                                .size(14.0)
                        )
                        .fill(if self.toolbar_focus_index == Some(5) { focus_fill } else { theme.surface })
                    );
                    if relayout_btn.clicked() {
                        // 只修正位置不正确的项目
                        self.validate_and_fix_project_positions();
                        // 更新编辑中的项目位置
                        if let Some(id) = &self.selected_project {
                            if let Some(project) = self.data.projects.get(id) {
                                if let Some(editing) = &mut self.editing_project {
                                    editing.position = project.position;
                                }
                            }
                        }
                    }
                    relayout_btn.on_hover_text("重新布局（修正位置不正确的项目）");
                    
                    ui.separator();
                    
                    // 放大按钮 - 索引6
                    let zoom_in_btn = ui.add_sized(
                        [32.0, 28.0],
                        Button::new(
                            RichText::new("🔍+")
                                .size(12.0)
                        )
                        .fill(if self.toolbar_focus_index == Some(6) { focus_fill } else { theme.surface })
                    );
                    if zoom_in_btn.clicked() {
                        self.zoom_in();
                    }
                    zoom_in_btn.on_hover_text("放大");
                    
                    // 缩小按钮 - 索引7
                    let zoom_out_btn = ui.add_sized(
                        [32.0, 28.0],
                        Button::new(
                            RichText::new("🔍-")
                                .size(12.0)
                        )
                        .fill(if self.toolbar_focus_index == Some(7) { focus_fill } else { theme.surface })
                    );
                    if zoom_out_btn.clicked() {
                        self.zoom_out();
                    }
                    zoom_out_btn.on_hover_text("缩小");
                    
                    // 重置缩放按钮 - 索引8
                    let zoom_reset_btn = ui.add_sized(
                        [32.0, 28.0],
                        Button::new(
                            RichText::new("⊙")
                                .size(14.0)
                        )
                        .fill(if self.toolbar_focus_index == Some(8) { focus_fill } else { theme.surface })
                    );
                    if zoom_reset_btn.clicked() {
                        self.zoom_reset();
                    }
                    zoom_reset_btn.on_hover_text("重置缩放");
                });
            });

        // 左侧数据表 - VSCode风格侧边栏
        if self.show_project_table {
            SidePanel::left("project_table")
                .resizable(true)
                .default_width(200.0)
                .width_range(150.0..=400.0)
                .frame(Frame::side_top_panel(&ctx.style()).fill(theme.surface).stroke(Stroke::new(1.0, theme.divider)))
                .show(ctx, |ui| {
                    // === 领域管理区域（可折叠） ===
                    // 限制领域区域高度在20到200之间
                    let field_height = self.field_section_height.clamp(20.0, 200.0);
                    
                    // 领域区域容器
                    ui.allocate_ui_with_layout(
                        vec2(ui.available_width(), field_height),
                        Layout::top_down(Align::LEFT),
                        |ui| {
                            ui.horizontal(|ui| {
                                ui.label(
                                    RichText::new("领域")
                                        .size(11.0)
                                        .color(theme.text_secondary)
                                );
                                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                    if ui.small_button("+").clicked() {
                                        let new_id = format!("field_{}", self.data.fields.len() + 1);
                                        let new_field = ResearchField {
                                            id: new_id.clone(),
                                            name: "新领域".to_string(),
                                            description: String::new(),
                                            position: (400.0, 400.0),
                                            radius: 200.0,
                                        };
                                        self.data.fields.insert(new_id, new_field);
                                        self.save_to_history();
                                    }
                                });
                            });
                            ui.add_space(4.0);
                            
                            // 领域列表滚动区域
                            let field_ids_left: Vec<String> = self.data.fields.keys().cloned().collect();
                            let mut fields_to_remove_left: Vec<String> = Vec::new();
                            let mut fields_to_update_left: HashMap<String, String> = HashMap::new();
                            let mut field_reorder: Option<(usize, usize)> = None;  // (from, to)
                            
                            ScrollArea::vertical()
                                .auto_shrink([false; 2])
                                .show(ui, |ui| {
                                    for (idx, field_id) in field_ids_left.iter().enumerate() {
                                        if let Some(field) = self.data.fields.get(field_id) {
                                            let item_rect = ui.available_rect_before_wrap();
                                            let item_height = 24.0;
                                            let item_rect = Rect::from_min_size(
                                                item_rect.min,
                                                vec2(item_rect.width(), item_height)
                                            );
                                            
                                            // 绘制拖拽目标指示线
                                            if let Some(target_idx) = self.field_drag_target_idx {
                                                if target_idx == idx {
                                                    ui.painter().rect_filled(
                                                        Rect::from_min_size(
                                                            pos2(item_rect.min.x, item_rect.min.y - 1.0),
                                                            vec2(item_rect.width(), 2.0)
                                                        ),
                                                        0.0,
                                                        Color32::from_rgb(0, 122, 204)
                                                    );
                                                }
                                            }
                                            
                                            // 绘制拖拽中的背景
                                            let is_dragging = self.dragging_field_idx == Some(idx);
                                            if is_dragging {
                                                ui.painter().rect_filled(
                                                    item_rect,
                                                    Rounding::same(2.0),
                                                    theme.selection,
                                                );
                                            }
                                            
                                            let _response = ui.allocate_ui_at_rect(item_rect, |ui| {
                                                ui.horizontal(|ui| {
                                                    // 行号
                                                    ui.label(
                                                        RichText::new(format!("{:2}.", idx + 1))
                                                            .size(11.0)
                                                            .color(theme.text_secondary)
                                                            .monospace()
                                                    );
                                                    
                                                    let input_width = (ui.available_width() - 55.0).max(40.0);
                                                    
                                                    let mut field_name = field.name.clone();
                                                    let name_response = ui.add(
                                                        TextEdit::singleline(&mut field_name)
                                                            .desired_width(input_width)
                                                    );
                                                    if name_response.changed() {
                                                        fields_to_update_left.insert(field_id.clone(), field_name);
                                                    }
                                                    
                                                    if ui.small_button("×").clicked() {
                                                        fields_to_remove_left.push(field_id.clone());
                                                    }
                                                });
                                            });
                                            
                                            // 处理拖拽
                                            let drag_response = ui.interact(item_rect, ui.id().with(("field_drag", idx)), Sense::drag());
                                            
                                            if drag_response.drag_started() {
                                                self.dragging_field_idx = Some(idx);
                                            }
                                            
                                            if drag_response.dragged() && self.dragging_field_idx.is_some() {
                                                ctx.set_cursor_icon(egui::CursorIcon::Grabbing);
                                            }
                                            
                                            // 检测拖拽目标位置
                                            if self.dragging_field_idx.is_some() {
                                                if let Some(pointer_pos) = ui.input(|i| i.pointer.hover_pos()) {
                                                    if item_rect.contains(pointer_pos) {
                                                        let relative_y = pointer_pos.y - item_rect.min.y;
                                                        if relative_y < item_height / 2.0 {
                                                            self.field_drag_target_idx = Some(idx);
                                                        } else {
                                                            self.field_drag_target_idx = Some(idx + 1);
                                                        }
                                                    }
                                                }
                                            }
                                            
                                            if drag_response.drag_stopped() {
                                                if let (Some(from_idx), Some(to_idx)) = (self.dragging_field_idx, self.field_drag_target_idx) {
                                                    if from_idx != to_idx && from_idx + 1 != to_idx {
                                                        field_reorder = Some((from_idx, to_idx));
                                                    }
                                                }
                                                self.dragging_field_idx = None;
                                                self.field_drag_target_idx = None;
                                            }
                                            
                                            ui.add_space(2.0);
                                        }
                                    }
                                    
                                    // 在最后一个项目后绘制拖拽目标线
                                    if let Some(target_idx) = self.field_drag_target_idx {
                                        if target_idx == field_ids_left.len() {
                                            let rect = ui.available_rect_before_wrap();
                                            ui.painter().rect_filled(
                                                Rect::from_min_size(
                                                    pos2(rect.min.x, rect.min.y - 1.0),
                                                    vec2(rect.width(), 2.0)
                                                ),
                                                0.0,
                                                Color32::from_rgb(0, 122, 204)
                                            );
                                        }
                                    }
                                });
                            
                            // 处理领域重排序
                            if let Some((from_idx, to_idx)) = field_reorder {
                                // 获取所有键值对
                                let entries: Vec<_> = self.data.fields.drain(..).collect();
                                let mut new_entries = Vec::with_capacity(entries.len());
                                
                                // 重新排列
                                let actual_to = if to_idx > from_idx { to_idx - 1 } else { to_idx };
                                for (i, entry) in entries.iter().enumerate() {
                                    if i == from_idx {
                                        continue;
                                    }
                                    if i == actual_to && to_idx <= from_idx {
                                        new_entries.push(entries[from_idx].clone());
                                    }
                                    new_entries.push(entry.clone());
                                    if i == actual_to && to_idx > from_idx {
                                        new_entries.push(entries[from_idx].clone());
                                    }
                                }
                                if actual_to >= entries.len() - 1 && to_idx > from_idx {
                                    new_entries.push(entries[from_idx].clone());
                                }
                                if new_entries.len() < entries.len() {
                                    // 如果移动到最后
                                    new_entries.push(entries[from_idx].clone());
                                }
                                
                                // 重建IndexMap
                                for (k, v) in new_entries {
                                    self.data.fields.insert(k, v);
                                }
                                // 重新计算领域布局
                                self.adjust_field_layout();
                                // 重新计算所有项目位置（领域位置变了），加入随机抖动避免重叠
                                self.recalculate_all_project_positions_with_jitter();
                                // 二次检验并修正重叠
                                self.validate_and_fix_project_positions();
                                self.save_to_history();
                            }
                            
                            // 更新领域名称
                            if !fields_to_update_left.is_empty() {
                                for (fid, new_name) in fields_to_update_left {
                                    if let Some(f) = self.data.fields.get_mut(&fid) {
                                        f.name = new_name;
                                    }
                                }
                                self.save_to_history();
                            }
                            
                            // 删除领域
                            if !fields_to_remove_left.is_empty() {
                                for fid in fields_to_remove_left {
                                    for project in self.data.projects.values_mut() {
                                        project.field_ids.retain(|id| id != &fid);
                                    }
                                    self.data.fields.remove(&fid);
                                }
                                self.save_to_history();
                            }
                        }
                    );
                    
                    // 可拖拽的分隔线
                    let separator_rect = ui.available_rect_before_wrap();
                    let separator_rect = Rect::from_min_size(
                        separator_rect.min,
                        vec2(separator_rect.width(), 8.0)
                    );
                    
                    let separator_response = ui.allocate_rect(separator_rect, Sense::drag());
                    
                    // 绘制分隔线（拖拽时高亮）
                    let separator_color = if separator_response.hovered() || separator_response.dragged() {
                        Color32::from_rgb(100, 150, 255)
                    } else {
                        theme.divider
                    };
                    ui.painter().rect_filled(
                        Rect::from_min_size(
                            pos2(separator_rect.min.x, separator_rect.center().y - 1.0),
                            vec2(separator_rect.width(), 2.0)
                        ),
                        0.0,
                        separator_color
                    );
                    
                    // 处理拖拽
                    if separator_response.dragged() {
                        self.field_section_height += separator_response.drag_delta().y;
                        self.field_section_height = self.field_section_height.clamp(20.0, 200.0);
                    }
                    
                    // 改变鼠标光标
                    if separator_response.hovered() || separator_response.dragged() {
                        ctx.set_cursor_icon(egui::CursorIcon::ResizeVertical);
                    }
                    
                    ui.add_space(4.0);
                    
                    // === 项目列表区域（中间） ===
                    ui.horizontal(|ui| {
                        ui.label(
                            RichText::new("项目")
                                .size(11.0)
                                .color(theme.text_secondary)
                        );
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            if ui.small_button("+").clicked() {
                                self.create_new_project_shortcut();
                            }
                        });
                    });
                    ui.add_space(4.0);
                    ui.separator();
                    ui.add_space(4.0);
                    
                    ScrollArea::vertical()
                        .auto_shrink([false; 2])
                        .show(ui, |ui| {
                            // 显示项目列表 - VSCode文件树风格
                            for (idx, (id, project)) in self.data.projects.iter().enumerate() {
                                let is_selected = self.selected_project.as_ref() == Some(id);
                                
                                // 绘制背景
                                let item_rect = ui.available_rect_before_wrap();
                                let item_height = 24.0;
                                let item_rect = Rect::from_min_size(
                                    item_rect.min,
                                    vec2(item_rect.width(), item_height)
                                );
                                
                                if is_selected {
                                    ui.painter().rect_filled(
                                        item_rect,
                                        Rounding::same(0.0),
                                        theme.selection,
                                    );
                                } else if item_rect.contains(ui.input(|i| i.pointer.hover_pos()).unwrap_or_default()) {
                                    ui.painter().rect_filled(
                                        item_rect,
                                        Rounding::same(0.0),
                                        theme.surface_hover,
                                    );
                                }
                                
                                // 项目名称（带行号）
                                let response = ui.allocate_ui_at_rect(item_rect, |ui| {
                                    ui.horizontal(|ui| {
                                        // 行号
                                        ui.label(
                                            RichText::new(format!("{:2}.", idx + 1))
                                                .size(11.0)
                                                .color(theme.text_secondary)
                                                .monospace()
                                        );
                                        ui.label(
                                            RichText::new(&project.name)
                                                .size(13.0)
                                                .color(if is_selected { Color32::WHITE } else { theme.text_primary })
                                        );
                                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                            // 状态标签
                                            let status_color = project.status.color();
                                            ui.label(
                                                RichText::new(project.status.name())
                                                    .size(10.0)
                                                    .color(Color32::WHITE)
                                                    .background_color(status_color)
                                            );
                                        });
                                    });
                                });
                                
                                if response.response.clicked() {
                                    self.selected_project = Some(id.clone());
                                    self.editing_project = Some(project.clone());
                                }
                            }
                        });
                });
        }

        // 右侧属性编辑面板 - VSCode风格
        // 注意：属性面板在可视化面板之后渲染，确保左边界贴着可视化面板
        if self.show_property_panel {
            let panel_response = SidePanel::right("property_panel")
                .resizable(true)
                .default_width(self.property_panel_width)
                .width_range(200.0..=400.0)
                .frame(Frame::side_top_panel(&ctx.style()).fill(theme.surface).stroke(Stroke::new(1.0, theme.divider)))
                .show(ctx, |ui| {
                    // 记录当前面板宽度
                    self.property_panel_width = ui.available_width();
                    // 标题栏
                    ui.horizontal(|ui| {
                        ui.label(
                            RichText::new("属性")
                                .size(11.0)
                                .color(theme.text_secondary)
                        );
                    });
                    ui.add_space(4.0);
                    ui.separator();
                    ui.add_space(4.0);

                    // 先克隆project，避免借用冲突
                    let project_clone = self.editing_project.clone();
                    if let Some(project) = project_clone {
                        let mut project_mut = project.clone();
                        
                        ScrollArea::vertical()
                            .auto_shrink([false; 2])
                            .show(ui, |ui| {
                                ui.vertical(|ui| {
                                    ui.label(
                                        RichText::new("项目属性")
                                            .size(12.0)
                                            .color(theme.text_secondary)
                                    );
                                    ui.add_space(8.0);

                                    let mut project_changed = false;
                                    
                                    ui.vertical(|ui| {
                                        ui.label(
                                            RichText::new("名称").size(11.0).color(theme.text_secondary)
                                        );
                                        ui.add_space(4.0);
                                        if ui.add(
                                            TextEdit::singleline(&mut project_mut.name)
                                                .desired_width(ui.available_width())
                                        ).changed() {
                                            project_changed = true;
                                        }
                                    });

                                    ui.add_space(12.0);
                                    
                                    ui.vertical(|ui| {
                                        ui.label(
                                            RichText::new("描述").size(11.0).color(theme.text_secondary)
                                        );
                                        ui.add_space(4.0);
                                        if ui.add(
                                            TextEdit::multiline(&mut project_mut.description)
                                                .desired_width(ui.available_width())
                                                .desired_rows(4)
                                        ).changed() {
                                            project_changed = true;
                                        }
                                    });
                                    
                                    ui.add_space(12.0);
                                    
                                    ui.vertical(|ui| {
                                        ui.label(
                                            RichText::new("状态").size(11.0).color(theme.text_secondary)
                                        );
                                        ui.add_space(4.0);
                                        let mut status_changed = false;
                                        ComboBox::from_id_source("status")
                                            .selected_text(project_mut.status.name())
                                            .width(150.0) // 固定宽度
                                            .show_ui(ui, |ui| {
                                        if ui.selectable_value(
                                            &mut project_mut.status,
                                            ProjectStatus::Published,
                                            ProjectStatus::Published.name(),
                                        ).clicked() {
                                            status_changed = true;
                                        }
                                        if ui.selectable_value(
                                            &mut project_mut.status,
                                            ProjectStatus::Submitted,
                                            ProjectStatus::Submitted.name(),
                                        ).clicked() {
                                            status_changed = true;
                                        }
                                        if ui.selectable_value(
                                            &mut project_mut.status,
                                            ProjectStatus::HighPriority,
                                            ProjectStatus::HighPriority.name(),
                                        ).clicked() {
                                            status_changed = true;
                                        }
                                        if ui.selectable_value(
                                            &mut project_mut.status,
                                            ProjectStatus::SteadyProgress,
                                            ProjectStatus::SteadyProgress.name(),
                                        ).clicked() {
                                            status_changed = true;
                                        }
                                        if ui.selectable_value(
                                            &mut project_mut.status,
                                            ProjectStatus::ToBeStarted,
                                            ProjectStatus::ToBeStarted.name(),
                                        ).clicked() {
                                            status_changed = true;
                                        }
                                            });
                                        if status_changed {
                                            project_changed = true;
                                        }
                                    });
                                    
                                    ui.add_space(12.0);
                                    
                                    ui.vertical(|ui| {
                                        ui.label(
                                            RichText::new("完成度").size(11.0).color(theme.text_secondary)
                                        );
                                        ui.add_space(4.0);
                                        let mut percentage = project_mut.completion_percentage;
                                        if ui.add(egui::Slider::new(&mut percentage, 0.0..=100.0)
                                            .suffix("%")).changed() {
                                            project_mut.completion_percentage = percentage;
                                            project_changed = true;
                                        }
                                    });
                                    
                                    // 如果项目属性发生变化，实时更新
                                    if project_changed {
                                        // 更新编辑中的项目
                                        self.editing_project = Some(project_mut.clone());
                                        // 同步到实际项目数据
                                        if let Some(id) = &self.selected_project {
                                            if let Some(p) = self.data.projects.get_mut(id) {
                                                *p = project_mut.clone();
                                            }
                                            // 保存到历史
                                            self.save_to_history();
                                        }
                                    }
                                    
                                    ui.add_space(12.0);
                                    
                                    let mut field_changed = false;
                                    let selected_project_id = self.selected_project.clone();
                                    
                                    ui.vertical(|ui| {
                                        ui.label(
                                            RichText::new("所属领域").size(11.0).color(theme.text_secondary)
                                        );
                                        ui.add_space(4.0);
                                        let field_ids: Vec<String> = self.data.fields.keys().cloned().collect();
                                        for field_id in field_ids {
                                            let field_name = self.data.fields.get(&field_id).map(|f| f.name.clone()).unwrap_or_default();
                                            let mut is_selected = project_mut.field_ids.contains(&field_id);
                                            let checkbox_response = ui.checkbox(&mut is_selected, &field_name);
                                            if checkbox_response.changed() {
                                                if is_selected {
                                                    if !project_mut.field_ids.contains(&field_id) {
                                                        project_mut.field_ids.push(field_id.clone());
                                                    }
                                                } else {
                                                    project_mut.field_ids.retain(|id| id != &field_id);
                                                }
                                                field_changed = true;
                                                // 立即更新编辑中的项目
                                                self.editing_project = Some(project_mut.clone());
                                                // 同步到实际项目数据
                                                if let Some(id) = &selected_project_id {
                                                    if let Some(p) = self.data.projects.get_mut(id) {
                                                        *p = project_mut.clone();
                                                    }
                                                }
                                            }
                                        }
                                    });
                                    
                                    // 勾选领域后自动更新项目位置并解决重叠
                                    if field_changed {
                                        if let Some(id) = &selected_project_id {
                                            let new_position = self.calculate_project_position(&project_mut);
                                            project_mut.position = new_position;
                                            // 更新编辑中的项目
                                            self.editing_project = Some(project_mut.clone());
                                            // 更新到实际项目
                                            if let Some(p) = self.data.projects.get_mut(id) {
                                                p.position = new_position;
                                            }
                                            // 自动验证并修正所有项目位置（物理引擎）
                                            self.validate_and_fix_project_positions();
                                            // 更新编辑中的项目位置（可能被物理引擎调整）
                                            if let Some(p) = self.data.projects.get(id) {
                                                project_mut.position = p.position;
                                                self.editing_project = Some(project_mut.clone());
                                            }
                                        }
                                    }

                                    ui.add_space(16.0);
                                    ui.separator();
                                    ui.add_space(12.0);
                                    
                                    // 项目关系管理
                                    ui.label(
                                        RichText::new("项目关系")
                                            .size(12.0)
                                            .color(theme.text_secondary)
                                    );
                                    ui.add_space(8.0);
                                    
                                    // 显示当前项目的关系（使用滚动区域）
                                    let project_id = self.selected_project.clone();
                                    let mut relations_to_remove = Vec::new();
                                    
                                    // 先收集需要显示的关系信息，避免借用冲突
                                    let mut relation_info: Vec<(usize, String, String, bool)> = Vec::new();
                                    for (idx, relation) in self.data.relations.iter().enumerate() {
                                        if let Some(ref pid) = project_id {
                                            if relation.from_id == *pid || relation.to_id == *pid {
                                                let from_name = self.data.projects.get(&relation.from_id)
                                                    .map(|p| p.name.clone())
                                                    .unwrap_or_else(|| "未知".to_string());
                                                let to_name = self.data.projects.get(&relation.to_id)
                                                    .map(|p| p.name.clone())
                                                    .unwrap_or_else(|| "未知".to_string());
                                                let is_outgoing = relation.from_id == *pid;
                                                relation_info.push((idx, from_name, to_name, is_outgoing));
                                            }
                                        }
                                    }
                                    
                                    // 使用滚动区域显示关系列表
                                    ScrollArea::vertical().show(ui, |ui| {
                            // 显示关系编辑界面
                            let mut needs_save_after = false;
                            for (idx, from_name, to_name, is_outgoing) in relation_info {
                                if let Some(relation) = self.data.relations.get_mut(idx) {
                                    let is_expanded = self.expanded_relations.get(&idx).copied().unwrap_or(false);
                                    
                                    // 关系标题行（折叠状态）
                                    ui.horizontal(|ui| {
                                        // 展开/折叠按钮
                                        let expand_text = if is_expanded { "▼" } else { "▶" };
                                        if ui.button(expand_text).clicked() {
                                            self.expanded_relations.insert(idx, !is_expanded);
                                        }
                                        
                                        // 显示关系方向（限制文本宽度）
                                        let direction_text = if is_outgoing {
                                            format!("→ {}", to_name)
                                        } else {
                                            format!("← {}", from_name)
                                        };
                                        // 如果文本太长，截断（使用字符数限制更可靠）
                                        let max_chars = 15; // 限制字符数
                                        let truncated_text = if direction_text.chars().count() > max_chars {
                                            let mut chars: Vec<char> = direction_text.chars().take(max_chars).collect();
                                            chars.push('…');
                                            chars.into_iter().collect::<String>()
                                        } else {
                                            direction_text
                                        };
                                        // 使用label并限制宽度
                                        ui.label(truncated_text);
                                        
                                        // 显示标签（紧凑显示，不撑开面板）
                                        if !relation.tags.is_empty() {
                                            // 只显示第一个标签，紧跟在方向文字后面
                                            if let Some(first_tag) = relation.tags.first() {
                                                ui.label(
                                                    RichText::new(first_tag)
                                                        .size(10.0)
                                                        .background_color(Color32::from_rgb(200, 200, 200))
                                                );
                                            }
                                            if relation.tags.len() > 1 {
                                                ui.label(RichText::new(format!("+{}", relation.tags.len() - 1)).size(10.0));
                                            }
                                        }
                                        
                                        // 删除按钮
                                        if ui.small_button("删除").clicked() {
                                            relations_to_remove.push(idx);
                                        }
                                    });
                                    
                                    // 展开的详细设置
                                    if is_expanded {
                                        ui.group(|ui| {
                                            ui.add_space(5.0);
                                            
                                            // 目标项目选择（仅当是出向关系时）
                                            let mut to_id_changed = false;
                                            let mut new_to_id = relation.to_id.clone();
                                            if is_outgoing {
                                                ui.horizontal(|ui| {
                                                    ui.label("目标项目: ");
                                                    ComboBox::from_id_source(format!("to_project_{}", idx))
                                                        .selected_text(to_name)
                                                        .width(120.0) // 固定宽度
                                                        .show_ui(ui, |ui| {
                                                            for (id, proj) in &self.data.projects {
                                                                if *id != relation.from_id {
                                                                    if ui.selectable_label(
                                                                        relation.to_id == *id,
                                                                        &proj.name
                                                                    ).clicked() {
                                                                        new_to_id = id.clone();
                                                                        to_id_changed = true;
                                                                    }
                                                                }
                                                            }
                                                        });
                                                });
                                                if to_id_changed {
                                                    relation.to_id = new_to_id;
                                                    needs_save_after = true;
                                                }
                                            } else {
                                                ui.label(format!("源项目: {}", from_name));
                                            }
                                            
                                            ui.add_space(5.0);
                                            
                                            // 关系类型（虚实）
                                            let mut relation_type_changed = false;
                                            let mut new_relation_type = relation.relation_type;
                                            ui.horizontal(|ui| {
                                                ui.label("类型: ");
                                                if ui.radio_value(&mut new_relation_type, RelationType::Direct, "实线").clicked() {
                                                    relation_type_changed = true;
                                                }
                                                if ui.radio_value(&mut new_relation_type, RelationType::Indirect, "虚线").clicked() {
                                                    relation_type_changed = true;
                                                }
                                            });
                                            if relation_type_changed {
                                                relation.relation_type = new_relation_type;
                                                needs_save_after = true;
                                            }
                                            
                                            ui.add_space(5.0);
                                            
                                            // 线宽
                                            let mut width_changed = false;
                                            let mut new_width = relation.width;
                                            ui.horizontal(|ui| {
                                                ui.label("线宽: ");
                                                if ui.add(egui::Slider::new(&mut new_width, 0.5..=10.0)
                                                    .step_by(0.5)
                                                    .suffix(" px")).changed() {
                                                    width_changed = true;
                                                }
                                            });
                                            if width_changed {
                                                relation.width = new_width;
                                                needs_save_after = true;
                                            }
                                            
                                            ui.add_space(5.0);
                                            
                                            // 颜色
                                            let mut color_changed = false;
                                            let mut new_color = relation.color;
                                            let mut color_rgba = [
                                                relation.color[0] as f32 / 255.0,
                                                relation.color[1] as f32 / 255.0,
                                                relation.color[2] as f32 / 255.0,
                                                relation.color[3] as f32 / 255.0,
                                            ];
                                            ui.horizontal(|ui| {
                                                ui.label("颜色: ");
                                                if ui.color_edit_button_rgba_unmultiplied(&mut color_rgba).changed() {
                                                    new_color = [
                                                        (color_rgba[0] * 255.0) as u8,
                                                        (color_rgba[1] * 255.0) as u8,
                                                        (color_rgba[2] * 255.0) as u8,
                                                        (color_rgba[3] * 255.0) as u8,
                                                    ];
                                                    color_changed = true;
                                                }
                                            });
                                            if color_changed {
                                                relation.color = new_color;
                                                needs_save_after = true;
                                            }
                                            
                                            ui.add_space(5.0);
                                            
                                            // 标签选择
                                            ui.label("代表意义（标签）: ");
                                            let mut tags_to_remove = Vec::new();
                                            ui.horizontal_wrapped(|ui| {
                                                ui.set_max_width(200.0); // 固定最大宽度
                                                // 显示已有标签
                                                for (tag_idx, tag) in relation.tags.iter().enumerate() {
                                                    if ui.small_button(format!("{} ✕", tag)).clicked() {
                                                        tags_to_remove.push(tag_idx);
                                                    }
                                                }
                                            });
                                            
                                            // 删除标签
                                            for tag_idx in tags_to_remove.iter().rev() {
                                                relation.tags.remove(*tag_idx);
                                                needs_save_after = true;
                                            }
                                            
                                            ui.add_space(5.0);
                                            
                                            // 添加标签（统一的输入框）
                                            ui.horizontal(|ui| {
                                                ui.label("添加标签: ");
                                                // 获取或初始化输入框内容
                                                let tag_input = self.relation_tag_inputs.entry(idx).or_insert_with(String::new);
                                                let response = ui.add(
                                                    TextEdit::singleline(tag_input)
                                                        .hint_text("输入标签名或选择现有标签...")
                                                        .desired_width(80.0) // 固定宽度
                                                );
                                                
                                                // 显示标签下拉列表（当输入框获得焦点时）
                                                if response.has_focus() {
                                                    let popup_id = egui::Id::new(format!("tag_popup_{}", idx));
                                                    egui::popup::popup_below_widget(ui, popup_id, &response, |ui| {
                                                        ui.set_width(response.rect.width().max(200.0));
                                                        ScrollArea::vertical().max_height(200.0).show(ui, |ui| {
                                                            // 显示已有标签（未添加到当前关系的）
                                                            let mut has_tags = false;
                                                            if !self.data.relation_tags.is_empty() {
                                                                for tag in &self.data.relation_tags {
                                                                    if !relation.tags.contains(tag) {
                                                                        has_tags = true;
                                                                        if ui.selectable_label(false, tag).clicked() {
                                                                            relation.tags.push(tag.clone());
                                                                            needs_save_after = true;
                                                                            // 清空输入框
                                                                            tag_input.clear();
                                                                            ui.memory_mut(|mem| mem.close_popup());
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                            if !has_tags {
                                                                ui.label(RichText::new("暂无可用标签").size(11.0).color(theme.text_secondary));
                                                            }
                                                        });
                                                    });
                                                }
                                                
                                                // 处理回车键创建新标签 - 类似飞书的效果
                                                if response.has_focus() {
                                                    if ctx.input(|i| i.key_pressed(Key::Enter)) && !tag_input.trim().is_empty() {
                                                        let tag_to_add = tag_input.trim().to_string();
                                                        if !tag_to_add.is_empty() {
                                                            // 如果标签不存在于全局标签库，则添加
                                                            if !self.data.relation_tags.contains(&tag_to_add) {
                                                                self.data.relation_tags.push(tag_to_add.clone());
                                                            }
                                                            // 如果标签不存在于当前关系，则添加
                                                            if !relation.tags.contains(&tag_to_add) {
                                                                relation.tags.push(tag_to_add);
                                                                needs_save_after = true;
                                                            }
                                                            // 清空输入框
                                                            tag_input.clear();
                                                            ui.memory_mut(|mem| mem.close_popup());
                                                            // 请求重新绘制
                                                            ctx.request_repaint();
                                                        }
                                                    }
                                                }
                                                // 也处理失去焦点时的回车（如果输入框有内容）
                                                if response.lost_focus() && !tag_input.trim().is_empty() {
                                                    let tag_to_add = tag_input.trim().to_string();
                                                    if !tag_to_add.is_empty() {
                                                        // 如果标签不存在于全局标签库，则添加
                                                        if !self.data.relation_tags.contains(&tag_to_add) {
                                                            self.data.relation_tags.push(tag_to_add.clone());
                                                        }
                                                        // 如果标签不存在于当前关系，则添加
                                                        if !relation.tags.contains(&tag_to_add) {
                                                            relation.tags.push(tag_to_add);
                                                            needs_save_after = true;
                                                        }
                                                        // 清空输入框
                                                        tag_input.clear();
                                                        ui.memory_mut(|mem| mem.close_popup());
                                                    }
                                                }
                                            });
                                        });
                                        
                                        ui.add_space(5.0);
                                    }
                                }
                            }
                            
                                        // 统一保存更改
                                        if needs_save_after {
                                            self.save_to_history();
                                            return; // 提前返回，下一帧再渲染
                                        }
                                    });
                                    
                                    // 删除关系（在循环外处理，避免借用冲突）
                                    if !relations_to_remove.is_empty() {
                                        let to_remove = relations_to_remove;
                                        for idx in to_remove.iter().rev() {
                                            self.data.relations.remove(*idx);
                                            self.expanded_relations.remove(idx);
                                            self.relation_tag_inputs.remove(idx);
                                        }
                                        self.save_to_history();
                                        return; // 提前返回，下一帧再渲染
                                    }
                                    
                                    ui.add_space(8.0);
                                    if ui.add_sized(
                                        [ui.available_width(), 28.0],
                                        Button::new(
                                            RichText::new("+ 添加关系")
                                                .size(12.0)
                                                .color(theme.text_primary)
                                        )
                                        .fill(theme.surface)
                                    ).clicked() {
                                        if let Some(id) = &project_id {
                                            let new_relation = ProjectRelation {
                                                from_id: id.clone(),
                                                to_id: String::new(),
                                                relation_type: RelationType::Direct,
                                                tags: Vec::new(),
                                                color: default_relation_color(),
                                                width: default_relation_width(),
                                            };
                                            self.data.relations.push(new_relation);
                                            self.save_to_history();
                                            return; // 提前返回，下一帧再渲染
                                        }
                                    }
                                });
                            });
                    } else {
                        // 没有选中项目时，显示提示信息
                        ui.vertical_centered(|ui| {
                            ui.add_space(20.0);
                            ui.label(
                                RichText::new("请选择一个项目")
                                    .size(12.0)
                                    .color(theme.text_secondary)
                            );
                        });
                    }
                });
        }

        // 中央可视化区域 - VSCode风格
        if self.show_visualization {
            CentralPanel::default()
                .frame(Frame::none().fill(theme.background))
                .show(ctx, |ui| {
                    // 标题栏
                    ui.horizontal(|ui| {
                        ui.label(
                            RichText::new("可视化")
                                .size(11.0)
                                .color(theme.text_secondary)
                        );
                    });
                    ui.add_space(4.0);
                    ui.separator();
                    ui.add_space(4.0);

                // 获取可用区域（排除标题和分隔符）
                let available_rect = ui.available_rect_before_wrap();
                let response = ui.allocate_response(available_rect.size(), Sense::click_and_drag());
                
                // 绘制可视化
                let painter = ui.painter();
                let rect = response.rect;
                
                // 使用设置中的背景颜色
                let bg_color = Color32::from_rgba_unmultiplied(
                    self.settings.visualization_bg_color[0],
                    self.settings.visualization_bg_color[1],
                    self.settings.visualization_bg_color[2],
                    self.settings.visualization_bg_color[3],
                );
                painter.rect_filled(rect, 0.0, bg_color);

                // 计算缩放比例，使可视化图适应窗口大小
                // 获取所有项目的位置范围
                let mut min_x = f32::MAX;
                let mut max_x = f32::MIN;
                let mut min_y = f32::MAX;
                let mut max_y = f32::MIN;
                let mut has_content = false;

                // 考虑所有领域的位置和半径
                for field in self.data.fields.values() {
                    min_x = min_x.min(field.position.0 - field.radius);
                    max_x = max_x.max(field.position.0 + field.radius);
                    min_y = min_y.min(field.position.1 - field.radius);
                    max_y = max_y.max(field.position.1 + field.radius);
                    has_content = true;
                }

                // 考虑所有项目的位置
                for project in self.data.projects.values() {
                    min_x = min_x.min(project.position.0 - project.radius);
                    max_x = max_x.max(project.position.0 + project.radius);
                    min_y = min_y.min(project.position.1 - project.radius);
                    max_y = max_y.max(project.position.1 + project.radius);
                    has_content = true;
                }

                // 计算内容范围和缩放
                let (content_width, content_height, content_center_x, content_center_y, auto_scale) = if has_content {
                    let width = (max_x - min_x).max(100.0);
                    let height = (max_y - min_y).max(100.0);
                    let center_x = (min_x + max_x) / 2.0;
                    let center_y = (min_y + max_y) / 2.0;
                    
                    // 计算适合窗口的缩放比例（留出边距）
                    let margin = 40.0;
                    let scale_x = (rect.width() - margin * 2.0) / width;
                    let scale_y = (rect.height() - margin * 2.0) / height;
                    let scale = scale_x.min(scale_y).min(2.0).max(0.1); // 限制缩放范围
                    
                    (width, height, center_x, center_y, scale)
                } else {
                    // 没有内容时使用默认值
                    (800.0, 600.0, 400.0, 400.0, 1.0)
                };

                // 计算偏移，使内容居中
                let window_center_x = rect.center().x;
                let window_center_y = rect.center().y;
                let offset_x = window_center_x - content_center_x * auto_scale * self.visualization_zoom;
                let offset_y = window_center_y - content_center_y * auto_scale * self.visualization_zoom;

                // 绘制研究领域（大圈）- 只绘制有项目的领域
                for field in self.data.fields.values() {
                    // 检查是否有项目属于该领域
                    let has_projects = self.data.projects.values().any(|p| p.field_ids.contains(&field.id));
                    if !has_projects {
                        continue; // 跳过没有项目的领域
                    }
                    
                    let center = pos2(
                        offset_x + field.position.0 * auto_scale * self.visualization_zoom
                            + self.visualization_offset.x,
                        offset_y + field.position.1 * auto_scale * self.visualization_zoom
                            + self.visualization_offset.y,
                    );
                    let radius = field.radius * auto_scale * self.visualization_zoom;

                    // 绘制透明圆圈（只绘制边框，不填充）
                    painter.circle_stroke(center, radius, (self.settings.field_border_width, Color32::GRAY));

                    // 绘制领域名称 - 确保文字在外侧，避免重叠
                    // 计算文字位置，确保在不同角度，避免全部在上方
                    // 找到与其他领域圆圈最近的交点，在相反方向放置文字
                    let mut best_angle = -std::f32::consts::PI / 2.0; // 默认上方
                    let mut min_distance = f32::MAX;
                    
                    // 检查与其他领域圆圈的距离（使用原始坐标，因为我们需要计算相对位置）
                    let field_center_scaled = pos2(
                        offset_x + field.position.0 * auto_scale * self.visualization_zoom + self.visualization_offset.x,
                        offset_y + field.position.1 * auto_scale * self.visualization_zoom + self.visualization_offset.y,
                    );
                    
                    for other_field in self.data.fields.values() {
                        if other_field.id != field.id {
                            let other_center_scaled = pos2(
                                offset_x + other_field.position.0 * auto_scale * self.visualization_zoom + self.visualization_offset.x,
                                offset_y + other_field.position.1 * auto_scale * self.visualization_zoom + self.visualization_offset.y,
                            );
                            let other_radius_scaled = other_field.radius * auto_scale * self.visualization_zoom;
                            
                            let dx = other_center_scaled.x - field_center_scaled.x;
                            let dy = other_center_scaled.y - field_center_scaled.y;
                            let distance = (dx * dx + dy * dy).sqrt();
                            
                            // 如果两个圆圈有交集或很接近，计算角度
                            if distance < (radius + other_radius_scaled) * 1.5 {
                                let angle = dy.atan2(dx);
                                
                                // 如果这个角度对应的位置更外侧，使用它
                                if distance < min_distance {
                                    min_distance = distance;
                                    // 文字应该在相反方向（远离其他领域的方向）
                                    best_angle = angle + std::f32::consts::PI;
                                }
                            }
                        }
                    }
                    
                    // 计算文字位置（在圆圈外侧，距离圆心 radius + 25 的位置）
                    let text_distance = radius + 25.0;
                    let mut text_x = center.x + text_distance * best_angle.cos();
                    let mut text_y = center.y + text_distance * best_angle.sin();
                    
                    // 估算文字尺寸（每个字符约10像素宽，高度约20像素）
                    let text_width = field.name.chars().count() as f32 * 10.0;
                    let text_height = 20.0;
                    let half_width = text_width / 2.0;
                    let half_height = text_height / 2.0;
                    
                    // 确保文字不超出可视化窗口边界
                    let margin = 5.0;
                    text_x = text_x.clamp(rect.left() + half_width + margin, rect.right() - half_width - margin);
                    text_y = text_y.clamp(rect.top() + half_height + margin, rect.bottom() - half_height - margin);
                    
                    // 确保文字不进入圆圈内（检查文字中心到圆心距离）
                    let dx = text_x - center.x;
                    let dy = text_y - center.y;
                    let dist_to_center = (dx * dx + dy * dy).sqrt();
                    let min_dist = radius + half_height + 5.0;  // 至少在圆圈外 + 文字半高 + 5像素
                    if dist_to_center < min_dist && dist_to_center > 0.0 {
                        // 将文字推到圆圈外
                        let scale = min_dist / dist_to_center;
                        text_x = center.x + dx * scale;
                        text_y = center.y + dy * scale;
                        // 再次检查边界
                        text_x = text_x.clamp(rect.left() + half_width + margin, rect.right() - half_width - margin);
                        text_y = text_y.clamp(rect.top() + half_height + margin, rect.bottom() - half_height - margin);
                    }
                    
                    painter.text(
                        pos2(text_x, text_y),
                        Align2::CENTER_CENTER,
                        &field.name,
                        FontId::proportional(16.0),
                        Color32::BLACK,
                    );
                }

                // 绘制项目关系（箭头）
                for relation in &self.data.relations {
                    if let (Some(from), Some(to)) = (
                        self.data.projects.get(&relation.from_id),
                        self.data.projects.get(&relation.to_id),
                    ) {
                        let from_pos = pos2(
                            offset_x + from.position.0 * auto_scale * self.visualization_zoom
                                + self.visualization_offset.x,
                            offset_y + from.position.1 * auto_scale * self.visualization_zoom
                                + self.visualization_offset.y,
                        );
                        let to_pos = pos2(
                            offset_x + to.position.0 * auto_scale * self.visualization_zoom
                                + self.visualization_offset.x,
                            offset_y + to.position.1 * auto_scale * self.visualization_zoom
                                + self.visualization_offset.y,
                        );

                        // 使用关系设置的颜色和宽度
                        let color = Color32::from_rgba_unmultiplied(
                            relation.color[0],
                            relation.color[1],
                            relation.color[2],
                            relation.color[3],
                        );
                        // 绘制箭头
                        let dir = (to_pos - from_pos).normalized();
                        let from_radius_scaled = from.radius * auto_scale * self.visualization_zoom;
                        let to_radius_scaled = to.radius * auto_scale * self.visualization_zoom;
                        let arrow_start = from_pos + dir * from_radius_scaled;
                        let arrow_end = to_pos - dir * to_radius_scaled;

                        let stroke = match relation.relation_type {
                            RelationType::Direct => {
                                // 实线：直接绘制
                                let stroke = Stroke::new(relation.width, color);
                                painter.line_segment([arrow_start, arrow_end], stroke);
                                stroke
                            }
                            RelationType::Indirect => {
                                // 虚线：手动绘制多个小线段
                                let stroke = Stroke::new(relation.width * 0.7, color);
                                let dash_length: f32 = 5.0;
                                let gap_length: f32 = 5.0;
                                let total_length = (arrow_end - arrow_start).length();
                                let mut current_pos = arrow_start;
                                let mut distance: f32 = 0.0;
                                
                                while distance < total_length {
                                    let remaining = total_length - distance;
                                    let segment_length = dash_length.min(remaining);
                                    let next_pos = current_pos + dir * segment_length;
                                    painter.line_segment([current_pos, next_pos], stroke);
                                    
                                    distance += segment_length + gap_length;
                                    current_pos = arrow_start + dir * distance.min(total_length);
                                    
                                    if distance >= total_length {
                                        break;
                                    }
                                }
                                stroke
                            }
                        };

                        // 绘制箭头头部
                        let arrow_size = 10.0;
                        let arrow_dir = (arrow_end - arrow_start).normalized();
                        let perp = vec2(-arrow_dir.y, arrow_dir.x);
                        let arrow_tip1 = arrow_end - arrow_dir * arrow_size + perp * arrow_size * 0.5;
                        let arrow_tip2 = arrow_end - arrow_dir * arrow_size - perp * arrow_size * 0.5;
                        painter.line_segment([arrow_end, arrow_tip1], stroke);
                        painter.line_segment([arrow_end, arrow_tip2], stroke);
                        
                        // 绘制关系标签（在箭头中点）
                        if !relation.tags.is_empty() {
                            let mid_point = (arrow_start.to_vec2() + arrow_end.to_vec2()) / 2.0;
                            let text_pos = pos2(mid_point.x, mid_point.y) + perp * 15.0;  // 偏移一点距离
                            let tags_text = relation.tags.join(", ");
                            painter.text(
                                text_pos,
                                Align2::CENTER_CENTER,
                                &tags_text,
                                FontId::proportional(10.0),
                                Color32::DARK_GRAY,
                            );
                        }
                    }
                }

                // 收集所有项目位置用于点击检测
                let mut project_centers = Vec::new();
                
                // 绘制项目（小圈）
                for (idx, project) in self.data.projects.values().enumerate() {
                    let center = pos2(
                        offset_x + project.position.0 * auto_scale * self.visualization_zoom
                            + self.visualization_offset.x,
                        offset_y + project.position.1 * auto_scale * self.visualization_zoom
                            + self.visualization_offset.y,
                    );
                    let radius = project.radius * auto_scale * self.visualization_zoom;
                    project_centers.push((project.id.clone(), center, radius, project.clone()));

                    let color = project.status.color();
                    let is_selected = self.selected_project.as_ref() == Some(&project.id);

                    // 根据完成度百分比计算边界颜色
                    let border_color = self.completion_percentage_to_color(project.completion_percentage);

                    // 绘制项目圆圈
                    painter.circle_filled(center, radius, color);
                    if is_selected {
                        // 选中时显示蓝色边框
                        painter.circle_stroke(center, radius + 3.0, (3.0, Color32::BLUE));
                        // 在蓝色边框内绘制完成度颜色边框
                        painter.circle_stroke(center, radius, (self.settings.project_border_width, border_color));
                    } else {
                        // 使用完成度百分比颜色作为边框
                        painter.circle_stroke(center, radius, (self.settings.project_border_width, border_color));
                    }

                    // 绘制项目编号（在圆圈中心）
                    if self.settings.show_project_numbers {
                        let project_num = idx + 1;
                        let text_color = if color == Color32::from_rgb(255, 255, 255) {
                            Color32::BLACK
                        } else {
                            Color32::WHITE
                        };
                        painter.text(
                            center,
                            Align2::CENTER_CENTER,
                            project_num.to_string(),
                            FontId::proportional(10.0),
                            text_color,
                        );
                    }

                    // 绘制项目名称
                    if self.settings.show_project_names {
                        painter.text(
                            pos2(center.x, center.y + radius + 15.0),
                            Align2::CENTER_CENTER,
                            &project.name,
                            FontId::proportional(12.0),
                            Color32::BLACK,
                        );
                    }
                }

                // 绘制图例（在右上角）
                self.draw_legend(painter, rect, &theme);
                
                // 获取图例矩形用于交互检测
                let legend_rect = self.get_legend_rect(rect);
                let mouse_pos = ctx.input(|i| i.pointer.hover_pos());
                let is_over_legend = mouse_pos.map(|p| legend_rect.contains(p)).unwrap_or(false);
                
                // 处理图例双击（打开设置）
                if response.double_clicked() {
                    if let Some(click_pos) = response.interact_pointer_pos() {
                        if legend_rect.contains(click_pos) {
                            self.show_legend_settings = true;
                        }
                    }
                }
                
                // 处理图例拖拽
                if is_over_legend && response.drag_started() {
                    self.legend_dragging = true;
                }
                
                if self.legend_dragging {
                    if response.dragged() {
                        self.legend_position += response.drag_delta();
                    }
                    if response.drag_stopped() {
                        self.legend_dragging = false;
                    }
                }

                // 处理点击（在绘制完成后）- 排除图例区域
                if response.clicked() && !is_over_legend {
                    if let Some(click_pos) = response.interact_pointer_pos() {
                        let modifiers = ui.input(|i| i.modifiers);
                        let cmd_pressed = modifiers.command; // macOS: Command, Windows/Linux: Ctrl
                        let shift_pressed = modifiers.shift;
                        
                        for (id, center, radius, project) in &project_centers {
                            let distance = (click_pos - *center).length();
                            if distance <= *radius {
                                // 如果按住 Command 且已有选中项目，则建立关系
                                if cmd_pressed && self.selected_project.is_some() {
                                    let from_id = self.selected_project.clone().unwrap();
                                    let to_id = id.clone();
                                    
                                    // 不能建立到自己的关系
                                    if from_id != to_id {
                                        // 检查是否已存在相同的关系
                                        let relation_exists = self.data.relations.iter().any(|r| {
                                            r.from_id == from_id && r.to_id == to_id
                                        });
                                        
                                        if !relation_exists {
                                            self.save_to_history();
                                            // Command+Shift: 虚线箭头，Command: 实线箭头
                                            let relation_type = if shift_pressed {
                                                RelationType::Indirect
                                            } else {
                                                RelationType::Direct
                                            };
                                            
                                            self.data.relations.push(ProjectRelation {
                                                from_id,
                                                to_id,
                                                relation_type,
                                                tags: Vec::new(),
                                                color: default_relation_color(),
                                                width: default_relation_width(),
                                            });
                                        }
                                    }
                                } else {
                                    // 普通点击：选中项目
                                    self.selected_project = Some(id.clone());
                                    self.editing_project = Some(project.clone());
                                }
                                break;
                            }
                        }
                    }
                }
                
                // 处理项目拖拽开始
                if response.drag_started() && !is_over_legend {
                    if let Some(drag_pos) = response.interact_pointer_pos() {
                        for (id, center, radius, _) in &project_centers {
                            let distance = (drag_pos - *center).length();
                            if distance <= *radius {
                                self.dragging_project = Some(id.clone());
                                self.selected_project = Some(id.clone());
                                break;
                            }
                        }
                    }
                }
                
                // 处理项目拖拽中
                if response.dragged() && self.dragging_project.is_some() {
                    let delta = response.drag_delta();
                    // 转换屏幕坐标变化到数据坐标变化
                    let scale = auto_scale * self.visualization_zoom;
                    let data_delta_x = delta.x / scale;
                    let data_delta_y = delta.y / scale;
                    
                    if let Some(project_id) = &self.dragging_project.clone() {
                        if let Some(project) = self.data.projects.get_mut(project_id) {
                            project.position.0 += data_delta_x;
                            project.position.1 += data_delta_y;
                        }
                        // 同步更新编辑中的项目
                        if let Some(editing) = &mut self.editing_project {
                            if &editing.id == project_id {
                                editing.position.0 += data_delta_x;
                                editing.position.1 += data_delta_y;
                            }
                        }
                    }
                }
                
                // 处理项目拖拽结束
                if response.drag_stopped() && self.dragging_project.is_some() {
                    // 检查位置是否正确，不正确则移动到最近的正确位置
                    if let Some(project_id) = &self.dragging_project.clone() {
                        if let Some(project) = self.data.projects.get(project_id).cloned() {
                            if !self.is_project_position_valid(&project) {
                                let new_pos = self.find_nearest_valid_position(&project);
                                if let Some(p) = self.data.projects.get_mut(project_id) {
                                    p.position = new_pos;
                                }
                                // 同步更新编辑中的项目
                                if let Some(editing) = &mut self.editing_project {
                                    if &editing.id == project_id {
                                        editing.position = new_pos;
                                    }
                                }
                            }
                        }
                    }
                    // 保存历史记录
                    self.save_to_history();
                    // 保存数据
                    self.save_data();
                    self.dragging_project = None;
                }

                // 处理拖拽和缩放 - 排除图例拖拽和项目拖拽
                if response.dragged() && !self.legend_dragging && self.dragging_project.is_none() {
                    // 计算内容的边界（考虑缩放）
                    let scaled_content_width = content_width * auto_scale * self.visualization_zoom;
                    let scaled_content_height = content_height * auto_scale * self.visualization_zoom;
                    
                    // 边距
                    let margin = 20.0;
                    
                    // 计算新的偏移量
                    let new_offset_x = self.visualization_offset.x + response.drag_delta().x;
                    let new_offset_y = self.visualization_offset.y + response.drag_delta().y;
                    
                    // 限制X方向：确保内容边界在窗口内
                    let final_offset_x = if scaled_content_width <= rect.width() {
                        // 内容小于窗口，允许在窗口内移动，但限制中心在窗口内
                        let max_offset_x = (rect.width() - scaled_content_width) / 2.0;
                        new_offset_x.clamp(-max_offset_x, max_offset_x)
                    } else {
                        // 内容大于窗口，限制边界在窗口内
                        let min_offset_x = rect.left() + margin - offset_x - scaled_content_width / 2.0;
                        let max_offset_x = rect.right() - margin - offset_x + scaled_content_width / 2.0;
                        new_offset_x.clamp(min_offset_x, max_offset_x)
                    };
                    
                    // 限制Y方向：确保内容边界在窗口内
                    let final_offset_y = if scaled_content_height <= rect.height() {
                        // 内容小于窗口，允许在窗口内移动，但限制中心在窗口内
                        let max_offset_y = (rect.height() - scaled_content_height) / 2.0;
                        new_offset_y.clamp(-max_offset_y, max_offset_y)
                    } else {
                        // 内容大于窗口，限制边界在窗口内
                        let min_offset_y = rect.top() + margin - offset_y - scaled_content_height / 2.0;
                        let max_offset_y = rect.bottom() - margin - offset_y + scaled_content_height / 2.0;
                        new_offset_y.clamp(min_offset_y, max_offset_y)
                    };
                    
                    // 应用限制后的偏移量
                    self.visualization_offset = Vec2::new(final_offset_x, final_offset_y);
                }

                // 鼠标滚轮缩放
                if response.hovered() {
                    let scroll_delta = ctx.input(|i| i.raw_scroll_delta.y);
                    if scroll_delta != 0.0 {
                        let zoom_factor = 1.0 + scroll_delta * 0.001;
                        self.visualization_zoom *= zoom_factor;
                        self.visualization_zoom = self.visualization_zoom.clamp(0.1, 3.0);
                    }
                }
            });
        }
    }

    /// 处理快捷键
    fn handle_shortcuts(&mut self, ctx: &Context) {
        // 只在主界面处理快捷键
        if !self.is_logged_in {
            return;
        }
        
        // Command+S: 保存 (macOS)
        if ctx.input(|i| i.key_pressed(Key::S) && i.modifiers.mac_cmd) {
            self.save_data();
        }
        
        // Command+Z: 撤销 (macOS)
        if ctx.input(|i| i.key_pressed(Key::Z) && i.modifiers.mac_cmd && !i.modifiers.shift) {
            self.undo();
        }
        
        // Command+Shift+Z: 重做 (macOS)
        if ctx.input(|i| i.key_pressed(Key::Z) && i.modifiers.mac_cmd && i.modifiers.shift) {
            self.redo();
        }
        
        // Command+N: 新建项目 (macOS)
        if ctx.input(|i| i.key_pressed(Key::N) && i.modifiers.mac_cmd) {
            self.create_new_project_shortcut();
        }
        
        // Tab键处理已移至update函数开头，确保在UI渲染前消耗
        
        // Ctrl+Plus 或 Ctrl+=: 放大
        if ctx.input(|i| {
            (i.key_pressed(Key::Plus) && i.modifiers.ctrl) ||
            (i.key_pressed(Key::Equals) && i.modifiers.ctrl)
        }) {
            self.zoom_in();
        }
        
        // Ctrl+Minus: 缩小
        if ctx.input(|i| i.key_pressed(Key::Minus) && i.modifiers.ctrl) {
            self.zoom_out();
        }
        
        // Ctrl+0: 重置缩放
        if ctx.input(|i| i.key_pressed(Key::Num0) && i.modifiers.ctrl) {
            self.zoom_reset();
        }
        
        // Esc: 取消选中项目
        if ctx.input(|i| i.key_pressed(Key::Escape)) {
            self.selected_project = None;
            self.toolbar_focus_index = None;  // 同时取消工具栏选中
        }
        
        // Enter: 触发选中的工具栏按钮
        if ctx.input(|i| i.key_pressed(Key::Enter)) {
            if let Some(idx) = self.toolbar_focus_index {
                match idx {
                    0 => self.create_new_project_shortcut(),
                    1 => {
                        if let Some(id) = self.selected_project.clone() {
                            self.data.projects.shift_remove(&id);
                            self.data.relations.retain(|r| r.from_id != id && r.to_id != id);
                            self.selected_project = None;
                            self.editing_project = None;
                            self.save_to_history();
                        }
                    }
                    2 => self.save_data(),
                    3 => self.undo(),
                    4 => self.redo(),
                    5 => {
                        // 只修正位置不正确的项目
                        self.validate_and_fix_project_positions();
                        // 更新编辑中的项目位置
                        if let Some(id) = &self.selected_project {
                            if let Some(project) = self.data.projects.get(id) {
                                if let Some(editing) = &mut self.editing_project {
                                    editing.position = project.position;
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    
    /// 保存当前状态到历史
    fn save_to_history(&mut self) {
        // 移除当前索引之后的历史（如果有重做操作后又有新操作）
        self.history.truncate(self.history_index + 1);
        
        // 添加新状态
        self.history.push(self.data.clone());
        self.history_index += 1;
        
        // 限制历史记录数量
        if self.history.len() > self.max_history_size {
            self.history.remove(0);
            self.history_index -= 1;
        }
    }
    
    /// 撤销
    fn undo(&mut self) {
        if self.history_index > 0 {
            self.history_index -= 1;
            self.data = self.history[self.history_index].clone();
            self.selected_project = None;
            self.editing_project = None;
        }
    }
    
    /// 重做
    fn redo(&mut self) {
        if self.history_index < self.history.len() - 1 {
            self.history_index += 1;
            self.data = self.history[self.history_index].clone();
            self.selected_project = None;
            self.editing_project = None;
        }
    }
    
    /// 新建项目（快捷键）
    fn create_new_project_shortcut(&mut self) {
        // 找到最大的项目编号，确保新ID不会冲突
        let max_num = self.data.projects.keys()
            .filter_map(|id| id.strip_prefix("project_").and_then(|n| n.parse::<usize>().ok()))
            .max()
            .unwrap_or(0);
        let new_id = format!("project_{}", max_num + 1);
        let mut new_project = Project {
            id: new_id.clone(),
            name: "新项目".to_string(),
            description: String::new(),
            status: ProjectStatus::ToBeStarted,
            field_ids: Vec::new(),
            position: (400.0, 400.0),
            radius: 20.0,
            completion_percentage: 0.0,
        };
        // 先调整领域布局
        self.adjust_field_layout();
        // 自动计算位置，避免重叠
        new_project.position = self.calculate_project_position(&new_project);
        
        self.save_to_history();
        self.data.projects.insert(new_id.clone(), new_project.clone());
        self.selected_project = Some(new_id);
        self.editing_project = Some(new_project);
    }
    
    /// 切换到下一个项目
    fn next_project(&mut self) {
        let project_ids: Vec<String> = self.data.projects.keys().cloned().collect();
        if project_ids.is_empty() {
            return;
        }
        
        let next_index = if let Some(ref current) = self.selected_project {
            let current_index = project_ids.iter().position(|id| id == current).unwrap_or(0);
            (current_index + 1) % project_ids.len()
        } else {
            // 没有选中时，从第一个项目开始
            0
        };
        
        let next_id = project_ids[next_index].clone();
        
        if let Some(project) = self.data.projects.get(&next_id) {
            self.selected_project = Some(next_id.clone());
            self.editing_project = Some(project.clone());
        }
    }
    
    /// 切换到上一个项目
    fn previous_project(&mut self) {
        let project_ids: Vec<String> = self.data.projects.keys().cloned().collect();
        if project_ids.is_empty() {
            return;
        }
        
        let current_index = if let Some(ref current) = self.selected_project {
            project_ids.iter().position(|id| id == current).unwrap_or(0)
        } else {
            0
        };
        
        let prev_index = if current_index == 0 {
            project_ids.len() - 1
        } else {
            current_index - 1
        };
        
        let prev_id = project_ids[prev_index].clone();
        
        if let Some(project) = self.data.projects.get(&prev_id) {
            self.selected_project = Some(prev_id.clone());
            self.editing_project = Some(project.clone());
        }
    }
    
    /// 放大
    fn zoom_in(&mut self) {
        self.visualization_zoom *= 1.1;
        self.visualization_zoom = self.visualization_zoom.min(3.0);
    }
    
    /// 缩小
    fn zoom_out(&mut self) {
        self.visualization_zoom *= 0.9;
        self.visualization_zoom = self.visualization_zoom.max(0.1);
    }
    
    /// 重置缩放
    fn zoom_reset(&mut self) {
        self.visualization_zoom = 1.0;
        self.visualization_offset = Vec2::ZERO;
    }

    fn new_file(&mut self) {
        self.data = AppData::default();
        self.current_file_path = None;
        self.selected_project = None;
        self.editing_project = None;
        // 重置历史
        self.history = vec![AppData::default()];
        self.history_index = 0;
    }

    fn load_data(&mut self) {
        if let Some(path) = rfd::FileDialog::new()
            .add_filter("JSON", &["json"])
            .set_title("打开数据文件")
            .pick_file()
        {
                            if let Ok(content) = std::fs::read_to_string(&path) {
                                match serde_json::from_str::<AppData>(&content) {
                                    Ok(data) => {
                                        self.data = data.clone();
                                        self.current_file_path = Some(path.clone());
                                        self.selected_project = None;
                                        self.editing_project = None;
                                        // 验证并修正项目位置
                                        self.validate_and_fix_project_positions();
                                        // 重置历史（使用修正后的数据）
                                        self.history = vec![self.data.clone()];
                                        self.history_index = 0;
                                        // 更新最近编辑的文件路径
                                        self.update_last_edited_file(&path);
                                    }
                                    Err(e) => {
                                        eprintln!("加载数据失败: {}", e);
                                    }
                                }
                            } else {
                                eprintln!("读取文件失败");
                            }
        }
    }

    fn save_data(&mut self) {
        // 如果有当前文件路径，直接保存
        if let Some(ref path) = self.current_file_path {
            let path_clone = path.clone();
            match serde_json::to_string_pretty(&self.data) {
                Ok(json) => {
                    if let Err(e) = std::fs::write(&path_clone, json) {
                        eprintln!("保存数据失败: {}", e);
                    } else {
                        // 保存成功后，更新最近编辑的文件路径
                        self.update_last_edited_file(&path_clone);
                    }
                }
                Err(e) => {
                    eprintln!("序列化数据失败: {}", e);
                }
            }
        } else {
            // 没有当前文件路径，弹出保存对话框
            self.save_data_as();
        }
    }

    fn save_data_as(&mut self) {
        if let Some(path) = rfd::FileDialog::new()
            .add_filter("JSON", &["json"])
            .set_title("另存为")
            .save_file()
        {
            match serde_json::to_string_pretty(&self.data) {
                Ok(json) => {
                    if let Err(e) = std::fs::write(&path, json) {
                        eprintln!("保存数据失败: {}", e);
                    } else {
                        // 保存成功后，更新当前文件路径和最近编辑的文件路径
                        self.current_file_path = Some(path.clone());
                        self.update_last_edited_file(&path);
                    }
                }
                Err(e) => {
                    eprintln!("序列化数据失败: {}", e);
                }
            }
        }
    }

    fn import_data(&mut self) {
        if let Some(path) = rfd::FileDialog::new()
            .add_filter("JSON", &["json"])
            .set_title("导入数据文件")
            .pick_file()
        {
            if let Ok(content) = std::fs::read_to_string(&path) {
                match serde_json::from_str::<AppData>(&content) {
                    Ok(imported_data) => {
                        // 合并导入的数据（保留当前数据，添加或更新导入的数据）
                        // 合并项目
                        for (id, project) in imported_data.projects {
                            self.data.projects.insert(id, project);
                        }
                        // 合并领域
                        for (id, field) in imported_data.fields {
                            self.data.fields.insert(id, field);
                        }
                        // 合并关系（去重）
                        for relation in imported_data.relations {
                            if !self.data.relations.iter().any(|r| {
                                r.from_id == relation.from_id && r.to_id == relation.to_id
                            }) {
                                self.data.relations.push(relation);
                            }
                        }
                        // 保存到历史
                        self.save_to_history();
                    }
                    Err(e) => {
                        eprintln!("导入数据失败: {}", e);
                    }
                }
            } else {
                eprintln!("读取文件失败");
            }
        }
    }

    fn export_data(&mut self) {
        if let Some(path) = rfd::FileDialog::new()
            .add_filter("JSON", &["json"])
            .set_title("导出数据文件")
            .save_file()
        {
            match serde_json::to_string_pretty(&self.data) {
                Ok(json) => {
                    if let Err(e) = std::fs::write(&path, json) {
                        eprintln!("导出数据失败: {}", e);
                    }
                }
                Err(e) => {
                    eprintln!("序列化数据失败: {}", e);
                }
            }
        }
    }

    /// 验证用户登录，从config.yaml读取用户信息
    /// 返回 (数据存储路径, 最近编辑的文件路径)
    fn verify_user(&self, username: &str, password: &str) -> Result<Option<(Option<String>, Option<String>)>, String> {
        let config_path = "config.yaml";
        
        // 如果config.yaml不存在，创建默认配置
        if !std::path::Path::new(config_path).exists() {
            let default_config = crate::models::UserConfig {
                users: vec![
                    crate::models::UserConfigEntry {
                        username: "admin".to_string(),
                        password_hash: "admin".to_string(),  // 简单实现，实际应使用加密
                        data_storage_path: None,
                        last_edited_file: None,
                    }
                ],
            };
            if let Err(e) = self.save_config(&default_config) {
                return Err(format!("创建默认配置失败: {}", e));
            }
        }

        // 加载配置
        let config = self.load_config()?;
        
        // 查找用户
        for user in &config.users {
            if user.username == username && user.password_hash == password {
                return Ok(Some((
                    user.data_storage_path.clone(),
                    user.last_edited_file.clone(),
                )));
            }
        }
        
        Ok(None)
    }

    /// 加载config.yaml
    fn load_config(&self) -> Result<crate::models::UserConfig, String> {
        let config_path = "config.yaml";
        let content = std::fs::read_to_string(config_path)
            .map_err(|e| format!("读取配置文件失败: {}", e))?;
        serde_yaml::from_str(&content)
            .map_err(|e| format!("解析配置文件失败: {}", e))
    }

    /// 保存config.yaml
    fn save_config(&self, config: &crate::models::UserConfig) -> Result<(), String> {
        let config_path = "config.yaml";
        let yaml = serde_yaml::to_string(config)
            .map_err(|e| format!("序列化配置失败: {}", e))?;
        std::fs::write(config_path, yaml)
            .map_err(|e| format!("保存配置文件失败: {}", e))?;
        Ok(())
    }

    /// 创建新用户
    fn create_user(&mut self, username: &str, password: &str) -> Result<(), String> {
        let mut config = self.load_config().unwrap_or_else(|_| {
            // 如果配置文件不存在，创建默认配置
            crate::models::UserConfig {
                users: Vec::new(),
            }
        });

        // 检查用户是否已存在
        if config.users.iter().any(|u| u.username == username) {
            return Err("用户名已存在".to_string());
        }

        // 创建用户目录
        let users_dir = "users";
        if !std::path::Path::new(users_dir).exists() {
            std::fs::create_dir_all(users_dir)
                .map_err(|e| format!("创建用户目录失败: {}", e))?;
        }

        let user_dir = format!("{}/{}", users_dir, username);
        if !std::path::Path::new(&user_dir).exists() {
            std::fs::create_dir_all(&user_dir)
                .map_err(|e| format!("创建用户目录失败: {}", e))?;
        }

        // 添加新用户到配置
        config.users.push(crate::models::UserConfigEntry {
            username: username.to_string(),
            password_hash: password.to_string(),  // 简单实现，实际应使用加密
            data_storage_path: Some(user_dir.clone()),
            last_edited_file: None,
        });

        // 保存配置
        self.save_config(&config)?;

        Ok(())
    }

    /// 更新最近编辑的文件路径
    /// 只更新属于当前用户数据存储路径的文件，避免用户文件路径混乱
    fn update_last_edited_file(&mut self, file_path: &std::path::Path) {
        if let Some(username) = &self.current_user {
            let file_path_str = file_path.to_string_lossy().to_string();
            
            // 验证文件路径是否属于当前用户的数据存储路径
            let file_belongs_to_user = if let Some(ref storage_path) = self.user_data_storage_path {
                // 将路径标准化后进行比较
                let file_path_normalized = file_path.canonicalize()
                    .unwrap_or_else(|_| file_path.to_path_buf());
                let storage_path_normalized = std::path::Path::new(storage_path).canonicalize()
                    .unwrap_or_else(|_| std::path::Path::new(storage_path).to_path_buf());
                
                // 检查文件路径是否在存储路径下
                file_path_normalized.starts_with(&storage_path_normalized)
            } else {
                // 如果没有设置存储路径，允许更新（向后兼容）
                true
            };
            
            // 只有文件属于当前用户时才更新
            if file_belongs_to_user {
                match self.load_config() {
                    Ok(mut config) => {
                        for user in &mut config.users {
                            if user.username == *username {
                                user.last_edited_file = Some(file_path_str);
                                break;
                            }
                        }
                        if let Err(e) = self.save_config(&config) {
                            eprintln!("更新最近编辑文件路径失败: {}", e);
                        }
                    }
                    Err(e) => {
                        eprintln!("加载配置失败: {}", e);
                    }
                }
            } else {
                // 文件不属于当前用户，不更新 last_edited_file
                eprintln!("警告: 文件路径不属于当前用户的数据存储路径，不更新 last_edited_file");
            }
        }
    }

    /// 设置数据存储路径
    fn set_data_storage_path(&mut self) {
        if let Some(username) = &self.current_user {
            // 选择文件夹
            if let Some(path) = rfd::FileDialog::new()
                .set_title("选择数据存储路径")
                .pick_folder()
            {
                let path_str = path.to_string_lossy().to_string();
                
                // 更新当前用户的数据存储路径
                match self.load_config() {
                    Ok(mut config) => {
                        for user in &mut config.users {
                            if user.username == *username {
                                user.data_storage_path = Some(path_str.clone());
                                break;
                            }
                        }
                        if let Err(e) = self.save_config(&config) {
                            eprintln!("保存配置失败: {}", e);
                        } else {
                            self.user_data_storage_path = Some(path_str);
                        }
                    }
                    Err(e) => {
                        eprintln!("加载配置失败: {}", e);
                    }
                }
            }
        }
    }

    /// 从存储路径加载数据文件列表
    fn load_from_storage_path(&mut self) {
        if let Some(ref storage_path) = self.user_data_storage_path {
            // 使用文件对话框，设置初始目录为存储路径
            if let Some(path) = rfd::FileDialog::new()
                .add_filter("JSON", &["json"])
                .set_title("从存储路径选择文件")
                .set_directory(storage_path)
                .pick_file()
            {
                                if let Ok(content) = std::fs::read_to_string(&path) {
                                    match serde_json::from_str::<crate::models::AppData>(&content) {
                                        Ok(data) => {
                                            self.data = data.clone();
                                            self.current_file_path = Some(path.clone());
                                            self.selected_project = None;
                                            self.editing_project = None;
                                            // 重置历史
                                            self.history = vec![data];
                                            self.history_index = 0;
                                            // 更新最近编辑的文件路径
                                            self.update_last_edited_file(&path);
                                        }
                                        Err(e) => {
                                            eprintln!("加载数据失败: {}", e);
                                        }
                                    }
                                } else {
                                    eprintln!("读取文件失败");
                                }
            }
        } else {
            eprintln!("请先设置数据存储路径");
        }
    }

    /// 检查项目位置是否正确（整个项目圆圈在所有目标领域内，且整个圆圈不在非目标领域内）
    fn is_project_position_valid(&self, project: &Project) -> bool {
        let (x, y) = project.position;
        let project_radius = project.radius;
        
        if project.field_ids.is_empty() {
            // 无领域的项目必须在所有领域之外
            for field in self.data.fields.values() {
                let dx = x - field.position.0;
                let dy = y - field.position.1;
                let distance = (dx * dx + dy * dy).sqrt();
                // 项目圆圈最近点必须在领域外
                if distance - project_radius < field.radius {
                    return false;  // 项目圆圈部分在某个领域内
                }
            }
        } else {
            // 检查整个项目圆圈是否完全在所有目标领域内
            for field_id in &project.field_ids {
                if let Some(field) = self.data.fields.get(field_id) {
                    let dx = x - field.position.0;
                    let dy = y - field.position.1;
                    let distance = (dx * dx + dy * dy).sqrt();
                    // 项目圆圈最远点到领域中心的距离 = distance + project_radius
                    // 必须 <= field.radius（留5像素边距）
                    if distance + project_radius > field.radius - 5.0 {
                        return false;  // 项目圆圈部分在目标领域外
                    }
                }
            }
            
            // 检查整个项目圆圈是否完全在非目标领域外
            for field in self.data.fields.values() {
                if project.field_ids.contains(&field.id) {
                    continue;
                }
                let dx = x - field.position.0;
                let dy = y - field.position.1;
                let distance = (dx * dx + dy * dy).sqrt();
                // 项目圆圈最近点到领域中心的距离 = distance - project_radius
                // 必须 >= field.radius（项目圆圈完全在非目标领域外）
                if distance - project_radius < field.radius {
                    return false;  // 项目圆圈部分在非目标领域内
                }
            }
        }
        
        // 检查与其他项目是否重叠
        for other in self.data.projects.values() {
            if other.id == project.id {
                continue;
            }
            let dx = x - other.position.0;
            let dy = y - other.position.1;
            let distance = (dx * dx + dy * dy).sqrt();
            // 两个圆圈不能重叠：距离必须 > 两个半径之和
            let min_dist = project_radius + other.radius + 15.0;  // 至少15像素间距
            if distance < min_dist {
                return false;  // 与其他项目重叠
            }
        }
        
        true
    }
    
    /// 找到离当前位置最近的正确位置
    fn find_nearest_valid_position(&self, project: &Project) -> (f32, f32) {
        let (current_x, current_y) = project.position;
        let project_radius = project.radius;
        
        // 无领域项目：找到所有领域之外的位置
        if project.field_ids.is_empty() {
            let all_fields: Vec<&ResearchField> = self.data.fields.values().collect();
            
            let mut best_pos = project.position;
            let mut best_dist = f32::MAX;
            
            for attempt in 0..500 {
                let angle = (attempt as f32) * 0.618 * std::f32::consts::PI * 2.0;
                let radius = (attempt as f32).sqrt() * 5.0;
                
                let x = current_x + radius * angle.cos();
                let y = current_y + radius * angle.sin();
                
                // 检查是否在所有领域之外
                let mut outside_all = true;
                for field in &all_fields {
                    let dx = x - field.position.0;
                    let dy = y - field.position.1;
                    let distance = (dx * dx + dy * dy).sqrt();
                    if distance - project_radius < field.radius {
                        outside_all = false;
                        break;
                    }
                }
                if !outside_all {
                    continue;
                }
                
                // 检查与其他项目的距离
                let mut overlaps = false;
                for existing in self.data.projects.values() {
                    if existing.id == project.id {
                        continue;
                    }
                    let dx = x - existing.position.0;
                    let dy = y - existing.position.1;
                    let dist = (dx * dx + dy * dy).sqrt();
                    if dist < project_radius + existing.radius + 15.0 {
                        overlaps = true;
                        break;
                    }
                }
                if overlaps {
                    continue;
                }
                
                let dist = ((x - current_x).powi(2) + (y - current_y).powi(2)).sqrt();
                if dist < best_dist {
                    best_dist = dist;
                    best_pos = (x, y);
                    if dist < 1.0 {
                        break;
                    }
                }
            }
            
            return best_pos;
        }
        
        // 收集目标领域
        let target_fields: Vec<&ResearchField> = project.field_ids.iter()
            .filter_map(|id| self.data.fields.get(id))
            .collect();
        
        if target_fields.is_empty() {
            return project.position;
        }
        
        // 收集非目标领域
        let non_target_fields: Vec<&ResearchField> = self.data.fields.values()
            .filter(|f| !project.field_ids.contains(&f.id))
            .collect();
        
        let mut best_pos = project.position;
        let mut best_dist = f32::MAX;
        
        // 计算目标领域的中心
        let mut target_center_x = 0.0;
        let mut target_center_y = 0.0;
        for field in &target_fields {
            target_center_x += field.position.0;
            target_center_y += field.position.1;
        }
        target_center_x /= target_fields.len() as f32;
        target_center_y /= target_fields.len() as f32;
        
        // 计算目标领域的最小半径（用于从边缘搜索）
        let min_target_radius = target_fields.iter()
            .map(|f| f.radius)
            .min_by(|a, b| a.partial_cmp(b).unwrap())
            .unwrap_or(100.0);
        
        // 从当前位置和目标领域边缘两个起点搜索
        // 边缘起点：远离中心的方向
        let edge_angle = (current_y - target_center_y).atan2(current_x - target_center_x);
        let edge_x = target_center_x + (min_target_radius * 0.6) * edge_angle.cos();
        let edge_y = target_center_y + (min_target_radius * 0.6) * edge_angle.sin();
        
        let search_starts = [(current_x, current_y), (edge_x, edge_y)];
        
        for (start_x, start_y) in search_starts {
        // 螺旋搜索找最近的有效位置
        for attempt in 0..500 {
            let angle = (attempt as f32) * 0.618 * std::f32::consts::PI * 2.0;
            let radius = (attempt as f32).sqrt() * 8.0;  // 增大搜索步长
            
            let x = start_x + radius * angle.cos();
            let y = start_y + radius * angle.sin();
            
            // 检查整个项目圆圈是否完全在所有目标领域内
            let mut in_all_targets = true;
            for field in &target_fields {
                let dx = x - field.position.0;
                let dy = y - field.position.1;
                let distance = (dx * dx + dy * dy).sqrt();
                // 项目圆圈最远点必须在领域内
                if distance + project_radius > field.radius - 5.0 {
                    in_all_targets = false;
                    break;
                }
            }
            if !in_all_targets {
                continue;
            }
            
            // 检查整个项目圆圈是否完全在非目标领域外
            let mut in_non_target = false;
            for field in &non_target_fields {
                let dx = x - field.position.0;
                let dy = y - field.position.1;
                let distance = (dx * dx + dy * dy).sqrt();
                // 项目圆圈最近点必须在非目标领域外
                if distance - project_radius < field.radius {
                    in_non_target = true;
                    break;
                }
            }
            if in_non_target {
                continue;
            }
            
            // 检查与其他项目的距离（避免重叠，保持间距）
            let mut overlaps_project = false;
            for existing in self.data.projects.values() {
                if existing.id == project.id {
                    continue;
                }
                let dx = x - existing.position.0;
                let dy = y - existing.position.1;
                let dist = (dx * dx + dy * dy).sqrt();
                // 两个圆圈不能重叠：距离必须 > 两个半径之和 + 间距
                let min_dist = project_radius + existing.radius + 15.0;  // 保持15像素间距
                if dist < min_dist {
                    overlaps_project = true;
                    break;
                }
            }
            if overlaps_project {
                continue;
            }
            
            // 计算到原位置的距离
            let dist = ((x - current_x).powi(2) + (y - current_y).powi(2)).sqrt();
            if dist < best_dist {
                best_dist = dist;
                best_pos = (x, y);
                if dist < 1.0 {
                    break;  // 足够近了
                }
            }
        }
        }  // 结束 search_starts 循环
        
        best_pos
    }
    
    /// 检查点是否在线段附近（用于检测箭头穿过）
    fn point_near_line_segment(&self, px: f32, py: f32, x1: f32, y1: f32, x2: f32, y2: f32, threshold: f32) -> bool {
        let line_len_sq = (x2 - x1).powi(2) + (y2 - y1).powi(2);
        if line_len_sq < 1.0 {
            return false;  // 线段太短
        }
        
        // 计算点到线段的最近点参数 t
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / line_len_sq;
        let t = t.clamp(0.0, 1.0);
        
        // 最近点坐标
        let nearest_x = x1 + t * (x2 - x1);
        let nearest_y = y1 + t * (y2 - y1);
        
        // 计算距离
        let dist = ((px - nearest_x).powi(2) + (py - nearest_y).powi(2)).sqrt();
        dist < threshold
    }
    
    /// 重新计算所有项目位置（用于领域位置变化后）
    fn recalculate_all_project_positions(&mut self) {
        let project_ids: Vec<String> = self.data.projects.keys().cloned().collect();
        for id in project_ids {
            if let Some(project) = self.data.projects.get(&id).cloned() {
                let new_pos = self.calculate_project_position(&project);
                if let Some(p) = self.data.projects.get_mut(&id) {
                    p.position = new_pos;
                }
            }
        }
    }
    
    /// 重新计算所有项目位置（带随机抖动，用于领域顺序变化后）
    fn recalculate_all_project_positions_with_jitter(&mut self) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64;
        
        let project_ids: Vec<String> = self.data.projects.keys().cloned().collect();
        for (idx, id) in project_ids.iter().enumerate() {
            if let Some(project) = self.data.projects.get(id).cloned() {
                // 先给位置加入随机抖动，避免完全重叠
                let jitter_seed = seed.wrapping_add(idx as u64);
                let jitter_x = ((jitter_seed % 100) as f32 - 50.0) * 0.5;
                let jitter_y = (((jitter_seed / 100) % 100) as f32 - 50.0) * 0.5;
                
                if let Some(p) = self.data.projects.get_mut(id) {
                    p.position.0 += jitter_x;
                    p.position.1 += jitter_y;
                }
                
                // 重新获取带抖动的项目
                if let Some(project) = self.data.projects.get(id).cloned() {
                    let new_pos = self.calculate_project_position(&project);
                    if let Some(p) = self.data.projects.get_mut(id) {
                        p.position = new_pos;
                    }
                }
            }
        }
    }
    
    /// 验证并修正所有项目位置（使用物理引擎思想）
    fn validate_and_fix_project_positions(&mut self) {
        let mut changed = false;
        
        // 第一步：先确保所有项目在正确的区域内
        let project_ids: Vec<String> = self.data.projects.keys().cloned().collect();
        for id in &project_ids {
            if let Some(project) = self.data.projects.get(id).cloned() {
                if !self.is_project_in_correct_region(&project) {
                    let new_pos = self.find_nearest_valid_position(&project);
                    if let Some(p) = self.data.projects.get_mut(id) {
                        p.position = new_pos;
                        changed = true;
                    }
                }
            }
        }
        
        // 第二步：物理引擎迭代，解决重叠问题
        let physics_iterations = 50;
        let damping = 0.8;  // 阻尼系数
        let min_spacing = 15.0;  // 最小间距
        let arrow_spacing = 25.0;  // 箭头避让距离
        
        for _ in 0..physics_iterations {
            let mut forces: std::collections::HashMap<String, (f32, f32)> = std::collections::HashMap::new();
            
            // 初始化力为零
            for id in &project_ids {
                forces.insert(id.clone(), (0.0, 0.0));
            }
            
            // 计算项目之间的斥力
            for i in 0..project_ids.len() {
                for j in (i + 1)..project_ids.len() {
                    let id1 = &project_ids[i];
                    let id2 = &project_ids[j];
                    
                    if let (Some(p1), Some(p2)) = (
                        self.data.projects.get(id1),
                        self.data.projects.get(id2)
                    ) {
                        let dx = p2.position.0 - p1.position.0;
                        let dy = p2.position.1 - p1.position.1;
                        let distance = (dx * dx + dy * dy).sqrt().max(1.0);
                        let min_dist = p1.radius + p2.radius + min_spacing;
                        
                        if distance < min_dist {
                            // 计算斥力（重叠越多，力越大）
                            let overlap = min_dist - distance;
                            let force_magnitude = overlap * 0.5;
                            let fx = (dx / distance) * force_magnitude;
                            let fy = (dy / distance) * force_magnitude;
                            
                            // p1 受到反方向的力
                            if let Some(f) = forces.get_mut(id1) {
                                f.0 -= fx;
                                f.1 -= fy;
                            }
                            // p2 受到正方向的力
                            if let Some(f) = forces.get_mut(id2) {
                                f.0 += fx;
                                f.1 += fy;
                            }
                        }
                    }
                }
            }
            
            // 计算箭头对项目的斥力
            let relations: Vec<(String, String)> = self.data.relations.iter()
                .map(|r| (r.from_id.clone(), r.to_id.clone()))
                .collect();
            
            for (from_id, to_id) in &relations {
                if let (Some(from_proj), Some(to_proj)) = (
                    self.data.projects.get(from_id),
                    self.data.projects.get(to_id)
                ) {
                    let (x1, y1) = from_proj.position;
                    let (x2, y2) = to_proj.position;
                    
                    // 对每个不是箭头端点的项目计算斥力
                    for id in &project_ids {
                        if id == from_id || id == to_id {
                            continue;
                        }
                        
                        if let Some(project) = self.data.projects.get(id) {
                            let (px, py) = project.position;
                            let threshold = project.radius + arrow_spacing;
                            
                            // 计算点到线段的最近点
                            let line_len_sq = (x2 - x1).powi(2) + (y2 - y1).powi(2);
                            if line_len_sq > 1.0 {
                                let t = (((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / line_len_sq).clamp(0.0, 1.0);
                                let nearest_x = x1 + t * (x2 - x1);
                                let nearest_y = y1 + t * (y2 - y1);
                                
                                let dx = px - nearest_x;
                                let dy = py - nearest_y;
                                let dist = (dx * dx + dy * dy).sqrt().max(1.0);
                                
                                if dist < threshold {
                                    let overlap = threshold - dist;
                                    let force_magnitude = overlap * 0.3;
                                    let fx = (dx / dist) * force_magnitude;
                                    let fy = (dy / dist) * force_magnitude;
                                    
                                    if let Some(f) = forces.get_mut(id) {
                                        f.0 += fx;
                                        f.1 += fy;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            // 应用力并检查边界约束
            let mut any_moved = false;
            for id in &project_ids {
                if let Some((fx, fy)) = forces.get(id).cloned() {
                    if fx.abs() > 0.1 || fy.abs() > 0.1 {
                        if let Some(project) = self.data.projects.get(id).cloned() {
                            let mut new_x = project.position.0 + fx * damping;
                            let mut new_y = project.position.1 + fy * damping;
                            
                            // 边界约束：确保项目仍在正确区域内
                            let mut temp_project = project.clone();
                            temp_project.position = (new_x, new_y);
                            
                            if !self.is_project_in_correct_region(&temp_project) {
                                // 如果移动后不在正确区域，尝试只移动一个方向
                                temp_project.position = (new_x, project.position.1);
                                if self.is_project_in_correct_region(&temp_project) {
                                    new_y = project.position.1;
                                } else {
                                    temp_project.position = (project.position.0, new_y);
                                    if self.is_project_in_correct_region(&temp_project) {
                                        new_x = project.position.0;
                                    } else {
                                        // 两个方向都不行，不移动
                                        continue;
                                    }
                                }
                            }
                            
                            if let Some(p) = self.data.projects.get_mut(id) {
                                p.position = (new_x, new_y);
                                any_moved = true;
                                changed = true;
                            }
                        }
                    }
                }
            }
            
            if !any_moved {
                break;  // 已达到平衡
            }
        }
        
        // 第三步：检查是否仍有重叠，如果有则扩展领域
        let still_overlapping = self.check_any_project_overlap(min_spacing);
        if still_overlapping {
            self.expand_fields_for_projects();
            changed = true;
            // 扩展后重新验证位置
            for id in &project_ids {
                if let Some(project) = self.data.projects.get(id).cloned() {
                    if !self.is_project_in_correct_region(&project) {
                        let new_pos = self.find_nearest_valid_position(&project);
                        if let Some(p) = self.data.projects.get_mut(id) {
                            p.position = new_pos;
                        }
                    }
                }
            }
        }
        
        if changed {
            self.save_to_history();
        }
    }
    
    /// 检查是否有任何项目重叠
    fn check_any_project_overlap(&self, min_spacing: f32) -> bool {
        let project_ids: Vec<String> = self.data.projects.keys().cloned().collect();
        for i in 0..project_ids.len() {
            for j in (i + 1)..project_ids.len() {
                if let (Some(p1), Some(p2)) = (
                    self.data.projects.get(&project_ids[i]),
                    self.data.projects.get(&project_ids[j])
                ) {
                    let dx = p1.position.0 - p2.position.0;
                    let dy = p1.position.1 - p2.position.1;
                    let distance = (dx * dx + dy * dy).sqrt();
                    let min_dist = p1.radius + p2.radius + min_spacing;
                    if distance < min_dist {
                        return true;
                    }
                }
            }
        }
        false
    }
    
    /// 扩展领域大小以容纳更多项目
    fn expand_fields_for_projects(&mut self) {
        let expand_amount = 30.0;  // 每次扩展30像素
        
        // 统计每个领域内的项目数量和所需空间
        let mut field_project_count: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        let mut field_required_area: std::collections::HashMap<String, f32> = std::collections::HashMap::new();
        
        for project in self.data.projects.values() {
            for field_id in &project.field_ids {
                *field_project_count.entry(field_id.clone()).or_insert(0) += 1;
                let area = std::f32::consts::PI * (project.radius + 7.5).powi(2);  // 项目面积 + 间距
                *field_required_area.entry(field_id.clone()).or_insert(0.0) += area;
            }
        }
        
        // 检查并扩展需要更多空间的领域
        for (field_id, required_area) in &field_required_area {
            if let Some(field) = self.data.fields.get_mut(field_id) {
                let current_area = std::f32::consts::PI * field.radius.powi(2);
                // 如果所需面积超过当前面积的40%（考虑交叉区域），则扩展
                if *required_area > current_area * 0.4 {
                    field.radius += expand_amount;
                }
            }
        }
    }
    
    /// 检查项目是否在正确的区域内（不检查与其他项目的重叠）
    fn is_project_in_correct_region(&self, project: &Project) -> bool {
        let (x, y) = project.position;
        let project_radius = project.radius;
        
        if project.field_ids.is_empty() {
            // 无领域的项目必须在所有领域之外
            for field in self.data.fields.values() {
                let dx = x - field.position.0;
                let dy = y - field.position.1;
                let distance = (dx * dx + dy * dy).sqrt();
                if distance - project_radius < field.radius {
                    return false;
                }
            }
        } else {
            // 检查整个项目圆圈是否完全在所有目标领域内
            for field_id in &project.field_ids {
                if let Some(field) = self.data.fields.get(field_id) {
                    let dx = x - field.position.0;
                    let dy = y - field.position.1;
                    let distance = (dx * dx + dy * dy).sqrt();
                    if distance + project_radius > field.radius - 5.0 {
                        return false;
                    }
                }
            }
            
            // 检查整个项目圆圈是否完全在非目标领域外
            for field in self.data.fields.values() {
                if project.field_ids.contains(&field.id) {
                    continue;
                }
                let dx = x - field.position.0;
                let dy = y - field.position.1;
                let distance = (dx * dx + dy * dy).sqrt();
                if distance - project_radius < field.radius {
                    return false;
                }
            }
        }
        
        true
    }

    /// 计算新项目的位置，根据所属领域自动布局，并避免与已有项目重叠
    /// 单领域项目会放在远离其他领域的方向，避免被误认为在交叉区域
    fn calculate_project_position(&self, project: &Project) -> (f32, f32) {
        let project_radius = project.radius;
        
        // 如果项目没有指定领域，放在所有领域之外
        if project.field_ids.is_empty() {
            // 计算所有领域的边界
            let mut max_x = 0.0_f32;
            let mut max_y = 0.0_f32;
            for field in self.data.fields.values() {
                max_x = max_x.max(field.position.0 + field.radius);
                max_y = max_y.max(field.position.1 + field.radius);
            }
            
            // 在右下角外侧找位置
            let start_x = max_x + 50.0;
            let start_y = max_y + 50.0;
            
            // 螺旋搜索找不重叠的位置
            for attempt in 0..200 {
                let angle = (attempt as f32) * 0.618 * std::f32::consts::PI * 2.0;
                let radius = (attempt as f32).sqrt() * 10.0;
                
                let x = start_x + radius * angle.cos();
                let y = start_y + radius * angle.sin();
                
                // 检查是否在所有领域之外
                let mut outside_all = true;
                for field in self.data.fields.values() {
                    let dx = x - field.position.0;
                    let dy = y - field.position.1;
                    let distance = (dx * dx + dy * dy).sqrt();
                    if distance - project_radius < field.radius {
                        outside_all = false;
                        break;
                    }
                }
                if !outside_all {
                    continue;
                }
                
                // 检查与其他项目的距离
                let mut overlaps = false;
                for existing in self.data.projects.values() {
                    if existing.id == project.id {
                        continue;
                    }
                    let dx = x - existing.position.0;
                    let dy = y - existing.position.1;
                    let dist = (dx * dx + dy * dy).sqrt();
                    if dist < project_radius + existing.radius + 15.0 {
                        overlaps = true;
                        break;
                    }
                }
                if !overlaps {
                    return (x, y);
                }
            }
            
            return (start_x, start_y);
        }

        // 计算所属领域的中心位置和半径
        let mut center_x = 0.0;
        let mut center_y = 0.0;
        let mut min_radius = f32::MAX;
        let mut field_count = 0;
        let mut target_fields: Vec<&ResearchField> = Vec::new();

        for field_id in &project.field_ids {
            if let Some(field) = self.data.fields.get(field_id) {
                center_x += field.position.0;
                center_y += field.position.1;
                min_radius = min_radius.min(field.radius);
                field_count += 1;
                target_fields.push(field);
            }
        }

        if field_count == 0 {
            return (400.0, 400.0);
        }

        // 计算多个领域的平均中心位置
        center_x /= field_count as f32;
        center_y /= field_count as f32;

        let project_radius = project.radius;

        // 单领域：计算远离其他领域的方向
        if field_count == 1 {
            let target_field = target_fields[0];
            
            // 收集其他领域的位置
            let other_fields: Vec<&ResearchField> = self.data.fields.values()
                .filter(|f| f.id != target_field.id)
                .collect();
            
            // 计算远离其他领域的方向
            let (preferred_angle, use_opposite) = if !other_fields.is_empty() {
                // 计算从目标领域中心指向其他领域中心的平均方向
                let mut avg_dx = 0.0;
                let mut avg_dy = 0.0;
                for other in &other_fields {
                    avg_dx += other.position.0 - target_field.position.0;
                    avg_dy += other.position.1 - target_field.position.1;
                }
                avg_dx /= other_fields.len() as f32;
                avg_dy /= other_fields.len() as f32;
                
                // 使用相反方向（远离其他领域）
                let opposite_angle = (-avg_dy).atan2(-avg_dx);
                (opposite_angle, true)
            } else {
                (0.0, false)
            };
            
            // 安全边距
            let safe_margin = project_radius + 15.0;
            let max_safe_radius = target_field.radius - safe_margin;
            
            // 收集该领域内已有项目的位置（用于找最空白的位置）
            let existing_projects: Vec<(f32, f32, f32)> = self.data.projects.values()
                .filter(|p| p.id != project.id && p.field_ids.contains(&target_field.id))
                .map(|p| (p.position.0, p.position.1, p.radius))
                .collect();
            
            // 生成候选位置并评分（离已有项目越远越好）
            let golden_angle = 2.399963229728653;  // 黄金角 ≈ 137.5°
            let mut best_pos: Option<(f32, f32)> = None;
            let mut best_min_dist = 0.0_f32;
            
            // 遍历多个候选位置
            let max_attempts = 200;
            for attempt in 0..max_attempts {
                // 黄金角螺旋覆盖整个领域
                let angle = (attempt as f32) * golden_angle;
                
                // 半径从边缘向内，覆盖整个领域
                let radius_factor = 0.8 - (attempt as f32 / max_attempts as f32) * 0.6;
                let radius = (max_safe_radius * radius_factor).max(project_radius + 10.0);
                
                let x = target_field.position.0 + radius * angle.cos();
                let y = target_field.position.1 + radius * angle.sin();
                
                // 检查是否在领域内
                let dx = x - target_field.position.0;
                let dy = y - target_field.position.1;
                let distance_from_center = (dx * dx + dy * dy).sqrt();
                if distance_from_center > max_safe_radius {
                    continue;
                }
                
                // 检查整个项目圆圈是否与其他领域交叉（项目圆圈不能进入非目标领域）
                let mut in_other_field = false;
                for other in &other_fields {
                    let odx = x - other.position.0;
                    let ody = y - other.position.1;
                    let dist_to_other = (odx * odx + ody * ody).sqrt();
                    // 项目圆圈最近点到领域中心的距离 = dist_to_other - project_radius
                    // 必须 >= other.radius（项目圆圈完全在非目标领域外）
                    if dist_to_other - project_radius < other.radius {
                        in_other_field = true;
                        break;
                    }
                }
                if in_other_field {
                    continue;
                }
                
                // 检查是否与已有项目重叠（保持间距）
                let mut has_overlap = false;
                let mut min_dist_to_existing = f32::MAX;
                for existing_project in self.data.projects.values() {
                    if existing_project.id == project.id {
                        continue;
                    }
                    let edx = x - existing_project.position.0;
                    let edy = y - existing_project.position.1;
                    let distance = (edx * edx + edy * edy).sqrt();
                    // 两个圆圈不能重叠：距离必须 > 两个半径之和 + 间距
                    let min_dist = project_radius + existing_project.radius + 15.0;  // 保持15像素间距
                    if distance < min_dist {
                        has_overlap = true;
                        break;
                    }
                    // 记录到最近项目的距离
                    min_dist_to_existing = min_dist_to_existing.min(distance);
                }
                if has_overlap {
                    continue;
                }
                
                // 检查是否被箭头穿过
                let mut crossed_by_arrow = false;
                for relation in &self.data.relations {
                    // 跳过与当前项目相关的箭头
                    if relation.from_id == project.id || relation.to_id == project.id {
                        continue;
                    }
                    if let (Some(from), Some(to)) = (
                        self.data.projects.get(&relation.from_id),
                        self.data.projects.get(&relation.to_id),
                    ) {
                        if self.point_near_line_segment(
                            x, y,
                            from.position.0, from.position.1,
                            to.position.0, to.position.1,
                            project_radius + 25.0,  // 箭头避让距离：项目半径 + 25像素间距
                        ) {
                            crossed_by_arrow = true;
                            break;
                        }
                    }
                }
                if crossed_by_arrow {
                    continue;
                }
                
                // 这是一个有效位置，记录离已有项目最远的位置
                if min_dist_to_existing > best_min_dist {
                    best_min_dist = min_dist_to_existing;
                    best_pos = Some((x, y));
                }
            }
            
            // 返回最空白的位置
            if let Some(pos) = best_pos {
                return pos;
            }
            
            // 回退：扩大搜索范围，放宽重叠和箭头限制，但仍严格检查领域边界
            for attempt in 0..200 {
                let angle = (attempt as f32) * 0.618 * std::f32::consts::PI * 2.0;
                let radius = (attempt as f32).sqrt() * 10.0;
                
                let x = target_field.position.0 + radius * angle.cos();
                let y = target_field.position.1 + radius * angle.sin();
                
                // 检查是否在目标领域内
                let dx = x - target_field.position.0;
                let dy = y - target_field.position.1;
                let distance_from_center = (dx * dx + dy * dy).sqrt();
                if distance_from_center + project_radius > target_field.radius - 5.0 {
                    continue;
                }
                
                // 严格检查：整个项目圆圈不能进入非目标领域
                let mut in_other_field = false;
                for other in &other_fields {
                    let odx = x - other.position.0;
                    let ody = y - other.position.1;
                    let dist_to_other = (odx * odx + ody * ody).sqrt();
                    if dist_to_other - project_radius < other.radius {
                        in_other_field = true;
                        break;
                    }
                }
                if in_other_field {
                    continue;
                }
                
                return (x, y);
            }
            
            // 最终回退：领域中心（不理想但至少在目标领域内）
            return (target_field.position.0, target_field.position.1);
        }
        
        // 多领域：找到真正的交集区域中心，同时远离非目标领域
        // 收集非目标领域
        let non_target_fields: Vec<&ResearchField> = self.data.fields.values()
            .filter(|f| !project.field_ids.contains(&f.id))
            .collect();
        
        // 计算远离非目标领域的方向
        let mut away_dir_x = 0.0;
        let mut away_dir_y = 0.0;
        for non_target in &non_target_fields {
            // 从非目标领域中心指向目标领域平均中心的方向
            away_dir_x += center_x - non_target.position.0;
            away_dir_y += center_y - non_target.position.1;
        }
        let away_len = (away_dir_x * away_dir_x + away_dir_y * away_dir_y).sqrt();
        if away_len > 0.0 {
            away_dir_x /= away_len;
            away_dir_y /= away_len;
        }
        
        // 使用迭代方法找到所有领域的交集中心，同时尽量远离非目标领域
        let mut intersection_center_x = center_x;
        let mut intersection_center_y = center_y;
        
        // 迭代优化：将中心点移向所有目标领域都能覆盖且远离非目标领域的位置
        for _ in 0..100 {
            let mut move_x = 0.0;
            let mut move_y = 0.0;
            let mut need_move = false;
            
            // 确保在所有目标领域内
            for field in &target_fields {
                let dx = intersection_center_x - field.position.0;
                let dy = intersection_center_y - field.position.1;
                let dist = (dx * dx + dy * dy).sqrt();
                let max_dist = field.radius - project_radius - 15.0;
                
                if dist > max_dist && dist > 0.0 {
                    let ratio = (dist - max_dist) / dist;
                    move_x -= dx * ratio * 0.5;
                    move_y -= dy * ratio * 0.5;
                    need_move = true;
                }
            }
            
            // 远离非目标领域
            for non_target in &non_target_fields {
                let dx = intersection_center_x - non_target.position.0;
                let dy = intersection_center_y - non_target.position.1;
                let dist = (dx * dx + dy * dy).sqrt();
                // 如果太靠近非目标领域，向外推
                if dist < non_target.radius + project_radius + 20.0 && dist > 0.0 {
                    let push_strength = (non_target.radius + project_radius + 20.0 - dist) / dist;
                    move_x += dx * push_strength * 0.3;
                    move_y += dy * push_strength * 0.3;
                    need_move = true;
                }
            }
            
            if !need_move {
                break;
            }
            
            intersection_center_x += move_x;
            intersection_center_y += move_y;
        }
        
        // 从交集中心开始搜索
        let base_radius = 0.0;  // 从中心开始
        
        let max_attempts = 100;
        for attempt in 0..max_attempts {
            let angle = (attempt as f32) * 0.618 * std::f32::consts::PI * 2.0;  // 黄金角
            let radius = base_radius + (attempt as f32).sqrt() * 8.0;  // 螺旋扩展

            let x = intersection_center_x + radius * angle.cos();
            let y = intersection_center_y + radius * angle.sin();

            // 检查整个项目圆圈是否完全在所有目标领域内
            let mut in_all_fields = true;
            for field in &target_fields {
                let dx = x - field.position.0;
                let dy = y - field.position.1;
                let distance = (dx * dx + dy * dy).sqrt();
                // 项目圆圈最远点必须在领域内（留10像素边距）
                if distance + project_radius > field.radius - 10.0 {
                    in_all_fields = false;
                    break;
                }
            }
            if !in_all_fields {
                continue;
            }
            
            // 检查整个项目圆圈是否完全在非目标领域外
            let mut in_non_target_field = false;
            for field in self.data.fields.values() {
                // 跳过目标领域
                if project.field_ids.contains(&field.id) {
                    continue;
                }
                let dx = x - field.position.0;
                let dy = y - field.position.1;
                let distance = (dx * dx + dy * dy).sqrt();
                // 整个项目圆圈必须在非目标领域外
                // 项目圆圈最近点到领域中心距离 = distance - project_radius
                if distance - project_radius < field.radius {
                    in_non_target_field = true;
                    break;
                }
            }
            if in_non_target_field {
                continue;
            }

            // 检查是否与已有项目重叠（保持间距）
            let mut has_overlap = false;
            for existing_project in self.data.projects.values() {
                if existing_project.id == project.id {
                    continue;
                }
                let dx = x - existing_project.position.0;
                let dy = y - existing_project.position.1;
                let distance = (dx * dx + dy * dy).sqrt();
                // 两个圆圈不能重叠：距离必须 > 两个半径之和 + 间距
                let min_dist = project_radius + existing_project.radius + 15.0;  // 保持15像素间距
                if distance < min_dist {
                    has_overlap = true;
                    break;
                }
            }
            if has_overlap {
                continue;
            }
            
            // 检查是否被箭头穿过
            let mut crossed_by_arrow = false;
            for relation in &self.data.relations {
                // 跳过与当前项目相关的箭头
                if relation.from_id == project.id || relation.to_id == project.id {
                    continue;
                }
                if let (Some(from), Some(to)) = (
                    self.data.projects.get(&relation.from_id),
                    self.data.projects.get(&relation.to_id),
                ) {
                    if self.point_near_line_segment(
                        x, y,
                        from.position.0, from.position.1,
                        to.position.0, to.position.1,
                        project_radius + 25.0,  // 箭头避让距离：项目半径 + 25像素间距
                    ) {
                        crossed_by_arrow = true;
                        break;
                    }
                }
            }
            if crossed_by_arrow {
                continue;
            }

            return (x, y);
        }

        // 最后的回退：返回交集中心位置
        (intersection_center_x, intersection_center_y)
    }

    /// 根据完成度百分比计算边界颜色
    /// 0% = 红色, 50% = 黄色, 100% = 绿色
    fn completion_percentage_to_color(&self, percentage: f32) -> Color32 {
        let p = percentage.clamp(0.0, 100.0) / 100.0;
        
        if p <= 0.5 {
            // 0% - 50%: 红色到黄色
            let ratio = p * 2.0; // 0.0 到 1.0
            let r = 255.0;
            let g = (255.0 * ratio) as u8;
            let b = 0;
            Color32::from_rgb(r as u8, g, b)
        } else {
            // 50% - 100%: 黄色到绿色
            let ratio = (p - 0.5) * 2.0; // 0.0 到 1.0
            let r = (255.0 * (1.0 - ratio)) as u8;
            let g = 255;
            let b = 0;
            Color32::from_rgb(r, g, b)
        }
    }

    /// 计算图例的矩形区域
    fn get_legend_rect(&self, rect: Rect) -> Rect {
        // 图例尺寸参数
        let padding = 12.0;
        let legend_width = 140.0;
        let item_height = 18.0;
        let spacing = 3.0;
        let title_height = 22.0;
        let section_title_height = 16.0;
        let section_spacing = 8.0;
        
        // 项目状态部分：5个状态 + 1个标题
        let status_count = 5;
        // 完成度部分：3个示例 + 1个标题
        let completion_count = 3;
        
        // 精确计算高度
        let legend_height = padding  // 顶部内边距
            + title_height  // 标题
            + spacing  // 标题后间距
            + section_title_height  // "项目状态:"
            + (status_count as f32) * (item_height + spacing)  // 状态项
            + section_spacing  // 分组间距
            + section_title_height  // "完成度:"
            + (completion_count as f32) * (item_height + spacing)  // 完成度项
            + padding;  // 底部内边距
        
        // 默认位置：右上角
        let default_x = rect.right() - legend_width - 10.0;
        let default_y = rect.top() + 10.0;
        
        // 应用用户拖拽的偏移
        let legend_x = default_x + self.legend_position.x;
        let legend_y = default_y + self.legend_position.y;
        
        // 限制图例在可视化区域内
        let legend_x = legend_x.clamp(rect.left(), rect.right() - legend_width);
        let legend_y = legend_y.clamp(rect.top(), rect.bottom() - legend_height);
        
        Rect::from_min_size(
            pos2(legend_x, legend_y),
            vec2(legend_width, legend_height),
        )
    }
    
    /// 绘制图例，显示项目状态和完成度的颜色含义
    fn draw_legend(&self, painter: &egui::Painter, rect: Rect, _theme: &Theme) {
        use crate::models::ProjectStatus;
        
        if !self.settings.show_legend {
            return;
        }
        
        // 获取图例矩形
        let legend_rect = self.get_legend_rect(rect);
        let legend_x = legend_rect.left();
        let legend_y = legend_rect.top();
        let legend_width = legend_rect.width();
        
        // 图例尺寸参数
        let padding = 12.0;
        let item_height = 18.0;
        let spacing = 3.0;
        let title_height = 22.0;
        let section_title_height = 16.0;
        let section_spacing = 8.0;
        
        // 绘制半透明背景
        let bg_color = Color32::from_rgba_unmultiplied(255, 255, 255, 240);
        painter.rect_filled(legend_rect, 4.0, bg_color);
        painter.rect_stroke(legend_rect, 4.0, (1.0, Color32::from_rgb(180, 180, 180)));
        
        // 绘制标题
        let mut current_y = legend_y + padding + title_height / 2.0;
        painter.text(
            pos2(legend_x + legend_width / 2.0, current_y),
            Align2::CENTER_CENTER,
            "图例",
            FontId::proportional(12.0),
            Color32::BLACK,
        );
        current_y += title_height / 2.0 + spacing;
        
        // 绘制项目状态图例
        current_y += section_title_height / 2.0;
        painter.text(
            pos2(legend_x + padding, current_y),
            Align2::LEFT_CENTER,
            "项目状态:",
            FontId::proportional(10.0),
            Color32::DARK_GRAY,
        );
        current_y += section_title_height / 2.0;
        
        let statuses = [
            ProjectStatus::Published,
            ProjectStatus::Submitted,
            ProjectStatus::HighPriority,
            ProjectStatus::SteadyProgress,
            ProjectStatus::ToBeStarted,
        ];
        
        for status in &statuses {
            let color = status.color();
            let name = status.name();
            
            current_y += item_height / 2.0;
            
            // 绘制颜色圆圈
            let circle_radius = 5.0;
            let circle_x = legend_x + padding + circle_radius;
            painter.circle_filled(
                pos2(circle_x, current_y),
                circle_radius,
                color,
            );
            // 如果是白色，添加边框以便看清
            if color == Color32::from_rgb(255, 255, 255) {
                painter.circle_stroke(
                    pos2(circle_x, current_y),
                    circle_radius,
                    (1.0, Color32::GRAY),
                );
            }
            
            // 绘制文本
            painter.text(
                pos2(circle_x + circle_radius + 6.0, current_y),
                Align2::LEFT_CENTER,
                name,
                FontId::proportional(9.0),
                Color32::BLACK,
            );
            
            current_y += item_height / 2.0 + spacing;
        }
        
        // 绘制完成度图例
        current_y += section_spacing;
        current_y += section_title_height / 2.0;
        painter.text(
            pos2(legend_x + padding, current_y),
            Align2::LEFT_CENTER,
            "完成度:",
            FontId::proportional(10.0),
            Color32::DARK_GRAY,
        );
        current_y += section_title_height / 2.0;
        
        let completion_examples = [0.0, 50.0, 100.0];
        for percentage in &completion_examples {
            let color = self.completion_percentage_to_color(*percentage);
            let label = format!("{}%", *percentage as i32);
            
            current_y += item_height / 2.0;
            
            // 绘制颜色圆圈（带边框）
            let circle_radius = 5.0;
            let circle_x = legend_x + padding + circle_radius;
            // 先绘制白色填充
            painter.circle_filled(
                pos2(circle_x, current_y),
                circle_radius,
                Color32::WHITE,
            );
            // 绘制完成度颜色作为边框
            painter.circle_stroke(
                pos2(circle_x, current_y),
                circle_radius,
                (2.0, color),
            );
            
            // 绘制文本
            painter.text(
                pos2(circle_x + circle_radius + 6.0, current_y),
                Align2::LEFT_CENTER,
                &label,
                FontId::proportional(9.0),
                Color32::BLACK,
            );
            
            current_y += item_height / 2.0 + spacing;
        }
    }

    /// 根据项目分布动态调整三个研究领域圆圈的位置和大小
    /// 确保三个圆圈有合适的交集区域
    fn adjust_field_layout(&mut self) {
        // 统计每个领域和交集区域的项目数量
        let field_ids: Vec<String> = self.data.fields.keys().cloned().collect();
        if field_ids.len() != 3 {
            return; // 只处理3个领域的情况
        }

        let field1_id = &field_ids[0];
        let field2_id = &field_ids[1];
        let field3_id = &field_ids[2];

        // 统计各区域的项目数量
        let mut count_field1_only = 0;
        let mut count_field2_only = 0;
        let mut count_field3_only = 0;
        let mut count_field12 = 0; // field1 和 field2 的交集
        let mut count_field13 = 0; // field1 和 field3 的交集
        let mut count_field23 = 0; // field2 和 field3 的交集
        let mut count_all = 0; // 三个领域的交集

        for project in self.data.projects.values() {
            let has1 = project.field_ids.contains(field1_id);
            let has2 = project.field_ids.contains(field2_id);
            let has3 = project.field_ids.contains(field3_id);

            match (has1, has2, has3) {
                (true, false, false) => count_field1_only += 1,
                (false, true, false) => count_field2_only += 1,
                (false, false, true) => count_field3_only += 1,
                (true, true, false) => count_field12 += 1,
                (true, false, true) => count_field13 += 1,
                (false, true, true) => count_field23 += 1,
                (true, true, true) => count_all += 1,
                _ => {}
            }
        }

        // 计算总项目数
        let total_projects = self.data.projects.len() as f32;
        if total_projects == 0.0 {
            return; // 没有项目，使用默认布局
        }

        // 计算交集区域需要的空间（基于项目数量）
        // 三个领域交集的项目数量影响交集区域大小
        let intersection_weight = (count_all as f32 / total_projects.max(1.0)).min(1.0);
        
        // 计算每个领域的项目密度
        let density1 = (count_field1_only + count_field12 + count_field13 + count_all) as f32 / total_projects;
        let density2 = (count_field2_only + count_field12 + count_field23 + count_all) as f32 / total_projects;
        let density3 = (count_field3_only + count_field13 + count_field23 + count_all) as f32 / total_projects;

        // 基础半径（根据项目密度调整，但确保最小值）
        let base_radius: f32 = 180.0;
        let radius1 = base_radius.max(150.0) + density1 * 80.0;
        let radius2 = base_radius.max(150.0) + density2 * 80.0;
        let radius3 = base_radius.max(150.0) + density3 * 80.0;

        // 计算三个圆圈的中心位置，确保有交集
        // 使用等边三角形布局，中心在 (400, 400)
        let center_x = 400.0;
        let center_y = 400.0;
        
        // 根据交集项目数量调整三角形大小
        // 如果有三个领域的交集项目，需要缩小三角形使圆圈更靠近
        let base_triangle_size = 120.0;
        // 交集项目越多，三角形越小（圆圈越靠近）
        let triangle_size = base_triangle_size * (1.0 - intersection_weight * 0.4);
        
        // 确保三角形大小使得三个圆圈有交集
        // 等边三角形的边长 = triangle_size * 2 * sin(60度) ≈ triangle_size * 1.732
        let triangle_side = triangle_size * 1.732;
        let min_radius_sum = (radius1 + radius2).min(radius2 + radius3).min(radius1 + radius3);
        
        // 如果三角形太大，调整它以确保有交集
        let final_triangle_size = if triangle_side > min_radius_sum * 0.8 {
            let adjusted_size = min_radius_sum * 0.46; // 0.8 / 1.732 ≈ 0.46
            adjusted_size.max(80.0) // 最小80像素
        } else {
            triangle_size
        };
        
        // 第一个圆圈（顶部）
        let angle1 = -std::f32::consts::PI / 2.0; // -90度
        let pos1_x = center_x + final_triangle_size * angle1.cos();
        let pos1_y = center_y + final_triangle_size * angle1.sin();
        
        // 第二个圆圈（左下）
        let angle2 = -std::f32::consts::PI / 2.0 + 2.0 * std::f32::consts::PI / 3.0; // -90 + 120度
        let pos2_x = center_x + final_triangle_size * angle2.cos();
        let pos2_y = center_y + final_triangle_size * angle2.sin();
        
        // 第三个圆圈（右下）
        let angle3 = -std::f32::consts::PI / 2.0 + 4.0 * std::f32::consts::PI / 3.0; // -90 + 240度
        let pos3_x = center_x + final_triangle_size * angle3.cos();
        let pos3_y = center_y + final_triangle_size * angle3.sin();

        // 更新领域位置和半径
        if let Some(field1) = self.data.fields.get_mut(field1_id) {
            field1.position = (pos1_x, pos1_y);
            field1.radius = radius1;
        }
        if let Some(field2) = self.data.fields.get_mut(field2_id) {
            field2.position = (pos2_x, pos2_y);
            field2.radius = radius2;
        }
        if let Some(field3) = self.data.fields.get_mut(field3_id) {
            field3.position = (pos3_x, pos3_y);
            field3.radius = radius3;
        }
    }
    
    /// 设置对话框 - VSCode风格
    fn settings_dialog(&mut self, ctx: &Context) {
        let theme = Theme::light();
        
        egui::Window::new("设置")
            .collapsible(false)
            .resizable(true)
            .default_size([550.0, 600.0])
            .show(ctx, |ui| {
                ui.set_width(550.0);
                
                ScrollArea::vertical().show(ui, |ui| {
                    ui.heading(
                        RichText::new("设置")
                            .size(16.0)
                            .color(theme.text_primary)
                    );
                    ui.add_space(8.0);
                    ui.separator();
                    ui.add_space(12.0);
                    
                    // 自动保存设置
                    ui.vertical(|ui| {
                        ui.label(
                            RichText::new("自动保存")
                                .size(12.0)
                                .color(theme.text_secondary)
                        );
                        ui.add_space(8.0);
                        ui.checkbox(&mut self.settings.auto_save, "启用自动保存");
                        if self.settings.auto_save {
                            ui.add_space(8.0);
                            ui.vertical(|ui| {
                                ui.label(
                                    RichText::new("保存间隔（秒）").size(11.0).color(theme.text_secondary)
                                );
                                ui.add_space(4.0);
                                ui.add(egui::Slider::new(&mut self.settings.auto_save_interval, 60..=3600)
                                    .suffix(" 秒"));
                            });
                        }
                    });
                    
                    ui.add_space(16.0);
                    ui.separator();
                    ui.add_space(12.0);
                    
                    // 可视化设置
                    ui.vertical(|ui| {
                        ui.label(
                            RichText::new("可视化设置")
                                .size(12.0)
                                .color(theme.text_secondary)
                        );
                        ui.add_space(8.0);
                        ui.vertical(|ui| {
                            ui.label(
                                RichText::new("默认缩放").size(11.0).color(theme.text_secondary)
                            );
                            ui.add_space(4.0);
                            ui.add(egui::Slider::new(&mut self.settings.default_zoom, 0.1..=3.0)
                                .step_by(0.1));
                        });
                        ui.add_space(8.0);
                        ui.checkbox(&mut self.settings.show_project_numbers, "显示项目编号");
                        ui.checkbox(&mut self.settings.show_project_names, "显示项目名称");
                        ui.add_space(8.0);
                        ui.vertical(|ui| {
                            ui.label(
                                RichText::new("领域边框宽度").size(11.0).color(theme.text_secondary)
                            );
                            ui.add_space(4.0);
                            ui.add(egui::Slider::new(&mut self.settings.field_border_width, 1.0..=5.0)
                                .step_by(0.5));
                        });
                    ui.add_space(8.0);
                    ui.vertical(|ui| {
                        ui.label(
                            RichText::new("项目边框宽度").size(11.0).color(theme.text_secondary)
                        );
                        ui.add_space(4.0);
                        ui.add(egui::Slider::new(&mut self.settings.project_border_width, 1.0..=5.0)
                            .step_by(0.5));
                    });
                    ui.add_space(8.0);
                    ui.vertical(|ui| {
                        ui.label(
                            RichText::new("背景颜色").size(11.0).color(theme.text_secondary)
                        );
                        ui.add_space(4.0);
                        let mut bg_color_rgba = [
                            self.settings.visualization_bg_color[0] as f32 / 255.0,
                            self.settings.visualization_bg_color[1] as f32 / 255.0,
                            self.settings.visualization_bg_color[2] as f32 / 255.0,
                            self.settings.visualization_bg_color[3] as f32 / 255.0,
                        ];
                        if ui.color_edit_button_rgba_unmultiplied(&mut bg_color_rgba).changed() {
                            self.settings.visualization_bg_color = [
                                (bg_color_rgba[0] * 255.0) as u8,
                                (bg_color_rgba[1] * 255.0) as u8,
                                (bg_color_rgba[2] * 255.0) as u8,
                                (bg_color_rgba[3] * 255.0) as u8,
                            ];
                        }
                    });
                });
                    
                    ui.add_space(16.0);
                    ui.separator();
                    ui.add_space(12.0);
                    
                    // 历史记录设置
                    ui.vertical(|ui| {
                        ui.label(
                            RichText::new("历史记录设置")
                                .size(12.0)
                                .color(theme.text_secondary)
                        );
                        ui.add_space(8.0);
                        ui.vertical(|ui| {
                            ui.label(
                                RichText::new("最大历史记录数").size(11.0).color(theme.text_secondary)
                            );
                            ui.add_space(4.0);
                            ui.add(egui::Slider::new(&mut self.settings.max_history_size, 10..=200)
                                .step_by(10.0));
                        });
                    });
                    
                    ui.add_space(16.0);
                    ui.separator();
                    ui.add_space(12.0);
                    
                    // 用户设置
                    ui.vertical(|ui| {
                        ui.label(
                            RichText::new("用户设置")
                                .size(12.0)
                                .color(theme.text_secondary)
                        );
                        ui.add_space(8.0);
                        ui.vertical(|ui| {
                            ui.label(
                                RichText::new("当前用户").size(11.0).color(theme.text_secondary)
                            );
                            ui.add_space(4.0);
                            if let Some(ref username) = self.current_user {
                                ui.label(
                                    RichText::new(username).size(12.0).color(theme.text_primary)
                                );
                            } else {
                                ui.label(
                                    RichText::new("未登录").size(12.0).color(theme.text_secondary)
                                );
                            }
                        });
                        ui.add_space(8.0);
                        ui.vertical(|ui| {
                            ui.label(
                                RichText::new("数据存储路径").size(11.0).color(theme.text_secondary)
                            );
                            ui.add_space(4.0);
                            if let Some(ref path) = self.user_data_storage_path {
                                ui.label(
                                    RichText::new(path).size(11.0).color(theme.text_primary)
                                );
                            } else {
                                ui.label(
                                    RichText::new("未设置").size(11.0).color(theme.text_secondary)
                                );
                            }
                        });
                        ui.add_space(12.0);
                        ui.horizontal(|ui| {
                            if ui.add_sized(
                                [ui.available_width() / 2.0 - 4.0, 28.0],
                                Button::new(
                                    RichText::new("设置路径")
                                        .size(12.0)
                                        .color(theme.text_primary)
                                )
                                .fill(theme.surface)
                            ).clicked() {
                                self.set_data_storage_path();
                            }
                            ui.add_space(8.0);
                            if ui.add_sized(
                                [ui.available_width(), 28.0],
                                Button::new(
                                    RichText::new("加载")
                                        .size(12.0)
                                        .color(theme.text_primary)
                                )
                                .fill(theme.surface)
                            ).clicked() {
                                self.load_from_storage_path();
                            }
                        });
                    });
                    
                    ui.add_space(24.0);
                    ui.separator();
                    ui.add_space(12.0);
                    
                    ui.horizontal(|ui| {
                        if ui.add_sized(
                            [100.0, 28.0],
                            Button::new(
                                RichText::new("确定")
                                    .size(12.0)
                                    .color(Color32::WHITE)
                            )
                            .fill(theme.primary)
                        ).clicked() {
                            // 应用设置
                            self.max_history_size = self.settings.max_history_size;
                            self.visualization_zoom = self.settings.default_zoom;
                            // 保存设置
                            self.save_settings();
                            self.show_settings_dialog = false;
                        }
                        ui.add_space(8.0);
                        if ui.add_sized(
                            [100.0, 28.0],
                            Button::new(
                                RichText::new("取消")
                                    .size(12.0)
                                    .color(theme.text_primary)
                            )
                            .fill(theme.surface)
                        ).clicked() {
                            // 重新加载设置，取消更改
                            self.load_settings();
                            self.show_settings_dialog = false;
                        }
                        ui.add_space(8.0);
                        if ui.add_sized(
                            [100.0, 28.0],
                            Button::new(
                                RichText::new("重置")
                                    .size(12.0)
                                    .color(theme.text_primary)
                            )
                            .fill(theme.surface)
                        ).clicked() {
                            self.settings = AppSettings::default();
                        }
                    });
                });
            });
    }
    
    /// 图例设置对话框
    fn legend_settings_dialog(&mut self, ctx: &Context) {
        let theme = Theme::light();
        
        egui::Window::new("图例设置")
            .collapsible(false)
            .resizable(false)
            .anchor(Align2::CENTER_CENTER, [0.0, 0.0])
            .fixed_size([280.0, 200.0])
            .frame(Frame::window(&ctx.style()).fill(theme.background))
            .show(ctx, |ui| {
                ui.vertical(|ui| {
                    ui.add_space(8.0);
                    
                    // 显示/隐藏图例
                    ui.horizontal(|ui| {
                        ui.label(
                            RichText::new("显示图例")
                                .size(12.0)
                                .color(theme.text_primary)
                        );
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            ui.checkbox(&mut self.settings.show_legend, "");
                        });
                    });
                    
                    ui.add_space(8.0);
                    ui.separator();
                    ui.add_space(8.0);
                    
                    // 重置位置按钮
                    if ui.add_sized(
                        [ui.available_width(), 28.0],
                        Button::new(
                            RichText::new("重置图例位置")
                                .size(12.0)
                                .color(theme.text_primary)
                        )
                        .fill(theme.surface)
                    ).clicked() {
                        self.legend_position = Vec2::ZERO;
                    }
                    
                    ui.add_space(16.0);
                    
                    // 提示信息
                    ui.label(
                        RichText::new("提示：可以拖拽图例调整位置")
                            .size(10.0)
                            .color(theme.text_secondary)
                    );
                    
                    ui.add_space(16.0);
                    ui.separator();
                    ui.add_space(8.0);
                    
                    // 关闭按钮
                    ui.horizontal(|ui| {
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            if ui.add_sized(
                                [80.0, 28.0],
                                Button::new(
                                    RichText::new("关闭")
                                        .size(12.0)
                                        .color(Color32::WHITE)
                                )
                                .fill(theme.primary)
                            ).clicked() {
                                self.save_settings();
                                self.show_legend_settings = false;
                            }
                        });
                    });
                });
            });
    }
    
    /// 加载应用设置
    fn load_settings(&mut self) {
        let settings_path = "app_settings.yaml";
        if std::path::Path::new(settings_path).exists() {
            if let Ok(content) = std::fs::read_to_string(settings_path) {
                if let Ok(settings) = serde_yaml::from_str::<AppSettings>(&content) {
                    self.settings = settings;
                    return;
                }
            }
        }
        // 如果加载失败，使用默认设置
        self.settings = AppSettings::default();
    }
    
    /// 保存应用设置
    fn save_settings(&self) {
        let settings_path = "app_settings.yaml";
        if let Ok(yaml) = serde_yaml::to_string(&self.settings) {
            if let Err(e) = std::fs::write(settings_path, yaml) {
                eprintln!("保存设置失败: {}", e);
            }
        }
    }
    
    /// 为admin用户创建复杂的初始数据（用于展示功能）
    fn create_admin_initial_data(&self) -> AppData {
        let mut fields = indexmap::IndexMap::new();
        let mut projects = indexmap::IndexMap::new();
        let mut relations = Vec::new();
        let mut relation_tags = vec![
            "依赖".to_string(),
            "扩展".to_string(),
            "参考".to_string(),
            "补充".to_string(),
            "替代".to_string(),
        ];

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

        // 添加多个项目，展示不同状态和领域
        projects.insert("project_1".to_string(), Project {
            id: "project_1".to_string(),
            name: "itol.toolkit".to_string(),
            description: "iTOL工具包，用于可视化系统发育树".to_string(),
            status: ProjectStatus::Published,
            field_ids: vec!["bioinfo_tools".to_string()],
            position: (550.0, 450.0),
            radius: 20.0,
            completion_percentage: 100.0,
        });

        projects.insert("project_2".to_string(), Project {
            id: "project_2".to_string(),
            name: "VnFinder".to_string(),
            description: "VnFinder工具，用于病毒发现".to_string(),
            status: ProjectStatus::Published,
            field_ids: vec!["microbial_ecology".to_string()],
            position: (250.0, 450.0),
            radius: 20.0,
            completion_percentage: 100.0,
        });

        projects.insert("project_3".to_string(), Project {
            id: "project_3".to_string(),
            name: "RNA结构预测工具".to_string(),
            description: "基于深度学习的RNA二级结构预测".to_string(),
            status: ProjectStatus::Submitted,
            field_ids: vec!["rna_structure".to_string(), "bioinfo_tools".to_string()],
            position: (450.0, 300.0),
            radius: 20.0,
            completion_percentage: 90.0,
        });

        projects.insert("project_4".to_string(), Project {
            id: "project_4".to_string(),
            name: "微生物群落分析".to_string(),
            description: "16S rRNA测序数据分析流程".to_string(),
            status: ProjectStatus::HighPriority,
            field_ids: vec!["microbial_ecology".to_string()],
            position: (200.0, 450.0),
            radius: 20.0,
            completion_percentage: 60.0,
        });

        projects.insert("project_5".to_string(), Project {
            id: "project_5".to_string(),
            name: "RNA-RNA相互作用预测".to_string(),
            description: "预测RNA分子间的相互作用".to_string(),
            status: ProjectStatus::SteadyProgress,
            field_ids: vec!["rna_structure".to_string()],
            position: (400.0, 250.0),
            radius: 20.0,
            completion_percentage: 40.0,
        });

        projects.insert("project_6".to_string(), Project {
            id: "project_6".to_string(),
            name: "新工具开发计划".to_string(),
            description: "计划开发的新生物信息学工具".to_string(),
            status: ProjectStatus::ToBeStarted,
            field_ids: vec!["bioinfo_tools".to_string()],
            position: (600.0, 450.0),
            radius: 20.0,
            completion_percentage: 0.0,
        });

        // 添加多个关系，展示不同类型的连接
        relations.push(ProjectRelation {
            from_id: "project_1".to_string(),
            to_id: "project_2".to_string(),
            relation_type: RelationType::Direct,
            tags: vec!["依赖".to_string()],
            color: [0, 0, 255, 255],
            width: 2.0,
        });

        relations.push(ProjectRelation {
            from_id: "project_3".to_string(),
            to_id: "project_1".to_string(),
            relation_type: RelationType::Indirect,
            tags: vec!["参考".to_string()],
            color: [128, 128, 128, 255],
            width: 1.5,
        });

        relations.push(ProjectRelation {
            from_id: "project_4".to_string(),
            to_id: "project_2".to_string(),
            relation_type: RelationType::Direct,
            tags: vec!["扩展".to_string()],
            color: [0, 128, 0, 255],
            width: 2.5,
        });

        relations.push(ProjectRelation {
            from_id: "project_5".to_string(),
            to_id: "project_3".to_string(),
            relation_type: RelationType::Indirect,
            tags: vec!["补充".to_string()],
            color: [255, 165, 0, 255],
            width: 1.8,
        });

        AppData {
            fields,
            projects,
            relations,
            relation_tags,
        }
    }
    
}

impl eframe::App for VennCVApp {
    fn update(&mut self, ctx: &Context, _frame: &mut eframe::Frame) {
        // 在所有UI渲染之前消耗Tab键并处理，防止egui默认焦点切换
        if self.is_logged_in {
            // 清除egui的焦点，防止Tab键导航到UI元素
            ctx.memory_mut(|m| m.request_focus(egui::Id::NULL));
            
            // 消耗Tab键事件并获取状态
            let tab_pressed = ctx.input_mut(|i| i.consume_key(egui::Modifiers::NONE, Key::Tab));
            let shift_tab_pressed = ctx.input_mut(|i| i.consume_key(egui::Modifiers::SHIFT, Key::Tab));
            let cmd_tab_pressed = ctx.input_mut(|i| i.consume_key(egui::Modifiers::MAC_CMD, Key::Tab));
            
            // 处理Tab键逻辑
            if cmd_tab_pressed {
                if self.toolbar_focus_index.is_some() {
                    self.toolbar_focus_index = None;
                } else {
                    self.toolbar_focus_index = Some(0);
                }
            } else if tab_pressed {
                if self.toolbar_focus_index.is_some() {
                    let toolbar_count = 9;
                    self.toolbar_focus_index = Some(match self.toolbar_focus_index {
                        Some(idx) => (idx + 1) % toolbar_count,
                        None => 0,
                    });
                } else {
                    self.next_project();
                }
            } else if shift_tab_pressed {
                if self.toolbar_focus_index.is_some() {
                    let toolbar_count = 9;
                    self.toolbar_focus_index = Some(match self.toolbar_focus_index {
                        Some(idx) => if idx == 0 { toolbar_count - 1 } else { idx - 1 },
                        None => toolbar_count - 1,
                    });
                } else {
                    self.previous_project();
                }
            }
        }
        
        if !self.is_logged_in {
            self.login_ui(ctx);
        } else {
            // 显示设置对话框（在main_ui之前，确保对话框在最上层）
            if self.show_settings_dialog {
                self.settings_dialog(ctx);
            }
            // 显示图例设置对话框
            if self.show_legend_settings {
                self.legend_settings_dialog(ctx);
            }
            self.main_ui(ctx);
        }
    }
}

