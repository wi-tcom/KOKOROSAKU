// A self-made Character as a ZIP: `<slug>.saku-character.zip` (Owner 2026-09-27, via 統括:
// 「SAKU に ZIP 書き出しを足す」; KOKOROAMU-STUDIO DECISION 2026-09-27-10, AMU accepted the shape
// on 2026-09-27). AMU Studio imports it as 「自作・未確認」.
//
// Two entries, flat, in this order:
//   1. saku-character-manifest.json — the list. Named apart from the publisher's
//      portable-manifest.json so the two cannot be mistaken for each other.
//   2. character.json — the Unified Character, the same bytes as the JSON download.
//
// There is no signature. The manifest says "signature": "NONE" and has no `package` field,
// which is how the publisher's signed archive (`<slug>.kokorosaku.zip`) differs. The digests
// only detect a change after export; they prove nothing about who made the file.
// `export_checks` and `created_at` are self-reported: AMU shows them and never decides on them.
//
// The ZIP is stored (no compression) with a fixed time, so the bytes are a pure function of
// the Character bytes and the manifest fields (created_at included).
import { canonicalJson } from "./external-review-intake.mjs";

export const SELF_MADE_FORMAT = "saku-self-made-character";
export const SELF_MADE_FORMAT_VERSION = "1";
export const SELF_MADE_MANIFEST_NAME = "saku-character-manifest.json";
export const SELF_MADE_CHARACTER_NAME = "character.json";
export const SELF_MADE_ZIP_SUFFIX = ".saku-character.zip";
const ENTRY_ORDER = Object.freeze([SELF_MADE_MANIFEST_NAME, SELF_MADE_CHARACTER_NAME]);

const utf8 = text => new TextEncoder().encode(String(text));
async function sha256Hex(bytes) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error("SHA256_UNAVAILABLE");
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
const digestOf = async bytes => `sha-256:${await sha256Hex(bytes)}`;

let CRC_TABLE = null;
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// 1980-01-01 00:00:00 in MS-DOS form: the earliest time a ZIP can carry, the same for every export.
const DOS_TIME = 0x0000;
const DOS_DATE = 0x0021;

/** A stored (method 0) ZIP of the entries, in the given order. Names must be ASCII. */
export function storedZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, bytes } of entries) {
    if (!/^[\x20-\x7e]+$/.test(name)) throw new Error("ZIP_NAME_NOT_ASCII");
    const nameBytes = utf8(name);
    const crc = crc32(bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0, true);
    local.setUint16(8, 0, true); local.setUint16(10, DOS_TIME, true); local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true); local.setUint32(18, bytes.length, true); local.setUint32(22, bytes.length, true);
    local.setUint16(26, nameBytes.length, true); local.setUint16(28, 0, true);
    locals.push(new Uint8Array(local.buffer), nameBytes, bytes);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true); central.setUint16(4, 20, true); central.setUint16(6, 20, true);
    central.setUint16(8, 0, true); central.setUint16(10, 0, true); central.setUint16(12, DOS_TIME, true);
    central.setUint16(14, DOS_DATE, true); central.setUint32(16, crc, true); central.setUint32(20, bytes.length, true);
    central.setUint32(24, bytes.length, true); central.setUint16(28, nameBytes.length, true); central.setUint16(30, 0, true);
    central.setUint16(32, 0, true); central.setUint16(34, 0, true); central.setUint16(36, 0, true);
    central.setUint32(38, 0, true); central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), nameBytes);
    offset += 30 + nameBytes.length + bytes.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true);
  end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

/**
 * Reads a ZIP strictly for this format: stored entries only, a central directory that agrees
 * with each local header, CRCs that match. Returns { entries: [{name, bytes}], errors }.
 */
export function readStoredZip(bytes) {
  const errors = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = at => view.getUint32(at, true);
  const u16 = at => view.getUint16(at, true);
  let eocd = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) {
    if (at >= 0 && u32(at) === 0x06054b50) { eocd = at; break; }
  }
  if (eocd < 0) return { entries: [], errors: ["ZIP_NOT_READABLE"] };
  const count = u16(eocd + 10);
  let at = u32(eocd + 16);
  const entries = [];
  for (let index = 0; index < count; index++) {
    if (at + 46 > bytes.length || u32(at) !== 0x02014b50) return { entries, errors: [...errors, "ZIP_NOT_READABLE"] };
    const method = u16(at + 10);
    const crc = u32(at + 16);
    const compressed = u32(at + 20);
    const size = u32(at + 24);
    const nameLength = u16(at + 28);
    const extraLength = u16(at + 30);
    const commentLength = u16(at + 32);
    const localAt = u32(at + 42);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (method !== 0 || compressed !== size) { errors.push(`ZIP_ENTRY_NOT_STORED:${name}`); continue; }
    if (localAt + 30 > bytes.length || u32(localAt) !== 0x04034b50) { errors.push(`ZIP_NOT_READABLE:${name}`); continue; }
    const localNameLength = u16(localAt + 26);
    const localName = new TextDecoder().decode(bytes.subarray(localAt + 30, localAt + 30 + localNameLength));
    if (localName !== name) { errors.push(`ZIP_ENTRY_NAME_MISMATCH:${name}`); continue; }
    const start = localAt + 30 + localNameLength + u16(localAt + 28);
    const data = bytes.subarray(start, start + size);
    if (data.length !== size || crc32(data) !== crc) { errors.push(`ZIP_ENTRY_CRC_MISMATCH:${name}`); continue; }
    entries.push({ name, bytes: data });
  }
  return { entries, errors };
}

