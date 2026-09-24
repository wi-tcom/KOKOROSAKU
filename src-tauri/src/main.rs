#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use flate2::read::DeflateDecoder;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

mod character_pack;
mod saku_return;
use character_pack::{CharacterPackImport, looks_like_character_pack, parse_character_pack};
use saku_return::{SakuReturnImport, looks_like_saku_return, parse_saku_return};

const APP_VERSION: &str = "0.1.0-beta.8";
const CONFIG_FILE: &str = "desktop-host.json";
const MAX_PACKAGE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_BYTES: usize = 32 * 1024 * 1024;
// A sold SAKU Character Pack is a folder of 20-30 files with one archive per
// Character; the shape carries an entry ceiling and a total uncompressed
// budget so an archive cannot be used to expand past the intake limit.
// (The two-file Builder package, .witpkg, was retired on 2026-09-21: nothing
// produced it, and its manifest name is now the marker of the AMU Character
// File, which this host recognises only to point the user back to AMU Studio.)
const MAX_PACK_ENTRIES: usize = 512;
const MAX_ARCHIVE_TOTAL_BYTES: usize = 64 * 1024 * 1024;

pub(crate) struct ArchiveShape {
    pub max_entries: usize,
    pub max_total_bytes: usize,
    pub allow_directory_prefix: bool,
    /// Layout rules off (any folder depth, mixed roots) — used only to *look at*
    /// an archive this host will not import, never to import from it.  Size,
    /// count, traversal, encryption and compression rules still apply.
    pub peek_only: bool,
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct HostConfig {
    workspace: Option<PathBuf>,
}

#[derive(Debug, Serialize)]
struct RuntimeState {
    app_version: &'static str,
    install_dir: String,
    config_dir: String,
    log_dir: String,
    cache_dir: String,
    workspace: Option<String>,
    first_run: bool,
    /// Whether this window holds the workspace's lock. A window that does not
    /// reads the workspace and writes nothing to it (D6).
    workspace_writable: bool,
    code_signing: &'static str,
    /// The shared base layer as found on disk at startup: its digest, and whether
    /// it is the one this build shipped. The screen refuses to hand anything over
    /// when it is not, so the state is reported rather than left to be discovered
    /// at the moment someone tries to paste.
    base_layer: BaseLayerState,
}

#[derive(Debug, Clone, Serialize)]
struct BaseLayerState {
    version: &'static str,
    expected_sha256: &'static str,
    sha256: Option<String>,
    ok: bool,
    reason: Option<String>,
}

/// The shared base layer this build ships (統制卓 2026-09-23, Owner-approved v1.0).
const BASE_LAYER_VERSION: &str = "1.0";
const BASE_LAYER_SHA256: &str = "ab4745a3617e5b8e49125146a47ee99d1adde7ad8436c953431518ac23358654";
const BASE_LAYER_RESOURCE: &str = "help/base/saku-base-directives.v1.txt";

/// Read the bundled base layer and compare it with the digest built into this
/// binary. Reading the bytes matters: a checkout or an editor that rewrote the
/// line endings changes the digest, and that is exactly what must be caught.
fn base_layer_state(app: &AppHandle) -> BaseLayerState {
    let mut state = BaseLayerState {
        version: BASE_LAYER_VERSION,
        expected_sha256: BASE_LAYER_SHA256,
        sha256: None,
        ok: false,
        reason: None,
    };
    // The base layer travels inside the frontend bundle, which is what the WebView
    // will actually load — so the check reads the same bytes the screen will read.
    let asset = match app.asset_resolver().get(BASE_LAYER_RESOURCE.to_string()) {
        Some(asset) => asset,
        None => {
            state.reason = Some("BASE_LAYER_NOT_BUNDLED".to_string());
            return state;
        }
    };
    let bytes = asset.bytes;
    let digest = sha256_hex(&bytes);
    state.ok = digest == BASE_LAYER_SHA256;
    if !state.ok {
        state.reason = Some("BASE_LAYER_DIGEST_MISMATCH".to_string());
    }
    state.sha256 = Some(digest);
    state
}

#[derive(Debug, Deserialize, Serialize)]
struct PackageManifest {
    package_type: String,
    product: String,
    package_version: String,
    // A version alone cannot identify a schema. Older packages carry no id;
    // they are refused rather than resolved from the payload, because resolving
    // it there would make the manifest's claim unfalsifiable.
    #[serde(default)]
    schema_id: String,
    schema_version: String,
    minimum_app_version: String,
    content_type: String,
    distribution_channel: String,
    license_state: String,
    payload_hash: String,
}

#[derive(Debug, Serialize)]
struct ImportResult {
    status: &'static str,
    code: &'static str,
    reason: String,
    source_path: Option<String>,
    imported_path: Option<String>,
    payload_json: Option<String>,
    manifest: Option<PackageManifest>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pack: Option<CharacterPackImport>,
    /// Present only for an AMU Studio saku-return (nothing is written for it).
    #[serde(skip_serializing_if = "Option::is_none")]
    saku_return: Option<SakuReturnImport>,
}

#[derive(Debug, Serialize)]
struct SaveFileResult {
    status: &'static str,
    path: Option<String>,
    filename: String,
    bytes: usize,
    reason: Option<String>,
}

#[derive(Debug)]
struct PackageValidationFailure {
    status: &'static str,
    code: &'static str,
    reason: String,
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn valid_export_filename(filename: &str) -> bool {
    let path = Path::new(filename);
    !filename.trim().is_empty()
        && !path.is_absolute()
        && path
            .parent()
            .is_some_and(|parent| parent.as_os_str().is_empty())
        && path
            .file_name()
            .is_some_and(|name| name == std::ffi::OsStr::new(filename))
}

fn write_export_file(path: &Path, filename: &str, content: &str) -> SaveFileResult {
    match fs::write(path, content.as_bytes()) {
        // A successful write is not yet proof for the user. The Owner must never be
        // told a file was saved unless it is actually on disk with the expected size,
        // so the result is confirmed by reading the metadata back.
        Ok(()) => match fs::metadata(path) {
            Ok(metadata) if metadata.len() == content.as_bytes().len() as u64 => SaveFileResult {
                status: "SAVED",
                path: Some(path_string(path)),
                filename: filename.to_string(),
                bytes: content.len(),
                reason: None,
            },
            Ok(metadata) => SaveFileResult {
                status: "ERROR",
                path: None,
                filename: filename.to_string(),
                bytes: 0,
                reason: Some(format!(
                    "FILE_SIZE_MISMATCH: wrote {} bytes, found {}",
                    content.as_bytes().len(),
                    metadata.len()
                )),
            },
            Err(error) => SaveFileResult {
                status: "ERROR",
                path: None,
                filename: filename.to_string(),
                bytes: 0,
                reason: Some(format!("FILE_NOT_FOUND_AFTER_WRITE: {error}")),
            },
        },
        Err(error) => SaveFileResult {
            status: "ERROR",
            path: None,
            filename: filename.to_string(),
            bytes: 0,
            reason: Some(format!("FILE_WRITE_FAILED: {error}")),
        },
    }
}

#[tauri::command]
fn save_builder_file(filename: String, content: String, dialog_title: String) -> SaveFileResult {
    if !valid_export_filename(&filename) {
        return SaveFileResult {
            status: "ERROR",
            path: None,
            filename,
            bytes: 0,
            reason: Some("EXPORT_FILENAME_INVALID".to_string()),
        };
    }
    let selection = rfd::FileDialog::new()
        .set_title(dialog_title)
        .set_file_name(&filename)
        .save_file();
    match selection {
        Some(path) => write_export_file(&path, &filename, &content),
        None => SaveFileResult {
            status: "CANCELLED",
            path: None,
            filename,
            bytes: 0,
            reason: None,
        },
    }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(CONFIG_FILE))
        .map_err(|error| format!("CONFIG_PATH_UNAVAILABLE: {error}"))
}

fn read_config(app: &AppHandle) -> Result<HostConfig, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(HostConfig::default());
    }
    let bytes = fs::read(&path).map_err(|error| format!("CONFIG_READ_FAILED: {error}"))?;
    serde_json::from_slice(&bytes).map_err(|error| format!("CONFIG_INVALID: {error}"))
}

fn write_config(app: &AppHandle, config: &HostConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "CONFIG_PARENT_UNAVAILABLE".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("CONFIG_CREATE_FAILED: {error}"))?;
    let bytes = serde_json::to_vec_pretty(config)
        .map_err(|error| format!("CONFIG_SERIALIZE_FAILED: {error}"))?;
    fs::write(path, bytes).map_err(|error| format!("CONFIG_WRITE_FAILED: {error}"))
}

fn runtime_state_inner(app: &AppHandle) -> Result<RuntimeState, String> {
    let config = read_config(app)?;
    let executable =
        std::env::current_exe().map_err(|error| format!("INSTALL_PATH_UNAVAILABLE: {error}"))?;
    let install_dir = executable
        .parent()
        .ok_or_else(|| "INSTALL_PATH_UNAVAILABLE".to_string())?;
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("CONFIG_PATH_UNAVAILABLE: {error}"))?;
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|error| format!("LOG_PATH_UNAVAILABLE: {error}"))?;
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("CACHE_PATH_UNAVAILABLE: {error}"))?;
    Ok(RuntimeState {
        app_version: APP_VERSION,
        install_dir: path_string(install_dir),
        config_dir: path_string(&config_dir),
        log_dir: path_string(&log_dir),
        cache_dir: path_string(&cache_dir),
        workspace: config.workspace.as_deref().map(path_string),
        first_run: config.workspace.is_none(),
        workspace_writable: config
            .workspace
            .as_deref()
            .map(|workspace| app.state::<WorkspaceLock>().acquire(workspace))
            .unwrap_or(false),
        code_signing: "UNSIGNED",
        base_layer: base_layer_state(app),
    })
}

#[tauri::command]
fn get_runtime_state(app: AppHandle) -> Result<RuntimeState, String> {
    runtime_state_inner(&app)
}

fn startup_route_from_args(args: impl IntoIterator<Item = String>) -> &'static str {
    if args
        .into_iter()
        .any(|argument| argument == "--getting-started")
    {
        "GETTING_STARTED"
    } else {
        "DEFAULT"
    }
}

#[tauri::command]
fn get_startup_route() -> &'static str {
    startup_route_from_args(std::env::args())
}

/// Pick a folder. Nothing changes yet: the page asks about an unsaved draft
/// between picking and opening, so cancelling the picker never costs a draft.
/// A window that does not hold its workspace does not change the choice that
/// both windows share.
#[tauri::command]
fn pick_workspace_folder(app: AppHandle) -> Result<String, String> {
    if let Some(current) = read_config(&app)?.workspace {
        if !holds_lock(&app, &current) {
            return Err(READ_ONLY.to_string());
        }
    }
    let selection = rfd::FileDialog::new()
        .set_title("SAKU workspaceを選択または作成")
        .pick_folder()
        .ok_or_else(|| "WORKSPACE_SELECTION_CANCELLED".to_string())?;
    Ok(path_string(&selection))
}

/// Picking and opening in one step, kept for callers from before the split.
#[tauri::command]
fn choose_workspace(app: AppHandle) -> Result<RuntimeState, String> {
    let folder = pick_workspace_folder(app.clone())?;
    open_workspace(app, folder)
}

/// Make `path` the workspace: create it if needed, record the choice, let go
/// of the workspace this window held, and take the new one's lock.
#[tauri::command]
fn open_workspace(app: AppHandle, path: String) -> Result<RuntimeState, String> {
    if let Some(current) = read_config(&app)?.workspace {
        if !holds_lock(&app, &current) {
            return Err(READ_ONLY.to_string());
        }
    }
    let selection = PathBuf::from(path);
    fs::create_dir_all(&selection).map_err(|error| format!("WORKSPACE_CREATE_FAILED: {error}"))?;
    let marker = selection.join(".saku-builder");
    fs::create_dir_all(&marker)
        .map_err(|error| format!("WORKSPACE_METADATA_CREATE_FAILED: {error}"))?;
    let marker_body = serde_json::json!({
        "profile": "saku.desktop.workspace@1",
        "app_version": APP_VERSION,
        "preserve_on_uninstall": true
    });
    fs::write(
        marker.join("workspace.json"),
        serde_json::to_vec_pretty(&marker_body)
            .map_err(|error| format!("WORKSPACE_METADATA_SERIALIZE_FAILED: {error}"))?,
    )
    .map_err(|error| format!("WORKSPACE_METADATA_WRITE_FAILED: {error}"))?;
    write_config(
        &app,
        &HostConfig {
            workspace: Some(selection),
        },
    )?;
    app.state::<WorkspaceLock>().release();
    runtime_state_inner(&app)
}

