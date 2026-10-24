//! The standard Agent Skills attachment, opened by the host (ADR-0027 §4.2, wi-tcom/ADR 5ffcf08; SAKU β.13 U1b-2).
//!
//! The page has no ZIP reader, so the host opens the containers — the attachment ZIP and each
//! `<character_id>.agent-skill.zip` in it — and hands the entries to the page as base64. Everything after the entry
//! lists is the shared kit's (`tools/unified-v1/agent-skills-attachment.mjs` verifyStandardAttachment): it counts
//! again, checks paths, the index, every nameplate, the binding to the chosen pack and membership. The host checks
//! nothing about the content. When the host cannot open a container, the code is `ATTACHMENT_ZIP_INVALID` (N-g).
//!
//! The limits are the kit's `OUTER_ZIP_LIMITS` and `INNER_ZIP_LIMITS`, copied as numbers because the host cannot import
//! JS; `scripts/verify_agent_skills_attachment.mjs` checks that they are the same (N-f). Nothing here writes or signs.

use crate::{archive_entries_with, ArchiveShape};
use serde::Serialize;
use std::collections::BTreeMap;

pub(crate) const ATTACHMENT_OUTER_MAX_ARCHIVE: usize = 64 * 1024 * 1024;
pub(crate) const ATTACHMENT_OUTER_MAX_FILE: usize = 8 * 1024 * 1024;
pub(crate) const ATTACHMENT_OUTER_MAX_EXPANDED: usize = 128 * 1024 * 1024;
pub(crate) const ATTACHMENT_OUTER_MAX_FILES: usize = 400;
pub(crate) const ATTACHMENT_INNER_MAX_ARCHIVE: usize = 4 * 1024 * 1024;
pub(crate) const ATTACHMENT_INNER_MAX_FILE: usize = 2 * 1024 * 1024;
pub(crate) const ATTACHMENT_INNER_MAX_EXPANDED: usize = 4 * 1024 * 1024;
pub(crate) const ATTACHMENT_INNER_MAX_FILES: usize = 8;
/// The inner ZIPs are the outer entries with this name ending (the save door's suffix, ADR-0027 §1.2).
pub(crate) const ATTACHMENT_INNER_SUFFIX: &str = ".agent-skill.zip";

#[derive(Debug, Serialize, PartialEq)]
pub struct AttachmentEntry {
    pub name: String,
    pub bytes_base64: String,
}

#[derive(Debug, Serialize)]
pub struct AttachmentRead {
    /// "READ" with the entries, or "REFUSED" with `code` and nothing else.
    pub status: &'static str,
    pub code: Option<&'static str>,
    pub reason: String,
    pub outer_entries: Vec<AttachmentEntry>,
    pub inner_entries: BTreeMap<String, Vec<AttachmentEntry>>,
}

fn refused(reason: impl Into<String>) -> AttachmentRead {
    AttachmentRead {
        status: "REFUSED",
        code: Some("ATTACHMENT_ZIP_INVALID"),
        reason: reason.into(),
        outer_entries: Vec::new(),
        inner_entries: BTreeMap::new(),
    }
}

const BASE64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Standard base64 with padding (RFC 4648 §4), for `atob` on the page.
pub(crate) fn base64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(BASE64[(n >> 18) as usize & 63] as char);
        out.push(BASE64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { BASE64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { BASE64[n as usize & 63] as char } else { '=' });
    }
    out
}

/// Open one container with the limits. Folder entries (size 0, a name ending "/") are left out by the reader; the
/// names are kept whole (peek_only: the kit checks the layout).
fn open(bytes: &[u8], max_archive: usize, max_file: usize, max_expanded: usize, max_files: usize, what: &str) -> Result<BTreeMap<String, Vec<u8>>, String> {
    if bytes.len() > max_archive {
        return Err(format!("{what} is larger than {max_archive} bytes"));
    }
    // A folder entry counts as an entry of the ZIP but not as a file; allow one per file.
    let shape = ArchiveShape { max_entries: max_files * 2, max_total_bytes: max_expanded, allow_directory_prefix: true, peek_only: true };
    let entries = archive_entries_with(bytes, &shape).map_err(|failure| format!("{what}: {}", failure.reason))?;
    if entries.len() > max_files {
        return Err(format!("{what} has more than {max_files} files"));
    }
    if let Some((name, _)) = entries.iter().find(|(_, content)| content.len() > max_file) {
        return Err(format!("{what}: {name} is larger than {max_file} bytes"));
    }
    Ok(entries.into_iter().collect())
}

