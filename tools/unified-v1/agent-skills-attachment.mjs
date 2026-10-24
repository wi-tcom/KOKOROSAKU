// The standard Agent Skills attachment reader of the shared kit (ADR-0027, wi-tcom/ADR 5ffcf08; SAKU β.13 U1b-2).
// SAKU Builder and AMU Studio read a pack's attachment ZIP with this one module (AMU copies it with the kit, S1b). Each
// product opens the ZIP containers (SAKU: the Rust host; AMU: readZipEntries) and hands the entries here; this module
// takes it from the entry lists on: it counts again, checks paths, the index, the bytes, every nameplate
// (character-export.mjs verifyNameplate), the binding to the chosen pack and its membership — in that order (§4.3).
// The index is not an authority (§1.4): only a VALID nameplate bound to the chosen, checked pack is standard.
// Nothing here signs (FIX 8) or writes; the reference in wi-tcom/ADR (src/agent-skills-attachment.mjs) is for its tests
// only and is not copied (§0 P-1). The same vectors run through this module (scripts/verify_agent_skills_attachment.mjs).
import { OVERLAY_FILE, ExportError, verifyNameplate, verifyEd25519Hex, nameplateFor } from "./character-export.mjs";

export const ATTACHMENT_INDEX_SCHEMA = "wi-t.agent-skills-standard-attachment/1";
export const ATTACHMENT_INDEX_FILE = "standard-agent-skills.json";
export const SKILL_ZIP_SUFFIX = ".agent-skill.zip";
const MiB = 1024 * 1024;
/** The attachment ZIP (§1.1; the same numbers as the pack reader's PACK_LIMITS). Names as readZipEntries takes them. */
export const OUTER_ZIP_LIMITS = Object.freeze({ maxArchive: 64 * MiB, maxFile: 8 * MiB, maxExpanded: 128 * MiB, maxFiles: 400 });
/** One <character_id>.agent-skill.zip (§1.2; the whole ZIP 4 MiB = SAKU Builder's save door, SELF_MADE_ZIP_MAX). */
export const INNER_ZIP_LIMITS = Object.freeze({ maxArchive: 4 * MiB, maxFile: 2 * MiB, maxExpanded: 4 * MiB, maxFiles: 8 });

/** The refusals of the attachment and binding steps (§4.4, a closed list). Per-nameplate codes are separate. */
export const ATTACHMENT_CODES = Object.freeze([
  "ATTACHMENT_INPUT_INVALID", "ATTACHMENT_ZIP_INVALID", "ATTACHMENT_TOO_LARGE", "ATTACHMENT_PATH_UNSAFE", "ATTACHMENT_DUPLICATE_ENTRY",
  "ATTACHMENT_INDEX_MISSING", "ATTACHMENT_INDEX_INVALID", "ATTACHMENT_SCHEMA_UNKNOWN", "ATTACHMENT_FILE_NOT_LISTED", "ATTACHMENT_FILE_MISSING",
  "ATTACHMENT_INNER_MISSING", "ATTACHMENT_INNER_UNEXPECTED", "ATTACHMENT_INDEX_DIGEST_MISMATCH", "ATTACHMENT_ENTRY_NOT_UTF8",
  "ATTACHMENT_PACK_NOT_SELECTED", "ATTACHMENT_PACK_MISMATCH", "ATTACHMENT_PACKAGE_DIGEST_MISSING", "ATTACHMENT_PACKAGE_DIGEST_WRONG_KIND",
]);

const SEGMENT = /^[A-Za-z0-9._-]+$/;
const HEX64 = /^[a-f0-9]{64}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKILL_FILE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.agent-skill\.zip$/;
const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const hasExactly = (o, keys, optional = []) => isObj(o) && keys.every(k => own(o, k)) && Object.keys(o).every(k => keys.includes(k) || optional.includes(k));
// The schema's minLength/maxLength count characters (code points).
const isStr = (v, max = Infinity) => typeof v === "string" && v.length > 0 && [...v].length <= max;

/** The pack reader's safePath (§1.1): no leading "/", no "." or ".." segment, only [A-Za-z0-9._-] in each segment. */
export const isSafePath = p => typeof p === "string" && p.length > 0 && p.length <= 240 && !p.startsWith("/") && p.split("/").every(seg => SEGMENT.test(seg) && seg !== "." && seg !== "..");
/** An entry of one inner ZIP: under <character_id>/ only (§1.2). */
export const isSafeInnerPath = characterId => p => typeof p === "string" && p.startsWith(`${characterId}/`) && p.length > characterId.length + 1 && isSafePath(p);