// The one Character schema this host imports from a pack: the active Unified
// V1 (Canonical adoption).  A pack declaring anything else is refused here,
// before any file is written; the page (character-schema.mjs admit()) then
// decides each Character.  The host never converts or relabels a Character.
const ACTIVE_SCHEMA_ID: &str = "SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE";
const ACTIVE_SCHEMA_VERSION: &str = "final-delta-recovery-closure-2026-09-04";
fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn invalid(reason: impl Into<String>, source_path: Option<String>) -> ImportResult {
    ImportResult {
        status: "INVALID",
        code: "PACKAGE_INVALID",
        reason: reason.into(),
        source_path,
        imported_path: None,
        payload_json: None,
        manifest: None,
        pack: None,
        saku_return: None,
    }
}

fn package_failure(
    status: &'static str,
    code: &'static str,
    reason: impl Into<String>,
) -> PackageValidationFailure {
    PackageValidationFailure {
        status,
        code,
        reason: reason.into(),
    }
}

fn failure_result(failure: PackageValidationFailure, source_path: Option<String>) -> ImportResult {
    ImportResult {
        status: failure.status,
        code: failure.code,
        reason: failure.reason,
        source_path,
        imported_path: None,
        payload_json: None,
        manifest: None,
        pack: None,
        saku_return: None,
    }
}

fn le_u16(bytes: &[u8], offset: usize) -> Option<u16> {
    let value = bytes.get(offset..offset.checked_add(2)?)?;
    Some(u16::from_le_bytes([value[0], value[1]]))
}

fn le_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    let value = bytes.get(offset..offset.checked_add(4)?)?;
    Some(u32::from_le_bytes([value[0], value[1], value[2], value[3]]))
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut value = u32::MAX;
    for byte in bytes {
        value ^= u32::from(*byte);
        for _ in 0..8 {
            let mask = 0_u32.wrapping_sub(value & 1);
            value = (value >> 1) ^ (0xedb8_8320 & mask);
        }
    }
    !value
}

fn invalid_archive(reason: impl Into<String>) -> PackageValidationFailure {
    package_failure("INVALID", "PACKAGE_ARCHIVE_INVALID", reason)
}

pub(crate) fn archive_entries_with(
    bytes: &[u8],
    shape: &ArchiveShape,
) -> Result<HashMap<String, Vec<u8>>, PackageValidationFailure> {
    const EOCD: u32 = 0x0605_4b50;
    const CENTRAL: u32 = 0x0201_4b50;
    const LOCAL: u32 = 0x0403_4b50;

    if bytes.len() < 22 {
        return Err(invalid_archive("ZIP end record is missing."));
    }
    let search_start = bytes.len().saturating_sub(22 + usize::from(u16::MAX));
    let eocd = (search_start..=bytes.len() - 22)
        .rev()
        .find(|offset| le_u32(bytes, *offset) == Some(EOCD))
        .ok_or_else(|| invalid_archive("ZIP end record is missing."))?;
    let comment_length = usize::from(
        le_u16(bytes, eocd + 20).ok_or_else(|| invalid_archive("ZIP end record is truncated."))?,
    );
    if eocd
        .checked_add(22 + comment_length)
        .filter(|end| *end == bytes.len())
        .is_none()
    {
        return Err(invalid_archive("ZIP has trailing or truncated data."));
    }
    let disk = le_u16(bytes, eocd + 4).unwrap_or(u16::MAX);
    let central_disk = le_u16(bytes, eocd + 6).unwrap_or(u16::MAX);
    let disk_entries = le_u16(bytes, eocd + 8).unwrap_or(u16::MAX);
    let total_entries = le_u16(bytes, eocd + 10).unwrap_or(u16::MAX);
    if disk != 0 || central_disk != 0 || disk_entries != total_entries {
        return Err(package_failure(
            "UNSUPPORTED",
            "PACKAGE_ARCHIVE_MULTIDISK_UNSUPPORTED",
            "Multi-disk ZIP packages are not supported.",
        ));
    }
    let entry_count = usize::from(total_entries);
    if entry_count == 0 || entry_count > shape.max_entries {
        return Err(invalid_archive(format!(
            "ZIP entry count {entry_count} is outside the supported limit (1..{}).",
            shape.max_entries
        )));
    }
    let central_size = usize::try_from(le_u32(bytes, eocd + 12).unwrap_or(u32::MAX))
        .map_err(|_| invalid_archive("ZIP central directory size is invalid."))?;
    let central_offset = usize::try_from(le_u32(bytes, eocd + 16).unwrap_or(u32::MAX))
        .map_err(|_| invalid_archive("ZIP central directory offset is invalid."))?;
    let central_end = central_offset
        .checked_add(central_size)
        .ok_or_else(|| invalid_archive("ZIP central directory overflows."))?;
    if central_end != eocd {
        return Err(invalid_archive("ZIP central directory binding is invalid."));
    }

    let mut cursor = central_offset;
    let mut entries = HashMap::new();
    let mut total_bytes: usize = 0;
    // With a directory prefix allowed, every file must sit under the same
    // single folder (or none at all); deeper paths are refused either way.
    let mut prefix: Option<String> = None;
    for _ in 0..entry_count {
        if le_u32(bytes, cursor) != Some(CENTRAL) {
            return Err(invalid_archive("ZIP central entry signature is invalid."));
        }
        let flags = le_u16(bytes, cursor + 8)
            .ok_or_else(|| invalid_archive("ZIP central entry is truncated."))?;
        let method = le_u16(bytes, cursor + 10)
            .ok_or_else(|| invalid_archive("ZIP compression method is missing."))?;
        let expected_crc =
            le_u32(bytes, cursor + 16).ok_or_else(|| invalid_archive("ZIP CRC is missing."))?;
        let compressed_size = usize::try_from(
            le_u32(bytes, cursor + 20)
                .ok_or_else(|| invalid_archive("ZIP compressed size is missing."))?,
        )
        .map_err(|_| invalid_archive("ZIP compressed size is invalid."))?;
        let uncompressed_size = usize::try_from(
            le_u32(bytes, cursor + 24)
                .ok_or_else(|| invalid_archive("ZIP uncompressed size is missing."))?,
        )
        .map_err(|_| invalid_archive("ZIP uncompressed size is invalid."))?;
        if uncompressed_size > MAX_ARCHIVE_ENTRY_BYTES {
            return Err(invalid_archive(
                "ZIP entry exceeds the uncompressed size limit.",
            ));
        }
        if flags & 0x0041 != 0 {
            return Err(package_failure(
                "UNSUPPORTED",
                "PACKAGE_ARCHIVE_ENCRYPTION_UNSUPPORTED",
                "Encrypted ZIP packages are not supported.",
            ));
        }
        if method != 0 && method != 8 {
            return Err(package_failure(
                "UNSUPPORTED",
                "PACKAGE_ARCHIVE_COMPRESSION_UNSUPPORTED",
                format!("ZIP compression method {method} is not supported."),
            ));
        }
        let name_length = usize::from(
            le_u16(bytes, cursor + 28)
                .ok_or_else(|| invalid_archive("ZIP filename length is missing."))?,
        );
        let extra_length = usize::from(
            le_u16(bytes, cursor + 30)
                .ok_or_else(|| invalid_archive("ZIP extra length is missing."))?,
        );
        let comment_length = usize::from(
            le_u16(bytes, cursor + 32)
                .ok_or_else(|| invalid_archive("ZIP comment length is missing."))?,
        );
        let local_offset = usize::try_from(
            le_u32(bytes, cursor + 42)
                .ok_or_else(|| invalid_archive("ZIP local offset is missing."))?,
        )
        .map_err(|_| invalid_archive("ZIP local offset is invalid."))?;
        let name_start = cursor + 46;
        let name_end = name_start
            .checked_add(name_length)
            .ok_or_else(|| invalid_archive("ZIP filename overflows."))?;
        let name_bytes = bytes
            .get(name_start..name_end)
            .ok_or_else(|| invalid_archive("ZIP filename is truncated."))?;
        let name = std::str::from_utf8(name_bytes)
            .map_err(|_| invalid_archive("ZIP filenames must be UTF-8 or ASCII."))?
            .to_string();
        if name.contains('\\') || name == "." || name == ".." || name.split('/').any(|segment| segment == "..") {
            return Err(invalid_archive("ZIP package files must be at the archive root."));
        }
        let mut is_directory_entry = false;
        let stored_name = if shape.peek_only {
            if name.ends_with('/') && uncompressed_size == 0 {
                is_directory_entry = true;
            }
            name.clone()
        } else if shape.allow_directory_prefix {
            if name.ends_with('/') && uncompressed_size == 0 {
                // A folder entry carries no bytes; it is skipped after the
                // structural checks below.
                is_directory_entry = true;
                name.clone()
            } else if let Some((folder, rest)) = name.split_once('/') {
                if rest.contains('/') || rest.is_empty() || folder.is_empty() {
                    return Err(invalid_archive("ZIP package files may sit at most one folder deep."));
                }
                match &prefix {
                    None => prefix = Some(folder.to_string()),
                    Some(existing) if existing == folder => {}
                    Some(_) => return Err(invalid_archive("ZIP package files must share one folder.")),
                }
                rest.to_string()
            } else {
                if prefix.is_some() {
                    return Err(invalid_archive("ZIP package files must share one folder."));
                }
                name.clone()
            }
        } else {
            if name.contains('/') {
                return Err(invalid_archive(
                    "ZIP package files must be at the archive root.",
                ));
            }
            name.clone()
        };
        if !is_directory_entry && entries.contains_key(&stored_name) {
            return Err(invalid_archive("ZIP contains a duplicate filename."));
        }
        total_bytes = total_bytes
            .checked_add(uncompressed_size)
            .filter(|total| *total <= shape.max_total_bytes)
            .ok_or_else(|| invalid_archive("ZIP exceeds the total uncompressed size limit."))?;

        if le_u32(bytes, local_offset) != Some(LOCAL) {
            return Err(invalid_archive("ZIP local entry signature is invalid."));
        }
        let local_method = le_u16(bytes, local_offset + 8)
            .ok_or_else(|| invalid_archive("ZIP local entry is truncated."))?;
        let local_name_length = usize::from(
            le_u16(bytes, local_offset + 26)
                .ok_or_else(|| invalid_archive("ZIP local filename length is missing."))?,
        );
        let local_extra_length = usize::from(
            le_u16(bytes, local_offset + 28)
                .ok_or_else(|| invalid_archive("ZIP local extra length is missing."))?,
        );
        if local_method != method {
            return Err(invalid_archive(
                "ZIP local and central compression methods differ.",
            ));
        }
        let local_name_start = local_offset + 30;
        let local_name_end = local_name_start
            .checked_add(local_name_length)
            .ok_or_else(|| invalid_archive("ZIP local filename overflows."))?;
        if bytes.get(local_name_start..local_name_end) != Some(name_bytes) {
            return Err(invalid_archive("ZIP local and central filenames differ."));
        }
        let data_start = local_name_end
            .checked_add(local_extra_length)
            .ok_or_else(|| invalid_archive("ZIP local data offset overflows."))?;
        let data_end = data_start
            .checked_add(compressed_size)
            .ok_or_else(|| invalid_archive("ZIP compressed data overflows."))?;
        let compressed = bytes
            .get(data_start..data_end)
            .ok_or_else(|| invalid_archive("ZIP compressed data is truncated."))?;
        let output = if method == 0 {
            compressed.to_vec()
        } else {
            let mut decoder =
                DeflateDecoder::new(compressed).take((MAX_ARCHIVE_ENTRY_BYTES + 1) as u64);
            let mut output = Vec::with_capacity(uncompressed_size);
            decoder
                .read_to_end(&mut output)
                .map_err(|error| invalid_archive(format!("ZIP deflate failed: {error}")))?;
            output
        };
        if output.len() != uncompressed_size || output.len() > MAX_ARCHIVE_ENTRY_BYTES {
            return Err(invalid_archive("ZIP uncompressed size does not match."));
        }
        if crc32(&output) != expected_crc {
            return Err(invalid_archive("ZIP CRC does not match."));
        }
        if !is_directory_entry {
            entries.insert(stored_name, output);
        }
        cursor = name_end
            .checked_add(extra_length)
            .and_then(|value| value.checked_add(comment_length))
            .ok_or_else(|| invalid_archive("ZIP central entry overflows."))?;
    }
    if cursor != central_end {
        return Err(invalid_archive(
            "ZIP central directory length does not match.",
        ));
    }
    Ok(entries)
}

