//! The Character IDs of the packs this Workspace has imported (SAKU β.13, 後の一覧 L10; 00A
//! ANSWER_2026-10-22_L10_known_pack_ids C06-1 (b) and C06-6).
//!
//! A row saved before β.12 with no record of where it came from is read as self-made. When its Character ID is one a
//! pack carries, its exports stop (C06-3). The page knows the pack rows of its list (K1); this reads the copies the host
//! keeps of every committed pack import (K2): `imports/<id>/character-pack.json`, `entries[].slug`. A pending import
//! (`imports/.pending`, or any folder whose name starts with ".") is not read. A copy that is there but cannot be read
//! makes the whole answer UNREADABLE, so that the page stops those exports this time instead of passing on K1 alone
//! (C06-6). Nothing here writes.

use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::Path;

pub(crate) const PACK_MANIFEST_NAME: &str = "character-pack.json";
/// What import_character_pack writes beside the pack's own files (main.rs).
pub(crate) const PACK_IMPORT_SUMMARY_NAME: &str = "pack-import.json";

#[derive(Debug, Serialize, PartialEq)]
pub struct ImportedPackIds {
    /// "OK", "NO_WORKSPACE" or "UNREADABLE".
    pub status: &'static str,
    /// The slugs, exactly as written (no case folding or normalising: the page compares them exactly, C06-1).
    pub ids: Vec<String>,
    pub unreadable: Vec<String>,
}