// Bytes to text (§1.3): valid UTF-8 only; a BOM stays as U+FEFF, so encoding the text again gives the same bytes.
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const decodeText = bytes => { try { return decoder.decode(bytes); } catch { return null; } };

async function sha256HexOfBytes(bytes) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new ExportError("CRYPTO_UNAVAILABLE", "WebCrypto is not available");
  // A digest that rejects (a DOMException) is the same as no SHA-256 here: the attachment is refused in the shape of §4.3
  // (00A ANSWER_2026-10-22_adr0027_no_sha256), never a rejected Promise.
  let digest;
  try { digest = await subtle.digest("SHA-256", bytes); } catch { throw new ExportError("CRYPTO_UNAVAILABLE", "SHA-256 did not run"); }
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

// ── The index's shape (§1.1; schemas/agent-skills-standard-attachment/attachment-index.schema.json, by hand) ──────
const isDigestRef = d => hasExactly(d, ["algorithm", "value"]) && d.algorithm === "sha-256" && typeof d.value === "string" && HEX64.test(d.value);
const leapYear = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function isDateTime(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(text);
  if (!m) return false;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > (mo === 2 && leapYear(y) ? 29 : DAYS[mo - 1]) || h > 23 || mi > 59 || s > 59) return false;
  return m[7] === undefined || (Number(m[8]) <= 23 && Number(m[9]) <= 59);
}
/** null when the index fits; ATTACHMENT_SCHEMA_UNKNOWN for another name; ATTACHMENT_INDEX_INVALID otherwise. */
export function checkAttachmentIndexShape(index) {
  if (!isObj(index) || index.schema !== ATTACHMENT_INDEX_SCHEMA) return "ATTACHMENT_SCHEMA_UNKNOWN";
  const bad = "ATTACHMENT_INDEX_INVALID";
  if (!hasExactly(index, ["schema", "pack", "entries", "created_at"])) return bad;
  const p = index.pack;
  if (!hasExactly(p, ["pack_id", "pack_version", "package_digest"]) || !isStr(p.pack_id, 128) || !isStr(p.pack_version, 64) || !isDigestRef(p.package_digest)) return bad;
  if (!Array.isArray(index.entries) || index.entries.length < 1 || index.entries.length > 399) return bad;
  for (const e of index.entries) {
    if (!hasExactly(e, ["character_id", "character_revision", "file", "zip_sha256"])) return bad;
    if (typeof e.character_id !== "string" || [...e.character_id].length > 64 || !SLUG.test(e.character_id) || !isStr(e.character_revision, 64)) return bad;
    if (typeof e.file !== "string" || [...e.file].length > 80 || !SKILL_FILE_NAME.test(e.file) || !isDigestRef(e.zip_sha256)) return bad;
  }
  if (typeof index.created_at !== "string" || !isDateTime(index.created_at)) return bad;
  return null;
}

// ── The entry point (§4.3) ─────────────────────────────────────────────────────────────────────────────────────
const isEntryList = list => Array.isArray(list) && list.every(e => hasExactly(e, ["name", "bytes"]) && typeof e.name === "string" && e.bytes instanceof Uint8Array);
const isPackFacts = p => hasExactly(p, ["pack_id", "pack_version", "zip_sha256", "verification", "members"], ["other_digests"]) && isStr(p.pack_id) && isStr(p.pack_version)
  && typeof p.zip_sha256 === "string" && HEX64.test(p.zip_sha256) && ["PASS", "DIGEST_ONLY"].includes(p.verification)
  && Array.isArray(p.members) && p.members.every(m => hasExactly(m, ["character_id", "character_revision", "character_digest"]) && isStr(m.character_id) && isStr(m.character_revision) && typeof m.character_digest === "string" && HEX64.test(m.character_digest))
  && (p.other_digests === undefined || (Array.isArray(p.other_digests) && p.other_digests.every(d => typeof d === "string")));
const refuse = code => ({ code, characters: [] });
const invalid = code => ({ status: "invalid", code });