pub(crate) const ACCEPTED_FORMATS_JA: &str = "受け付ける形式: SAKU Character Pack（character-pack.json を含む署名付き ZIP）。";
pub(crate) const INDIVIDUAL_IMPORT_HINT_JA: &str = "Character JSON／YAML は「個別インポート」から読み込んでください。";
pub(crate) const AMU_CHARACTER_FILE_JA: &str = "これは AMU Character File（.amupkg）です。SAKU Builder では開けません。SAKU へ戻すには AMU Studio の「この編集内容を SAKU へ戻す」を使い、できた .saku-return.zip を読み込んでください。";
pub(crate) const RETIRED_BUILDER_PACKAGE_JA: &str = "旧 Builder パッケージ（.witpkg: wit-package.json と payload.json）は 2026-09-21 に廃止され、読み込めません。";
// The AMU Character File marks itself in wit-package.json (KOKOROAMU-STUDIO
// specification/constants.js, PR #68 7c1e24e): exact strings, pinned.
const AMU_WIT_PACKAGE_TYPE: &str = "WIT_PACKAGE";
const AMU_CHARACTER_KIND: &str = "AMU_CHARACTER";
const AMU_CHARACTER_SCHEMA_PREFIX: &str = "AMU-CHARACTER/";

fn unrecognized_format(detail: impl Into<String>) -> PackageValidationFailure {
    package_failure(
        "INVALID",
        "PACKAGE_FORMAT_UNRECOGNIZED",
        format!("{ACCEPTED_FORMATS_JA} このファイルはどれにも当てはまりません（{}）。", detail.into()),
    )
}

#[derive(Debug)]
enum ParsedPackage {
    CharacterPack(CharacterPackImport),
    SakuReturn(SakuReturnImport),
}

/// Is this wit-package.json the AMU Character File marker?  Decided by the
/// pinned strings only; a schema prefix match alone is accepted as a hedge
/// against a future kind rename, never a shape guess.
fn is_amu_character_file(manifest: &Value) -> bool {
    let package_type = manifest.get("package_type").and_then(Value::as_str).unwrap_or("");
    let kind = manifest.get("kind").and_then(Value::as_str).unwrap_or("");
    let schema = manifest.get("schema").and_then(Value::as_str).unwrap_or("");
    package_type == AMU_WIT_PACKAGE_TYPE && (kind == AMU_CHARACTER_KIND || schema.starts_with(AMU_CHARACTER_SCHEMA_PREFIX))
}

/// The root wit-package.json of an archive, read with layout rules off.  None
/// when the archive cannot be read at all or carries no such root entry.
fn peek_root_wit_package(bytes: &[u8]) -> Option<Value> {
    let entries = archive_entries_with(
        bytes,
        &ArchiveShape { max_entries: MAX_PACK_ENTRIES, max_total_bytes: MAX_ARCHIVE_TOTAL_BYTES, allow_directory_prefix: true, peek_only: true },
    )
    .ok()?;
    serde_json::from_slice(entries.get("wit-package.json")?).ok()
}

fn amu_character_file() -> PackageValidationFailure {
    package_failure("UNSUPPORTED", "PACKAGE_FORMAT_AMU_CHARACTER_FILE", AMU_CHARACTER_FILE_JA)
}

fn parse_package(path: &Path, bytes: &[u8]) -> Result<ParsedPackage, PackageValidationFailure> {
    let has_zip_magic = bytes.starts_with(b"PK\x03\x04");
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .unwrap_or_default();
    if has_zip_magic {
        let entries = match archive_entries_with(
            bytes,
            &ArchiveShape { max_entries: MAX_PACK_ENTRIES, max_total_bytes: MAX_ARCHIVE_TOTAL_BYTES, allow_directory_prefix: true, peek_only: false },
        ) {
            Ok(entries) => entries,
            Err(failure) => {
                // The AMU Character File has a mixed root (wit-package.json beside
                // pack/ and characters/), so the pack layout rules refuse it before
                // it can be named.  Look once more, layout rules off, only to say
                // what it is; nothing from this read is imported.
                if let Some(manifest) = peek_root_wit_package(bytes) {
                    if is_amu_character_file(&manifest) {
                        return Err(amu_character_file());
                    }
                    return Err(unrecognized_format(format!("{RETIRED_BUILDER_PACKAGE_JA} {INDIVIDUAL_IMPORT_HINT_JA}")));
                }
                if extension == "amupkg" {
                    return Err(amu_character_file());
                }
                return Err(failure);
            }
        };
        if looks_like_character_pack(&entries) {
            let pack = parse_character_pack(entries)?;
            if pack.schema_id != ACTIVE_SCHEMA_ID || pack.schema_version != ACTIVE_SCHEMA_VERSION {
                return Err(package_failure(
                    "UNSUPPORTED",
                    "CHARACTER_PACK_SCHEMA_UNSUPPORTED",
                    format!("この Character Pack の schema（{} {}）はこの Builder では読めません。対応: {ACTIVE_SCHEMA_ID} {ACTIVE_SCHEMA_VERSION}。", pack.schema_id, pack.schema_version),
                ));
            }
            return Ok(ParsedPackage::CharacterPack(pack));
        }
        // AMU Studio's 「SAKU へ戻す」: root edit-request.json + character.json.
        if looks_like_saku_return(&entries) {
            let ret = parse_saku_return(entries)?;
            if ret.schema_id != ACTIVE_SCHEMA_ID || ret.schema_version != ACTIVE_SCHEMA_VERSION {
                return Err(package_failure(
                    "UNSUPPORTED",
                    "SAKU_RETURN_SCHEMA_UNSUPPORTED",
                    format!("戻された Character の schema（{} {}）はこの Builder では読めません。対応: {ACTIVE_SCHEMA_ID} {ACTIVE_SCHEMA_VERSION}。", ret.schema_id, ret.schema_version),
                ));
            }
            return Ok(ParsedPackage::SakuReturn(ret));
        }
        // wit-package.json now marks two things this host does not import: the
        // AMU Character File (say where it belongs) and the retired Builder
        // package (say that it is retired).  Neither is guessed from anything
        // but the manifest's own declared strings.
        if let Some(manifest_bytes) = entries.get("wit-package.json") {
            let manifest: Value = serde_json::from_slice(manifest_bytes).unwrap_or(Value::Null);
            if is_amu_character_file(&manifest) {
                return Err(amu_character_file());
            }
            return Err(unrecognized_format(format!("{RETIRED_BUILDER_PACKAGE_JA} {INDIVIDUAL_IMPORT_HINT_JA}")));
        }
        if extension == "amupkg" {
            return Err(amu_character_file());
        }
        let mut names: Vec<&String> = entries.keys().collect();
        names.sort();
        let shown: Vec<&str> = names.iter().take(5).map(|name| name.as_str()).collect();
        return Err(unrecognized_format(format!(
            "ZIP に character-pack.json がありません: {}{}",
            shown.join(", "),
            if names.len() > 5 { " …" } else { "" }
        )));
    }
    if extension == "amupkg" {
        return Err(amu_character_file());
    }
    if extension == "zip" {
        return Err(unrecognized_format("拡張子は .zip ですが ZIP のヘッダーがありません"));
    }
    if extension == "witpkg" {
        return Err(unrecognized_format(RETIRED_BUILDER_PACKAGE_JA));
    }
    // A bare JSON / YAML Character belongs to the individual import, which reads
    // it in the page; the package route refuses it with that pointer rather than
    // failing on a manifest it was never going to have.
    if matches!(extension.as_str(), "json" | "yaml" | "yml") || serde_json::from_slice::<Value>(bytes).is_ok() {
        return Err(package_failure("INVALID", "PACKAGE_FORMAT_INDIVIDUAL_FILE", format!("{INDIVIDUAL_IMPORT_HINT_JA} {ACCEPTED_FORMATS_JA}")));
    }
    Err(unrecognized_format("ZIP ではありません"))
}

fn import_package(app: &AppHandle, path: &Path) -> ImportResult {
    let source_path = Some(path_string(path));
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) => return invalid(format!("PACKAGE_READ_FAILED: {error}"), source_path),
    };
    if metadata.len() > MAX_PACKAGE_BYTES {
        return failure_result(
            package_failure(
                "INVALID",
                "PACKAGE_SIZE_LIMIT_EXCEEDED",
                "Package exceeds the 64 MiB intake limit.",
            ),
            source_path,
        );
    }
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => return invalid(format!("PACKAGE_READ_FAILED: {error}"), source_path),
    };
    match parse_package(path, &bytes) {
        Ok(ParsedPackage::CharacterPack(pack)) => import_character_pack(app, pack, source_path),
        Ok(ParsedPackage::SakuReturn(ret)) => import_saku_return(ret, source_path),
        Err(failure) => failure_result(failure, source_path),
    }
}

/// A saku-return is handed to the page as one Character plus the request; the
/// workspace is not touched (Q1, 2026-09-21: a return is the entry point of an
/// edit, not an imported artifact), so no workspace is required either.
fn import_saku_return(ret: SakuReturnImport, source_path: Option<String>) -> ImportResult {
    let character: Value = match serde_json::from_str(&ret.character_json) {
        Ok(value) => value,
        Err(error) => return invalid(format!("SAKU_RETURN_CHARACTER_INVALID: {error}"), source_path),
    };
    let payload_json = match serde_json::to_string(&serde_json::json!({ "characters": [character] })) {
        Ok(text) => text,
        Err(error) => return invalid(format!("SAKU_RETURN_PAYLOAD_SERIALIZE_FAILED: {error}"), source_path),
    };
    let manifest = PackageManifest {
        package_type: "amu-saku-return".to_string(),
        product: ret.character_id.clone(),
        package_version: ret.character_revision.clone(),
        schema_id: ret.schema_id.clone(),
        schema_version: ret.schema_version.clone(),
        minimum_app_version: APP_VERSION.to_string(),
        content_type: "CHARACTER".to_string(),
        distribution_channel: "AMU_STUDIO_RETURN".to_string(),
        license_state: "AS_SIGNED_ARCHIVE".to_string(),
        payload_hash: sha256_hex(payload_json.as_bytes()),
    };
    ImportResult {
        status: "IMPORTED",
        code: "SAKU_RETURN_READY",
        reason: format!(
            "AMU Studio からの戻し: {} rev {}（{} 件の依頼フィールド）。workspace には保存していません。",
            ret.character_id, ret.character_revision, ret.fields.len()
        ),
        source_path,
        imported_path: None,
        payload_json: Some(payload_json),
        manifest: Some(manifest),
        pack: None,
        saku_return: Some(ret),
    }
}

/// Import a verified SAKU Character Pack: the Characters go to the caller as
/// one `{ characters: [...] }` payload (the same shape a Builder package
/// carries), the pack files are kept in the workspace for provenance, and the
/// synthesized manifest lets the durable-store scan pick the import up again.
fn import_character_pack(app: &AppHandle, pack: CharacterPackImport, source_path: Option<String>) -> ImportResult {
    let characters: Vec<Value> = match pack
        .entries
        .iter()
        .map(|entry| serde_json::from_str::<Value>(&entry.character_json))
        .collect::<Result<Vec<Value>, _>>()
    {
        Ok(values) => values,
        Err(error) => return invalid(format!("CHARACTER_PACK_CHARACTER_INVALID: {error}"), source_path),
    };
    // The glossaries travel beside the Characters, keyed by character_id, so the
    // screen can pick the right one without re-reading the archive.
    let directives: serde_json::Map<String, Value> = pack
        .entries
        .iter()
        .filter_map(|entry| entry.directives_json.as_ref().and_then(|text| serde_json::from_str::<Value>(text).ok()).map(|value| (entry.character_id.clone(), value)))
        .collect();
    let payload_json = match serde_json::to_string(&serde_json::json!({ "characters": characters, "directives": directives })) {
        Ok(text) => text,
        Err(error) => return invalid(format!("CHARACTER_PACK_PAYLOAD_SERIALIZE_FAILED: {error}"), source_path),
    };
    let payload_hash = sha256_hex(payload_json.as_bytes());
    let manifest = PackageManifest {
        package_type: "kokorosaku-character-pack".to_string(),
        product: pack.pack_id.clone(),
        package_version: pack.pack_version.clone(),
        schema_id: pack.schema_id.clone(),
        schema_version: pack.schema_version.clone(),
        minimum_app_version: APP_VERSION.to_string(),
        content_type: "CHARACTER_PACK".to_string(),
        distribution_channel: "STORE".to_string(),
        license_state: "BUNDLED_LICENSE_MD".to_string(),
        payload_hash: payload_hash.clone(),
    };
    let config = match read_config(app) {
        Ok(config) => config,
        Err(error) => return invalid(error, source_path),
    };
    let workspace = match config.workspace {
        Some(path) => path,
        None => {
            return ImportResult {
                status: "NOT_CONFIGURED",
                code: "WORKSPACE_REQUIRED",
                reason: "Select or create a workspace before importing a package.".to_string(),
                source_path,
                imported_path: None,
                payload_json: None,
                manifest: Some(manifest),
                pack: Some(pack),
                saku_return: None,
            };
        }
    };
    // Writing into the workspace needs its lock: a second window reads only (D6).
    if let Err(error) = require_workspace_lock(app, None) {
        return invalid(error, source_path);
    }
    let import_dir = workspace.join("imports").join(format!(
        "{}-{}-{}",
        safe_path_segment(&pack.pack_id),
        safe_path_segment(&pack.pack_version),
        &payload_hash[..12]
    ));
    if let Err(error) = fs::create_dir_all(import_dir.join("characters")) {
        return invalid(format!("IMPORT_DIRECTORY_CREATE_FAILED: {error}"), source_path);
    }
    let mut writes: Vec<(PathBuf, Vec<u8>)> = vec![(import_dir.join("payload.json"), payload_json.clone().into_bytes())];
    match serde_json::to_vec_pretty(&manifest) {
        Ok(bytes) => writes.push((import_dir.join("wit-package.json"), bytes)),
        Err(error) => return invalid(format!("MANIFEST_SERIALIZE_FAILED: {error}"), source_path),
    }
    match serde_json::to_vec_pretty(&pack) {
        Ok(bytes) => writes.push((import_dir.join("pack-import.json"), bytes)),
        Err(error) => return invalid(format!("PACK_SUMMARY_SERIALIZE_FAILED: {error}"), source_path),
    }
    for (name, bytes) in &pack.files {
        // Names were validated as flat, separator-free archive members.
        if name.contains('/') || name.contains(char::from(92)) || name == ".." || name == "." {
            return invalid(format!("CHARACTER_PACK_FILE_NAME_INVALID: {name}"), source_path);
        }
        writes.push((import_dir.join(name), bytes.clone()));
    }
    for entry in &pack.entries {
        writes.push((
            import_dir.join("characters").join(format!("{}.character.json", safe_path_segment(&entry.slug))),
            entry.character_json.clone().into_bytes(),
        ));
        // A pack may carry the directive glossary its Character needs. It was
        // digest-checked with the rest of the entry; keep it beside the
        // Character so 03 can prefer it over the copy bundled with the app.
        if let Some(directives) = &entry.directives_json {
            writes.push((
                import_dir.join("characters").join(format!("{}.directives.json", safe_path_segment(&entry.slug))),
                directives.clone().into_bytes(),
            ));
        }
    }
    for (target, bytes) in writes {
        if let Err(error) = fs::write(&target, bytes) {
            return invalid(format!("IMPORT_WRITE_FAILED: {}: {error}", path_string(&target)), source_path);
        }
    }
    let count = pack.character_count;
    ImportResult {
        status: "IMPORTED",
        code: "CHARACTER_PACK_IMPORTED",
        reason: format!(
            "SAKU Character Pack {} {}: {count} 体の digest 整合（SHA256SUMS・archive・files・catalog release・manifest digest）を確認しました。署名（Ed25519）はこのホストでは未検証です。",
            pack.pack_id, pack.pack_version
        ),
        source_path,
        imported_path: Some(path_string(&import_dir)),
        payload_json: Some(payload_json),
        manifest: Some(manifest),
        pack: Some(pack),
        saku_return: None,
    }
}