/** The manifest for a Character's JSON text (the exact bytes the JSON download writes). */
export async function selfMadeManifest({ characterText, appVersion = null, createdAt, exportChecks }) {
  const character = JSON.parse(characterText);
  const identity = character.identity || {};
  const schema = character.schema || {};
  const characterBytes = utf8(characterText);
  const manifest = {
    format: SELF_MADE_FORMAT,
    format_version: SELF_MADE_FORMAT_VERSION,
    character: { character_id: identity.character_id ?? null, character_revision: identity.character_revision ?? null, display_name: identity.display_name ?? null },
    schema: { schema_id: schema.schema_id ?? null, schema_version: schema.schema_version ?? null },
    files: [{ path: SELF_MADE_CHARACTER_NAME, bytes: characterBytes.length, digest: await digestOf(characterBytes) }],
    created_by: { product: "SAKU Builder", app_version: appVersion },
    created_at: createdAt,
    export_checks: exportChecks,
    signature: "NONE",
  };
  manifest.manifest_digest = await digestOf(utf8(canonicalJson(manifest)));
  return manifest;
}

/** The time as the manifest writes it: UTC, whole seconds. */
export const manifestTime = (date = new Date()) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

/** Builds `<slug>.saku-character.zip`. Returns { filename, bytes, manifest }. */
export async function buildSelfMadeCharacterZip({ slug, characterText, appVersion = null, createdAt = manifestTime(), exportChecks }) {
  const safeSlug = String(slug || "").replace(/[^a-z0-9-]/g, "") || "character";
  const manifest = await selfMadeManifest({ characterText, appVersion, createdAt, exportChecks });
  const bytes = storedZip([
    { name: SELF_MADE_MANIFEST_NAME, bytes: utf8(`${JSON.stringify(manifest, null, 2)}\n`) },
    { name: SELF_MADE_CHARACTER_NAME, bytes: utf8(characterText) },
  ]);
  return { filename: `${safeSlug}${SELF_MADE_ZIP_SUFFIX}`, bytes, manifest };
}

/**
 * The refusal rules AMU applies on import (統括 2026-09-27), checked here too so SAKU's own
 * export is held to them. The Schema check of character.json is the reader's own and is not
 * repeated here. Returns { ok, errors, manifest, character }.
 */
export async function checkSelfMadeCharacterZip(bytes) {
  const { entries, errors } = readStoredZip(bytes);
  const names = entries.map(entry => entry.name);
  if (names.length !== new Set(names).size) errors.push("ZIP_ENTRY_DUPLICATE");
  const undeclared = names.filter(name => !ENTRY_ORDER.includes(name));
  if (undeclared.length) errors.push(`ZIP_ENTRY_UNDECLARED:${undeclared.join(",")}`);
  for (const name of ENTRY_ORDER) if (!names.includes(name)) errors.push(`ZIP_ENTRY_MISSING:${name}`);
  if (entries.length !== 2) errors.push("ZIP_ENTRY_COUNT_NOT_TWO");
  const byName = new Map(entries.map(entry => [entry.name, entry.bytes]));
  let manifest = null;
  let character = null;
  try { manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(byName.get(SELF_MADE_MANIFEST_NAME) || new Uint8Array())); }
  catch { errors.push("MANIFEST_NOT_JSON"); }
  try { character = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(byName.get(SELF_MADE_CHARACTER_NAME) || new Uint8Array())); }
  catch { errors.push("CHARACTER_NOT_JSON"); }
  if (manifest && typeof manifest === "object") {
    if (manifest.format !== SELF_MADE_FORMAT) errors.push("FORMAT_NOT_SELF_MADE");
    if (manifest.signature !== "NONE") errors.push("SIGNATURE_NOT_NONE");
    if (Object.hasOwn(manifest, "package")) errors.push("PACKAGE_FIELD_PRESENT");
    const declared = Array.isArray(manifest.files) ? manifest.files : [];
    if (declared.length !== 1 || declared[0]?.path !== SELF_MADE_CHARACTER_NAME) errors.push("FILES_NOT_ONLY_CHARACTER");
    const characterBytes = byName.get(SELF_MADE_CHARACTER_NAME);
    if (characterBytes && declared[0]) {
      if (declared[0].bytes !== characterBytes.length || declared[0].digest !== await digestOf(characterBytes)) errors.push("FILE_DIGEST_MISMATCH");
    }
    const { manifest_digest: stated, ...rest } = manifest;
    if (stated !== await digestOf(utf8(canonicalJson(rest)))) errors.push("MANIFEST_DIGEST_MISMATCH");
    if (character && typeof character === "object") {
      const identity = character.identity || {};
      const listed = manifest.character || {};
      for (const key of ["character_id", "character_revision", "display_name"]) {
        if (listed[key] !== identity[key]) errors.push(`CHARACTER_FIELD_MISMATCH:${key}`);
      }
    }
  }
  return { ok: errors.length === 0, errors, manifest, character };
}
