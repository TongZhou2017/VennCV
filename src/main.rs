mod models;
mod app;

use app::VennCVApp;

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1200.0, 800.0])
            .with_title("科研项目管理系统 - VennCV"),
        ..Default::default()
    };

    eframe::run_native(
        "VennCV",
        options,
        Box::new(|cc| {
            // 配置中文字体支持
            setup_custom_fonts(&cc.egui_ctx);
            Box::new(VennCVApp::new(cc))
        }),
    )
}

fn setup_custom_fonts(ctx: &egui::Context) {
    use egui::FontFamily;

    let mut fonts = egui::FontDefinitions::default();

    // 尝试从系统加载中文字体
    // macOS: PingFang SC, STHeiti, Arial Unicode MS
    // Windows: Microsoft YaHei, SimHei, SimSun
    // Linux: Noto Sans CJK SC, WenQuanYi Micro Hei
    
    // 方法1: 尝试使用系统字体路径（如果可用）
    #[cfg(target_os = "macos")]
    let system_font_paths = vec![
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    ];
    
    #[cfg(target_os = "windows")]
    let system_font_paths = vec![
        "C:/Windows/Fonts/msyh.ttc",      // Microsoft YaHei
        "C:/Windows/Fonts/simhei.ttf",    // SimHei
        "C:/Windows/Fonts/simsun.ttc",    // SimSun
    ];
    
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let system_font_paths = vec![
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    ];

    // 尝试加载系统字体
    let mut font_loaded = false;
    for font_path in system_font_paths {
        if let Ok(font_data) = std::fs::read(font_path) {
            fonts.font_data.insert(
                "chinese".to_owned(),
                egui::FontData::from_owned(font_data),
            );
            font_loaded = true;
            break;
        }
    }

    // 如果系统字体加载失败，使用 egui 内置字体作为回退
    // 并尝试使用系统字体名称（某些系统可能支持）
    if !font_loaded {
        // 使用默认字体，但配置字体回退
        // 注意：这不能完全解决中文显示问题，但至少不会崩溃
        eprintln!("警告: 无法加载中文字体文件，中文可能无法正常显示");
        eprintln!("建议: 安装 Noto Sans CJK 或使用系统自带中文字体");
    }

    // 配置字体优先级
    if font_loaded {
        fonts
            .families
            .get_mut(&FontFamily::Proportional)
            .unwrap()
            .insert(0, "chinese".to_owned());
        
        fonts
            .families
            .get_mut(&FontFamily::Monospace)
            .unwrap()
            .insert(0, "chinese".to_owned());
    }

    ctx.set_fonts(fonts);
}
