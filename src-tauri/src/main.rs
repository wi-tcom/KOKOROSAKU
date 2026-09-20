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
use character_pack::{CharacterPackImport, looks_like_character_pack, parse_character_pack};

const APP_VERSION: &str = "0.1.0-beta.2";
const CONFIG_FILE: &str = "desktop-host.json";
const MAX_PACKAGE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_BYTES: usize = 32 * 1024 * 1024;
// A Builder package (.witpkg) is two files; a sold SAKU Character Pack is a
// folder of 20-30 files with one archive per Character.  Each shape has its
// own entry ceiling and a total uncompressed budget, so a pack cannot be used
// to expand more than the package intake limit.
const MAX_WITPKG_ENTRIES: usize = 16;
const MAX_PACK_ENTRIES: usize = 512;
const MAX_ARCHIVE_TOTAL_BYTES: usize = 64 * 1024 * 1024;

pub(crate) struct ArchiveShape {
    pub max_entries: usize,
    pub max_total_bytes: usize,
    pub allow_directory_prefix: bool,
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
    code_signing: &'static str,
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

#[derive(Debug, Deserialize)]
struct PackageEnvelope {
    wit_package: PackageManifest,
    payload_encoding: String,
    payload_json: String,
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
        code_signing: "UNSIGNED",
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

#[tauri::command]
fn choose_workspace(app: AppHandle) -> Result<RuntimeState, String> {
    let selection = rfd::FileDialog::new()
        .set_title("SAKU workspaceを選択または作成")
        .pick_folder()
        .ok_or_else(|| "WORKSPACE_SELECTION_CANCELLED".to_string())?;
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
    runtime_state_inner(&app)
}

fn parse_version(version: &str) -> Option<[u64; 3]> {
    let mut values = [0_u64; 3];
    let core = version.split_once('-').map_or(version, |(value, _)| value);
    let mut parts = core.split('.');
    for value in &mut values {
        *value = parts.next()?.parse().ok()?;
    }
    if parts.next().is_some() {
        return None;
    }
    Some(values)
}

// The Character schemas this application can read. Package integrity says
// nothing about whether the Character inside is one of these, so the two
// questions are answered separately and both must pass.
//
// Unified V1 is the sole active schema. Earlier v1 and legacy-schema inputs remain readable
// sources, but this host never converts or relabels either one. Every payload is
// bound to exactly the schema its manifest declares.
const LEGACY_SCHEMA_VERSION: &str = concat!("v", "next-1.0");
const SUPPORTED_SCHEMAS: &[(&str, &str)] = &[
    (
        "SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE",
        "final-delta-recovery-closure-2026-09-04",
    ),
    ("SAKU-CHARACTER", "1.0"),
    ("saku.character", LEGACY_SCHEMA_VERSION),
];

fn schema_is_supported(schema_id: &str, schema_version: &str) -> bool {
    SUPPORTED_SCHEMAS
        .iter()
        .any(|(id, version)| *id == schema_id && *version == schema_version)
}

fn schema_id_is_known(schema_id: &str) -> bool {
    SUPPORTED_SCHEMAS.iter().any(|(id, _)| *id == schema_id)
}

/// What a Character says it is. v1 declares a bare string plus a sibling
/// version; Unified V1 declares an object. Nothing is inferred from shape.
fn declared_schema(character: &Value) -> Option<(String, String)> {
    let schema = character.get("schema")?;
    if let Some(text) = schema.as_str() {
        if text.trim().is_empty() {
            return None;
        }
        let version = character
            .get("version")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        return Some((text.trim().to_string(), version));
    }
    let id = schema.get("schema_id")?.as_str()?.trim().to_string();
    if id.is_empty() {
        return None;
    }
    let version = schema
        .get("schema_version")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    Some((id, version))
}

fn payload_characters(payload: &Value) -> Vec<&Value> {
    if let Some(list) = payload.as_array() {
        return list.iter().collect();
    }
    if let Some(list) = payload.get("characters").and_then(Value::as_array) {
        return list.iter().collect();
    }
    if payload.is_object() {
        return vec![payload];
    }
    Vec::new()
}

/// Bind the manifest's declared schema to the payload's, exactly.
fn validate_schema_binding(
    manifest: &PackageManifest,
    payload_json: &str,
) -> Result<String, PackageValidationFailure> {
    let manifest_id = manifest.schema_id.trim();
    let manifest_version = manifest.schema_version.trim();
    if manifest_id.is_empty() {
        return Err(package_failure(
            "INVALID",
            "MANIFEST_SCHEMA_ID_MISSING",
            "Package manifest does not name a Character schema identity.",
        ));
    }
    if !schema_id_is_known(manifest_id) {
        return Err(package_failure(
            "UNSUPPORTED",
            "MANIFEST_SCHEMA_ID_UNKNOWN",
            format!("Package manifest names an unknown Character schema: {manifest_id}"),
        ));
    }
    if !schema_is_supported(manifest_id, manifest_version) {
        return Err(package_failure(
            "UNSUPPORTED",
            "MANIFEST_SCHEMA_VERSION_UNSUPPORTED",
            format!("Character schema {manifest_id} {manifest_version} is not supported."),
        ));
    }
    let payload: Value = serde_json::from_str(payload_json).map_err(|error| {
        package_failure(
            "INVALID",
            "PAYLOAD_JSON_INVALID",
            format!("Payload is not valid JSON: {error}"),
        )
    })?;
    let characters = payload_characters(&payload);
    if characters.is_empty() {
        return Err(package_failure(
            "INVALID",
            "PAYLOAD_HAS_NO_CHARACTER",
            "Package payload carries no Character.",
        ));
    }
    for (index, character) in characters.iter().enumerate() {
        let position = index + 1;
        let Some((payload_id, payload_version)) = declared_schema(character) else {
            return Err(package_failure(
                "INVALID",
                "PAYLOAD_SCHEMA_NOT_DECLARED",
                format!("Payload Character {position} declares no schema."),
            ));
        };
        if payload_id != manifest_id || payload_version != manifest_version {
            return Err(package_failure(
                "INVALID",
                "MANIFEST_PAYLOAD_SCHEMA_MISMATCH",
                format!(
                    "Manifest says {manifest_id} {manifest_version}; payload Character {position} says {payload_id} {}.",
                    if payload_version.is_empty() {
                        "(version absent)".to_string()
                    } else {
                        payload_version
                    }
                ),
            ));
        }
    }
    Ok(format!("{manifest_id} {manifest_version}"))
}

fn supported_minimum_version(required: &str) -> bool {
    match (parse_version(APP_VERSION), parse_version(required)) {
        (Some(current), Some(minimum)) => current >= minimum,
        _ => false,
    }
}

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
    }
}

