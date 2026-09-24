//! AMU Studio 「この編集内容を SAKU へ戻す」 — the `<slug>.saku-return.zip`.
//!
//! AMU Studio (KOKOROAMU-STUDIO PR #68/#69, `writeSakuReturn`) writes four
//! root-level files, STORE only: `character.json` (the bytes from inside the
//! signed archive, unchanged), `portable-manifest.json` (the signed manifest,
//! unchanged), `<slug>.kokorosaku.zip` (the signed archive itself) and
//! `edit-request.json` (schema `AMU-SAKU-RETURN/1.0.0`: which Character, its
//! digest and revision, the Instance it came from, a note and the fields to
//! look at).  The AMU layer is not in the file, by design.
//!
//! What this module establishes: the four files agree with each other — the
//! request names the Character the bytes carry; `character.json` matches the
//! signed manifest's `files[]` digest byte for byte; the manifest's own signed
//! digest recomputes; the enclosed archive, when present, holds the very same
//! two files; the request's `character_digest` equals the manifest's
//! `source.characterDigest.value` (profile `saku.sha256-rfc8785-ijson@1.0.0`,
//! which this host does not recompute — the signature binds it and AMU
//! recomputes it on re-import).  What it does NOT establish: the Ed25519
//! signature (verified on the page with the pinned publisher keys), and
//! whether the note is reasonable (that is the Owner's reading).
//!
//! Nothing is written to the workspace: a return is the entry point of an
//! edit, not an imported artifact.
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

use crate::character_pack::{MAX_INNER_ARCHIVE_ENTRIES, MAX_INNER_ARCHIVE_TOTAL_BYTES, PACK_PROFILE, PORTABLE_FORMAT, signed_manifest_digest};
use crate::{ArchiveShape, PackageValidationFailure, archive_entries_with, package_failure, sha256_hex};

/// Exact strings from KOKOROAMU-STUDIO `specification/constants.js` (PR #68 7c1e24e).
pub const SAKU_RETURN_SCHEMA: &str = "AMU-SAKU-RETURN/1.0.0";
pub const EDIT_REQUEST_JSON: &str = "edit-request.json";
const CHARACTER_JSON: &str = "character.json";
const MANIFEST_JSON: &str = "portable-manifest.json";
pub const MAX_RETURN_ENTRIES: usize = 8;
pub const MAX_RETURN_TOTAL_BYTES: usize = 8 * 1024 * 1024;
const MAX_NOTE_CHARS: usize = 4000;
const MAX_FIELD_CHARS: usize = 120;
const MAX_FIELDS: usize = 64;