/// Read an attachment's bytes into the entry lists the kit takes (ADR-0027 §4.3 outerEntries / innerEntries).
pub(crate) fn read_standard_attachment_bytes(bytes: &[u8]) -> AttachmentRead {
    let outer = match open(bytes, ATTACHMENT_OUTER_MAX_ARCHIVE, ATTACHMENT_OUTER_MAX_FILE, ATTACHMENT_OUTER_MAX_EXPANDED, ATTACHMENT_OUTER_MAX_FILES, "the attachment ZIP") {
        Ok(entries) => entries,
        Err(reason) => return refused(reason),
    };
    let mut inner_entries = BTreeMap::new();
    for (name, content) in &outer {
        if !name.ends_with(ATTACHMENT_INNER_SUFFIX) {
            continue;
        }
        let inner = match open(content, ATTACHMENT_INNER_MAX_ARCHIVE, ATTACHMENT_INNER_MAX_FILE, ATTACHMENT_INNER_MAX_EXPANDED, ATTACHMENT_INNER_MAX_FILES, name) {
            Ok(entries) => entries,
            Err(reason) => return refused(reason),
        };
        let list = inner.iter().map(|(n, b)| AttachmentEntry { name: n.clone(), bytes_base64: base64_encode(b) }).collect();
        inner_entries.insert(name.clone(), list);
    }
    AttachmentRead {
        status: "READ",
        code: None,
        reason: String::new(),
        outer_entries: outer.iter().map(|(n, b)| AttachmentEntry { name: n.clone(), bytes_base64: base64_encode(b) }).collect(),
        inner_entries,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn push_u16(output: &mut Vec<u8>, value: u16) {
        output.extend_from_slice(&value.to_le_bytes());
    }
    fn push_u32(output: &mut Vec<u8>, value: u32) {
        output.extend_from_slice(&value.to_le_bytes());
    }
    /// A stored (method 0) ZIP, as SAKU Builder's storedZip writes it.
    fn stored_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut output = Vec::new();
        let mut central = Vec::new();
        for (name, content) in entries {
            let offset = u32::try_from(output.len()).unwrap();
            let crc = crate::crc32(content);
            push_u32(&mut output, 0x0403_4b50);
            push_u16(&mut output, 20);
            push_u16(&mut output, 0x0800);
            push_u16(&mut output, 0);
            push_u16(&mut output, 0);
            push_u16(&mut output, 0);
            push_u32(&mut output, crc);
            push_u32(&mut output, u32::try_from(content.len()).unwrap());
            push_u32(&mut output, u32::try_from(content.len()).unwrap());
            push_u16(&mut output, u16::try_from(name.len()).unwrap());
            push_u16(&mut output, 0);
            output.extend_from_slice(name.as_bytes());
            output.extend_from_slice(content);
            central.push((*name, content.len(), crc, offset));
        }
        let central_offset = u32::try_from(output.len()).unwrap();
        for (name, len, crc, offset) in &central {
            push_u32(&mut output, 0x0201_4b50);
            push_u16(&mut output, 20);
            push_u16(&mut output, 20);
            push_u16(&mut output, 0x0800);
            push_u16(&mut output, 0);
            push_u16(&mut output, 0);
            push_u16(&mut output, 0);
            push_u32(&mut output, *crc);
            push_u32(&mut output, u32::try_from(*len).unwrap());
            push_u32(&mut output, u32::try_from(*len).unwrap());
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
        push_u16(&mut output, u16::try_from(central.len()).unwrap());
        push_u16(&mut output, u16::try_from(central.len()).unwrap());
        push_u32(&mut output, central_size);
        push_u32(&mut output, central_offset);
        push_u16(&mut output, 0);
        output
    }

    #[test]
    fn base64_known_answers() {
        for (input, expected) in [("", ""), ("f", "Zg=="), ("fo", "Zm8="), ("foo", "Zm9v"), ("foob", "Zm9vYg=="), ("fooba", "Zm9vYmE="), ("foobar", "Zm9vYmFy")] {
            assert_eq!(base64_encode(input.as_bytes()), expected, "{input}");
        }
        assert_eq!(base64_encode(&[0xff, 0xfe, 0xfd]), "//79");
    }

    #[test]
    fn the_limits_are_the_kits() {
        // scripts/verify_agent_skills_attachment.mjs compares these with the kit's export (N-f); this pins the numbers here too.
        assert_eq!([ATTACHMENT_OUTER_MAX_ARCHIVE, ATTACHMENT_OUTER_MAX_FILE, ATTACHMENT_OUTER_MAX_EXPANDED, ATTACHMENT_OUTER_MAX_FILES], [64 << 20, 8 << 20, 128 << 20, 400]);
        assert_eq!([ATTACHMENT_INNER_MAX_ARCHIVE, ATTACHMENT_INNER_MAX_FILE, ATTACHMENT_INNER_MAX_EXPANDED, ATTACHMENT_INNER_MAX_FILES], [4 << 20, 2 << 20, 4 << 20, 8]);
        assert_eq!(ATTACHMENT_INNER_SUFFIX, ".agent-skill.zip");
    }

    #[test]
    fn an_attachment_is_handed_over_as_entry_lists() {
        let inner_a = stored_zip(&[("guide-a/", &b""[..]), ("guide-a/SKILL.md", &b"# A\n"[..]), ("guide-a/wi-t-overlay.json", &b"{}"[..])]);
        let inner_b = stored_zip(&[("guide-b/SKILL.md", &b"# B\n"[..])]);
        let outer = stored_zip(&[("standard-agent-skills.json", &b"{\"schema\":\"x\"}"[..]), ("guide-a.agent-skill.zip", &inner_a[..]), ("guide-b.agent-skill.zip", &inner_b[..])]);
        let read = read_standard_attachment_bytes(&outer);
        assert_eq!(read.status, "READ");
        assert_eq!(read.code, None);
        let names: Vec<&str> = read.outer_entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["guide-a.agent-skill.zip", "guide-b.agent-skill.zip", "standard-agent-skills.json"]);
        // The inner ZIP's raw bytes travel as the outer entry (the kit checks the index digest on them and saves them).
        assert_eq!(read.outer_entries[0].bytes_base64, base64_encode(&inner_a));
        assert_eq!(read.inner_entries.keys().cloned().collect::<Vec<_>>(), ["guide-a.agent-skill.zip", "guide-b.agent-skill.zip"]);
        // The folder entry is left out; the names keep their <character_id>/ prefix (the kit strips it).
        let a: Vec<&str> = read.inner_entries["guide-a.agent-skill.zip"].iter().map(|e| e.name.as_str()).collect();
        assert_eq!(a, ["guide-a/SKILL.md", "guide-a/wi-t-overlay.json"]);
        assert_eq!(read.inner_entries["guide-a.agent-skill.zip"][0].bytes_base64, base64_encode(b"# A\n"));
    }

    #[test]
    fn a_name_ending_in_a_slash_with_content_is_handed_over() {
        // 統括 照らし N-1 (2026-10-22): only a folder entry (size 0) is left out by the host. A name ending "/" that has
        // content is handed over as it is, so that the kit refuses it (ATTACHMENT_PATH_UNSAFE, ADR-0027 §1.2 NG-C).
        let inner = stored_zip(&[("guide-a/SKILL.md", &b"# A\n"[..]), ("guide-a/x/", &b"content"[..])]);
        let outer = stored_zip(&[("standard-agent-skills.json", &b"{}"[..]), ("guide-a.agent-skill.zip", &inner[..]), ("folder/", &b"data"[..])]);
        let read = read_standard_attachment_bytes(&outer);
        assert_eq!(read.status, "READ");
        assert!(read.outer_entries.iter().any(|e| e.name == "folder/" && e.bytes_base64 == base64_encode(b"data")), "the outer name ending in / with content is kept");
        let a = &read.inner_entries["guide-a.agent-skill.zip"];
        assert!(a.iter().any(|e| e.name == "guide-a/x/" && e.bytes_base64 == base64_encode(b"content")), "the inner name ending in / with content is kept");
        assert_eq!(a.len(), 2);
    }

    #[test]
    fn what_the_host_cannot_open_is_attachment_zip_invalid() {
        let not_zip = read_standard_attachment_bytes(b"not a zip");
        assert_eq!((not_zip.status, not_zip.code), ("REFUSED", Some("ATTACHMENT_ZIP_INVALID")));
        assert!(not_zip.outer_entries.is_empty() && not_zip.inner_entries.is_empty());
        let broken_inner = stored_zip(&[("standard-agent-skills.json", &b"{}"[..]), ("guide-a.agent-skill.zip", &b"not a zip"[..])]);
        assert_eq!(read_standard_attachment_bytes(&broken_inner).code, Some("ATTACHMENT_ZIP_INVALID"));
        let big_inner = vec![0u8; ATTACHMENT_INNER_MAX_ARCHIVE + 1];
        let too_big = stored_zip(&[("guide-a.agent-skill.zip", &big_inner[..])]);
        let read = read_standard_attachment_bytes(&too_big);
        assert_eq!(read.code, Some("ATTACHMENT_ZIP_INVALID"));
        assert!(read.reason.contains("larger than"), "{}", read.reason);
        let big_file = vec![0u8; ATTACHMENT_OUTER_MAX_FILE + 1];
        assert_eq!(read_standard_attachment_bytes(&stored_zip(&[("extra.bin", &big_file[..])])).code, Some("ATTACHMENT_ZIP_INVALID"));
        let names: Vec<String> = (0..9).map(|i| format!("guide-a/f{i}.md")).collect();
        let many: Vec<(&str, &[u8])> = names.iter().map(|n| (n.as_str(), b"x" as &[u8])).collect();
        let crowded = stored_zip(&[("guide-a.agent-skill.zip", &stored_zip(&many)[..])]);
        assert_eq!(read_standard_attachment_bytes(&crowded).code, Some("ATTACHMENT_ZIP_INVALID"));
    }
}
