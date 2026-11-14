use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const LIBRARY_ROOTS_FILE: &str = "library_roots.json";
const MAX_LIBRARY_ROOTS: usize = 12;
static CURRENT_ROOT: Mutex<Option<PathBuf>> = Mutex::new(None);

const CONFIG_FILE: &str = "config.yaml";
const SYNC_ACCOUNT_FILE: &str = "sync_account.json";
const MAX_LIBRARY_FILE_BYTES: u64 = 32 * 1024 * 1024;

fn is_safe_username(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_alphanumeric() {
        return false;
    }
    name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-')
}

fn is_safe_json_filename(name: &str) -> bool {
    !name.is_empty()
        && !name.contains("..")
        && name.ends_with(".json")
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-')
        && name.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
}

fn is_allowed_library_path(logical: &str) -> bool {
    if logical.is_empty() || logical.starts_with('/') || logical.contains('\0') {
        return false;
    }
    let n = logical.replace('\\', "/");
    if n.split('/').any(|part| part.is_empty() || part == "." || part == "..") {
        return false;
    }
    if n == CONFIG_FILE || n == SYNC_ACCOUNT_FILE {
        return true;
    }
    let parts: Vec<&str> = n.split('/').collect();
    parts.len() == 3 && parts[0] == "users" && is_safe_username(parts[1]) && is_safe_json_filename(parts[2])
}

fn home_dir() -> Result<PathBuf, String> {
    if cfg!(windows) {
        std::env::var("USERPROFILE")
            .map(PathBuf::from)
            .map_err(|_| "找不到用户目录".to_string())
    } else {
        std::env::var("HOME")
            .map(PathBuf::from)
            .map_err(|_| "找不到用户目录".to_string())
    }
}

fn platform_library_root() -> Result<PathBuf, String> {
    let home = home_dir()?;
    if cfg!(target_os = "macos") {
        Ok(home.join("Library").join("Application Support").join("VennCV"))
    } else if cfg!(target_os = "windows") {
        let base = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData").join("Roaming"));
        Ok(base.join("VennCV"))
    } else {
        let base = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".local").join("share"));
        Ok(base.join("VennCV"))
    }
}

fn catalog_home() -> Result<PathBuf, String> {
    if let Ok(custom) = std::env::var("VENNCV_DATA_DIR") {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }
    platform_library_root()
}

fn read_catalog_active(home: &Path) -> Option<PathBuf> {
    let file = home.join(LIBRARY_ROOTS_FILE);
    let text = fs::read_to_string(file).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&text).ok()?;
    let active = parsed.get("active")?.as_str()?;
    if active.is_empty() {
        return None;
    }
    Some(PathBuf::from(active))
}

fn startup_root() -> Result<PathBuf, String> {
    if let Ok(custom) = std::env::var("VENNCV_DATA_DIR") {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }
    let home = platform_library_root()?;
    if let Some(active) = read_catalog_active(&home) {
        let meta = fs::symlink_metadata(&active).ok();
        if meta.is_some_and(|item| item.is_dir() && !item.file_type().is_symlink()) && !forbidden_library_root(&active) {
            return Ok(active);
        }
    }
    Ok(home)
}

pub fn library_root() -> Result<PathBuf, String> {
    let mut guard = CURRENT_ROOT.lock().map_err(|_| "用户库忙".to_string())?;
    if let Some(root) = guard.clone() {
        return Ok(root);
    }
    let root = startup_root()?;
    *guard = Some(root.clone());
    Ok(root)
}

fn set_library_root(root: PathBuf) -> Result<(), String> {
    let mut guard = CURRENT_ROOT.lock().map_err(|_| "用户库忙".to_string())?;
    *guard = Some(root);
    Ok(())
}

fn chmod_private(path: &Path, mode: u32) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(mode));
    }
    #[cfg(not(unix))]
    {
        let _ = (path, mode);
    }
}

