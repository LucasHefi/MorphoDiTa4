use std::{
    fs::OpenOptions,
    io::{BufWriter, Write},
    path::{Path, PathBuf},
};

// Exports are UTF-8 documents, never arbitrary paths supplied by the webview.
fn write_export(directory: &Path, filename: &str, content: &str) -> Result<PathBuf, String> {
    if content.len() > 256 * 1024 * 1024 {
        return Err("Export exceeds 256 MiB".into());
    }
    write_export_with(directory, filename, |file| {
        file.write_all(content.as_bytes())
    })
}

fn write_export_with(
    directory: &Path,
    filename: &str,
    write: impl FnOnce(&mut std::fs::File) -> std::io::Result<()>,
) -> Result<PathBuf, String> {
    if filename.is_empty()
        || filename.len() > 180
        || !filename
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
        || filename.starts_with('.')
        || !["csv", "json", "txt"].contains(&filename.rsplit('.').next().unwrap_or(""))
    {
        return Err("Invalid export filename".into());
    }
    std::fs::create_dir_all(directory)
        .map_err(|e| format!("Cannot create export directory: {e}"))?;
    let source = Path::new(filename);
    let stem = source.file_stem().unwrap().to_string_lossy();
    let extension = source.extension().unwrap().to_string_lossy();
    for number in 0..10000 {
        let name = if number == 0 {
            filename.to_owned()
        } else {
            format!("{stem}-{number}.{extension}")
        };
        let path = directory.join(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                if let Err(error) = write(&mut file).and_then(|_| file.sync_all()) {
                    let _ = std::fs::remove_file(&path);
                    return Err(format!("Cannot write export: {error}"));
                }
                return Ok(path);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Cannot create export: {error}")),
        }
    }
    Err("Too many exports with the same filename".into())
}

#[tauri::command]
pub async fn export_file(filename: String, content: String) -> Result<String, String> {
    let directory = dirs::download_dir()
        .or_else(dirs::document_dir)
        .ok_or("Downloads directory is unavailable")?;
    tauri::async_runtime::spawn_blocking(move || {
        write_export(&directory, &filename, &content)
            .map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| format!("Export worker failed: {e}"))?
}

#[derive(serde::Deserialize)]
pub struct CsvSection {
    section: String,
    values: Vec<String>,
}

fn csv_cell(value: &str) -> String {
    let trimmed = value.trim_start_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
    let value = if trimmed.starts_with(['=', '+', '-', '@']) {
        format!("'{value}")
    } else {
        value.to_owned()
    };
    if value.contains([',', '"', '\r', '\n']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value
    }
}

fn write_csv(
    directory: &Path,
    filename: &str,
    model: &str,
    schema_version: u32,
    sections: &[CsvSection],
) -> Result<PathBuf, String> {
    write_export_with(directory, filename, |file| {
        let mut output = BufWriter::new(file);
        let header = b"schemaVersion,model,section,value";
        output.write_all(header)?;
        let mut bytes = header.len();
        for section in sections {
            let prefix = format!(
                "\r\n{},{},{},",
                schema_version,
                csv_cell(model),
                csv_cell(&section.section)
            );
            for value in &section.values {
                let cell = csv_cell(value);
                bytes += prefix.len() + cell.len();
                if bytes > 256 * 1024 * 1024 {
                    return Err(std::io::Error::other("Export exceeds 256 MiB"));
                }
                output.write_all(prefix.as_bytes())?;
                output.write_all(cell.as_bytes())?;
            }
        }
        output.flush()
    })
}

#[tauri::command]
pub async fn export_csv_sections(
    filename: String,
    model: String,
    schema_version: u32,
    sections: Vec<CsvSection>,
) -> Result<String, String> {
    let directory = dirs::download_dir()
        .or_else(dirs::document_dir)
        .ok_or("Downloads directory is unavailable")?;
    tauri::async_runtime::spawn_blocking(move || {
        write_csv(&directory, &filename, &model, schema_version, &sections)
            .map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| format!("Export worker failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn directory() -> PathBuf {
        std::env::temp_dir().join(format!("morphodita-export-{}", uuid::Uuid::new_v4()))
    }
    #[test]
    fn csv_streams_unicode_quotes_formulas_and_preserves_existing_files() {
        let dir = directory();
        let sections = vec![CsvSection {
            section: "forms".into(),
            values: vec!["žluťoučký".into(), "a,\"b\"\n".into(), " \u{feff}=1".into()],
        }];
        let first = write_csv(&dir, "result.csv", "czech", 1, &sections).unwrap();
        let second = write_csv(&dir, "result.csv", "czech", 1, &sections).unwrap();
        assert_ne!(first, second);
        assert_eq!(std::fs::read_to_string(first).unwrap(), "schemaVersion,model,section,value\r\n1,czech,forms,žluťoučký\r\n1,czech,forms,\"a,\"\"b\"\"\n\"\r\n1,czech,forms,' \u{feff}=1");
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn writes_unicode_and_preserves_existing_exports() {
        let dir = directory();
        for ext in ["csv", "json", "txt"] {
            let name = format!("result.{ext}");
            let first = write_export(&dir, &name, "žluťoučký kůň\n").unwrap();
            let second = write_export(&dir, &name, "druhý").unwrap();
            assert_ne!(first, second);
            assert_eq!(std::fs::read_to_string(first).unwrap(), "žluťoučký kůň\n");
            assert_eq!(std::fs::read_to_string(second).unwrap(), "druhý");
        }
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn rejects_paths_and_reports_write_failures() {
        let dir = directory();
        for name in [
            "../escape.txt",
            "/tmp/escape.txt",
            "a\\b.txt",
            ".hidden.txt",
            "file.exe",
            "",
            "file",
        ] {
            assert!(write_export(&dir, name, "data").is_err());
        }
        std::fs::write(&dir, "not a directory").unwrap();
        assert!(write_export(&dir, "result.txt", "data").is_err());
        std::fs::remove_file(dir).unwrap();
    }
}