pub(crate) fn imported_pack_ids_in(workspace: &Path) -> ImportedPackIds {
    let root = workspace.join("imports");
    let mut ids = Vec::new();
    let mut unreadable = Vec::new();
    match fs::read_dir(&root) {
        Ok(entries) => {
            for entry in entries {
                let entry = match entry {
                    Ok(entry) => entry,
                    Err(error) => {
                        unreadable.push(format!("{}: {error}", root.display()));
                        continue;
                    }
                };
                let dir = entry.path();
                // An error asking what the entry is, or whether its files are there, is "cannot read", never "not
                // there" (統括 照らし NG-3: C06-6 must not fail open).
                let is_dir = match entry.file_type() {
                    Ok(kind) => kind.is_dir(),
                    Err(error) => {
                        unreadable.push(format!("{}: {error}", dir.display()));
                        continue;
                    }
                };
                if !is_dir || entry.file_name().to_string_lossy().starts_with('.') {
                    continue;
                }
                let manifest = dir.join(PACK_MANIFEST_NAME);
                match manifest.try_exists() {
                    Ok(true) => {}
                    Ok(false) => {
                        // A pack import keeps pack-import.json beside its manifest; one without the manifest is a
                        // pack whose IDs cannot be read. Anything else (an older Builder package) is not a pack.
                        match dir.join(PACK_IMPORT_SUMMARY_NAME).try_exists() {
                            Ok(false) => {}
                            Ok(true) => unreadable.push(format!("{}: a pack import without its {PACK_MANIFEST_NAME}", dir.display())),
                            Err(error) => unreadable.push(format!("{}: {error}", dir.display())),
                        }
                        continue;
                    }
                    Err(error) => {
                        unreadable.push(format!("{}: {error}", manifest.display()));
                        continue;
                    }
                }
                let text = match fs::read_to_string(&manifest) {
                    Ok(text) => text,
                    Err(error) => {
                        unreadable.push(format!("{}: {error}", manifest.display()));
                        continue;
                    }
                };
                match serde_json::from_str::<Value>(&text).ok().and_then(|value| value.get("entries").and_then(Value::as_array).cloned()) {
                    Some(list) => {
                        for item in list {
                            match item.get("slug").and_then(Value::as_str) {
                                Some(slug) if !slug.is_empty() => ids.push(slug.to_string()),
                                _ => unreadable.push(format!("{}: an entry without a slug", manifest.display())),
                            }
                        }
                    }
                    None => unreadable.push(format!("{}: not a pack manifest with entries", manifest.display())),
                }
            }
        }
        // No imports folder yet: nothing imported, nothing to stop on.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => unreadable.push(format!("{}: {error}", root.display())),
    }
    ids.sort();
    ids.dedup();
    ImportedPackIds { status: if unreadable.is_empty() { "OK" } else { "UNREADABLE" }, ids, unreadable }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn workspace(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("saku-imported-packs-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }
    fn pack(dir: &Path, folder: &str, manifest: &str) {
        let target = dir.join("imports").join(folder);
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join(PACK_MANIFEST_NAME), manifest).unwrap();
    }

    #[test]
    fn the_slugs_of_committed_pack_imports_are_read_exactly() {
        let ws = workspace("ok");
        pack(&ws, "p-1-aaaaaaaaaaaa", r#"{"entries":[{"slug":"guide-a"},{"slug":"Guide-B"}]}"#);
        pack(&ws, "q-1-bbbbbbbbbbbb", r#"{"entries":[{"slug":"guide-a"},{"slug":"guide-c"}]}"#);
        // A pending import and a hidden folder are not read (C06-1).
        pack(&ws, ".pending", r#"{"entries":[{"slug":"pending-only"}]}"#);
        fs::create_dir_all(ws.join("imports").join(".pending").join("x")).unwrap();
        fs::write(ws.join("imports").join(".pending").join("x").join(PACK_MANIFEST_NAME), r#"{"entries":[{"slug":"pending-only"}]}"#).unwrap();
        // A folder without a pack manifest is not a pack import.
        fs::create_dir_all(ws.join("imports").join("old-builder-package")).unwrap();
        let read = imported_pack_ids_in(&ws);
        assert_eq!(read.status, "OK");
        assert_eq!(read.ids, ["Guide-B", "guide-a", "guide-c"], "the slugs as written, no case folding");
        assert!(read.unreadable.is_empty());
        let _ = fs::remove_dir_all(&ws);
    }

    #[test]
    fn a_pack_import_without_its_manifest_is_unreadable() {
        // 統括 照らし NG-3: a folder that is a pack import (pack-import.json) but has no character-pack.json is not
        // skipped as "not a pack"; a folder with neither is (an older Builder package).
        let ws = workspace("summary-only");
        let dir = ws.join("imports").join("p-1-aaaaaaaaaaaa");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(PACK_IMPORT_SUMMARY_NAME), "{}").unwrap();
        fs::create_dir_all(ws.join("imports").join("old-builder-package")).unwrap();
        let read = imported_pack_ids_in(&ws);
        assert_eq!(read.status, "UNREADABLE");
        assert_eq!(read.unreadable.len(), 1, "{:?}", read.unreadable);
        assert!(read.unreadable[0].contains("a pack import without its character-pack.json"), "{:?}", read.unreadable);
        let _ = fs::remove_dir_all(&ws);
    }

    #[test]
    fn no_imports_folder_is_ok_and_empty() {
        let ws = workspace("none");
        assert_eq!(imported_pack_ids_in(&ws), ImportedPackIds { status: "OK", ids: Vec::new(), unreadable: Vec::new() });
        let _ = fs::remove_dir_all(&ws);
    }

    #[test]
    fn a_copy_that_cannot_be_read_makes_the_answer_unreadable() {
        let ws = workspace("bad");
        pack(&ws, "p-1-aaaaaaaaaaaa", r#"{"entries":[{"slug":"guide-a"}]}"#);
        pack(&ws, "q-1-bbbbbbbbbbbb", "not json");
        let read = imported_pack_ids_in(&ws);
        assert_eq!(read.status, "UNREADABLE", "C06-6: not K1 alone");
        assert_eq!(read.unreadable.len(), 1);
        pack(&ws, "q-1-bbbbbbbbbbbb", r#"{"entries":[{"name":"no slug"}]}"#);
        assert_eq!(imported_pack_ids_in(&ws).status, "UNREADABLE", "an entry without a slug is not skipped");
        let _ = fs::remove_dir_all(&ws);
    }
}