fn assert_no_symlink(root: &Path, full: &Path) -> Result<(), String> {
    let rel = full.strip_prefix(root).map_err(|_| "路径越界".to_string())?;
    let mut current = root.to_path_buf();
    for part in rel.components() {
        current.push(part);
        match fs::symlink_metadata(&current) {
            Ok(meta) if meta.file_type().is_symlink() => return Err("拒绝符号链接".to_string()),
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}

fn resolve_library_file(root: &Path, logical: &str) -> Result<PathBuf, String> {
    let normalized = logical.replace('\\', "/");
    if !is_allowed_library_path(&normalized) {
        return Err("不允许的路径".to_string());
    }
    let full = root.join(PathBuf::from(&normalized));
    if !full.starts_with(root) {
        return Err("路径越界".to_string());
    }
    assert_no_symlink(root, &full)?;
    Ok(full)
}

fn write_private(full: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        chmod_private(parent, 0o700);
    }
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(full).map_err(|e| e.to_string())?;
    file.write_all(contents.as_bytes()).map_err(|e| e.to_string())?;
    chmod_private(full, 0o600);
    Ok(())
}

fn copy_legacy_file(root: &Path, logical: &str, source: &Path) -> Result<(), String> {
    let dest = resolve_library_file(root, logical)?;
    if dest.exists() {
        return Ok(());
    }
    let meta = fs::symlink_metadata(source).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.file_type().is_symlink() {
        return Ok(());
    }
    if meta.len() > MAX_LIBRARY_FILE_BYTES {
        return Err(format!("文件过大：{logical}"));
    }
    let text = fs::read_to_string(source).map_err(|e| e.to_string())?;
    write_private(&dest, &text)
}

fn legacy_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(extra) = std::env::var("VENNCV_LEGACY_DATA_DIR") {
        if !extra.trim().is_empty() {
            roots.push(PathBuf::from(extra));
        }
    }
    #[cfg(debug_assertions)]
    {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        if let Some(parent) = manifest.parent() {
            roots.push(parent.to_path_buf());
        }
    }
    roots
}

pub fn ensure_library(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    chmod_private(root, 0o700);
    let dest_config = root.join(CONFIG_FILE);
    if dest_config.exists() {
        return Ok(());
    }
    for legacy in legacy_roots() {
        if legacy == root {
            continue;
        }
        let users_dir = legacy.join("users");
        let users_meta = fs::symlink_metadata(&users_dir);
        let users_ok = users_meta
            .as_ref()
            .map(|meta| meta.is_dir() && !meta.file_type().is_symlink())
            .unwrap_or(false);
        if users_ok {
            let entries = fs::read_dir(&users_dir).map_err(|e| e.to_string())?;
            for entry in entries {
                let entry = entry.map_err(|e| e.to_string())?;
                let name = entry.file_name().to_string_lossy().to_string();
                if !entry.file_type().map(|t| t.is_dir() && !t.is_symlink()).unwrap_or(false) {
                    continue;
                }
                if !is_safe_username(&name) {
                    continue;
                }
                let files = fs::read_dir(entry.path()).map_err(|e| e.to_string())?;
                for file in files {
                    let file = file.map_err(|e| e.to_string())?;
                    let filename = file.file_name().to_string_lossy().to_string();
                    if !file.file_type().map(|t| t.is_file() && !t.is_symlink()).unwrap_or(false) {
                        continue;
                    }
                    if !is_safe_json_filename(&filename) {
                        continue;
                    }
                    let logical = format!("users/{name}/{filename}");
                    copy_legacy_file(root, &logical, &file.path())?;
                }
            }
        }
        let legacy_config = legacy.join(CONFIG_FILE);
        let config_ok = fs::symlink_metadata(&legacy_config)
            .map(|meta| meta.is_file() && !meta.file_type().is_symlink())
            .unwrap_or(false);
        if config_ok {
            copy_legacy_file(root, CONFIG_FILE, &legacy_config)?;
        }
    }
    Ok(())
}