fn validate_package(
    manifest: &PackageManifest,
    payload_encoding: &str,
    payload_json: &str,
) -> Result<String, PackageValidationFailure> {
    if manifest.package_type != "WIT_PACKAGE" {
        return Err(PackageValidationFailure {
            status: "INVALID",
            code: "PACKAGE_TYPE_INVALID",
            reason: "package_type must be WIT_PACKAGE".to_string(),
        });
    }
    if manifest.product.trim().is_empty()
        || manifest.package_version.trim().is_empty()
        || manifest.schema_version.trim().is_empty()  // presence only; compatibility is decided by validate_schema_binding
        || manifest.minimum_app_version.trim().is_empty()
        || manifest.content_type.trim().is_empty()
        || manifest.distribution_channel.trim().is_empty()
        || manifest.license_state.trim().is_empty()
    {
        return Err(PackageValidationFailure {
            status: "INVALID",
            code: "REQUIRED_MANIFEST_FIELD_MISSING",
            reason: "One or more required manifest fields are empty.".to_string(),
        });
    }
    if payload_encoding != "utf8-json" {
        return Err(PackageValidationFailure {
            status: "UNSUPPORTED",
            code: "PAYLOAD_ENCODING_UNSUPPORTED",
            reason: format!("Unsupported payload encoding: {payload_encoding}"),
        });
    }
    if !supported_minimum_version(&manifest.minimum_app_version) {
        return Err(PackageValidationFailure {
            status: "UNSUPPORTED",
            code: "MINIMUM_APP_VERSION_UNSUPPORTED",
            reason: format!(
                "Package requires app {} but this candidate is {}",
                manifest.minimum_app_version, APP_VERSION
            ),
        });
    }
    if !matches!(
        manifest.content_type.as_str(),
        "CHARACTER" | "CHARACTER_PACK" | "CATALOG_MANIFEST"
    ) {
        return Err(PackageValidationFailure {
            status: "UNSUPPORTED",
            code: "CONTENT_TYPE_UNSUPPORTED",
            reason: format!("Unsupported content type: {}", manifest.content_type),
        });
    }
    let expected_hash = manifest.payload_hash.as_str();
    if expected_hash.len() != 64
        || !expected_hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(PackageValidationFailure {
            status: "INVALID",
            code: "PAYLOAD_HASH_FORMAT_INVALID",
            reason: "payload_hash must be 64 lowercase hexadecimal characters.".to_string(),
        });
    }
    let actual_hash = sha256_hex(payload_json.as_bytes());
    if actual_hash != expected_hash {
        return Err(PackageValidationFailure {
            status: "INVALID",
            code: "PAYLOAD_HASH_MISMATCH",
            reason: format!(
                "Payload hash mismatch: expected {expected_hash}, actual {actual_hash}"
            ),
        });
    }
    if let Err(error) = serde_json::from_str::<Value>(payload_json) {
        return Err(PackageValidationFailure {
            status: "INVALID",
            code: "PAYLOAD_JSON_INVALID",
            reason: format!("Payload is not valid JSON: {error}"),
        });
    }
    // Integrity is settled above: the archive is well formed and the payload is
    // the one the manifest hashed. That says nothing about whether the Character
    // inside is a schema this application can read, which is asked separately.
    validate_schema_binding(manifest, payload_json)?;
    Ok(actual_hash)
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