#[tauri::command]
fn choose_and_import_package(app: AppHandle) -> Result<ImportResult, String> {
    let selection = rfd::FileDialog::new()
        .set_title("SAKU Character Pack を選択")
        .add_filter("SAKU Character Pack (.zip)", &["zip"])
        .pick_file()
        .ok_or_else(|| "PACKAGE_SELECTION_CANCELLED".to_string())?;
    Ok(import_package(&app, &selection))
}

#[tauri::command]
fn import_package_path(app: AppHandle, path: String) -> ImportResult {
    import_package(&app, Path::new(&path))
}

// ── Durable Character store ──────────────────────────────────────────────────
//
// The Character Library index lives in WebView2 Local Storage under
// %LOCALAPPDATA%, which the uninstaller removes when the Owner ticks "delete
// app data". That store is therefore a working index, not the source of truth.
// Every Character the Owner authors or imports is also written into the
// workspace, which is a folder the Owner chose and which no uninstall path
// touches, so the Library can be rebuilt after the removable store is gone.

fn safe_path_segment(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('_').to_string();
    if trimmed.is_empty() {
        "unnamed".to_string()
    } else {
        trimmed.chars().take(80).collect()
    }
}

#[derive(Debug, Serialize)]
struct DurableArtifact {
    origin: &'static str,
    path: String,
    payload_json: String,
    schema_id: String,
    schema_version: String,
}

#[derive(Debug, Serialize)]
struct DurableLibrary {
    status: &'static str,
    workspace: Option<String>,
    artifacts: Vec<DurableArtifact>,
    unreadable: Vec<String>,
}

fn collect_imports(
    workspace: &Path,
    artifacts: &mut Vec<DurableArtifact>,
    unreadable: &mut Vec<String>,
) {
    let root = workspace.join("imports");
    let entries = match fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let payload = match fs::read_to_string(dir.join("payload.json")) {
            Ok(text) => text,
            Err(error) => {
                unreadable.push(format!("{}: {error}", path_string(&dir)));
                continue;
            }
        };
        let (schema_id, schema_version) = match fs::read_to_string(dir.join("wit-package.json"))
            .ok()
            .and_then(|text| serde_json::from_str::<PackageManifest>(&text).ok())
        {
            Some(manifest) => (manifest.schema_id, manifest.schema_version),
            None => (String::new(), String::new()),
        };
        artifacts.push(DurableArtifact {
            origin: "IMPORT",
            path: path_string(&dir),
            payload_json: payload,
            schema_id,
            schema_version,
        });
    }
}

fn collect_authored(
    workspace: &Path,
    artifacts: &mut Vec<DurableArtifact>,
    unreadable: &mut Vec<String>,
) {
    let root = workspace.join("characters");
    let entries = match fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let file = dir.join("character.json");
        match fs::read_to_string(&file) {
            Ok(text) => artifacts.push(DurableArtifact {
                origin: "AUTHORED",
                path: path_string(&dir),
                payload_json: text,
                schema_id: String::new(),
                schema_version: String::new(),
            }),
            Err(error) => unreadable.push(format!("{}: {error}", path_string(&file))),
        }
    }
}

#[tauri::command]
fn list_workspace_characters(app: AppHandle) -> Result<DurableLibrary, String> {
    let config = read_config(&app)?;
    let workspace = match config.workspace {
        Some(path) => path,
        None => {
            return Ok(DurableLibrary {
                status: "NO_WORKSPACE",
                workspace: None,
                artifacts: Vec::new(),
                unreadable: Vec::new(),
            });
        }
    };
    let mut artifacts = Vec::new();
    let mut unreadable = Vec::new();
    collect_imports(&workspace, &mut artifacts, &mut unreadable);
    collect_authored(&workspace, &mut artifacts, &mut unreadable);
    Ok(DurableLibrary {
        status: "OK",
        workspace: Some(path_string(&workspace)),
        artifacts,
        unreadable,
    })
}

#[tauri::command]
fn save_workspace_character(
    app: AppHandle,
    character_id: String,
    character_json: String,
) -> Result<String, String> {
    // Refuse to persist something that is not a JSON object: a durable store
    // that accepts anything cannot be trusted to rebuild the Library.
    serde_json::from_str::<serde_json::Value>(&character_json)
        .ok()
        .filter(|value| value.is_object())
        .ok_or_else(|| "CHARACTER_NOT_JSON_OBJECT".to_string())?;
    let workspace = require_workspace_lock(&app, None)?;
    write_character_files(&workspace, &character_id, &character_json)
}

/// The latest revision as `character.json`, and every revision the workspace
/// has seen under `revisions/` (D3): a save never overwrites an older revision.
fn write_character_files(workspace: &Path, character_id: &str, character_json: &str) -> Result<String, String> {
    let dir = workspace
        .join("characters")
        .join(safe_path_segment(character_id));
    fs::create_dir_all(&dir).map_err(|error| format!("CHARACTER_DIR_CREATE_FAILED: {error}"))?;
    let revision = serde_json::from_str::<Value>(character_json)
        .ok()
        .and_then(|value| value.pointer("/identity/character_revision").and_then(Value::as_str).map(str::to_string))
        .filter(|revision| !revision.trim().is_empty())
        .unwrap_or_else(|| "unversioned".to_string());
    let revisions = dir.join("revisions");
    fs::create_dir_all(&revisions).map_err(|error| format!("CHARACTER_DIR_CREATE_FAILED: {error}"))?;
    write_atomically(&revisions.join(format!("{}.json", safe_path_segment(&revision))), character_json.as_bytes())?;
    let file = dir.join("character.json");
    write_atomically(&file, character_json.as_bytes())?;
    Ok(path_string(&file))
}

// ── Workspace-scoped state (D-20260923-workspace-scoped-library) ─────────────
//
// The Character list, its deletion marks, the import history, the selected
// Character and its draft belong to the workspace. The page keeps a working
// copy in WebView storage and writes each change through to
// `.saku-builder/state/`. One window holds a workspace at a time: the lock is
// an exclusive open of `.saku-builder/lock`, so the operating system releases
// it when the process ends and a crash never leaves a stale lock. A window
// without the lock reads the workspace and writes nothing to it.

const READ_ONLY: &str = "WORKSPACE_READ_ONLY: another window holds this workspace";
const STATE_DIR: &str = "state";
const STATE_FILES: [(&str, &str); 4] = [
    ("saku.workspace.library", "library.json"),
    ("saku.workspace.importHistory", "import-history.json"),
    ("saku.workspace.active", "active.json"),
    ("saku.workspace.draft", "draft.json"),
];
const MAX_STATE_BYTES: usize = 64 * 1024 * 1024;

#[derive(Default)]
struct WorkspaceLock(std::sync::Mutex<Option<(PathBuf, fs::File)>>);

fn metadata_dir(workspace: &Path) -> PathBuf {
    workspace.join(".saku-builder")
}

#[cfg(windows)]
fn open_exclusive(path: &Path) -> std::io::Result<fs::File> {
    use std::os::windows::fs::OpenOptionsExt;
    // share_mode(0): no other handle, in this process or another, may open the
    // file while this one is open.
    fs::OpenOptions::new().read(true).write(true).create(true).share_mode(0).open(path)
}
#[cfg(not(windows))]
fn open_exclusive(path: &Path) -> std::io::Result<fs::File> {
    fs::OpenOptions::new().read(true).write(true).create(true).open(path)
}

impl WorkspaceLock {
    fn slot(&self) -> std::sync::MutexGuard<'_, Option<(PathBuf, fs::File)>> {
        match self.0.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        }
    }
    /// Hold `workspace` for this process. True when it is held, already or now.
    fn acquire(&self, workspace: &Path) -> bool {
        let mut slot = self.slot();
        if slot.as_ref().map(|(held, _)| held == workspace).unwrap_or(false) {
            return true;
        }
        let dir = metadata_dir(workspace);
        if fs::create_dir_all(&dir).is_err() {
            return false;
        }
        match open_exclusive(&dir.join("lock")) {
            Ok(mut file) => {
                use std::io::Write;
                let _ = file.set_len(0);
                let _ = write!(file, "{}", std::process::id());
                *slot = Some((workspace.to_path_buf(), file));
                true
            }
            Err(_) => false,
        }
    }
    fn holds(&self, workspace: &Path) -> bool {
        self.slot().as_ref().map(|(held, _)| held == workspace).unwrap_or(false)
    }
    fn release(&self) {
        *self.slot() = None;
    }
}

fn holds_lock(app: &AppHandle, workspace: &Path) -> bool {
    app.state::<WorkspaceLock>().holds(workspace)
}

/// The configured workspace, provided this window holds it — and, when the page
/// names the workspace it means, that it is the configured one.
fn require_workspace_lock(app: &AppHandle, expected: Option<&str>) -> Result<PathBuf, String> {
    let workspace = read_config(app)?
        .workspace
        .ok_or_else(|| "WORKSPACE_NOT_CONFIGURED".to_string())?;
    if let Some(expected) = expected {
        if expected != path_string(&workspace) {
            return Err(format!(
                "WORKSPACE_MISMATCH: the page wrote for {expected}, the open workspace is {}",
                path_string(&workspace)
            ));
        }
    }
    if !holds_lock(app, &workspace) {
        return Err(READ_ONLY.to_string());
    }
    Ok(workspace)
}

/// Write to a temporary file beside the target, then rename over it: a crash
/// leaves the old file or the new one, never half of one.
fn write_atomically(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("WORKSPACE_WRITE_FAILED: {} has no parent", path_string(path)))?;
    fs::create_dir_all(parent).map_err(|error| format!("WORKSPACE_WRITE_FAILED: {error}"))?;
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    let temporary = parent.join(format!(".{name}.tmp"));
    fs::write(&temporary, bytes).map_err(|error| format!("WORKSPACE_WRITE_FAILED: {error}"))?;
    fs::rename(&temporary, path).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("WORKSPACE_WRITE_FAILED: {error}")
    })
}