fn invalid(reason: impl Into<String>) -> PackageValidationFailure {
    package_failure("INVALID", "SAKU_RETURN_INVALID", reason)
}
fn mismatch(reason: impl Into<String>) -> PackageValidationFailure {
    package_failure("INVALID", "SAKU_RETURN_MISMATCH", reason)
}
fn text<'a>(value: &'a Value, path: &str) -> Option<&'a str> {
    let mut node = value;
    for key in path.split('.') {
        node = node.get(key)?;
    }
    node.as_str()
}
fn required<'a>(value: &'a Value, path: &str, what: &str) -> Result<&'a str, PackageValidationFailure> {
    text(value, path).filter(|item| !item.trim().is_empty()).ok_or_else(|| invalid(format!("{what}: `{path}` がありません。")))
}
fn is_hex64(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

#[derive(Debug, Serialize)]
pub struct SakuReturnImport {
    pub schema: String,
    pub character_id: String,
    pub character_revision: String,
    /// `source.characterDigest.value` — bare hex, profile saku.sha256-rfc8785-ijson@1.0.0.
    pub character_digest: String,
    pub character_json_sha256: String,
    pub display_name: String,
    pub schema_id: String,
    pub schema_version: String,
    pub note: String,
    pub fields: Vec<String>,
    pub created_at: String,
    pub from_instance: Option<Value>,
    pub publisher_key_id: String,
    pub manifest_digest: String,
    pub signature: String,
    pub manifest_digest_recomputed: bool,
    pub archive_file: Option<String>,
    pub archive_present: bool,
    /// What the host established.  Never "signed".
    pub digest_state: &'static str,
    pub signature_state: &'static str,
    /// The exact bytes of character.json, as text.
    pub character_json: String,
}

/// True when the root entries look like a saku-return: cheap and structural.
pub fn looks_like_saku_return(entries: &HashMap<String, Vec<u8>>) -> bool {
    entries.contains_key(EDIT_REQUEST_JSON) && entries.contains_key(CHARACTER_JSON)
}

/// Parse and cross-check a saku-return from its root-level entries.
pub fn parse_saku_return(entries: HashMap<String, Vec<u8>>) -> Result<SakuReturnImport, PackageValidationFailure> {
    if entries.len() > MAX_RETURN_ENTRIES {
        return Err(package_failure("INVALID", "SAKU_RETURN_LIMIT_EXCEEDED", format!("戻しファイルの項目数が上限（{MAX_RETURN_ENTRIES}）を超えています。")));
    }
    let total: usize = entries.values().map(Vec::len).sum();
    if total > MAX_RETURN_TOTAL_BYTES {
        return Err(package_failure("INVALID", "SAKU_RETURN_LIMIT_EXCEEDED", "戻しファイルの合計サイズが上限（8 MiB）を超えています。"));
    }
    let request_bytes = entries.get(EDIT_REQUEST_JSON).ok_or_else(|| invalid("edit-request.json がありません。"))?;
    let character_bytes = entries.get(CHARACTER_JSON).ok_or_else(|| invalid("character.json がありません。"))?;
    let manifest_bytes = entries.get(MANIFEST_JSON).ok_or_else(|| invalid("portable-manifest.json がありません。"))?;
    // Only the four files AMU writes may be present: anything else is refused,
    // because nothing here would look at it and a stowaway must not ride in.
    let archives: Vec<&String> = entries.keys().filter(|name| name.ends_with(".kokorosaku.zip")).collect();
    if archives.len() > 1 {
        return Err(invalid("戻しファイルに .kokorosaku.zip が複数あります。"));
    }
    for name in entries.keys() {
        if name != EDIT_REQUEST_JSON && name != CHARACTER_JSON && name != MANIFEST_JSON && !name.ends_with(".kokorosaku.zip") {
            return Err(invalid(format!("戻しファイルに想定外の項目があります: {name}")));
        }
    }

    // edit-request.json
    let request: Value = serde_json::from_slice(request_bytes).map_err(|error| invalid(format!("edit-request.json が JSON として読めません: {error}")))?;
    let schema = required(&request, "schema", "edit-request.json")?.to_string();
    if schema != SAKU_RETURN_SCHEMA {
        return Err(package_failure("UNSUPPORTED", "SAKU_RETURN_SCHEMA_UNSUPPORTED", format!("edit-request.json の schema（{schema}）はこの Builder では読めません。対応: {SAKU_RETURN_SCHEMA}。")));
    }
    let character_id = required(&request, "character_id", "edit-request.json")?.to_string();
    let character_revision = required(&request, "character_revision", "edit-request.json")?.to_string();
    let character_digest = required(&request, "character_digest", "edit-request.json")?.to_string();
    if !is_hex64(&character_digest) {
        return Err(invalid("edit-request.json の character_digest が sha-256 の 16 進 64 桁ではありません。"));
    }
    let created_at = text(&request, "created_at").unwrap_or("").to_string();
    let note = request.get("note").and_then(Value::as_str).unwrap_or("").to_string();
    if note.trim().is_empty() || note.chars().count() > MAX_NOTE_CHARS {
        return Err(invalid(format!("edit-request.json の note は 1〜{MAX_NOTE_CHARS} 文字である必要があります。")));
    }
    let fields: Vec<String> = match request.get("fields") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => {
            if items.len() > MAX_FIELDS {
                return Err(invalid(format!("edit-request.json の fields が多すぎます（上限 {MAX_FIELDS}）。")));
            }
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                let field = item.as_str().ok_or_else(|| invalid("edit-request.json の fields は文字列の配列である必要があります。"))?;
                if field.trim().is_empty() || field.chars().count() > MAX_FIELD_CHARS {
                    return Err(invalid(format!("edit-request.json の fields の各項目は 1〜{MAX_FIELD_CHARS} 文字である必要があります。")));
                }
                out.push(field.to_string());
            }
            out
        }
        Some(_) => return Err(invalid("edit-request.json の fields は配列である必要があります。")),
    };
    let from_instance = match request.get("from_instance") {
        None | Some(Value::Null) => None,
        Some(value @ Value::Object(_)) => {
            required(value, "amu_instance_ref", "edit-request.json from_instance")?;
            required(value, "instance_config_digest", "edit-request.json from_instance")?;
            Some(value.clone())
        }
        Some(_) => return Err(invalid("edit-request.json の from_instance はオブジェクトか null である必要があります。")),
    };

    // character.json: the Character the request names, in the active schema.
    let character: Value = serde_json::from_slice(character_bytes).map_err(|error| invalid(format!("character.json が JSON として読めません: {error}")))?;
    let identity_id = required(&character, "identity.character_id", "character.json")?;
    let identity_revision = required(&character, "identity.character_revision", "character.json")?;
    if identity_id != character_id || identity_revision != character_revision {
        return Err(mismatch(format!("edit-request.json は {character_id} rev {character_revision} を指していますが、character.json は {identity_id} rev {identity_revision} です。")));
    }
    let schema_id = required(&character, "schema.schema_id", "character.json")?.to_string();
    let schema_version = required(&character, "schema.schema_version", "character.json")?.to_string();
    let display_name = text(&character, "identity.display_name").unwrap_or("").to_string();

    // portable-manifest.json: the signed manifest that covers these bytes.
    let manifest: Value = serde_json::from_slice(manifest_bytes).map_err(|error| invalid(format!("portable-manifest.json が JSON として読めません: {error}")))?;
    if text(&manifest, "format") != Some(PORTABLE_FORMAT) || text(&manifest, "profile") != Some(PACK_PROFILE) {
        return Err(invalid(format!("portable-manifest.json は {PORTABLE_FORMAT} / {PACK_PROFILE} である必要があります。")));
    }
    if text(&manifest, "source.sourceSlug") != Some(character_id.as_str()) || text(&manifest, "source.sourceVersion") != Some(character_revision.as_str()) {
        return Err(mismatch("portable-manifest.json の source が edit-request.json の Character と一致しません。"));
    }
    if text(&manifest, "source.schema.schemaId") != Some(schema_id.as_str()) || text(&manifest, "source.schema.schemaVersion") != Some(schema_version.as_str()) {
        return Err(mismatch("portable-manifest.json の schema が character.json の宣言と一致しません。"));
    }
    if text(&manifest, "source.characterDigest.value") != Some(character_digest.as_str()) {
        return Err(mismatch("edit-request.json の character_digest が portable-manifest.json の characterDigest と一致しません。"));
    }
    let files = manifest.get("files").and_then(Value::as_array).ok_or_else(|| invalid("portable-manifest.json に files がありません。"))?;
    let character_json_sha256 = sha256_hex(character_bytes);
    let mut character_listed = false;
    for item in files {
        let path = required(item, "path", "portable-manifest.json files")?;
        let digest = required(item, "digest", "portable-manifest.json files")?;
        if path == CHARACTER_JSON {
            character_listed = true;
            if digest.strip_prefix("sha-256:").unwrap_or(digest) != character_json_sha256 {
                return Err(mismatch("character.json のバイト列が portable-manifest.json の files[] の digest と一致しません。"));
            }
        }
    }
    if !character_listed {
        return Err(invalid("portable-manifest.json の files に character.json がありません。"));
    }
    let package = manifest.get("package").ok_or_else(|| invalid("portable-manifest.json に package がありません。"))?;
    if text(package, "algorithm") != Some("Ed25519") {
        return Err(invalid("portable-manifest.json の package.algorithm は Ed25519 である必要があります。"));
    }
    let publisher_key_id = required(package, "publisherKeyId", "portable-manifest.json package")?.to_string();
    let manifest_digest = required(package, "digest", "portable-manifest.json package")?.to_string();
    let signature = required(package, "signature", "portable-manifest.json package")?.to_string();
    let recomputed = signed_manifest_digest(&manifest).ok_or_else(|| invalid("portable-manifest.json の package がオブジェクトではありません。"))?;
    if recomputed != manifest_digest {
        return Err(mismatch("portable-manifest.json の package.digest が正規化した manifest と一致しません。"));
    }

    // The enclosed signed archive, when present: the very same two files.
    let archive_file = archives.first().map(|name| (*name).clone());
    if let Some(name) = &archive_file {
        let inner = archive_entries_with(
            &entries[name],
            &ArchiveShape { max_entries: MAX_INNER_ARCHIVE_ENTRIES, max_total_bytes: MAX_INNER_ARCHIVE_TOTAL_BYTES, allow_directory_prefix: false, peek_only: false },
        )
        .map_err(|failure| invalid(format!("{name}: {}", failure.reason)))?;
        let inner_character = inner.get(CHARACTER_JSON).ok_or_else(|| invalid(format!("{name}: character.json がありません。")))?;
        let inner_manifest = inner.get(MANIFEST_JSON).ok_or_else(|| invalid(format!("{name}: portable-manifest.json がありません。")))?;
        if inner_character != character_bytes {
            return Err(mismatch(format!("{name} 内の character.json が戻しファイルの character.json とバイト列で一致しません。")));
        }
        if inner_manifest != manifest_bytes {
            return Err(mismatch(format!("{name} 内の portable-manifest.json が戻しファイルの portable-manifest.json と一致しません。")));
        }
    }

    Ok(SakuReturnImport {
        schema,
        character_id,
        character_revision,
        character_digest,
        character_json_sha256,
        display_name,
        schema_id,
        schema_version,
        note,
        fields,
        created_at,
        from_instance,
        publisher_key_id,
        manifest_digest,
        signature,
        manifest_digest_recomputed: true,
        archive_present: archive_file.is_some(),
        archive_file,
        digest_state: "CHARACTER_BYTES_AND_SIGNED_MANIFEST_VERIFIED",
        signature_state: "NOT_VERIFIED_BY_HOST",
        character_json: String::from_utf8_lossy(character_bytes).into_owned(),
    })
}
