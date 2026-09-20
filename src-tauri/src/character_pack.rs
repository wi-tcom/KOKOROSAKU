//! SAKU Character Pack intake (Package 3.0.0, profile `saku-unified-v1`).
//!
//! The sold packs are one ZIP with a single folder inside it:
//! `LICENSE.md`, `README.md`, `SHA256SUMS`, `character-pack.json`,
//! `catalog-release.v1.json` and one `<slug>.kokorosaku.zip` per Character,
//! each holding `portable-manifest.json` + `character.json`.
//!
//! What this module establishes, and says so: every byte-level binding the
//! pack carries is recomputed and compared — `SHA256SUMS`, each archive
//! digest, each `files[].digest`, the catalog-release membership, and the
//! manifest digests that the publisher signed.  What it does NOT establish is
//! the Ed25519 signatures themselves: the host has no Ed25519 implementation,
//! so the signature and key id are returned to the caller, which verifies
//! them where it can and must otherwise display "signature not verified".
//! Nothing here is allowed to be reported as "signed" by this module.
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};

use crate::{ArchiveShape, PackageValidationFailure, archive_entries_with, package_failure, sha256_hex};

pub const PACK_FORMAT: &str = "kokorosaku-character-pack";
pub const PORTABLE_FORMAT: &str = "kokorosaku-portable-package";
pub const PACK_PROFILE: &str = "saku-unified-v1";
pub const MAX_PACK_CHARACTERS: usize = 256;
pub const MAX_INNER_ARCHIVE_ENTRIES: usize = 8;
pub const MAX_INNER_ARCHIVE_TOTAL_BYTES: usize = 8 * 1024 * 1024;
const SHA256SUMS: &str = "SHA256SUMS";
const PACK_JSON: &str = "character-pack.json";
const CATALOG_RELEASE_JSON: &str = "catalog-release.v1.json";
const OPERATION_CLASSES: [&str; 3] = ["A", "B", "C"];

#[derive(Debug, Clone, Serialize)]
pub struct PackEntryImport {
    pub slug: String,
    pub character_id: String,
    pub display_name: String,
    pub source_version: String,
    pub operation_class: String,
    pub file: String,
    pub archive_digest: String,
    pub package_digest: String,
    pub character_digest: String,
    pub publisher_key_id: String,
    pub signature: String,
    pub manifest_digest_recomputed: bool,
    pub schema_id: String,
    pub schema_version: String,
    #[serde(skip_serializing)]
    pub character_json: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CharacterPackImport {
    pub format: &'static str,
    pub pack_id: String,
    pub pack_version: String,
    pub created_at: String,
    pub character_count: usize,
    pub catalog_id: String,
    pub catalog_release_version: String,
    pub schema_id: String,
    pub schema_version: String,
    pub pack_publisher_key_id: String,
    pub pack_manifest_digest: String,
    pub pack_signature: String,
    pub pack_manifest_digest_recomputed: bool,
    pub sha256sums_verified: usize,
    pub digest_state: &'static str,
    pub signature_state: &'static str,
    pub entries: Vec<PackEntryImport>,
    #[serde(skip_serializing)]
    pub files: BTreeMap<String, Vec<u8>>,
}

fn invalid(reason: impl Into<String>) -> PackageValidationFailure {
    package_failure("INVALID", "CHARACTER_PACK_INVALID", reason)
}
fn digest_mismatch(reason: impl Into<String>) -> PackageValidationFailure {
    package_failure("INVALID", "CHARACTER_PACK_DIGEST_MISMATCH", reason)
}
fn limit(reason: impl Into<String>) -> PackageValidationFailure {
    package_failure("INVALID", "CHARACTER_PACK_LIMIT_EXCEEDED", reason)
}

fn text<'a>(value: &'a Value, path: &str) -> Option<&'a str> {
    let mut node = value;
    for key in path.split('.') {
        node = node.get(key)?;
    }
    node.as_str()
}
fn required<'a>(value: &'a Value, path: &str, what: &str) -> Result<&'a str, PackageValidationFailure> {
    text(value, path)
        .filter(|item| !item.trim().is_empty())
        .ok_or_else(|| invalid(format!("{what}: `{path}` is missing.")))
}
fn strip_prefix(digest: &str) -> &str {
    digest.strip_prefix("sha-256:").unwrap_or(digest)
}
fn is_hex64(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

/// RFC 8785-style canonical JSON for the manifests the publisher signs:
/// keys sorted, no whitespace, scalars as JSON.  Matches the producer's
/// `canonicalJson` for the value shapes a manifest holds.
pub fn canonical_json(value: &Value) -> String {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let parts: Vec<String> = keys
                .into_iter()
                .map(|key| format!("{}:{}", serde_json::to_string(key).unwrap_or_default(), canonical_json(&map[key])))
                .collect();
            format!("{{{}}}", parts.join(","))
        }
        Value::Array(items) => format!("[{}]", items.iter().map(canonical_json).collect::<Vec<_>>().join(",")),
        other => serde_json::to_string(other).unwrap_or_default(),
    }
}