fn read_state_files(workspace: &Path) -> Result<serde_json::Map<String, Value>, String> {
    let dir = metadata_dir(workspace).join(STATE_DIR);
    let mut keys = serde_json::Map::new();
    for (key, file) in STATE_FILES {
        let path = dir.join(file);
        let value = match fs::read_to_string(&path) {
            Ok(text) => Value::String(text),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Value::Null,
            Err(error) => {
                return Err(format!(
                    "WORKSPACE_STATE_READ_FAILED: {}: {error}",
                    path_string(&path)
                ))
            }
        };
        keys.insert(key.to_string(), value);
    }
    Ok(keys)
}

/// Every value is checked before any file is touched, so a refused write
/// changes nothing.
fn write_state_files(workspace: &Path, keys: &HashMap<String, Option<String>>) -> Result<(), String> {
    for (key, value) in keys {
        if !STATE_FILES.iter().any(|(known, _)| known == key) {
            return Err(format!("WORKSPACE_STATE_KEY_UNKNOWN: {key}"));
        }
        if let Some(text) = value {
            if text.len() > MAX_STATE_BYTES {
                return Err(format!("WORKSPACE_STATE_TOO_LARGE: {key}"));
            }
            serde_json::from_str::<Value>(text)
                .map_err(|error| format!("WORKSPACE_STATE_NOT_JSON: {key}: {error}"))?;
        }
    }
    let dir = metadata_dir(workspace).join(STATE_DIR);
    for (key, file) in STATE_FILES {
        let Some(value) = keys.get(key) else { continue };
        let path = dir.join(file);
        match value {
            Some(text) => write_atomically(&path, text.as_bytes())?,
            None => match fs::remove_file(&path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(format!("WORKSPACE_WRITE_FAILED: {error}")),
            },
        }
    }
    Ok(())
}

/// A copy of the working state as it was, kept under `migration/` (D2). A new
/// file every time; an existing copy is never overwritten.
fn write_migration_copy(workspace: &Path, content: &str) -> Result<String, String> {
    if content.len() > MAX_STATE_BYTES {
        return Err("WORKSPACE_STATE_TOO_LARGE: migration copy".to_string());
    }
    serde_json::from_str::<Value>(content)
        .map_err(|error| format!("WORKSPACE_STATE_NOT_JSON: migration copy: {error}"))?;
    let dir = metadata_dir(workspace).join("migration");
    fs::create_dir_all(&dir).map_err(|error| format!("WORKSPACE_WRITE_FAILED: {error}"))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    for attempt in 0..1000 {
        let path = dir.join(format!("state-{stamp}-{attempt}.json"));
        match fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                use std::io::Write;
                file.write_all(content.as_bytes())
                    .map_err(|error| format!("WORKSPACE_WRITE_FAILED: {error}"))?;
                return Ok(path_string(&path));
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("WORKSPACE_WRITE_FAILED: {error}")),
        }
    }
    Err("WORKSPACE_WRITE_FAILED: no free name for the migration copy".to_string())
}

#[derive(Debug, Serialize)]
struct WorkspaceStateRead {
    status: &'static str,
    workspace: Option<String>,
    writable: bool,
    keys: serde_json::Map<String, Value>,
}

#[tauri::command]
fn read_workspace_state(app: AppHandle) -> Result<WorkspaceStateRead, String> {
    let Some(workspace) = read_config(&app)?.workspace else {
        return Ok(WorkspaceStateRead { status: "NO_WORKSPACE", workspace: None, writable: false, keys: serde_json::Map::new() });
    };
    Ok(WorkspaceStateRead {
        status: "OK",
        workspace: Some(path_string(&workspace)),
        writable: holds_lock(&app, &workspace),
        keys: read_state_files(&workspace)?,
    })
}

#[tauri::command]
fn write_workspace_state(app: AppHandle, workspace: String, keys: HashMap<String, Option<String>>) -> Result<(), String> {
    let root = require_workspace_lock(&app, Some(&workspace))?;
    write_state_files(&root, &keys)
}

#[tauri::command]
fn write_workspace_migration_backup(app: AppHandle, workspace: String, content: String) -> Result<String, String> {
    let root = require_workspace_lock(&app, Some(&workspace))?;
    write_migration_copy(&root, &content)
}

fn main() {
    tauri::Builder::default()
        .manage(WorkspaceLock::default())
        .invoke_handler(tauri::generate_handler![
            get_runtime_state,
            get_startup_route,
            choose_workspace,
            pick_workspace_folder,
            open_workspace,
            read_workspace_state,
            write_workspace_state,
            write_workspace_migration_backup,
            choose_and_import_package,
            import_package_path,
            save_builder_file,
            list_workspace_characters,
            save_workspace_character
        ])
        .run(tauri::generate_context!())
        .expect("SAKU Builder desktop host failed");
}

#[cfg(test)]
mod tests {
    use super::{
        collect_authored, collect_imports, crc32, metadata_dir, path_string, read_state_files,
        safe_path_segment, sha256_hex, startup_route_from_args, valid_export_filename,
        write_character_files, write_export_file, write_migration_copy, write_state_files,
        WorkspaceLock, STATE_DIR,
    };
    use std::collections::HashMap;
    use flate2::{Compression, write::DeflateEncoder};
    use std::fs;
    use std::io::Write;
    use std::path::{Path, PathBuf};

    #[test]
    fn sha256_is_lowercase_hex_of_exact_bytes() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn export_filename_is_a_single_safe_component() {
        assert!(valid_export_filename("character.yaml"));
        assert!(!valid_export_filename("../character.yaml"));
        assert!(!valid_export_filename("folder/character.yaml"));
        assert!(!valid_export_filename(""));
    }

