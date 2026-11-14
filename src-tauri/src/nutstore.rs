use std::time::Duration;

/// 坚果云（Nutstore）WebDAV。主机是服务自己的域名。
const DAV_ROOT: &str = "https://dav.jianguoyun.com/dav/";

fn safe_segment(part: &str) -> bool {
    !part.is_empty() && part != "." && part != ".." && !part.chars().any(|ch| ch.is_control() || ch == '\\')
}

fn safe_username(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    first.is_ascii_alphanumeric()
        && name.len() <= 64
        && name
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '.' || ch == '-')
}

fn safe_data_file(name: &str) -> bool {
    const STAY: &[&str] = &[
        "remember_login.json",
        "sync_account.json",
        "sync_state.json",
        "sync_base.json",
        "cloud_upload.json",
        "cloud_conflict.json",
        "sync.json",
    ];
    if name == "sync.json" || name == "version_store.json" {
        return true;
    }
    if STAY.contains(&name) || !name.ends_with(".json") || name.contains("..") {
        return false;
    }
    name.chars().next().is_some_and(|ch| ch.is_ascii_alphanumeric())
        && name
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '.' || ch == '-')
}

pub fn is_safe_dav_path(path: &str) -> bool {
    if path.is_empty() || path.len() > 180 || path.starts_with('/') || path.contains('\\') || path.contains("..") || path.contains('\0')
    {
        return false;
    }
    let parts: Vec<&str> = path.split('/').collect();
    if parts.iter().any(|part| !safe_segment(part)) {
        return false;
    }
    match parts.as_slice() {
        [_] => true,
        [_, ".venncv-sync"] | [_, "users"] => true,
        [_, "users", user] if safe_username(user) => true,
        [_, "users", user, file] if safe_username(user) && safe_data_file(file) => true,
        _ => false,
    }
}

fn encode_segment(part: &str) -> String {
    let mut out = String::new();
    for byte in part.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(byte as char),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn dav_url(method: &str, path: &str) -> String {
    let encoded = path.split('/').map(encode_segment).collect::<Vec<_>>().join("/");
    if method == "MKCOL" || method == "PROPFIND" {
        format!("{DAV_ROOT}{encoded}/")
    } else {
        format!("{DAV_ROOT}{encoded}")
    }
}

fn precondition_header(value: Option<String>) -> Result<Option<String>, String> {
    let Some(value) = value.filter(|item| !item.is_empty()) else {
        return Ok(None);
    };
    if value.len() > 200 || value.contains('\n') || value.contains('\r') {
        return Err("同步条件无效".to_string());
    }
    Ok(Some(value))
}

#[tauri::command]
pub fn nutstore_webdav(
    method: String,
    path: String,
    body: Option<String>,
    email: String,
    password: String,
    if_match: Option<String>,
    if_none_match: Option<String>,
) -> Result<serde_json::Value, String> {
    if !matches!(method.as_str(), "MKCOL" | "PUT" | "GET" | "DELETE" | "PROPFIND") {
        return Err("不支持的请求".to_string());
    }
    if !is_safe_dav_path(&path) {
        return Err("远程路径无效".to_string());
    }
    let email = email.trim();
    if email.is_empty() || password.is_empty() {
        return Err("请填写坚果云邮箱和应用密码".to_string());
    }
    let if_match = precondition_header(if_match)?;
    let if_none_match = precondition_header(if_none_match)?;
    let client = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "连不上坚果云".to_string())?;
    let url = dav_url(&method, &path);
    let reqwest_method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| "不支持的请求".to_string())?;
    let mut request = client.request(reqwest_method, &url).basic_auth(email, Some(password));
    if let Some(value) = if_match {
        request = request.header("If-Match", value);
    }
    if let Some(value) = if_none_match {
        request = request.header("If-None-Match", value);
    }
    if method == "PUT" {
        request = request.body(body.unwrap_or_default());
    } else if method == "PROPFIND" {
        request = request
            .header("Depth", "1")
            .header("Content-Type", "application/xml; charset=utf-8")
            .body(body.unwrap_or_default());
    }
    let response = match request.send() {
        Ok(response) => response,
        Err(_) => return Ok(serde_json::json!({ "status": 0, "body": "连不上坚果云" })),
    };
    let etag = response
        .headers()
        .get("etag")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let status = response.status().as_u16();
    let text = response.text().unwrap_or_default();
    Ok(serde_json::json!({ "status": status, "body": text, "etag": etag }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_a_folder_and_marker_but_not_another_host() {
        assert!(is_safe_dav_path("VennCV"));
        assert!(is_safe_dav_path("VennCV/.venncv-sync"));
        assert!(is_safe_dav_path("VennCV/users"));
        assert!(is_safe_dav_path("VennCV/users/admin"));
        assert!(is_safe_dav_path("VennCV/users/admin/workspace.json"));
        assert!(is_safe_dav_path("VennCV/users/admin/sync.json"));
        assert!(!is_safe_dav_path("VennCV/users/admin/remember_login.json"));
        assert!(!is_safe_dav_path("VennCV/users/admin/sync_state.json"));
        assert!(!is_safe_dav_path("VennCV/users/admin/sync_base.json"));
        assert!(!is_safe_dav_path("../VennCV"));
        assert!(!is_safe_dav_path("https://evil.example/dav"));
        assert!(dav_url("MKCOL", "VennCV").ends_with("/VennCV/"));
        assert!(dav_url("PUT", "VennCV/.venncv-sync").ends_with("/VennCV/.venncv-sync"));
        assert!(dav_url("PROPFIND", "VennCV/users").ends_with("/VennCV/users/"));
    }
}