/// The digest the publisher signed: sha-256 over the canonical manifest with
/// `package.digest` and `package.signature` removed.
pub fn signed_manifest_digest(manifest: &Value) -> Option<String> {
    let mut unsigned = manifest.clone();
    let package = unsigned.get_mut("package")?.as_object_mut()?;
    package.remove("digest");
    package.remove("signature");
    Some(format!("sha-256:{}", sha256_hex(canonical_json(&unsigned).as_bytes())))
}

fn signature_block(manifest: &Value, what: &str) -> Result<(String, String, String, bool), PackageValidationFailure> {
    let package = manifest.get("package").ok_or_else(|| invalid(format!("{what}: `package` is missing.")))?;
    if text(package, "algorithm") != Some("Ed25519") {
        return Err(invalid(format!("{what}: package.algorithm must be Ed25519.")));
    }
    let key_id = required(package, "publisherKeyId", what)?.to_string();
    let digest = required(package, "digest", what)?.to_string();
    let signature = required(package, "signature", what)?.to_string();
    if !is_hex64(strip_prefix(&digest)) {
        return Err(invalid(format!("{what}: package.digest is not a sha-256 digest.")));
    }
    let recomputed = signed_manifest_digest(manifest).ok_or_else(|| invalid(format!("{what}: package block is not an object.")))?;
    if recomputed != digest {
        return Err(digest_mismatch(format!("{what}: package.digest does not match the canonical manifest.")));
    }
    Ok((key_id, digest, signature, true))
}

/// True when the root-level entries look like a Character Pack.  Cheap and
/// deliberately structural: the full checks happen in `parse_character_pack`.
pub fn looks_like_character_pack(entries: &HashMap<String, Vec<u8>>) -> bool {
    entries.contains_key(PACK_JSON)
}