fn archive_entries(bytes: &[u8]) -> Result<HashMap<String, Vec<u8>>, PackageValidationFailure> {
    archive_entries_with(
        bytes,
        &ArchiveShape { max_entries: MAX_WITPKG_ENTRIES, max_total_bytes: MAX_ARCHIVE_TOTAL_BYTES, allow_directory_prefix: false },
    )
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
        let stored_name = if shape.allow_directory_prefix {
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

fn parse_zip_package(bytes: &[u8]) -> Result<PackageEnvelope, PackageValidationFailure> {
    let mut entries = archive_entries(bytes)?;
    if entries.len() != 2
        || !entries.contains_key("wit-package.json")
        || !entries.contains_key("payload.json")
    {
        return Err(invalid_archive(
            "ZIP must contain only wit-package.json and payload.json at its root.",
        ));
    }
    let manifest_bytes = entries.remove("wit-package.json").unwrap_or_default();
    let payload_bytes = entries.remove("payload.json").unwrap_or_default();
    let wit_package: PackageManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|error| invalid_archive(format!("wit-package.json is invalid JSON: {error}")))?;
    let payload_json = String::from_utf8(payload_bytes)
        .map_err(|_| invalid_archive("payload.json must be UTF-8."))?;
    Ok(PackageEnvelope {
        wit_package,
        payload_encoding: "utf8-json".to_string(),
        payload_json,
    })
}

pub(crate) const ACCEPTED_FORMATS_JA: &str = "受け付ける形式: SAKU Character Pack（character-pack.json を含む ZIP）／Builder パッケージ（.witpkg: wit-package.json と payload.json）／Character JSON。";

fn unrecognized_format(detail: impl Into<String>) -> PackageValidationFailure {
    package_failure(
        "INVALID",
        "PACKAGE_FORMAT_UNRECOGNIZED",
        format!("{ACCEPTED_FORMATS_JA} このファイルはどれにも当てはまりません（{}）。", detail.into()),
    )
}

#[derive(Debug)]
enum ParsedPackage {
    Envelope(PackageEnvelope),
    CharacterPack(CharacterPackImport),
}

#[cfg(test)]
fn parse_package_envelope(
    path: &Path,
    bytes: &[u8],
) -> Result<PackageEnvelope, PackageValidationFailure> {
    match parse_package(path, bytes)? {
        ParsedPackage::Envelope(envelope) => Ok(envelope),
        ParsedPackage::CharacterPack(_) => Err(invalid_archive(
            "A Character Pack is imported through the pack path, not as a Builder package.",
        )),
    }
}

fn parse_package(path: &Path, bytes: &[u8]) -> Result<ParsedPackage, PackageValidationFailure> {
    let has_zip_magic = bytes.starts_with(b"PK\x03\x04");
    let zip_extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"));
    if has_zip_magic {
        // Read once with the wider pack shape: a two-file Builder package is a
        // subset of it, and the pack marker decides the path.
        let entries = archive_entries_with(
            bytes,
            &ArchiveShape { max_entries: MAX_PACK_ENTRIES, max_total_bytes: MAX_ARCHIVE_TOTAL_BYTES, allow_directory_prefix: true },
        )?;
        if looks_like_character_pack(&entries) {
            return parse_character_pack(entries).map(ParsedPackage::CharacterPack);
        }
        if entries.contains_key("wit-package.json") || entries.contains_key("payload.json") {
            return parse_zip_package(bytes).map(ParsedPackage::Envelope);
        }
        let mut names: Vec<&String> = entries.keys().collect();
        names.sort();
        let shown: Vec<&str> = names.iter().take(5).map(|name| name.as_str()).collect();
        return Err(unrecognized_format(format!(
            "ZIP に character-pack.json も wit-package.json もありません: {}{}",
            shown.join(", "),
            if names.len() > 5 { " …" } else { "" }
        )));
    }
    if zip_extension {
        return Err(unrecognized_format("拡張子は .zip ですが ZIP のヘッダーがありません"));
    }
    serde_json::from_slice(bytes).map(ParsedPackage::Envelope).map_err(|error| {
        package_failure(
            "INVALID",
            "PACKAGE_JSON_INVALID",
            format!("{ACCEPTED_FORMATS_JA} JSON として読めません: {error}"),
        )
    })
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
    let envelope = match parse_package(path, &bytes) {
        Ok(ParsedPackage::Envelope(value)) => value,
        Ok(ParsedPackage::CharacterPack(pack)) => return import_character_pack(app, pack, source_path),
        Err(failure) => return failure_result(failure, source_path),
    };
    let manifest = envelope.wit_package;
    let actual_hash = match validate_package(
        &manifest,
        &envelope.payload_encoding,
        &envelope.payload_json,
    ) {
        Ok(hash) => hash,
        Err(failure) => {
            return ImportResult {
                status: failure.status,
                code: failure.code,
                reason: failure.reason,
                source_path,
                imported_path: None,
                payload_json: None,
                manifest: Some(manifest),
                pack: None,
            };
        }
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
                pack: None,
            };
        }
    };
    let safe_product: String = manifest
        .product
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect();
    let import_dir = workspace.join("imports").join(format!(
        "{}-{}-{}",
        safe_product,
        manifest.package_version,
        &actual_hash[..12]
    ));
    if let Err(error) = fs::create_dir_all(&import_dir) {
        return invalid(
            format!("IMPORT_DIRECTORY_CREATE_FAILED: {error}"),
            source_path,
        );
    }
    if let Err(error) = fs::write(
        import_dir.join("payload.json"),
        envelope.payload_json.as_bytes(),
    ) {
        return invalid(format!("IMPORT_PAYLOAD_WRITE_FAILED: {error}"), source_path);
    }
    let manifest_bytes = match serde_json::to_vec_pretty(&manifest) {
        Ok(bytes) => bytes,
        Err(error) => return invalid(format!("MANIFEST_SERIALIZE_FAILED: {error}"), source_path),
    };
    if let Err(error) = fs::write(import_dir.join("wit-package.json"), manifest_bytes) {
        return invalid(
            format!("IMPORT_MANIFEST_WRITE_FAILED: {error}"),
            source_path,
        );
    }
    ImportResult {
        status: "IMPORTED",
        code: "PACKAGE_IMPORTED",
        reason: "Compatibility and payload integrity checks passed.".to_string(),
        source_path,
        imported_path: Some(path_string(&import_dir)),
        payload_json: Some(envelope.payload_json),
        manifest: Some(manifest),
        pack: None,
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
    let payload_json = match serde_json::to_string(&serde_json::json!({ "characters": characters })) {
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
            };
        }
    };
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
    }
}