pub fn snapshot(root: &Path) -> Result<Vec<(String, String)>, String> {
    let mut files = Vec::new();
    let config_path = root.join(CONFIG_FILE);
    if config_path.is_file() {
        files.push((CONFIG_FILE.to_string(), read_checked(root, CONFIG_FILE)?));
    }
    let account_path = root.join(SYNC_ACCOUNT_FILE);
    let account_ok = fs::symlink_metadata(&account_path)
        .map(|meta| meta.is_file() && !meta.file_type().is_symlink())
        .unwrap_or(false);
    if account_ok {
        files.push((SYNC_ACCOUNT_FILE.to_string(), read_checked(root, SYNC_ACCOUNT_FILE)?));
    }
    let users_dir = root.join("users");
    let users_ok = fs::symlink_metadata(&users_dir)
        .map(|meta| meta.is_dir() && !meta.file_type().is_symlink())
        .unwrap_or(false);
    if !users_ok {
        files.sort_by(|a, b| a.0.cmp(&b.0));
        return Ok(files);
    }
    let users = fs::read_dir(&users_dir).map_err(|e| e.to_string())?;
    for user in users {
        let user = user.map_err(|e| e.to_string())?;
        let name = user.file_name().to_string_lossy().to_string();
        if !user.file_type().map(|t| t.is_dir() && !t.is_symlink()).unwrap_or(false) || !is_safe_username(&name)
        {
            continue;
        }
        let entries = fs::read_dir(user.path()).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let filename = entry.file_name().to_string_lossy().to_string();
            if !entry.file_type().map(|t| t.is_file() && !t.is_symlink()).unwrap_or(false)
                || !is_safe_json_filename(&filename)
            {
                continue;
            }
            let logical = format!("users/{name}/{filename}");
            files.push((logical.clone(), read_checked(root, &logical)?));
        }
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(files)
}

fn read_checked(root: &Path, logical: &str) -> Result<String, String> {
    let full = resolve_library_file(root, logical)?;
    let meta = fs::metadata(&full).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("不是文件".to_string());
    }
    if meta.len() > MAX_LIBRARY_FILE_BYTES {
        return Err(format!("文件过大：{logical}"));
    }
    fs::read_to_string(full).map_err(|e| e.to_string())
}

pub fn write_file(root: &Path, logical: &str, contents: &str) -> Result<(), String> {
    if contents.len() as u64 > MAX_LIBRARY_FILE_BYTES {
        return Err("内容过大".to_string());
    }
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    chmod_private(root, 0o700);
    let full = resolve_library_file(root, logical)?;
    write_private(&full, contents)
}

fn forbidden_library_root(candidate: &Path) -> bool {
    let Ok(home) = home_dir() else {
        return false;
    };
    let resolved = candidate;
    if resolved == home.as_path() {
        return true;
    }
    let mut broad = vec![
        home.join("Documents"),
        home.join("Desktop"),
        home.join("Downloads"),
    ];
    if cfg!(target_os = "macos") {
        broad.extend([
            PathBuf::from("/Users"),
            PathBuf::from("/tmp"),
            PathBuf::from("/private"),
            PathBuf::from("/var"),
            PathBuf::from("/etc"),
            PathBuf::from("/usr"),
            PathBuf::from("/System"),
            PathBuf::from("/Applications"),
            PathBuf::from("/Library"),
            home.join("Library"),
            home.join("Library").join("Application Support"),
        ]);
    } else if cfg!(target_os = "windows") {
        broad.push(home.join("AppData"));
    } else {
        broad.extend([
            PathBuf::from("/etc"),
            PathBuf::from("/usr"),
            PathBuf::from("/var"),
            PathBuf::from("/tmp"),
            home.join(".local"),
            home.join(".local").join("share"),
        ]);
    }
    broad.iter().any(|item| item.as_path() == resolved)
}

fn open_library(root: &Path) -> Result<(), String> {
    let platform = platform_library_root()?;
    if root == platform.as_path() {
        return ensure_library(root);
    }
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    chmod_private(root, 0o700);
    Ok(())
}

fn resolve_switch_target(raw: &str, create: bool) -> Result<PathBuf, String> {
    let text = raw.trim();
    if text.is_empty() || text.contains('\0') || text.len() > 1024 {
        return Err("路径无效".to_string());
    }
    let resolved = PathBuf::from(text);
    if !resolved.is_absolute() {
        return Err("请填写从根目录开始的完整路径".to_string());
    }
    if forbidden_library_root(&resolved) {
        return Err("这个位置太宽，请选一个专门的文件夹".to_string());
    }
    match fs::symlink_metadata(&resolved) {
        Ok(meta) if meta.file_type().is_symlink() => Err("不能使用符号链接".to_string()),
        Ok(meta) if !meta.is_dir() => Err("这不是文件夹".to_string()),
        Ok(_) => Ok(resolved),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            if !create {
                return Err("NEED_CREATE".to_string());
            }
            let Some(parent) = resolved.parent() else {
                return Err("这个位置太宽，请选一个专门的文件夹".to_string());
            };
            if parent.as_os_str().is_empty() || parent.parent().is_none() {
                return Err("这个位置太宽，请选一个专门的文件夹".to_string());
            }
            let parent_meta = fs::symlink_metadata(parent).map_err(|_| "上一级文件夹不存在".to_string())?;
            if parent_meta.file_type().is_symlink() || !parent_meta.is_dir() {
                return Err("上一级不是文件夹".to_string());
            }
            fs::create_dir(&resolved).map_err(|e| e.to_string())?;
            chmod_private(&resolved, 0o700);
            Ok(resolved)
        }
        Err(error) => Err(error.to_string()),
    }
}