    #[test]
    fn export_write_reports_exact_path_filename_and_nonempty_bytes() {
        let path =
            std::env::temp_dir().join(format!("saku-builder-export-{}.yaml", std::process::id()));
        let result = write_export_file(&path, "character.yaml", "meta:\n  name: beta1\n");
        assert_eq!(result.status, "SAVED");
        let expected_path = path_string(&path);
        assert_eq!(result.path.as_deref(), Some(expected_path.as_str()));
        assert_eq!(result.filename, "character.yaml");
        assert!(result.bytes > 0);
        assert!(fs::read_to_string(&path).unwrap().contains("beta1"));
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn export_write_error_never_reports_success() {
        let path = std::env::temp_dir()
            .join("saku-builder-missing-parent")
            .join("character.yaml");
        let result = write_export_file(&path, "character.yaml", "content");
        assert_eq!(result.status, "ERROR");
        assert!(result.path.is_none());
        assert!(
            result
                .reason
                .as_deref()
                .unwrap_or("")
                .starts_with("FILE_WRITE_FAILED:")
        );
    }

    #[test]
    fn startup_route_requires_exact_getting_started_argument() {
        assert_eq!(
            startup_route_from_args(["saku-builder".to_string(), "--getting-started".to_string()]),
            "GETTING_STARTED"
        );
        assert_eq!(
            startup_route_from_args(["saku-builder".to_string(), "--help".to_string()]),
            "DEFAULT"
        );
    }

    fn push_u16(output: &mut Vec<u8>, value: u16) {
        output.extend_from_slice(&value.to_le_bytes());
    }

    fn push_u32(output: &mut Vec<u8>, value: u32) {
        output.extend_from_slice(&value.to_le_bytes());
    }

    fn test_zip(entries: &[(&str, Vec<u8>)]) -> Vec<u8> {
        let mut output = Vec::new();
        let mut central_entries = Vec::new();
        for (name, content) in entries {
            let offset = u32::try_from(output.len()).unwrap();
            let mut encoder = DeflateEncoder::new(Vec::new(), Compression::default());
            encoder.write_all(content).unwrap();
            let compressed = encoder.finish().unwrap();
            let crc = crc32(content);
            push_u32(&mut output, 0x0403_4b50);
            push_u16(&mut output, 20);
            push_u16(&mut output, 0x0800);
            push_u16(&mut output, 8);
            push_u16(&mut output, 0);
            push_u16(&mut output, 0);
            push_u32(&mut output, crc);
            push_u32(&mut output, u32::try_from(compressed.len()).unwrap());
            push_u32(&mut output, u32::try_from(content.len()).unwrap());
            push_u16(&mut output, u16::try_from(name.len()).unwrap());
            push_u16(&mut output, 0);
            output.extend_from_slice(name.as_bytes());
            output.extend_from_slice(&compressed);
            central_entries.push((*name, content.len(), compressed.len(), crc, offset));
        }
        let central_offset = u32::try_from(output.len()).unwrap();
        for (name, uncompressed_len, compressed_len, crc, offset) in &central_entries {
            push_u32(&mut output, 0x0201_4b50);
            push_u16(&mut output, 20);
            push_u16(&mut output, 20);
            push_u16(&mut output, 0x0800);
            push_u16(&mut output, 8);
            push_u16(&mut output, 0);
            push_u16(&mut output, 0);
            push_u32(&mut output, *crc);
            push_u32(&mut output, u32::try_from(*compressed_len).unwrap());
            push_u32(&mut output, u32::try_from(*uncompressed_len).unwrap());
            push_u16(&mut output, u16::try_from(name.len()).unwrap());
            push_u16(&mut output, 0);
            push_u16(&mut output, 0);
            push_u16(&mut output, 0);
            push_u16(&mut output, 0);
            push_u32(&mut output, 0);
            push_u32(&mut output, *offset);
            output.extend_from_slice(name.as_bytes());
        }
        let central_size = u32::try_from(output.len()).unwrap() - central_offset;
        push_u32(&mut output, 0x0605_4b50);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u16(&mut output, u16::try_from(entries.len()).unwrap());
        push_u16(&mut output, u16::try_from(entries.len()).unwrap());
        push_u32(&mut output, central_size);
        push_u32(&mut output, central_offset);
        push_u16(&mut output, 0);
        output
    }

    // ── SAKU-COMPAT-01 ───────────────────────────────────────────────────
    // Package integrity and schema compatibility are separate questions. These
    // exercise the second one at the point where the host answers it.

    #[test]
    fn save_reports_the_real_path_and_size_after_writing() {
        let dir = std::env::temp_dir().join(format!("saku-save-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let target = dir.join("character.json");
        let content = "{\"identity\":{\"character_id\":\"round-trip\"}}";
        let result = write_export_file(&target, "character.json", content);
        assert_eq!(result.status, "SAVED");
        assert_eq!(result.bytes, content.as_bytes().len());
        // The reported path must be the file the user can actually open.
        let reported = result.path.expect("saved path");
        assert!(std::path::Path::new(&reported).is_file());
        // Re-reading the reported path must return exactly what was exported.
        assert_eq!(std::fs::read_to_string(&reported).expect("reopen"), content);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn save_failure_never_reports_success() {
        // A directory that does not exist cannot receive the file.
        let missing = std::env::temp_dir()
            .join("saku-missing-parent")
            .join("nested-absent")
            .join("character.json");
        let result = write_export_file(&missing, "character.json", "{}");
        assert_eq!(result.status, "ERROR");
        assert!(result.path.is_none());
        assert_eq!(result.bytes, 0);
        assert!(result.reason.is_some());
    }

    #[test]
    fn export_filename_rejects_paths_and_traversal() {
        assert!(valid_export_filename("character.yaml"));
        assert!(!valid_export_filename(""));
        assert!(!valid_export_filename("../character.yaml"));
        assert!(!valid_export_filename("nested/character.yaml"));
    }
    // ── Durable Character store ─────────────────────────────────────────────

    #[test]
    fn safe_path_segment_keeps_the_workspace_flat() {
        assert_eq!(safe_path_segment("hoshino-luka"), "hoshino-luka");
        // A Character id is Owner text. It must never escape the store.
        assert_eq!(safe_path_segment("../../etc/passwd"), "etc_passwd");
        assert_eq!(safe_path_segment(r"C:\Windows"), "C__Windows");
        assert_eq!(safe_path_segment(""), "unnamed");
        assert_eq!(safe_path_segment("///"), "unnamed");
        assert!(!safe_path_segment("a/b").contains('/'));
    }

    #[test]
    fn durable_store_reads_back_imports_and_authored_characters() {
        let root = std::env::temp_dir().join(format!("saku-durable-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let import_dir = root.join("imports").join("pkg-1.0.0-abcdef123456");
        std::fs::create_dir_all(&import_dir).expect("import dir");
        std::fs::write(
            import_dir.join("payload.json"),
            br#"{"characters":[{"identity":{"character_id":"imported"}}]}"#,
        )
        .expect("payload");
        std::fs::write(
            import_dir.join("wit-package.json"),
            br#"{"package_type":"WIT_PACKAGE","product":"SAKU Builder","package_version":"1.0.0","schema_id":"SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE","schema_version":"final-delta-recovery-closure-2026-09-04","minimum_app_version":"0.1.0-beta.1","content_type":"CHARACTER","distribution_channel":"OWNER_TEST","license_state":"NOT_SPECIFIED","payload_hash":"00"}"#,
        )
        .expect("manifest");
        let authored_dir = root.join("characters").join("authored-one");
        std::fs::create_dir_all(&authored_dir).expect("authored dir");
        std::fs::write(
            authored_dir.join("character.json"),
            br#"{"identity":{"character_id":"authored-one"}}"#,
        )
        .expect("authored");

        let mut artifacts = Vec::new();
        let mut unreadable = Vec::new();
        collect_imports(&root, &mut artifacts, &mut unreadable);
        collect_authored(&root, &mut artifacts, &mut unreadable);

        assert_eq!(artifacts.len(), 2, "both durable origins are read back");
        assert!(unreadable.is_empty(), "nothing unreadable: {unreadable:?}");
        let import = artifacts
            .iter()
            .find(|item| item.origin == "IMPORT")
            .expect("import artifact");
        assert_eq!(
            import.schema_id,
            "SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE"
        );
        assert!(import.payload_json.contains("imported"));
        let authored = artifacts
            .iter()
            .find(|item| item.origin == "AUTHORED")
            .expect("authored artifact");
        assert!(authored.payload_json.contains("authored-one"));

        let _ = std::fs::remove_dir_all(&root);
    }

    fn scratch(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("saku-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("scratch dir");
        root
    }

    #[cfg(windows)]
    #[test]
    fn workspace_lock_is_exclusive() {
        let root = scratch("lock");
        let first = WorkspaceLock::default();
        let second = WorkspaceLock::default();
        assert!(first.acquire(&root), "the first window takes the lock");
        assert!(first.acquire(&root), "taking it again is a no-op, not a refusal");
        assert!(!second.acquire(&root), "a second holder is refused while the first holds it");
        assert!(first.holds(&root) && !second.holds(&root));
        first.release();
        assert!(second.acquire(&root), "released, it can be taken");
        second.release();
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn workspace_state_round_trips_and_deletes() {
        let root = scratch("state");
        let mut keys = HashMap::new();
        keys.insert("saku.workspace.library".to_string(), Some(r#"{"version":1,"entries":[]}"#.to_string()));
        keys.insert("saku.workspace.active".to_string(), Some(r#"{"character":{}}"#.to_string()));
        write_state_files(&root, &keys).expect("write");
        let read = read_state_files(&root).expect("read");
        assert_eq!(read["saku.workspace.library"], Value::String(r#"{"version":1,"entries":[]}"#.to_string()));
        assert_eq!(read["saku.workspace.importHistory"], Value::Null, "an absent key reads as null");
        let mut drop = HashMap::new();
        drop.insert("saku.workspace.active".to_string(), None);
        write_state_files(&root, &drop).expect("delete");
        assert_eq!(read_state_files(&root).expect("read")["saku.workspace.active"], Value::Null, "null deletes the file");
        let leftovers: Vec<_> = std::fs::read_dir(metadata_dir(&root).join(STATE_DIR)).expect("dir").flatten().filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp")).collect();
        assert!(leftovers.is_empty(), "no temporary file is left behind");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn workspace_state_refuses_before_touching_anything() {
        let root = scratch("state-refuse");
        let mut good = HashMap::new();
        good.insert("saku.workspace.library".to_string(), Some(r#"{"entries":[1]}"#.to_string()));
        write_state_files(&root, &good).expect("write");
        let mut bad = HashMap::new();
        bad.insert("saku.workspace.library".to_string(), Some(r#"{"entries":[]}"#.to_string()));
        bad.insert("saku.workspace.draft".to_string(), Some("not json".to_string()));
        assert!(write_state_files(&root, &bad).unwrap_err().starts_with("WORKSPACE_STATE_NOT_JSON"));
        assert_eq!(read_state_files(&root).expect("read")["saku.workspace.library"], Value::String(r#"{"entries":[1]}"#.to_string()), "a refused write changed nothing");
        let mut unknown = HashMap::new();
        unknown.insert("saku.trainer.anything".to_string(), Some("{}".to_string()));
        assert!(write_state_files(&root, &unknown).unwrap_err().starts_with("WORKSPACE_STATE_KEY_UNKNOWN"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn workspace_state_migration_copy_never_overwrites() {
        let root = scratch("migration");
        let a = write_migration_copy(&root, r#"{"keys":{"n":1}}"#).expect("first");
        let b = write_migration_copy(&root, r#"{"keys":{"n":2}}"#).expect("second");
        assert_ne!(a, b, "each copy is its own file");
        assert!(std::fs::read_to_string(&a).expect("a").contains("\"n\":1"));
        assert!(write_migration_copy(&root, "not json").is_err());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn workspace_state_keeps_every_revision() {
        let root = scratch("revisions");
        write_character_files(&root, "one", r#"{"identity":{"character_id":"one","character_revision":"1.0.0"}}"#).expect("1.0.0");
        write_character_files(&root, "one", r#"{"identity":{"character_id":"one","character_revision":"1.1.0"}}"#).expect("1.1.0");
        let revisions = root.join("characters").join("one").join("revisions");
        assert!(revisions.join("1_0_0.json").exists() && revisions.join("1_1_0.json").exists(), "both revisions are kept");
        assert!(std::fs::read_to_string(root.join("characters").join("one").join("character.json")).expect("latest").contains("1.1.0"), "character.json is the latest");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn durable_store_is_empty_without_a_workspace_tree() {
        let root =
            std::env::temp_dir().join(format!("saku-durable-missing-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let mut artifacts = Vec::new();
        let mut unreadable = Vec::new();
        collect_imports(&root, &mut artifacts, &mut unreadable);
        collect_authored(&root, &mut artifacts, &mut unreadable);
        assert!(
            artifacts.is_empty(),
            "a missing workspace yields nothing, not an error"
        );
        assert!(unreadable.is_empty());
    }

    // ── SAKU Character Pack intake ─────────────────────────────────────────
    //
    // A synthetic pack with every digest computed the way the publisher does
    // (SHA256SUMS, archive digest, files[].digest, catalog membership, signed
    // manifest digest over canonical JSON).  Only the Ed25519 signature bytes
    // are placeholders, which is exactly what the host does not verify.
    use super::character_pack::{canonical_json, signed_manifest_digest};
    use super::{ParsedPackage, parse_package};
    use serde_json::{Value, json};

    fn character_json_with_schema(slug: &str, name: &str, schema_id: &str, schema_version: &str) -> String {
        json!({
            "schema": { "schema_id": schema_id, "schema_version": schema_version },
            "identity": { "character_id": slug, "character_revision": "1.0.0", "display_name": name },
            "purpose": { "summary": format!("{name} summary") }
        })
        .to_string()
    }

    fn signed(mut manifest: Value, key_id: &str) -> Value {
        manifest["package"] = json!({ "algorithm": "Ed25519", "publisherKeyId": key_id });
        let digest = signed_manifest_digest(&manifest).unwrap();
        manifest["package"]["digest"] = Value::String(digest);
        manifest["package"]["signature"] = Value::String("c2lnbmF0dXJlLXBsYWNlaG9sZGVy".to_string());
        manifest
    }

    struct SyntheticPack {
        bytes: Vec<u8>,
        slugs: Vec<&'static str>,
    }

    fn synthetic_pack(slugs: &[&'static str], prefix: &str, tamper: Option<&str>) -> SyntheticPack {
        synthetic_pack_full(slugs, prefix, tamper, "SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE", "final-delta-recovery-closure-2026-09-04")
    }

    fn synthetic_pack_with_schema(slugs: &[&'static str], prefix: &str, schema_id: &str, schema_version: &str) -> SyntheticPack {
        synthetic_pack_full(slugs, prefix, None, schema_id, schema_version)
    }

    fn synthetic_pack_full(slugs: &[&'static str], prefix: &str, tamper: Option<&str>, schema_id: &str, schema_version: &str) -> SyntheticPack {
        let mut inner_archives: Vec<(String, Vec<u8>, Value, String)> = Vec::new();
        let mut membership = Vec::new();
        for slug in slugs {
            let character = character_json_with_schema(slug, &format!("名前 {slug}"), schema_id, schema_version);
            let character_digest = sha256_hex(character.as_bytes());
            let manifest = signed(
                json!({
                    "format": "kokorosaku-portable-package", "schemaVersion": "3.0.0", "profile": "saku-unified-v1",
                    "source": { "provider": "kokorosaku", "characterId": format!("id-{slug}"), "sourceSlug": slug, "sourceVersion": "1.0.0",
                        "schema": { "schemaId": schema_id, "schemaVersion": schema_version },
                        "characterDigest": { "domain": "CHARACTER_FULL_SEMANTICS", "profile": "saku.sha256-rfc8785-ijson@1.0.0", "value": character_digest } },
                    "summary": { "displayName": format!("名前 {slug}"), "seat8": "human" },
                    "files": [{ "path": "character.json", "size": character.len(), "digest": format!("sha-256:{}", sha256_hex(character.as_bytes())) }]
                }),
                "saku-character-publisher-ed25519.v1",
            );
            let mut character_bytes = character.clone().into_bytes();
            if tamper == Some("character") && *slug == slugs[0] {
                character_bytes = character.replace("summary", "sumary").into_bytes();
            }
            let manifest_text = if tamper == Some("manifest") && *slug == slugs[0] {
                let mut tampered = manifest.clone();
                tampered["summary"]["displayName"] = Value::String("別名".to_string());
                tampered.to_string()
            } else {
                manifest.to_string()
            };
            let mut members: Vec<(&str, Vec<u8>)> = vec![("portable-manifest.json", manifest_text.into_bytes()), ("character.json", character_bytes)];
            if tamper == Some("nested") && *slug == slugs[0] {
                members.push(("extra.zip", test_zip(&[("x.txt", b"x".to_vec())])));
            }
            let archive = test_zip(&members);
            membership.push(json!({ "character_id": slug, "character_revision": "1.0.0", "character_digest": character_digest }));
            inner_archives.push((format!("{slug}.kokorosaku.zip"), archive, manifest, character_digest));
        }
        let catalog_release = json!({ "catalog_schema_id": "saku.catalog-release", "catalog_schema_version": "1.0.0", "catalog_id": "saku-character-catalog",
            "release_version": "1.0.0-test", "immutable_published_revision": true, "membership": membership })
        .to_string();
        let catalog_digest = sha256_hex(catalog_release.as_bytes());
        let entries: Vec<Value> = inner_archives
            .iter()
            .map(|(file, archive, manifest, character_digest)| {
                json!({ "slug": manifest["source"]["sourceSlug"], "characterId": manifest["source"]["characterId"], "displayName": manifest["summary"]["displayName"],
                    "sourceVersion": "1.0.0", "file": file, "archiveDigest": format!("sha-256:{}", sha256_hex(archive)),
                    "packageDigest": manifest["package"]["digest"], "seat8": "human", "profile": "saku-unified-v1",
                    "characterDigest": character_digest, "operationClass": if file.starts_with("c") { "C" } else { "A" } })
            })
            .collect();
        let pack_json = signed(
            json!({ "format": "kokorosaku-character-pack", "schemaVersion": "1.0.0",
                "pack": { "id": "saku-pack-test", "version": "1.0.0", "createdAt": "2026-09-20T00:00:00.000Z", "characterCount": slugs.len() },
                "entries": entries,
                "catalogRelease": { "file": "catalog-release.v1.json", "digest": format!("sha-256:{catalog_digest}"), "catalogId": "saku-character-catalog", "releaseVersion": "1.0.0-test" } }),
            "saku-pack-publisher-ed25519.v1",
        )
        .to_string();
        let license = b"LICENSE v1.0 (test)".to_vec();
        let readme = b"README (test)".to_vec();
        let mut files: Vec<(String, Vec<u8>)> = vec![
            ("LICENSE.md".to_string(), license),
            ("README.md".to_string(), readme),
            ("catalog-release.v1.json".to_string(), catalog_release.into_bytes()),
            ("character-pack.json".to_string(), pack_json.into_bytes()),
        ];
        for (file, archive, _, _) in &inner_archives {
            files.push((file.clone(), archive.clone()));
        }
        if tamper == Some("stowaway") {
            files.push(("stowaway.kokorosaku.zip".to_string(), test_zip(&[("x.txt", b"x".to_vec())])));
        }
        let mut sums = String::new();
        for (name, bytes) in &files {
            if tamper == Some("stowaway") && name == "stowaway.kokorosaku.zip" {
                continue;
            }
            let mut digest = sha256_hex(bytes);
            if tamper == Some("sums") && name == "README.md" {
                digest = digest.chars().rev().collect();
            }
            sums.push_str(&format!("{digest}  {name}\n"));
        }
        files.push(("SHA256SUMS".to_string(), sums.into_bytes()));
        let named: Vec<(String, Vec<u8>)> = files.into_iter().map(|(name, bytes)| (format!("{prefix}{name}"), bytes)).collect();
        let borrowed: Vec<(&str, Vec<u8>)> = named.iter().map(|(name, bytes)| (name.as_str(), bytes.clone())).collect();
        SyntheticPack { bytes: test_zip(&borrowed), slugs: slugs.to_vec() }
    }

    fn parse_pack(bytes: &[u8]) -> Result<super::character_pack::CharacterPackImport, super::PackageValidationFailure> {
        match parse_package(Path::new("saku-pack-test-1.0.0-beta.zip"), bytes)? {
            ParsedPackage::CharacterPack(pack) => Ok(pack),
            ParsedPackage::SakuReturn(_) => panic!("a pack must not parse as a saku-return"),
        }
    }

    #[test]
    fn character_pack_in_one_folder_is_read_and_every_binding_is_checked() {
        let pack = synthetic_pack(&["aoi-one", "beni-two", "cho-three"], "saku-pack-test-1.0.0/", None);
        let parsed = parse_pack(&pack.bytes).expect("pack parses");
        assert_eq!(parsed.pack_id, "saku-pack-test");
        assert_eq!(parsed.character_count, 3);
        assert_eq!(parsed.entries.iter().map(|entry| entry.slug.as_str()).collect::<Vec<_>>(), pack.slugs);
        assert_eq!(parsed.entries[2].operation_class, "C", "class C is imported and labelled, not dropped");
        assert!(parsed.entries.iter().all(|entry| entry.manifest_digest_recomputed));
        assert!(parsed.pack_manifest_digest_recomputed);
        assert_eq!(parsed.signature_state, "NOT_VERIFIED_BY_HOST", "the host never claims a signature it did not verify");
        assert_eq!(parsed.sha256sums_verified, 7);
        assert_eq!(parsed.schema_id, "SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE");
        assert!(parsed.entries[0].character_json.contains("\"character_id\":\"aoi-one\""));
        // the same pack without a folder prefix is equally acceptable
        let flat = synthetic_pack(&["aoi-one"], "", None);
        assert_eq!(parse_pack(&flat.bytes).unwrap().character_count, 1);
    }

    #[test]
    fn character_pack_digest_mismatches_are_refused_as_a_whole() {
        for (tamper, expected_code) in [
            ("sums", "CHARACTER_PACK_DIGEST_MISMATCH"),
            ("character", "CHARACTER_PACK_DIGEST_MISMATCH"),
            ("manifest", "CHARACTER_PACK_DIGEST_MISMATCH"),
            ("stowaway", "CHARACTER_PACK_INVALID"),
            ("nested", "CHARACTER_PACK_INVALID"),
        ] {
            let pack = synthetic_pack(&["aoi-one", "beni-two"], "saku-pack-test-1.0.0/", Some(tamper));
            let failure = parse_pack(&pack.bytes).expect_err(tamper);
            assert_eq!(failure.status, "INVALID", "{tamper}");
            assert_eq!(failure.code, expected_code, "{tamper}: {}", failure.reason);
        }
    }

    #[test]
    fn character_pack_catalog_membership_is_required() {
        let pack = synthetic_pack(&["aoi-one"], "saku-pack-test-1.0.0/", None);
        // Rewrite the catalog release with a different digest for the member and re-sign nothing:
        // SHA256SUMS then fails first — so rebuild SHA256SUMS honestly to reach the catalog check.
        let entries = super::archive_entries_with(&pack.bytes, &super::ArchiveShape { max_entries: 512, max_total_bytes: 64 << 20, allow_directory_prefix: true, peek_only: false }).unwrap();
        let mut catalog: Value = serde_json::from_slice(&entries["catalog-release.v1.json"]).unwrap();
        catalog["membership"][0]["character_digest"] = Value::String("0".repeat(64));
        let catalog_text = catalog.to_string();
        let mut pack_json: Value = serde_json::from_slice(&entries["character-pack.json"]).unwrap();
        pack_json["catalogRelease"]["digest"] = Value::String(format!("sha-256:{}", sha256_hex(catalog_text.as_bytes())));
        // keep the pack manifest digest honest for the changed catalogRelease block
        let mut unsigned = pack_json.clone();
        unsigned["package"].as_object_mut().unwrap().remove("digest");
        unsigned["package"].as_object_mut().unwrap().remove("signature");
        pack_json["package"]["digest"] = Value::String(format!("sha-256:{}", sha256_hex(canonical_json(&unsigned).as_bytes())));
        let pack_text = pack_json.to_string();
        let mut files: Vec<(String, Vec<u8>)> = entries
            .iter()
            .filter(|(name, _)| *name != "SHA256SUMS" && *name != "catalog-release.v1.json" && *name != "character-pack.json")
            .map(|(name, bytes)| (name.clone(), bytes.clone()))
            .collect();
        files.push(("catalog-release.v1.json".to_string(), catalog_text.into_bytes()));
        files.push(("character-pack.json".to_string(), pack_text.into_bytes()));
        files.sort();
        let sums: String = files.iter().map(|(name, bytes)| format!("{}  {name}\n", sha256_hex(bytes))).collect();
        files.push(("SHA256SUMS".to_string(), sums.into_bytes()));
        let borrowed: Vec<(&str, Vec<u8>)> = files.iter().map(|(name, bytes)| (name.as_str(), bytes.clone())).collect();
        let failure = parse_pack(&test_zip(&borrowed)).expect_err("catalog mismatch");
        assert_eq!(failure.code, "CHARACTER_PACK_CATALOG_MISMATCH", "{}", failure.reason);
    }

    #[test]
    fn archive_shape_limits_hold_for_packs_and_builder_packages() {
        // 513 root files: over the pack ceiling → refused before any parsing.
        let many: Vec<(String, Vec<u8>)> = (0..513).map(|index| (format!("f{index}.txt"), b"x".to_vec())).collect();
        let borrowed: Vec<(&str, Vec<u8>)> = many.iter().map(|(name, bytes)| (name.as_str(), bytes.clone())).collect();
        let failure = parse_package(Path::new("many.zip"), &test_zip(&borrowed)).unwrap_err();
        assert_eq!(failure.code, "PACKAGE_ARCHIVE_INVALID");
        assert!(failure.reason.contains("513"), "{}", failure.reason);
        // two folders deep is never accepted
        let deep = test_zip(&[("a/b/character-pack.json", b"{}".to_vec())]);
        assert_eq!(parse_package(Path::new("deep.zip"), &deep).unwrap_err().code, "PACKAGE_ARCHIVE_INVALID");
        // two different folders are never accepted
        let two = test_zip(&[("a/character-pack.json", b"{}".to_vec()), ("b/x.txt", b"x".to_vec())]);
        assert_eq!(parse_package(Path::new("two.zip"), &two).unwrap_err().code, "PACKAGE_ARCHIVE_INVALID");
        // the retired two-file Builder package is refused with the retirement notice
        let retired = test_zip(&[("wit-package.json", br#"{"package_type":"WIT_PACKAGE","product":"x"}"#.to_vec()), ("payload.json", b"{}".to_vec())]);
        let failure = parse_package(Path::new("old.witpkg"), &retired).unwrap_err();
        assert_eq!(failure.code, "PACKAGE_FORMAT_UNRECOGNIZED");
        assert!(failure.reason.contains("廃止"), "{}", failure.reason);
        assert!(failure.reason.contains("個別インポート"), "{}", failure.reason);
        // an unknown ZIP names the accepted formats in Japanese, not just a code
        let unknown = test_zip(&[("notes.txt", b"hello".to_vec())]);
        let failure = parse_package(Path::new("unknown.zip"), &unknown).unwrap_err();
        assert_eq!(failure.code, "PACKAGE_FORMAT_UNRECOGNIZED");
        assert!(failure.reason.contains("受け付ける形式"), "{}", failure.reason);
        assert!(failure.reason.contains("character-pack.json"));
    }

    #[test]
    fn amu_character_file_is_recognised_and_pointed_back_to_amu_studio() {
        // The .amupkg marks itself in wit-package.json (KOKOROAMU-STUDIO constants, exact strings).
        let amu_manifest = br#"{"package_type":"WIT_PACKAGE","kind":"AMU_CHARACTER","schema":"AMU-CHARACTER/3.0.0","entries":[]}"#.to_vec();
        let amupkg = test_zip(&[("wit-package.json", amu_manifest.clone()), ("pack/saku-pack-support-1.0.0.zip", b"PK".to_vec()), ("characters/aimi/instance.json", b"{}".to_vec())]);
        for name in ["aimi-meguru.amupkg", "renamed.zip", "no-extension"] {
            let failure = parse_package(Path::new(name), &amupkg).unwrap_err();
            assert_eq!(failure.code, "PACKAGE_FORMAT_AMU_CHARACTER_FILE", "{name}");
            assert_eq!(failure.status, "UNSUPPORTED");
            assert!(failure.reason.contains("AMU Studio"), "{}", failure.reason);
            assert!(failure.reason.contains("SAKU へ戻す"), "{}", failure.reason);
        }
        // kind alone (no schema field) is enough — kind is the primary marker
        let by_kind = test_zip(&[("wit-package.json", br#"{"package_type":"WIT_PACKAGE","kind":"AMU_CHARACTER"}"#.to_vec())]);
        assert_eq!(parse_package(Path::new("x.zip"), &by_kind).unwrap_err().code, "PACKAGE_FORMAT_AMU_CHARACTER_FILE");
        // schema prefix alone (kind renamed upstream) still routes to AMU Studio
        let by_schema = test_zip(&[("wit-package.json", br#"{"package_type":"WIT_PACKAGE","kind":"SOMETHING_ELSE","schema":"AMU-CHARACTER/4.0.0"}"#.to_vec())]);
        assert_eq!(parse_package(Path::new("x.zip"), &by_schema).unwrap_err().code, "PACKAGE_FORMAT_AMU_CHARACTER_FILE");
        // package_type must match: an unrelated manifest is not an AMU file
        let other = test_zip(&[("wit-package.json", br#"{"package_type":"OTHER","kind":"AMU_CHARACTER"}"#.to_vec())]);
        assert_eq!(parse_package(Path::new("x.zip"), &other).unwrap_err().code, "PACKAGE_FORMAT_UNRECOGNIZED");
        // a non-ZIP file with the .amupkg extension is still pointed at AMU Studio
        assert_eq!(parse_package(Path::new("broken.amupkg"), b"not a zip").unwrap_err().code, "PACKAGE_FORMAT_AMU_CHARACTER_FILE");
        // a pack that happens to sit beside a wit-package.json is still a pack (marker decides)
        let pack = synthetic_pack(&["aoi-one"], "saku-pack-test-1.0.0/", None);
        assert!(parse_pack(&pack.bytes).is_ok());
        // the real file written by AMU Studio (PR #69), when the shared fixture folder is present
        let real = std::env::var("SAKU_AMU_FIXTURES").map(std::path::PathBuf::from).unwrap_or_else(|_| std::path::PathBuf::from("C:/Users/Public/SAKU-verify")).join("aimi-meguru.amupkg");
        if let Ok(bytes) = std::fs::read(&real) {
            let failure = parse_package(&real, &bytes).unwrap_err();
            assert_eq!(failure.code, "PACKAGE_FORMAT_AMU_CHARACTER_FILE", "real .amupkg");
            let failure = parse_package(Path::new("renamed.zip"), &bytes).unwrap_err();
            assert_eq!(failure.code, "PACKAGE_FORMAT_AMU_CHARACTER_FILE", "real .amupkg renamed to .zip");
        } else {
            eprintln!("real .amupkg fixture not present at {} — skipped", real.display());
        }
    }

    /// Build a saku-return the way AMU's writeSakuReturn does, from one archive of a synthetic pack.
    fn synthetic_return(pack: &SyntheticPack, slug: &str, request: Option<Value>, with_archive: bool) -> Vec<u8> {
        let entries = super::archive_entries_with(&pack.bytes, &super::ArchiveShape { max_entries: 512, max_total_bytes: 64 << 20, allow_directory_prefix: true, peek_only: false }).unwrap();
        let archive = entries.get(&format!("{slug}.kokorosaku.zip")).expect("archive").clone();
        let inner = super::archive_entries_with(&archive, &super::ArchiveShape { max_entries: 8, max_total_bytes: 8 << 20, allow_directory_prefix: false, peek_only: false }).unwrap();
        let character = inner.get("character.json").unwrap().clone();
        let manifest = inner.get("portable-manifest.json").unwrap().clone();
        let manifest_value: Value = serde_json::from_slice(&manifest).unwrap();
        let request = request.unwrap_or_else(|| json!({
            "schema": "AMU-SAKU-RETURN/1.0.0", "created_at": "2026-09-21T00:00:00.000Z",
            "character_id": slug, "character_revision": "1.0.0",
            "character_digest": manifest_value["source"]["characterDigest"]["value"],
            "from_instance": { "amu_instance_ref": "00000000-0000-4000-8000-000000000002", "instance_config_digest": "sha-256:5f31eed016ab6eb0f3c7ab795da0bf91771178642c0ca6ec330909caa2493a4b" },
            "note": "価値観の 2 番目を『静かな傾聴』に改めたい", "fields": ["values"],
            "meaning": "AMU Studio からの編集依頼。"
        }));
        let mut files: Vec<(&str, Vec<u8>)> = vec![("character.json", character), ("portable-manifest.json", manifest), ("edit-request.json", request.to_string().into_bytes())];
        let name = format!("{slug}.kokorosaku.zip");
        if with_archive { files.push((Box::leak(name.into_boxed_str()), archive)); }
        test_zip(&files)
    }

    fn parse_return(bytes: &[u8]) -> Result<super::saku_return::SakuReturnImport, super::PackageValidationFailure> {
        match parse_package(Path::new("aoi-one.saku-return.zip"), bytes)? {
            ParsedPackage::SakuReturn(ret) => Ok(ret),
            ParsedPackage::CharacterPack(_) => panic!("a return must not parse as a pack"),
        }
    }

    #[test]
    fn saku_return_is_read_and_cross_checked_without_writing() {
        let pack = synthetic_pack(&["aoi-one", "beni-two"], "saku-pack-test-1.0.0/", None);
        let ret = parse_return(&synthetic_return(&pack, "aoi-one", None, true)).expect("return parses");
        assert_eq!(ret.schema, "AMU-SAKU-RETURN/1.0.0");
        assert_eq!((ret.character_id.as_str(), ret.character_revision.as_str()), ("aoi-one", "1.0.0"));
        assert_eq!(ret.fields, vec!["values".to_string()]);
        assert!(ret.note.contains("静かな傾聴"));
        assert!(ret.from_instance.is_some());
        assert!(ret.archive_present && ret.archive_file.as_deref() == Some("aoi-one.kokorosaku.zip"));
        assert_eq!(ret.signature_state, "NOT_VERIFIED_BY_HOST");
        assert_eq!(ret.digest_state, "CHARACTER_BYTES_AND_SIGNED_MANIFEST_VERIFIED");
        assert_eq!(ret.publisher_key_id, "saku-character-publisher-ed25519.v1");
        assert_eq!(ret.character_json_sha256.len(), 64);
        // without the archive it still parses, and says so
        let bare = parse_return(&synthetic_return(&pack, "aoi-one", None, false)).unwrap();
        assert!(!bare.archive_present && bare.archive_file.is_none());
        // the ImportResult carries one Character and no imported_path
        let result = super::import_saku_return(ret, Some("x".into()));
        assert_eq!((result.status, result.code), ("IMPORTED", "SAKU_RETURN_READY"));
        assert!(result.imported_path.is_none() && result.pack.is_none() && result.saku_return.is_some());
        let payload: Value = serde_json::from_str(result.payload_json.as_deref().unwrap()).unwrap();
        assert_eq!(payload["characters"].as_array().unwrap().len(), 1);
        assert_eq!(result.manifest.as_ref().unwrap().content_type, "CHARACTER");
    }

    #[test]
    fn saku_return_mismatches_and_bad_requests_are_refused() {
        let pack = synthetic_pack(&["aoi-one", "beni-two"], "saku-pack-test-1.0.0/", None);
        let good = synthetic_return(&pack, "aoi-one", None, true);
        let base: Value = {
            let entries = super::archive_entries_with(&good, &super::ArchiveShape { max_entries: 8, max_total_bytes: 8 << 20, allow_directory_prefix: false, peek_only: false }).unwrap();
            serde_json::from_slice(entries.get("edit-request.json").unwrap()).unwrap()
        };
        let with = |mutate: &dyn Fn(&mut Value)| { let mut r = base.clone(); mutate(&mut r); synthetic_return(&pack, "aoi-one", Some(r), true) };
        // request names another Character / revision / digest
        let failure = parse_return(&with(&|r| r["character_id"] = json!("beni-two"))).unwrap_err();
        assert_eq!(failure.code, "SAKU_RETURN_MISMATCH");
        assert!(failure.reason.contains("character.json は aoi-one"), "{}", failure.reason);
        assert_eq!(parse_return(&with(&|r| r["character_revision"] = json!("1.0.1"))).unwrap_err().code, "SAKU_RETURN_MISMATCH");
        assert_eq!(parse_return(&with(&|r| r["character_digest"] = json!("0".repeat(64)))).unwrap_err().code, "SAKU_RETURN_MISMATCH");
        // unknown schema, empty note, over-long field, non-array fields, odd from_instance
        assert_eq!(parse_return(&with(&|r| r["schema"] = json!("AMU-SAKU-RETURN/2.0.0"))).unwrap_err().code, "SAKU_RETURN_SCHEMA_UNSUPPORTED");
        assert_eq!(parse_return(&with(&|r| r["note"] = json!(""))).unwrap_err().code, "SAKU_RETURN_INVALID");
        assert_eq!(parse_return(&with(&|r| r["fields"] = json!(["x".repeat(121)]))).unwrap_err().code, "SAKU_RETURN_INVALID");
        assert_eq!(parse_return(&with(&|r| r["fields"] = json!("values"))).unwrap_err().code, "SAKU_RETURN_INVALID");
        assert_eq!(parse_return(&with(&|r| r["from_instance"] = json!({ "amu_instance_ref": "x" }))).unwrap_err().code, "SAKU_RETURN_INVALID");
        // character.json bytes edited after signing → files[] digest breaks
        let entries = super::archive_entries_with(&good, &super::ArchiveShape { max_entries: 8, max_total_bytes: 8 << 20, allow_directory_prefix: false, peek_only: false }).unwrap();
        let mut list: Vec<(&str, Vec<u8>)> = Vec::new();
        for (name, bytes) in &entries {
            let bytes = if name == "character.json" { let mut c: Value = serde_json::from_slice(bytes).unwrap(); c["purpose"]["summary"] = json!("edited"); c.to_string().into_bytes() } else { bytes.clone() };
            list.push((name.as_str(), bytes));
        }
        assert_eq!(parse_return(&test_zip(&list)).unwrap_err().code, "SAKU_RETURN_MISMATCH");
        // manifest edited → signed digest breaks
        let mut list: Vec<(&str, Vec<u8>)> = Vec::new();
        for (name, bytes) in &entries {
            let bytes = if name == "portable-manifest.json" { let mut m: Value = serde_json::from_slice(bytes).unwrap(); m["summary"]["author"] = json!("someone"); m.to_string().into_bytes() } else { bytes.clone() };
            list.push((name.as_str(), bytes));
        }
        assert_eq!(parse_return(&test_zip(&list)).unwrap_err().code, "SAKU_RETURN_MISMATCH");
        // enclosed archive belongs to another Character → byte mismatch
        let pack_entries = super::archive_entries_with(&pack.bytes, &super::ArchiveShape { max_entries: 512, max_total_bytes: 64 << 20, allow_directory_prefix: true, peek_only: false }).unwrap();
        let mut list: Vec<(&str, Vec<u8>)> = entries.iter().filter(|(name, _)| !name.ends_with(".kokorosaku.zip")).map(|(name, bytes)| (name.as_str(), bytes.clone())).collect();
        list.push(("aoi-one.kokorosaku.zip", pack_entries.get("beni-two.kokorosaku.zip").unwrap().clone()));
        let failure = parse_return(&test_zip(&list)).unwrap_err();
        assert_eq!(failure.code, "SAKU_RETURN_MISMATCH");
        assert!(failure.reason.contains("内の character.json"), "{}", failure.reason);
        // a stowaway file is refused; too many entries too
        let mut list: Vec<(&str, Vec<u8>)> = entries.iter().map(|(name, bytes)| (name.as_str(), bytes.clone())).collect();
        list.push(("extra.txt", b"x".to_vec()));
        assert_eq!(parse_return(&test_zip(&list)).unwrap_err().code, "SAKU_RETURN_INVALID");
        // a return of another schema is refused by the active-schema pin
        let other = synthetic_pack_with_schema(&["aoi-one"], "saku-pack-test-1.0.0/", "SAKU-CHARACTER", "1.0");
        assert_eq!(parse_return(&synthetic_return(&other, "aoi-one", None, true)).unwrap_err().code, "SAKU_RETURN_SCHEMA_UNSUPPORTED");
        // the real file written by AMU Studio (PR #69), when present
        let real = std::env::var("SAKU_AMU_FIXTURES").map(std::path::PathBuf::from).unwrap_or_else(|_| std::path::PathBuf::from("C:/Users/Public/SAKU-verify")).join("aimi-meguru.saku-return.zip");
        if let Ok(bytes) = std::fs::read(&real) {
            let ret = match parse_package(&real, &bytes).expect("real return parses") { ParsedPackage::SakuReturn(ret) => ret, _ => panic!("not a return") };
            assert_eq!((ret.character_id.as_str(), ret.character_revision.as_str()), ("aimi-meguru", "1.0.0"));
            assert_eq!(ret.character_digest, "67442422ead69b5c78438478b528af13aacfa7e83c2d0149c746fc7f906f0537");
            assert_eq!(ret.fields, vec!["values".to_string()]);
            assert!(ret.archive_present && ret.from_instance.is_some());
        } else {
            eprintln!("real .saku-return.zip fixture not present at {} — skipped", real.display());
        }
    }

    #[test]
    fn a_pack_of_another_schema_is_refused_before_anything_is_written() {
        // A different declared schema, consistently carried by manifest and
        // character.json, is not relabelled but refused with the supported identity named.
        let pack = synthetic_pack_with_schema(&["aoi-one"], "saku-pack-test-1.0.0/", "SAKU-CHARACTER", "1.0");
        let failure = parse_pack(&pack.bytes).unwrap_err();
        assert_eq!(failure.code, "CHARACTER_PACK_SCHEMA_UNSUPPORTED");
        assert_eq!(failure.status, "UNSUPPORTED");
        assert!(failure.reason.contains("SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE"));
    }

    #[test]
    fn individual_files_on_the_package_route_are_pointed_at_individual_import() {
        for (name, bytes) in [("hero.json", br#"{"schema":{"schema_id":"x"}}"#.to_vec()), ("hero.yaml", b"identity:\n  character_id: x\n".to_vec()), ("noext", b"{}".to_vec())] {
            let failure = parse_package(Path::new(name), &bytes).unwrap_err();
            assert_eq!(failure.code, "PACKAGE_FORMAT_INDIVIDUAL_FILE", "{name}");
            assert!(failure.reason.contains("個別インポート"), "{}", failure.reason);
        }
        // an empty/binary non-ZIP file is simply unrecognised
        let failure = parse_package(Path::new("blob.bin"), b"\x00\x01\x02").unwrap_err();
        assert_eq!(failure.code, "PACKAGE_FORMAT_UNRECOGNIZED");
        // the old extension alone is answered with the retirement notice
        let failure = parse_package(Path::new("old.witpkg"), b"garbage").unwrap_err();
        assert_eq!(failure.code, "PACKAGE_FORMAT_UNRECOGNIZED");
        assert!(failure.reason.contains("廃止"));
        // .zip that is not a ZIP
        assert!(parse_package(Path::new("fake.zip"), b"nope").unwrap_err().reason.contains("ZIP のヘッダー"));
    }

    #[test]
    fn canonical_json_matches_the_producer_rules() {
        let value = json!({ "b": [1, { "z": "\u{3042}", "a": null }], "a": "quote\"and\\slash", "n": 5947, "t": true });
        assert_eq!(canonical_json(&value), "{\"a\":\"quote\\\"and\\\\slash\",\"b\":[1,{\"a\":null,\"z\":\"\u{3042}\"}],\"n\":5947,\"t\":true}");
    }

    // The sold packs, when the sibling KOKOROAMU-STUDIO clone (or SAKU_PACK_FIXTURES) is present.
    // Skipped, and said so, when they are not: the synthetic pack covers the logic either way.
    #[test]
    fn production_packs_import_when_available() {
        let root = std::env::var("SAKU_PACK_FIXTURES").map(PathBuf::from).unwrap_or_else(|_| {
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../KOKOROAMU-STUDIO/tests/adapters-character-package/fixtures")
        });
        let expected = [("saku-pack-support-1.0.0-beta.zip", 15usize), ("saku-pack-business-1.0.0-beta.zip", 19), ("saku-pack-technical-1.0.0-beta.zip", 20)];
        if !root.join(expected[0].0).is_file() {
            eprintln!("production pack fixtures not present under {}; skipped", root.display());
            return;
        }
        for (name, count) in expected {
            let bytes = fs::read(root.join(name)).expect(name);
            let parsed = parse_pack(&bytes).unwrap_or_else(|failure| panic!("{name}: {} {}", failure.code, failure.reason));
            assert_eq!(parsed.character_count, count, "{name}");
            assert!(parsed.pack_manifest_digest_recomputed && parsed.entries.iter().all(|entry| entry.manifest_digest_recomputed), "{name}: manifest digests recompute");
            assert_eq!(parsed.schema_id, "SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE");
            assert!(parsed.entries.iter().all(|entry| ["A", "B", "C"].contains(&entry.operation_class.as_str())));
        }
    }
}