// Count again what the product's ZIP reader handed over. A folder entry (size 0, name ending "/") is skipped; a name
// ending "/" with content is refused (NG-C). Duplicates include names that differ only in case.
function sweepEntries(list, limits, pathOk) {
  const files = new Map();
  const lower = new Set();
  let total = 0;
  for (const e of list) {
    if (e.name.endsWith("/")) { if (e.bytes.length === 0) continue; return { code: "ATTACHMENT_PATH_UNSAFE" }; }
    if (!pathOk(e.name)) return { code: "ATTACHMENT_PATH_UNSAFE" };
    if (files.has(e.name) || lower.has(e.name.toLowerCase())) return { code: "ATTACHMENT_DUPLICATE_ENTRY" };
    if (e.bytes.length > limits.maxFile) return { code: "ATTACHMENT_TOO_LARGE" };
    total += e.bytes.length;
    files.set(e.name, e.bytes);
    lower.add(e.name.toLowerCase());
  }
  if (files.size > limits.maxFiles || total > limits.maxExpanded) return { code: "ATTACHMENT_TOO_LARGE" };
  return { files };
}

/**
 * verifyStandardAttachment({ outerEntries, innerEntries, pack, trustIndex, verifySignature }) → Promise<{ code, characters }>
 *   outerEntries   [{ name, bytes: Uint8Array }] — the attachment ZIP's entries, opened by the product
 *   innerEntries   { [file]: [{ name, bytes }] } — each <character_id>.agent-skill.zip opened by the product
 *   pack           the checked original pack's facts { pack_id, pack_version, zip_sha256, verification, members, other_digests? }, or null
 *   trustIndex, verifySignature   as verifyNameplate (character-export.mjs)
 * Steps (§4.3): 1 the attachment, 2 every nameplate, 3 the binding to the pack, 4 membership. A non-null code comes with
 * no characters. Only a character whose nameplate.state is VALID may be saved as standard, with the bytes of its
 * outer entry as they are (§4.3, N-h).
 */
export async function verifyStandardAttachment({ outerEntries, innerEntries, pack, trustIndex = null, verifySignature = verifyEd25519Hex }) {
  try {
    return await readAttachment({ outerEntries, innerEntries, pack, trustIndex, verifySignature });
  } catch (error) {
    // No SHA-256 in this runtime (none, or one that rejects): the attachment cannot be checked here. 00A 2026-10-22
    // (ANSWER_2026-10-22_adr0027_no_sha256): ATTACHMENT_PACK_NOT_SELECTED with no characters — unverified as a whole,
    // fail-closed. CRYPTO_UNAVAILABLE is a per-nameplate code and is not used at the attachment step. The screen words
    // keep this apart from "no pack chosen" (ライター&SNS).
    if (error instanceof ExportError && (error.code === "CRYPTO_UNAVAILABLE" || error.code === "SHA256_UNAVAILABLE")) return refuse("ATTACHMENT_PACK_NOT_SELECTED");
    throw error;
  }
}