fn read_catalog(home: &Path) -> (Option<String>, Vec<String>) {
    let Ok(text) = fs::read_to_string(home.join(LIBRARY_ROOTS_FILE)) else {
        return (None, Vec::new());
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) else {
        return (None, Vec::new());
    };
    let active = parsed
        .get("active")
        .and_then(|value| value.as_str())
        .map(str::to_string);
    let paths = parsed
        .get("paths")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .take(MAX_LIBRARY_ROOTS)
                .collect()
        })
        .unwrap_or_default();
    (active, paths)
}

fn write_catalog(home: &Path, active: &str, paths: &[String]) -> Result<(), String> {
    fs::create_dir_all(home).map_err(|e| e.to_string())?;
    chmod_private(home, 0o700);
    let body = serde_json::json!({ "active": active, "paths": paths });
    let text = serde_json::to_string_pretty(&body).map_err(|e| e.to_string())?;
    write_private(&home.join(LIBRARY_ROOTS_FILE), &format!("{text}\n"))
}

fn choice_label(path: &str, platform: &str) -> String {
    if path == platform {
        return "默认用户库".to_string();
    }
    Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| path.to_string())
}

fn library_choices(current: &Path) -> Result<serde_json::Value, String> {
    let home = catalog_home()?;
    let platform = platform_library_root()?;
    let platform_text = platform.to_string_lossy().to_string();
    let current_text = current.to_string_lossy().to_string();
    let (_, stored) = read_catalog(&home);
    let mut paths = vec![current_text.clone(), platform_text.clone()];
    paths.extend(stored);
    paths.sort();
    paths.dedup();
    let mut choices: Vec<serde_json::Value> = paths
        .into_iter()
        .map(|item| {
            let exists = fs::symlink_metadata(&item)
                .map(|meta| meta.is_dir() && !meta.file_type().is_symlink())
                .unwrap_or(false);
            serde_json::json!({
                "path": item,
                "label": choice_label(&item, &platform_text),
                "current": item == current_text,
                "exists": exists,
                "builtin": item == platform_text,
            })
        })
        .collect();
    choices.sort_by(|left, right| {
        let left_current = left.get("current").and_then(|value| value.as_bool()).unwrap_or(false);
        let right_current = right.get("current").and_then(|value| value.as_bool()).unwrap_or(false);
        right_current.cmp(&left_current).then_with(|| {
            let left_builtin = left.get("builtin").and_then(|value| value.as_bool()).unwrap_or(false);
            let right_builtin = right.get("builtin").and_then(|value| value.as_bool()).unwrap_or(false);
            right_builtin.cmp(&left_builtin)
        })
    });
    Ok(serde_json::json!({
        "current": current_text,
        "platform": platform_text,
        "choices": choices,
    }))
}

fn snapshot_body(root: &Path) -> Result<serde_json::Value, String> {
    open_library(root)?;
    let files = snapshot(root)?;
    let mut body = library_choices(root)?;
    let files_json: Vec<serde_json::Value> = files
        .into_iter()
        .map(|(path, contents)| serde_json::json!({ "path": path, "contents": contents }))
        .collect();
    if let Some(object) = body.as_object_mut() {
        object.insert("root".to_string(), serde_json::json!(root.to_string_lossy()));
        object.insert("files".to_string(), serde_json::Value::Array(files_json));
    }
    Ok(body)
}

#[tauri::command]
pub fn user_library_snapshot() -> Result<serde_json::Value, String> {
    let root = library_root()?;
    let body = snapshot_body(&root)?;
    Ok(serde_json::json!({
        "root": body.get("root").cloned().unwrap_or(serde_json::Value::Null),
        "files": body.get("files").cloned().unwrap_or_else(|| serde_json::json!([])),
    }))
}