/// Parse and verify a Character Pack from its root-level entries.
pub fn parse_character_pack(entries: HashMap<String, Vec<u8>>) -> Result<CharacterPackImport, PackageValidationFailure> {
    let pack_bytes = entries.get(PACK_JSON).ok_or_else(|| invalid("character-pack.json is missing."))?;
    let pack: Value = serde_json::from_slice(pack_bytes).map_err(|error| invalid(format!("character-pack.json is invalid JSON: {error}")))?;
    if text(&pack, "format") != Some(PACK_FORMAT) {
        return Err(invalid(format!("character-pack.json format must be {PACK_FORMAT}.")));
    }
    let pack_id = required(&pack, "pack.id", "character-pack.json")?.to_string();
    let pack_version = required(&pack, "pack.version", "character-pack.json")?.to_string();
    let created_at = text(&pack, "pack.createdAt").unwrap_or_default().to_string();
    let declared_count = pack
        .get("pack")
        .and_then(|item| item.get("characterCount"))
        .and_then(Value::as_u64)
        .ok_or_else(|| invalid("character-pack.json: pack.characterCount is missing."))?;
    let declared = pack
        .get("entries")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid("character-pack.json: entries is missing."))?;
    if declared.is_empty() {
        return Err(invalid("character-pack.json lists no Characters."));
    }
    if declared.len() > MAX_PACK_CHARACTERS {
        return Err(limit(format!("A Character Pack may hold at most {MAX_PACK_CHARACTERS} Characters.")));
    }
    if declared.len() as u64 != declared_count {
        return Err(invalid("character-pack.json: pack.characterCount does not match entries."));
    }
    let (pack_publisher_key_id, pack_manifest_digest, pack_signature, pack_manifest_digest_recomputed) =
        signature_block(&pack, "character-pack.json")?;

    // SHA256SUMS: every listed file present and matching; every file other
    // than SHA256SUMS itself listed.  A pack cannot carry an unaccounted file.
    let sums_text = String::from_utf8(entries.get(SHA256SUMS).cloned().ok_or_else(|| invalid("SHA256SUMS is missing."))?)
        .map_err(|_| invalid("SHA256SUMS must be UTF-8."))?;
    let mut listed: BTreeMap<String, String> = BTreeMap::new();
    for line in sums_text.lines().map(str::trim).filter(|line| !line.is_empty()) {
        let (digest, name) = line
            .split_once("  ")
            .or_else(|| line.split_once(' '))
            .ok_or_else(|| invalid("SHA256SUMS line is malformed."))?;
        let name = name.trim().trim_start_matches('*').to_string();
        if !is_hex64(digest) || name.is_empty() || name.contains('/') || name.contains('\\') {
            return Err(invalid("SHA256SUMS line is malformed."));
        }
        if listed.insert(name, digest.to_string()).is_some() {
            return Err(invalid("SHA256SUMS lists a file twice."));
        }
    }
    for (name, digest) in &listed {
        let bytes = entries.get(name).ok_or_else(|| invalid(format!("SHA256SUMS lists a missing file: {name}")))?;
        if sha256_hex(bytes) != *digest {
            return Err(digest_mismatch(format!("{name} does not match SHA256SUMS.")));
        }
    }
    for name in entries.keys() {
        if name != SHA256SUMS && !listed.contains_key(name) {
            return Err(invalid(format!("{name} is not listed in SHA256SUMS.")));
        }
    }

    // catalog-release membership: id / revision / digest per Character.
    let catalog_bytes = entries.get(CATALOG_RELEASE_JSON).ok_or_else(|| invalid("catalog-release.v1.json is missing."))?;
    let catalog: Value = serde_json::from_slice(catalog_bytes).map_err(|error| invalid(format!("catalog-release.v1.json is invalid JSON: {error}")))?;
    let catalog_id = required(&catalog, "catalog_id", "catalog-release.v1.json")?.to_string();
    let catalog_release_version = required(&catalog, "release_version", "catalog-release.v1.json")?.to_string();
    if let Some(declared_release) = pack.get("catalogRelease") {
        if text(declared_release, "file") != Some(CATALOG_RELEASE_JSON) {
            return Err(invalid("character-pack.json names a different catalog release file."));
        }
        if let Some(expected) = text(declared_release, "digest") {
            if strip_prefix(expected) != sha256_hex(catalog_bytes) {
                return Err(digest_mismatch("catalog-release.v1.json does not match character-pack.json."));
            }
        }
        if text(declared_release, "releaseVersion").is_some_and(|value| value != catalog_release_version) {
            return Err(invalid("catalog release version differs between character-pack.json and catalog-release.v1.json."));
        }
    }
    let membership: HashMap<String, (String, String)> = catalog
        .get("membership")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid("catalog-release.v1.json: membership is missing."))?
        .iter()
        .filter_map(|member| {
            Some((
                text(member, "character_id")?.to_string(),
                (text(member, "character_revision")?.to_string(), text(member, "character_digest")?.to_string()),
            ))
        })
        .collect();

    let mut imports = Vec::with_capacity(declared.len());
    let mut seen_slugs = std::collections::HashSet::new();
    let mut schema_id = String::new();
    let mut schema_version = String::new();
    for entry in declared {
        let slug = required(entry, "slug", "character-pack.json entry")?.to_string();
        if !seen_slugs.insert(slug.clone()) {
            return Err(invalid(format!("character-pack.json lists {slug} twice.")));
        }
        let file = required(entry, "file", "character-pack.json entry")?.to_string();
        let character_id = required(entry, "characterId", "character-pack.json entry")?.to_string();
        let display_name = text(entry, "displayName").unwrap_or_default().to_string();
        let source_version = required(entry, "sourceVersion", "character-pack.json entry")?.to_string();
        let operation_class = required(entry, "operationClass", "character-pack.json entry")?.to_string();
        if !OPERATION_CLASSES.contains(&operation_class.as_str()) {
            return Err(invalid(format!("{slug}: operationClass must be A, B or C.")));
        }
        if text(entry, "profile").is_some_and(|value| value != PACK_PROFILE) {
            return Err(invalid(format!("{slug}: profile must be {PACK_PROFILE}.")));
        }
        let archive_digest = required(entry, "archiveDigest", "character-pack.json entry")?.to_string();
        let package_digest = required(entry, "packageDigest", "character-pack.json entry")?.to_string();
        let character_digest = required(entry, "characterDigest", "character-pack.json entry")?.to_string();
        if !file.ends_with(".kokorosaku.zip") || file.contains('/') || file.contains('\\') {
            return Err(invalid(format!("{slug}: entry file must be a root-level .kokorosaku.zip.")));
        }
        let archive = entries.get(&file).ok_or_else(|| invalid(format!("{slug}: {file} is missing from the pack.")))?;
        if sha256_hex(archive) != strip_prefix(&archive_digest) {
            return Err(digest_mismatch(format!("{file} does not match its archiveDigest.")));
        }

        // One nesting level only, root-only names, small budget.
        let inner = archive_entries_with(
            archive,
            &ArchiveShape { max_entries: MAX_INNER_ARCHIVE_ENTRIES, max_total_bytes: MAX_INNER_ARCHIVE_TOTAL_BYTES, allow_directory_prefix: false },
        )
        .map_err(|failure| invalid(format!("{file}: {}", failure.reason)))?;
        let manifest_bytes = inner.get("portable-manifest.json").ok_or_else(|| invalid(format!("{file}: portable-manifest.json is missing.")))?;
        let character_bytes = inner.get("character.json").ok_or_else(|| invalid(format!("{file}: character.json is missing.")))?;
        if inner.keys().any(|name| name.ends_with(".zip")) {
            return Err(invalid(format!("{file}: nested archives inside a Character archive are not accepted.")));
        }
        let manifest: Value = serde_json::from_slice(manifest_bytes).map_err(|error| invalid(format!("{file}: portable-manifest.json is invalid JSON: {error}")))?;
        if text(&manifest, "format") != Some(PORTABLE_FORMAT) {
            return Err(invalid(format!("{file}: portable-manifest.json format must be {PORTABLE_FORMAT}.")));
        }
        if text(&manifest, "profile") != Some(PACK_PROFILE) {
            return Err(invalid(format!("{file}: portable-manifest.json profile must be {PACK_PROFILE}.")));
        }
        if text(&manifest, "source.characterId") != Some(character_id.as_str())
            || text(&manifest, "source.sourceSlug") != Some(slug.as_str())
            || text(&manifest, "source.sourceVersion") != Some(source_version.as_str())
        {
            return Err(invalid(format!("{file}: portable-manifest.json source does not match the pack entry.")));
        }
        if text(&manifest, "summary.seat8") != Some("human") {
            return Err(invalid(format!("{file}: seat8 must be human.")));
        }
        if text(&manifest, "source.characterDigest.value") != Some(character_digest.as_str()) {
            return Err(digest_mismatch(format!("{file}: characterDigest differs between pack entry and portable manifest.")));
        }
        let entry_schema_id = required(&manifest, "source.schema.schemaId", &format!("{file}: portable-manifest.json"))?.to_string();
        let entry_schema_version = required(&manifest, "source.schema.schemaVersion", &format!("{file}: portable-manifest.json"))?.to_string();
        if schema_id.is_empty() {
            schema_id = entry_schema_id.clone();
            schema_version = entry_schema_version.clone();
        } else if schema_id != entry_schema_id || schema_version != entry_schema_version {
            return Err(invalid("Characters in one pack must share one schema identity."));
        }
        // files[]: every listed file present with the listed digest; character.json must be listed.
        let files = manifest.get("files").and_then(Value::as_array).ok_or_else(|| invalid(format!("{file}: portable-manifest.json files is missing.")))?;
        let mut character_listed = false;
        for item in files {
            let path = required(item, "path", &format!("{file}: files entry"))?;
            let digest = required(item, "digest", &format!("{file}: files entry"))?;
            let bytes = inner.get(path).ok_or_else(|| invalid(format!("{file}: files lists a missing member {path}.")))?;
            if sha256_hex(bytes) != strip_prefix(digest) {
                return Err(digest_mismatch(format!("{file}: {path} does not match portable-manifest.json.")));
            }
            if path == "character.json" {
                character_listed = true;
            }
        }
        if !character_listed {
            return Err(invalid(format!("{file}: character.json is not covered by portable-manifest.json files.")));
        }
        let (publisher_key_id, manifest_digest, signature, manifest_digest_recomputed) =
            signature_block(&manifest, &format!("{file}: portable-manifest.json"))?;
        if manifest_digest != package_digest {
            return Err(digest_mismatch(format!("{file}: packageDigest differs between pack entry and portable manifest.")));
        }
        // character.json: parses, declares the same schema, carries the same identity.
        let character: Value = serde_json::from_slice(character_bytes).map_err(|error| invalid(format!("{file}: character.json is invalid JSON: {error}")))?;
        if text(&character, "schema.schema_id") != Some(entry_schema_id.as_str())
            || text(&character, "schema.schema_version") != Some(entry_schema_version.as_str())
        {
            return Err(invalid(format!("{file}: character.json schema differs from portable-manifest.json.")));
        }
        if text(&character, "identity.character_id") != Some(slug.as_str())
            || text(&character, "identity.character_revision") != Some(source_version.as_str())
        {
            return Err(invalid(format!("{file}: character.json identity differs from the pack entry.")));
        }
        match membership.get(&slug) {
            Some((revision, digest)) if *revision == source_version && *digest == character_digest => {}
            Some(_) => return Err(package_failure("INVALID", "CHARACTER_PACK_CATALOG_MISMATCH", format!("{slug}: catalog release names a different revision or digest."))),
            None => return Err(package_failure("INVALID", "CHARACTER_PACK_CATALOG_MISMATCH", format!("{slug} is not a member of the catalog release."))),
        }
        let character_json = String::from_utf8(character_bytes.clone()).map_err(|_| invalid(format!("{file}: character.json must be UTF-8.")))?;
        imports.push(PackEntryImport {
            slug,
            character_id,
            display_name,
            source_version,
            operation_class,
            file,
            archive_digest,
            package_digest,
            character_digest,
            publisher_key_id,
            signature,
            manifest_digest_recomputed,
            schema_id: entry_schema_id,
            schema_version: entry_schema_version,
            character_json,
        });
    }
    // Every archive in the pack must be a declared entry (no stowaways).
    let declared_files: std::collections::HashSet<&str> = imports.iter().map(|item| item.file.as_str()).collect();
    for name in entries.keys() {
        if name.ends_with(".kokorosaku.zip") && !declared_files.contains(name.as_str()) {
            return Err(invalid(format!("{name} is not declared in character-pack.json.")));
        }
    }
    let files: BTreeMap<String, Vec<u8>> = entries
        .iter()
        .filter(|(name, _)| !name.ends_with(".kokorosaku.zip"))
        .map(|(name, bytes)| (name.clone(), bytes.clone()))
        .collect();
    Ok(CharacterPackImport {
        format: PACK_FORMAT,
        pack_id,
        pack_version,
        created_at,
        character_count: imports.len(),
        catalog_id,
        catalog_release_version,
        schema_id,
        schema_version,
        pack_publisher_key_id,
        pack_manifest_digest,
        pack_signature,
        pack_manifest_digest_recomputed,
        sha256sums_verified: listed.len(),
        digest_state: "SHA256_BINDINGS_VERIFIED",
        signature_state: "NOT_VERIFIED_BY_HOST",
        entries: imports,
        files,
    })
}
