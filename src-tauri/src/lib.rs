mod nutstore;
mod user_library;

use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

fn build_app_submenu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<tauri::menu::Submenu<R>> {
    let settings = MenuItemBuilder::new("设置…")
        .id("settings")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    let mut builder = SubmenuBuilder::new(app, "VennCV")
        .about(None)
        .separator()
        .item(&settings)
        .separator();

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator();
    }

    builder.quit().build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();

            let app_menu = build_app_submenu(handle)?;

            let file_menu = SubmenuBuilder::new(handle, "文件")
                .item(
                    &MenuItemBuilder::new("保存工作区")
                        .id("save")
                        .accelerator("CmdOrCtrl+S")
                        .build(handle)?,
                )
                .item(
                    &MenuItemBuilder::new("导入 JSON…")
                        .id("import")
                        .accelerator("CmdOrCtrl+O")
                        .build(handle)?,
                )
                .item(
                    &MenuItemBuilder::new("导出 JSON…")
                        .id("export")
                        .accelerator("CmdOrCtrl+Shift+S")
                        .build(handle)?,
                )
                .build()?;

            let edit_menu = SubmenuBuilder::new(handle, "编辑")
                .cut()
                .copy()
                .paste()
                .select_all()
                .separator()
                .item(
                    &MenuItemBuilder::new("撤销")
                        .id("undo")
                        .accelerator("CmdOrCtrl+Z")
                        .build(handle)?,
                )
                .item(
                    &MenuItemBuilder::new("重做")
                        .id("redo")
                        .accelerator("CmdOrCtrl+Shift+Z")
                        .build(handle)?,
                )
                .build()?;

            let view_menu = SubmenuBuilder::new(handle, "视图")
                .item(
                    &MenuItemBuilder::new("放大")
                        .id("zoom_in")
                        .accelerator("CmdOrCtrl+=")
                        .build(handle)?,
                )
                .item(
                    &MenuItemBuilder::new("缩小")
                        .id("zoom_out")
                        .accelerator("CmdOrCtrl+-")
                        .build(handle)?,
                )
                .build()?;

            let account_menu = SubmenuBuilder::new(handle, "账户")
                .item(&MenuItemBuilder::new("退出登录").id("logout").build(handle)?)
                .build()?;

            let menu = MenuBuilder::new(handle)
                .items(&[
                    &app_menu,
                    &file_menu,
                    &edit_menu,
                    &view_menu,
                    &account_menu,
                ])
                .build()?;

            app.set_menu(menu)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            user_library::user_library_snapshot,
            user_library::user_library_choices,
            user_library::user_library_switch,
            user_library::user_library_forget,
            user_library::user_library_write,
            nutstore::nutstore_webdav,
        ])
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            let handled = matches!(
                id,
                "settings"
                    | "save"
                    | "import"
                    | "export"
                    | "undo"
                    | "redo"
                    | "zoom_in"
                    | "zoom_out"
                    | "logout"
            );
            if handled {
                let payload = serde_json::json!({ "id": id });
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.emit("app:menu", &payload);
                } else {
                    let _ = app.emit("app:menu", &payload);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