async function readAttachment({ outerEntries, innerEntries, pack, trustIndex, verifySignature }) {
  // ── Step 1: the attachment ──
  if (!isEntryList(outerEntries) || !isObj(innerEntries) || !Object.values(innerEntries).every(isEntryList) || !(pack === null || pack === undefined || isPackFacts(pack))) return refuse("ATTACHMENT_INPUT_INVALID");
  const outer = sweepEntries(outerEntries, OUTER_ZIP_LIMITS, isSafePath);
  if (outer.code) return refuse(outer.code);
  if (!outer.files.has(ATTACHMENT_INDEX_FILE)) return refuse("ATTACHMENT_INDEX_MISSING");
  const indexText = decodeText(outer.files.get(ATTACHMENT_INDEX_FILE));
  if (indexText === null) return refuse("ATTACHMENT_ENTRY_NOT_UTF8");
  let index;
  try { index = JSON.parse(indexText); } catch { return refuse("ATTACHMENT_INDEX_INVALID"); }
  const shape = checkAttachmentIndexShape(index);
  if (shape) return refuse(shape);
  const ids = new Set();
  const names = new Set();
  for (const e of index.entries) {
    if (ids.has(e.character_id) || names.has(e.file)) return refuse("ATTACHMENT_DUPLICATE_ENTRY");
    if (e.file !== `${e.character_id}${SKILL_ZIP_SUFFIX}`) return refuse("ATTACHMENT_INDEX_INVALID");
    ids.add(e.character_id);
    names.add(e.file);
  }
  for (const name of outer.files.keys()) if (name !== ATTACHMENT_INDEX_FILE && !names.has(name)) return refuse("ATTACHMENT_FILE_NOT_LISTED");
  for (const name of names) if (!outer.files.has(name)) return refuse("ATTACHMENT_FILE_MISSING");
  for (const file of Object.keys(innerEntries)) if (!names.has(file)) return refuse("ATTACHMENT_INNER_UNEXPECTED");
  for (const name of names) if (!own(innerEntries, name)) return refuse("ATTACHMENT_INNER_MISSING");
  const inner = [];
  for (const e of index.entries) {
    // The inner ZIP's raw bytes are its outer entry's bytes: the index digest is checked on them, and they are what is saved.
    const zipBytes = outer.files.get(e.file);
    const zipSha = await sha256HexOfBytes(zipBytes);
    if (zipSha !== e.zip_sha256.value) return refuse("ATTACHMENT_INDEX_DIGEST_MISMATCH");
    if (zipBytes.length > INNER_ZIP_LIMITS.maxArchive) return refuse("ATTACHMENT_TOO_LARGE");
    const swept = sweepEntries(innerEntries[e.file], INNER_ZIP_LIMITS, isSafeInnerPath(e.character_id));
    if (swept.code) return refuse(swept.code);
    const files = {};
    const prefix = `${e.character_id}/`;
    for (const [name, bytes] of swept.files) {
      const text = decodeText(bytes);
      if (text === null) return refuse("ATTACHMENT_ENTRY_NOT_UTF8");
      files[name.slice(prefix.length)] = text;
    }
    if (!own(files, OVERLAY_FILE)) return refuse("ATTACHMENT_FILE_MISSING");
    inner.push({ entry: e, zipSha, files });
  }
  // ── Step 2: every nameplate (name → shape → the reference's checks), with the kit's verifyNameplate ──
  const characters = [];
  for (const { entry, zipSha, files } of inner) {
    let overlay = null;
    try { overlay = JSON.parse(files[OVERLAY_FILE]); } catch { overlay = null; }
    const content = { ...files };
    delete content[OVERLAY_FILE];
    let nameplate;
    if (overlay === null) {
      const result = invalid("OVERLAY_SHAPE_INVALID");
      nameplate = { ...nameplateFor(result, { trustIndex }), result };
    } else {
      nameplate = await verifyNameplate({ overlay, files: content, trustIndex, verifySignature });
    }
    // The index's own word and the nameplate disagree: the index is broken (an attachment-step refusal).
    if (nameplate.result.status === "valid" && overlay.character.character_id !== entry.character_id) return refuse("ATTACHMENT_INDEX_INVALID");
    characters.push({ character_id: entry.character_id, file: entry.file, zip_sha256: zipSha, overlay, nameplate });
  }
  // ── Step 3: the binding to the chosen, checked pack (§2) ──
  if (!pack || pack.verification !== "PASS") return refuse("ATTACHMENT_PACK_NOT_SELECTED");
  const ip = index.pack;
  if (ip.pack_id !== pack.pack_id || ip.pack_version !== pack.pack_version || ip.package_digest.value !== pack.zip_sha256) return refuse("ATTACHMENT_PACK_MISMATCH");
  // other_digests only picks the refusal code (WRONG_KIND or PACK_MISMATCH); a match there never accepts anything.
  const others = new Set((pack.other_digests ?? []).map(d => d.replace(/^sha-256:/, "")));
  for (const ch of characters) {
    if (ch.nameplate.state !== "VALID") continue;
    const s = ch.overlay.source;
    if (s.kind !== "PUBLISHER_PACK_ENTRY" || s.pack_id !== pack.pack_id) return refuse("ATTACHMENT_PACK_MISMATCH");
    if (!s.package_digest) return refuse("ATTACHMENT_PACKAGE_DIGEST_MISSING");
    if (s.package_digest.value !== pack.zip_sha256) return refuse(others.has(s.package_digest.value) ? "ATTACHMENT_PACKAGE_DIGEST_WRONG_KIND" : "ATTACHMENT_PACK_MISMATCH");
  }
  // ── Step 4: membership — look the Character up by its digest, then check its id and revision ──
  for (const ch of characters) {
    if (ch.nameplate.state !== "VALID") continue;
    const c = ch.overlay.character;
    const member = pack.members.find(m => m.character_digest === c.character_digest.value);
    if (!member || member.character_id !== c.character_id || member.character_revision !== c.character_revision) {
      const result = invalid("ATTACHMENT_NOT_PACK_MEMBER");
      ch.nameplate = { ...nameplateFor(result, { trustIndex }), result };
    }
  }
  return { code: null, characters: characters.map(({ overlay, ...rest }) => rest) };
}
