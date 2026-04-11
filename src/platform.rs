//! 文件与持久化抽象：原生使用 `std::fs`，`wasm32` 使用 `localStorage`。
//! 路径统一按 POSIX 风格字符串（`config.yaml`、`users/name/file.json`）。

#[cfg(not(target_arch = "wasm32"))]
mod native {
    use std::io;
    use std::path::Path;

    pub fn read_to_string(path: &str) -> io::Result<String> {
        std::fs::read_to_string(path)
    }

    pub fn write(path: &str, contents: impl AsRef<[u8]>) -> io::Result<()> {
        if let Some(parent) = Path::new(path).parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)?;
            }
        }
        std::fs::write(path, contents)
    }

    pub fn exists(path: &str) -> bool {
        Path::new(path).exists()
    }

    pub fn create_dir_all(path: &str) -> io::Result<()> {
        std::fs::create_dir_all(path)
    }
}

#[cfg(target_arch = "wasm32")]
mod web {
    use std::io;

    const PREFIX: &str = "venncv_fs:";

    fn key(path: &str) -> String {
        let n = path.replace('\\', "/");
        format!("{PREFIX}{n}")
    }

    fn storage() -> Option<web_sys::Storage> {
        web_sys::window()?.local_storage().ok()?
    }

    pub fn read_to_string(path: &str) -> io::Result<String> {
        let s = storage().ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "no localStorage"))?;
        s.get_item(&key(path))
            .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("{e:?}")))?
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, path))
    }

    pub fn write(path: &str, contents: impl AsRef<[u8]>) -> io::Result<()> {
        let s = storage().ok_or_else(|| io::Error::new(io::ErrorKind::Other, "no localStorage"))?;
        let text = std::str::from_utf8(contents.as_ref())
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        s.set_item(&key(path), text)
            .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("{e:?}")))
    }

    pub fn exists(path: &str) -> bool {
        storage()
            .and_then(|s| s.get_item(&key(path)).ok())
            .flatten()
            .is_some()
    }

    pub fn create_dir_all(_path: &str) -> io::Result<()> {
        Ok(())
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub use native::*;

#[cfg(target_arch = "wasm32")]
pub use web::*;

/// 用于「最近文件」归属校验：原生尽量 canonicalize；Web 用字符串前缀。
pub fn file_under_storage(file_path: &std::path::Path, storage_path: &str) -> bool {
    #[cfg(not(target_arch = "wasm32"))]
    {
        let file_norm = file_path.canonicalize().unwrap_or_else(|_| file_path.to_path_buf());
        let store_norm = std::path::Path::new(storage_path).canonicalize().unwrap_or_else(|_| {
            std::path::PathBuf::from(storage_path)
        });
        file_norm.starts_with(&store_norm)
    }
    #[cfg(target_arch = "wasm32")]
    {
        let fp = file_path.to_string_lossy().replace('\\', "/");
        let sp = storage_path.replace('\\', "/");
        fp.starts_with(&sp)
    }
}
