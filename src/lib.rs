//! VennCV：WebAssembly（Trunk + egui）逻辑；桌面端请使用 Tauri + `web/`。
#![cfg_attr(target_arch = "wasm32", allow(clippy::unused_unit))]

pub mod app;
pub mod left_sidebar;
pub mod logger;
pub mod models;
pub mod platform;

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

/// 将 panic 打到浏览器控制台（开发者工具 / `trunk serve` 终端），便于定位闪退原因。
#[cfg(target_arch = "wasm32")]
fn install_wasm_panic_hook() {
    use std::panic;
    panic::set_hook(Box::new(|info| {
        let msg = if let Some(s) = info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "(panic payload not str)".to_string()
        };
        let loc = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());
        let full = format!("[VennCV PANIC] {msg} @ {loc}");
        web_sys::console::error_1(&wasm_bindgen::JsValue::from_str(&full));
        log::error!("{full}");
    }));
}

#[cfg(target_arch = "wasm32")]
fn setup_custom_fonts(ctx: &egui::Context) {
    use egui::FontFamily;

    let mut fonts = egui::FontDefinitions::default();

    // Noto Sans SC（子集，OFL）；与 Web 共用 `web/public/fonts/`，见 LICENSE_NOTO.txt
    const NOTO_SC: &[u8] = include_bytes!("../web/public/fonts/NotoSansSC-Regular.otf");
    fonts.font_data.insert(
        "chinese".to_owned(),
        egui::FontData::from_static(NOTO_SC),
    );
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
    log::info!("Web 版已嵌入 Noto Sans SC（简体子集）");

    ctx.set_fonts(fonts);
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub struct WebHandle {
    runner: eframe::WebRunner,
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
impl WebHandle {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        install_wasm_panic_hook();
        let _ = eframe::WebLogger::init(log::LevelFilter::Debug);
        Self {
            runner: eframe::WebRunner::new(),
        }
    }

    #[wasm_bindgen]
    pub async fn start(&self, canvas_id: &str) -> Result<(), wasm_bindgen::JsValue> {
        use app::VennCVApp;
        self.runner
            .start(
                canvas_id,
                eframe::WebOptions::default(),
                Box::new(|cc| {
                    setup_custom_fonts(&cc.egui_ctx);
                    Box::new(VennCVApp::new(cc))
                }),
            )
            .await
    }
}
