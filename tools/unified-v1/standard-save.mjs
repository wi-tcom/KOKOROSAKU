// The standard save of ④出力 (SAKU β.13, 後の一覧 L19; ADR-0027 §4.3, design v4 §7.2 「標準保存」). SAKU Builder's own glue
// between the host and the shared kit; not part of the kit (AMU builds the same inputs from its own parts).
//
//   the host's attachment read (choose_standard_attachment: base64 entries)  → decodeAttachmentRead → outerEntries, innerEntries
//   the list rows of the chosen pack                                          → packFactsFromRows   → pack
//   verifyStandardAttachment (kit)                                            → standardSaveTarget  → what may be saved
//
// Only a VALID nameplate is saved, with its outer entry's bytes as they are (§4.3, N-h); nothing is rebuilt or signed.
// The attachment is held for this session only (design v4 §3.3): nothing here writes it anywhere.
import { originOf } from "./character-library.mjs";

const HEX64 = /^[a-f0-9]{64}$/;

const bytesOfBase64 = text => {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

/**
 * The host's read (status READ with base64 entries) as the kit's entry lists, or null with the host's refusal code.
 * A read the host refused (ATTACHMENT_ZIP_INVALID) is passed on as it is.
 */
export function decodeAttachmentRead(read) {
  if (!read || read.status !== "READ" || !Array.isArray(read.outer_entries) || !read.inner_entries || typeof read.inner_entries !== "object") {
    return { ok: false, code: read && typeof read.code === "string" ? read.code : "ATTACHMENT_ZIP_INVALID" };
  }
  try {
    const decode = list => list.map(e => ({ name: String(e.name), bytes: bytesOfBase64(String(e.bytes_base64)) }));
    const innerEntries = {};
    for (const [file, list] of Object.entries(read.inner_entries)) innerEntries[file] = decode(Array.isArray(list) ? list : []);
    return { ok: true, outerEntries: decode(read.outer_entries), innerEntries };
  } catch {
    return { ok: false, code: "ATTACHMENT_ZIP_INVALID" };
  }
}

const characterIdOf = entry => String(entry?.character?.identity?.character_id || "");

/**
 * The checked original pack's facts (ADR-0027 §4.3 `pack`) from the list: the chosen row must be a pack row (PACK),
 * and every row of the same pack and version (deleted rows too — they are still members) gives a member. null with a
 * reason when it cannot be given:
 *   NOT_A_PACK_ROW     the chosen row is not an unedited pack Character
 *   NEEDS_REIMPORT     the pack was imported before the host recorded the whole file's SHA-256 (β.12 and earlier)
 *   MEMBER_INCOMPLETE  a member row lacks its revision or digest (an older import)
 * The verification is the rows' signature state: PASS, or DIGEST_ONLY (no Ed25519 in this WebView2).
 */
export function packFactsFromRows(entries, chosen) {
  const origin = originOf(chosen || {});
  if (origin.kind !== "PACK") return { pack: null, reason: "NOT_A_PACK_ROW" };
  const p = chosen.provenance;
  if (typeof p.pack_zip_sha256 !== "string" || !HEX64.test(p.pack_zip_sha256)) return { pack: null, reason: "NEEDS_REIMPORT" };
  const rows = (entries || []).filter(e => {
    const o = originOf(e);
    return o.kind === "PACK" && o.pack_id === p.pack_id && o.pack_version === (p.pack_version || "") && e.provenance.pack_zip_sha256 === p.pack_zip_sha256;
  });
  const members = [];
  const seen = new Set();
  for (const row of rows) {
    const id = characterIdOf(row);
    if (seen.has(id)) continue;
    const revision = row.provenance.source_version;
    const digest = row.provenance.character_digest;
    if (!id || typeof revision !== "string" || !revision || typeof digest !== "string" || !HEX64.test(digest)) return { pack: null, reason: "MEMBER_INCOMPLETE" };
    seen.add(id);
    members.push({ character_id: id, character_revision: revision, character_digest: digest });
  }
  const verification = p.signature_state === "PASS" ? "PASS" : p.signature_state === "DIGEST_ONLY" ? "DIGEST_ONLY" : null;
  if (!verification) return { pack: null, reason: "NOT_A_PACK_ROW" };
  return { pack: { pack_id: p.pack_id, pack_version: p.pack_version || "", zip_sha256: p.pack_zip_sha256, verification, members }, reason: null };
}

/**
 * What ④ may do for the chosen Character with the kit's answer:
 *   { saveable: true, file, bytes, nameplate }   a VALID nameplate: save `bytes` (the outer entry, unchanged) as `file`
 *   { saveable: false, code }                    the attachment was refused as a whole (no nameplate is shown)
 *   { saveable: false, nameplate }               the Character's nameplate is not VALID (shown, not saved)
 *   { saveable: false, code: "CHARACTER_NOT_IN_ATTACHMENT" }   the attachment does not carry the chosen Character
 */
export function standardSaveTarget(result, outerEntries, characterId) {
  if (!result || result.code) return { saveable: false, code: result?.code || "ATTACHMENT_INPUT_INVALID" };
  const ch = (result.characters || []).find(c => c.character_id === characterId);
  if (!ch) return { saveable: false, code: "CHARACTER_NOT_IN_ATTACHMENT" };
  if (ch.nameplate.state !== "VALID") return { saveable: false, nameplate: ch.nameplate };
  const outer = (outerEntries || []).find(e => e.name === ch.file);
  if (!outer) return { saveable: false, code: "ATTACHMENT_FILE_MISSING" };
  return { saveable: true, file: ch.file, bytes: outer.bytes, nameplate: ch.nameplate, zip_sha256: ch.zip_sha256 };
}