#[tauri::command]
fn choose_and_import_package(app: AppHandle) -> Result<ImportResult, String> {
    let selection = rfd::FileDialog::new()
        .set_title("SAKU Character Pack / Builder パッケージを選択")
        .add_filter("SAKU Character Pack / Builder package", &["zip", "witpkg", "json"])
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
    let config = read_config(&app)?;
    let workspace = config
        .workspace
        .ok_or_else(|| "WORKSPACE_NOT_CONFIGURED".to_string())?;
    let dir = workspace
        .join("characters")
        .join(safe_path_segment(&character_id));
    fs::create_dir_all(&dir).map_err(|error| format!("CHARACTER_DIR_CREATE_FAILED: {error}"))?;
    let file = dir.join("character.json");
    fs::write(&file, character_json.as_bytes())
        .map_err(|error| format!("CHARACTER_WRITE_FAILED: {error}"))?;
    Ok(path_string(&file))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_runtime_state,
            get_startup_route,
            choose_workspace,
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
        LEGACY_SCHEMA_VERSION, PackageManifest, collect_authored, collect_imports, crc32,
        parse_package_envelope, parse_version, path_string, safe_path_segment, sha256_hex,
        startup_route_from_args, supported_minimum_version, valid_export_filename,
        validate_package, write_export_file,
    };
    use flate2::{Compression, write::DeflateEncoder};
    use std::fs;
    use std::io::Write;
    use std::path::{Path, PathBuf};

    fn manifest(payload_hash: String) -> PackageManifest {
        PackageManifest {
            package_type: "WIT_PACKAGE".to_string(),
            product: "test-product".to_string(),
            package_version: "1.0.0".to_string(),
            schema_id: "saku.character".to_string(),
            schema_version: LEGACY_SCHEMA_VERSION.to_string(),
            minimum_app_version: "0.1.0".to_string(),
            content_type: "CHARACTER_PACK".to_string(),
            distribution_channel: "OWNER_REVIEW".to_string(),
            license_state: "NOT_SPECIFIED".to_string(),
            payload_hash,
        }
    }

    #[test]
    fn sha256_is_lowercase_hex_of_exact_bytes() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn app_version_gate_is_deterministic() {
        assert_eq!(parse_version("1.2.3"), Some([1, 2, 3]));
        assert_eq!(parse_version("1.2.3-beta.1"), Some([1, 2, 3]));
        assert_eq!(parse_version("1.2"), None);
        assert!(supported_minimum_version("0.1.0"));
        assert!(!supported_minimum_version("0.1.1"));
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

    // A minimal Character that declares the schema the test manifest names.
    fn legacy_schema_payload() -> String {
        format!(
            "{{\"characters\":[{{\"schema\":{{\"schema_id\":\"saku.character\",\"schema_version\":\"{}\"}},\"identity\":{{\"character_id\":\"t\"}}}}]}}",
            LEGACY_SCHEMA_VERSION
        )
    }

    #[test]
    fn valid_package_contract_passes() {
        let payload = legacy_schema_payload();
        let payload = payload.as_str();
        let result = validate_package(
            &manifest(sha256_hex(payload.as_bytes())),
            "utf8-json",
            payload,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn payload_mismatch_is_invalid() {
        let failure = validate_package(&manifest("0".repeat(64)), "utf8-json", "{}").unwrap_err();
        assert_eq!(failure.status, "INVALID");
        assert_eq!(failure.code, "PAYLOAD_HASH_MISMATCH");
    }

    #[test]
    fn unknown_content_type_is_unsupported() {
        let payload = "{}";
        let mut candidate = manifest(sha256_hex(payload.as_bytes()));
        candidate.content_type = "UNKNOWN_FUTURE_TYPE".to_string();
        let failure = validate_package(&candidate, "utf8-json", payload).unwrap_err();
        assert_eq!(failure.status, "UNSUPPORTED");
        assert_eq!(failure.code, "CONTENT_TYPE_UNSUPPORTED");
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

    #[test]
    fn downloaded_zip_package_is_parsed_without_manual_extraction() {
        let payload = legacy_schema_payload();
        let payload = payload.as_str();
        let manifest = manifest(sha256_hex(payload.as_bytes()));
        let archive = test_zip(&[
            (
                "wit-package.json",
                serde_json::to_vec_pretty(&manifest).unwrap(),
            ),
            ("payload.json", payload.as_bytes().to_vec()),
        ]);
        let envelope =
            parse_package_envelope(Path::new("downloaded-character-pack.zip"), &archive).unwrap();
        assert_eq!(envelope.payload_json, payload);
        assert_eq!(envelope.wit_package.product, "test-product");
        assert!(
            validate_package(
                &envelope.wit_package,
                &envelope.payload_encoding,
                &envelope.payload_json
            )
            .is_ok()
        );
    }

    // The packages handed to the Owner for the intake test must be proven by the
    // host's own reader, not by the tool that wrote them. These are the exact
    // bytes that ship, read from the repository.
    fn fixture(name: &str) -> Vec<u8> {
        let file = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("tests")
            .join("fixtures")
            .join("packages")
            .join(name);
        std::fs::read(&file).unwrap_or_else(|error| panic!("fixture {name}: {error}"))
    }

    // ── SAKU-COMPAT-01 ───────────────────────────────────────────────────
    // Package integrity and schema compatibility are separate questions. These
    // exercise the second one at the point where the host answers it.

    fn v1_character() -> String {
        concat!(
            "{\"schema\":\"SAKU-CHARACTER\",\"version\":\"1.0\",",
            "\"front_character\":{\"name\":\"v1\"},",
            "\"assistants\":[{\"key\":\"seat7_persona_guard\",\"kind\":\"ai\"}]}"
        )
        .to_string()
    }

    fn legacy_schema_character() -> String {
        format!(
            "{{\"schema\":{{\"schema_id\":\"saku.character\",\"schema_version\":\"{}\"}},\"identity\":{{\"character_id\":\"n\"}}}}",
            LEGACY_SCHEMA_VERSION
        )
    }

    fn unified_character() -> String {
        concat!(
            "{\"schema\":{\"schema_id\":\"SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE\",",
            "\"schema_version\":\"final-delta-recovery-closure-2026-09-04\"},",
            "\"identity\":{\"character_id\":\"u\"}}"
        )
        .to_string()
    }

    fn pack(character: &str) -> String {
        format!("{{\"characters\":[{character}]}}")
    }

    fn bound(schema_id: &str, schema_version: &str, payload: &str) -> PackageManifest {
        let mut m = manifest(sha256_hex(payload.as_bytes()));
        m.schema_id = schema_id.to_string();
        m.schema_version = schema_version.to_string();
        m
    }

    #[test]
    fn compat_01_valid_v1_package_binds() {
        let payload = pack(&v1_character());
        let manifest = bound("SAKU-CHARACTER", "1.0", &payload);
        assert!(validate_package(&manifest, "utf8-json", &payload).is_ok());
    }

    #[test]
    fn compat_02_valid_legacy_schema_package_binds() {
        let payload = pack(&legacy_schema_character());
        let manifest = bound("saku.character", LEGACY_SCHEMA_VERSION, &payload);
        assert!(validate_package(&manifest, "utf8-json", &payload).is_ok());
    }

    #[test]
    fn compat_active_unified_package_binds() {
        let payload = pack(&unified_character());
        let manifest = bound(
            "SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE",
            "final-delta-recovery-closure-2026-09-04",
            &payload,
        );
        assert!(validate_package(&manifest, "utf8-json", &payload).is_ok());
    }

    #[test]
    fn compat_03_unknown_schema_is_refused() {
        let character = "{\"schema\":{\"schema_id\":\"some.other\",\"schema_version\":\"9\"}}";
        let payload = pack(character);
        let manifest = bound("some.other", "9", &payload);
        let failure = validate_package(&manifest, "utf8-json", &payload).unwrap_err();
        assert_eq!(failure.code, "MANIFEST_SCHEMA_ID_UNKNOWN");
    }

    #[test]
    fn compat_04_05_unsupported_revision_is_refused() {
        for (id, version) in [
            ("SAKU-CHARACTER", "9.9"),
            ("saku.character", concat!("v", "next-99.0")),
        ] {
            let character = format!(
                "{{\"schema\":{{\"schema_id\":\"{id}\",\"schema_version\":\"{version}\"}}}}"
            );
            let payload = pack(&character);
            let manifest = bound(id, version, &payload);
            let failure = validate_package(&manifest, "utf8-json", &payload).unwrap_err();
            assert_eq!(failure.status, "UNSUPPORTED", "{id} {version}");
            assert_eq!(
                failure.code, "MANIFEST_SCHEMA_VERSION_UNSUPPORTED",
                "{id} {version}"
            );
        }
    }

    #[test]
    fn compat_06_manifest_v1_payload_legacy_schema_is_refused() {
        let payload = pack(&legacy_schema_character());
        let manifest = bound("SAKU-CHARACTER", "1.0", &payload);
        let failure = validate_package(&manifest, "utf8-json", &payload).unwrap_err();
        assert_eq!(failure.code, "MANIFEST_PAYLOAD_SCHEMA_MISMATCH");
    }

    #[test]
    fn compat_07_manifest_legacy_schema_payload_v1_is_refused() {
        let payload = pack(&v1_character());
        let manifest = bound("saku.character", LEGACY_SCHEMA_VERSION, &payload);
        let failure = validate_package(&manifest, "utf8-json", &payload).unwrap_err();
        assert_eq!(failure.code, "MANIFEST_PAYLOAD_SCHEMA_MISMATCH");
    }

    #[test]
    fn compat_08_payload_without_a_declared_schema_is_refused() {
        let payload = "{\"characters\":[{\"identity\":{\"character_id\":\"x\"}}]}";
        let manifest = bound("saku.character", LEGACY_SCHEMA_VERSION, payload);
        let failure = validate_package(&manifest, "utf8-json", payload).unwrap_err();
        assert_eq!(failure.code, "PAYLOAD_SCHEMA_NOT_DECLARED");
    }

    #[test]
    fn compat_09_intact_package_with_incompatible_schema_is_refused() {
        // Integrity is perfect: the hash matches its own payload exactly. Only
        // the schema is wrong, and that alone must stop the import.
        let character = format!(
            "{{\"schema\":{{\"schema_id\":\"saku.character\",\"schema_version\":\"{}\"}}}}",
            concat!("v", "next-0.9")
        );
        let payload = pack(&character);
        let manifest = bound("saku.character", concat!("v", "next-0.9"), &payload);
        assert_eq!(
            sha256_hex(payload.as_bytes()),
            manifest.payload_hash,
            "integrity must be intact for this vector to mean anything"
        );
        let failure = validate_package(&manifest, "utf8-json", &payload).unwrap_err();
        assert_eq!(failure.code, "MANIFEST_SCHEMA_VERSION_UNSUPPORTED");
    }

    #[test]
    fn compat_a_manifest_without_a_schema_identity_is_refused() {
        let payload = pack(&legacy_schema_character());
        let manifest = bound("", LEGACY_SCHEMA_VERSION, &payload);
        let failure = validate_package(&manifest, "utf8-json", &payload).unwrap_err();
        assert_eq!(failure.code, "MANIFEST_SCHEMA_ID_MISSING");
    }

    #[test]
    fn compat_b_no_seat_vocabulary_is_translated_by_the_host() {
        // The host must not rewrite either schema's seat names on the way in.
        let payload = pack(&v1_character());
        let manifest = bound("SAKU-CHARACTER", "1.0", &payload);
        validate_package(&manifest, "utf8-json", &payload).expect("v1 binds");
        assert!(payload.contains("seat7_persona_guard"));
        assert!(!payload.contains("FORWARD_DRIVER"));
    }

    #[test]
    fn owner_intake_test_packages_import() {
        for (name, content_type) in [
            ("saku-import-test-pack.zip", "CHARACTER_PACK"),
            ("saku-import-test-character.zip", "CHARACTER"),
        ] {
            let bytes = fixture(name);
            let envelope = parse_package_envelope(Path::new(name), &bytes)
                .unwrap_or_else(|failure| panic!("{name} did not parse: {}", failure.reason));
            assert_eq!(envelope.wit_package.content_type, content_type, "{name}");
            validate_package(
                &envelope.wit_package,
                &envelope.payload_encoding,
                &envelope.payload_json,
            )
            .unwrap_or_else(|failure| panic!("{name} did not validate: {}", failure.reason));
            serde_json::from_str::<serde_json::Value>(&envelope.payload_json)
                .unwrap_or_else(|error| panic!("{name} payload is not JSON: {error}"));
        }
    }

    #[test]
    fn owner_intake_broken_package_is_refused() {
        let bytes = fixture("saku-import-test-broken-hash.zip");
        let envelope =
            parse_package_envelope(Path::new("saku-import-test-broken-hash.zip"), &bytes)
                .expect("the archive itself is well formed; only the payload was changed");
        let failure = validate_package(
            &envelope.wit_package,
            &envelope.payload_encoding,
            &envelope.payload_json,
        )
        .expect_err("a package whose payload no longer matches its hash must not import");
        assert_eq!(failure.status, "INVALID");
        assert_eq!(failure.code, "PAYLOAD_HASH_MISMATCH");
    }

    #[test]
    fn zip_package_with_extra_or_nested_content_fails_closed() {
        let nested = test_zip(&[
            ("wit-package.json", b"{}".to_vec()),
            ("payload.json", b"{}".to_vec()),
            ("extra.txt", b"not allowed".to_vec()),
        ]);
        let failure = parse_package_envelope(Path::new("extra.zip"), &nested).unwrap_err();
        assert_eq!(failure.status, "INVALID");
        assert_eq!(failure.code, "PACKAGE_ARCHIVE_INVALID");

        let nested = test_zip(&[
            ("folder/wit-package.json", b"{}".to_vec()),
            ("payload.json", b"{}".to_vec()),
        ]);
        let failure = parse_package_envelope(Path::new("nested.zip"), &nested).unwrap_err();
        assert_eq!(failure.status, "INVALID");
        assert_eq!(failure.code, "PACKAGE_ARCHIVE_INVALID");
    }

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

    fn character_json(slug: &str, name: &str) -> String {
        json!({
            "schema": { "schema_id": "SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE", "schema_version": "final-delta-recovery-closure-2026-09-04" },
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
        let mut inner_archives: Vec<(String, Vec<u8>, Value, String)> = Vec::new();
        let mut membership = Vec::new();
        for slug in slugs {
            let character = character_json(slug, &format!("名前 {slug}"));
            let character_digest = sha256_hex(character.as_bytes());
            let manifest = signed(
                json!({
                    "format": "kokorosaku-portable-package", "schemaVersion": "3.0.0", "profile": "saku-unified-v1",
                    "source": { "provider": "kokorosaku", "characterId": format!("id-{slug}"), "sourceSlug": slug, "sourceVersion": "1.0.0",
                        "schema": { "schemaId": "SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE", "schemaVersion": "final-delta-recovery-closure-2026-09-04" },
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
            ParsedPackage::Envelope(_) => panic!("a pack must not parse as a Builder package"),
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
        let entries = super::archive_entries_with(&pack.bytes, &super::ArchiveShape { max_entries: 512, max_total_bytes: 64 << 20, allow_directory_prefix: true }).unwrap();
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
        // the Builder package path keeps its own 16-entry ceiling
        let mut witpkg: Vec<(String, Vec<u8>)> = vec![("wit-package.json".to_string(), b"{}".to_vec()), ("payload.json".to_string(), b"{}".to_vec())];
        for index in 0..15 {
            witpkg.push((format!("extra{index}.txt"), b"x".to_vec()));
        }
        let borrowed: Vec<(&str, Vec<u8>)> = witpkg.iter().map(|(name, bytes)| (name.as_str(), bytes.clone())).collect();
        let failure = parse_package(Path::new("wide.zip"), &test_zip(&borrowed)).unwrap_err();
        assert_eq!(failure.code, "PACKAGE_ARCHIVE_INVALID");
        assert!(failure.reason.contains("17"), "{}", failure.reason);
        // an unknown ZIP names the accepted formats in Japanese, not just a code
        let unknown = test_zip(&[("notes.txt", b"hello".to_vec())]);
        let failure = parse_package(Path::new("unknown.zip"), &unknown).unwrap_err();
        assert_eq!(failure.code, "PACKAGE_FORMAT_UNRECOGNIZED");
        assert!(failure.reason.contains("受け付ける形式"), "{}", failure.reason);
        assert!(failure.reason.contains("character-pack.json"));
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