#[tauri::command]
pub fn user_library_choices() -> Result<serde_json::Value, String> {
    library_choices(&library_root()?)
}

#[tauri::command]
pub fn user_library_switch(path: String, create: bool) -> Result<serde_json::Value, String> {
    let resolved = resolve_switch_target(&path, create)?;
    let home = catalog_home()?;
    let (_, mut paths) = read_catalog(&home);
    let current = library_root()?;
    let text = resolved.to_string_lossy().to_string();
    let current_text = current.to_string_lossy().to_string();
    paths.retain(|item| item != &text && item != &current_text);
    paths.insert(0, text.clone());
    if current_text != text {
        paths.insert(1, current_text);
    }
    if paths.len() > MAX_LIBRARY_ROOTS {
        return Err("常用路径最多 12 个".to_string());
    }
    write_catalog(&home, &text, &paths)?;
    set_library_root(resolved.clone())?;
    snapshot_body(&resolved)
}

#[tauri::command]
pub fn user_library_forget(path: String) -> Result<serde_json::Value, String> {
    let current = library_root()?;
    let requested = PathBuf::from(path.trim());
    if requested == current {
        return Err("正在使用的路径不能移出".to_string());
    }
    let home = catalog_home()?;
    let (active, mut paths) = read_catalog(&home);
    let before = paths.len();
    let text = requested.to_string_lossy().to_string();
    paths.retain(|item| item != &text);
    if paths.len() == before {
        return Err("列表里没有这个路径".to_string());
    }
    let next_active = match active {
        Some(item) if item == text => current.to_string_lossy().to_string(),
        Some(item) => item,
        None => current.to_string_lossy().to_string(),
    };
    write_catalog(&home, &next_active, &paths)?;
    library_choices(&current)
}

#[tauri::command]
pub fn user_library_write(path: String, contents: String) -> Result<(), String> {
    let root = library_root()?;
    open_library(&root)?;
    write_file(&root, &path, &contents)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_user_workspace_and_rejects_traversal() {
        assert!(is_allowed_library_path("config.yaml"));
        assert!(is_allowed_library_path("sync_account.json"));
        assert!(!is_allowed_library_path("notes.json"));
        assert!(is_allowed_library_path("users/tong/set2.json"));
        assert!(!is_allowed_library_path("../config.yaml"));
        assert!(!is_allowed_library_path("users/../config.yaml"));
        assert!(!is_allowed_library_path("users/tong/../../config.yaml"));
        assert!(!is_allowed_library_path("/etc/passwd"));
    }

    #[test]
    fn seed_copies_once_and_does_not_overwrite() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let legacy = std::env::temp_dir().join(format!("venncv-legacy-{stamp}"));
        let dest = std::env::temp_dir().join(format!("venncv-lib-{stamp}"));
        fs::create_dir_all(legacy.join("users/tong")).unwrap();
        fs::write(legacy.join("config.yaml"), "users: []\n").unwrap();
        fs::write(legacy.join("users/tong/set2.json"), "{\"projects\":{}}").unwrap();

        copy_legacy_file(&dest, "users/tong/set2.json", &legacy.join("users/tong/set2.json")).unwrap();
        copy_legacy_file(&dest, "config.yaml", &legacy.join("config.yaml")).unwrap();
        fs::write(dest.join("users/tong/set2.json"), "{\"kept\":true}").unwrap();
        copy_legacy_file(&dest, "users/tong/set2.json", &legacy.join("users/tong/set2.json")).unwrap();
        let kept = fs::read_to_string(dest.join("users/tong/set2.json")).unwrap();
        assert!(kept.contains("kept"));

        let _ = fs::remove_dir_all(&legacy);
        let _ = fs::remove_dir_all(&dest);
    }

    #[test]
    fn missing_directory_needs_confirmation_and_home_is_too_broad() {
        let home = home_dir().unwrap();
        assert!(forbidden_library_root(&home));
        let missing = std::env::temp_dir().join(format!(
            "venncv-missing-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let error = resolve_switch_target(missing.to_str().unwrap(), false).unwrap_err();
        assert_eq!(error, "NEED_CREATE");
    }
}
