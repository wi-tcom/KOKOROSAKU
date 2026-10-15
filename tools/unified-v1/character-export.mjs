// Character export to Agent Skills with the WI-T.COM layer (ADR-0026, PROPOSED; Owner 2026-10-03: the tool is
// SAKU Builder(4)'s, added to the Builder's exports). The canonical Character stays the SAKU Unified V1 one; an
// export is a copy made from it. One Character = one skill folder:
//
//   <character_id>/
//     SKILL.md                         frontmatter + a body made from the 03 layers (platform-prompt)
//     references/character.json        the canonical Character, as JSON
//     references/seat8-human-gate.md   Seat 8 is a person: the gate, from the Character's own handoff conditions
//     LICENSE.md                       the pack's LICENSE.md, when the pack ships one (ADR-0026 §11)
//     wi-t-overlay.json                the WI-T.COM layer (§5), unsigned: SAKU Builder never signs (§12-5)
//
// The constants, the name and license rules and the checks follow the reference implementation
// (wi-tcom/ADR src/character-export-overlay.mjs); scripts/verify_character_export.mjs runs that reference on what
// this module writes. This module uses WebCrypto (async) so that the desktop page can run it; the reference uses
// node:crypto. Nothing here imports the Trainer or the tuning modules.
import { canonicalJson } from "./canonical-json.mjs";
import { originOf } from "./character-library.mjs";

export class ExportError extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.name = "ExportError"; this.code = code; }
}

// Candidate values; fixed when ADR-0026 is adopted.
export const OVERLAY_SCHEMA = "wi-t.character-export-overlay/0-candidate";
export const OVERLAY_FILE = "wi-t-overlay.json";
export const CHARACTER_VERBATIM_PATH = "references/character.json";
export const SEAT8_GATE_PATH = "references/seat8-human-gate.md";
export const SKILL_FILE = "SKILL.md";
export const LICENSE_FILE = "LICENSE.md";
export const GENERATOR_ID = "saku-builder.character-export.agent-skills";
// The Agent Skills spec has no version number; the layer records the spec's name and the day it was checked.
export const TARGET_SPEC = Object.freeze({ name: "agentskills.io", version: "2026-08-04", checked_on: "2026-10-03" });
export const SELF_MADE_LICENSE = "NOASSERTION";   // 00A 2026-10-04
// A pack Character changed in SAKU (ADR-0026 §14, 00A candidate 2026-10-14, wi-tcom/ADR #32 d13c0d0, pinned as a Draft: Owner result 177): it keeps the pack's
// terms and is not WI-T.COM's (§10 第 3 項). UNSIGNED only; the pack's license id and LICENSE.md travel; derived_from names the pack.
export const PACK_DERIVED_KIND = "PUBLISHER_PACK_DERIVED";
const PACK_LICENSE_ID = /^LicenseRef-WIT-(?:Commercial|Subscriber|Sample)-[0-9]+\.[0-9]+$/;
const WRITABLE_SIGNATURE_STATES = new Set(["UNSIGNED", "SELF_SIGNED", "NOT_VERIFIED"]);

// ── Which exports a list row may have (Owner 結果 188, 00A QA13 Q27–Q30, 2026-10-14) ──────────────────────────────
// One check for the three exits (the self-made ZIP, Agent Skills, .json／.yaml), run before any bytes are made:
//   self-made                      zip, skill, text
//   a pack row, not edited         skill only (Q28: no self-made ZIP; Q29: no .json／.yaml)
//   a pack row edited in SAKU      zip (edited_from), skill (PUBLISHER_PACK_DERIVED); no .json／.yaml (Q29)
//   a self-made ZIP naming a pack  zip, skill; no .json／.yaml (Q29)
//   a return from AMU Studio       skill (traced to its pack); the ZIP comes after β.5 (結果 172); no .json／.yaml
//   origin unknown                 nothing (Q30)
//   the sample pack, or a pack whose license id is not known: nothing at all (Q27; the sample is read only)
export const EXPORT_KINDS = Object.freeze(["zip", "skill", "text"]);
const SAMPLE_PACK_ID = "saku-pack-sample";
const SAMPLE_LICENSE_ID = /^LicenseRef-WIT-Sample-/;
const KNOWN_SALE_LICENSE_ID = /^LicenseRef-WIT-(?:Commercial|Subscriber)-[0-9]+\.[0-9]+$/;

export function exportPermission(entry, kind) {
  const refuse = code => ({ ok: false, code });
  if (!EXPORT_KINDS.includes(kind)) return refuse("EXPORT_KIND_UNKNOWN");
  if (!entry) return refuse("ENTRY_NOT_RESOLVED");
  const provenance = entry.provenance || null;
  const viaReturn = Boolean(provenance && (provenance.via === "AMU_STUDIO_RETURN" || provenance.source === "AMU_STUDIO_RETURN"));
  const origin = viaReturn ? "AMU_RETURN" : originOf(entry).kind;
  if (origin === "SELF_MADE") return { ok: true, code: "SELF_MADE" };
  if (origin === "UNKNOWN") return refuse("ORIGIN_UNKNOWN");
  const pack = origin === "PACK" ? provenance : (provenance && provenance.edited_from) || provenance;
  const packId = String(pack && pack.pack_id || "");
  const license = String(pack && pack.license || "");
  if (viaReturn && !packId) return refuse("RETURN_PACK_UNKNOWN");
  if (packId === SAMPLE_PACK_ID || SAMPLE_LICENSE_ID.test(license)) return refuse("SAMPLE_NOT_EXPORTABLE");
  if (!KNOWN_SALE_LICENSE_ID.test(license) && !STALE_LICENSE_ID.test(license)) return refuse("PACK_LICENSE_UNKNOWN");
  if (kind === "text") return refuse("PACK_TEXT_NOT_EXPORTABLE");
  if (kind === "zip") {
    if (origin === "PACK") return refuse("PACK_ZIP_NOT_SELF_MADE");
    if (origin === "AMU_RETURN") return refuse("RETURN_ZIP_LATER");
  }
  return { ok: true, code: origin };
}

// ── The pack's license for an export (ADR-0026 §11) ───────────────────────────────────────────────────────────
// The packs sold so far carry the stale id wi-t.com-ai-product-terms-2026-09-16; the terms that apply are the bundled
// LICENSE.md, whose first heading names its version and whether it is the subscriber pack. The export writes the new
// id read from there, and stops when it cannot read it (00A 2026-10-03: 読めないときは止まる).
const LICENSE_HEADING = /^#\s*SAKU Character Pack\s*—\s*(Subscriber Pack\s+)?LICENSE（v([0-9]+\.[0-9]+)・/;
export function licenseIdFromLicenseMd(licenseText) {
  const first = String(licenseText || "").split(/\r?\n/, 1)[0] || "";
  const match = first.match(LICENSE_HEADING);
  if (!match) throw new ExportError("LICENSE_VERSION_UNREADABLE", "the pack's LICENSE.md does not name its version in the expected heading");
  return `LicenseRef-WIT-${match[1] ? "Subscriber" : "Commercial"}-${match[2]}`;
}

/** The id to write and whether LICENSE.md must travel: a WI-T.COM id needs the text; a stale id is mapped from it. */
export function exportLicenseFor(statedId, licenseText) {
  const stated = String(statedId || "");
  if (STALE_LICENSE_ID.test(stated)) {
    if (!licenseText) throw new ExportError("LICENSE_TEXT_MISSING", "the pack's LICENSE.md is not kept; import the pack again");
    return { license: licenseIdFromLicenseMd(licenseText), licenseText };
  }
  if (WI_T_LICENSE_ID.test(stated)) {
    if (!licenseText) throw new ExportError("LICENSE_TEXT_MISSING", "the pack's LICENSE.md is not kept; import the pack again");
    // The id the pack states and the version its LICENSE.md names must agree: two different texts never travel under one id.
    if (licenseIdFromLicenseMd(licenseText) !== stated) throw new ExportError("LICENSE_VERSION_MISMATCH", "the pack's license id and its LICENSE.md version differ");
  }
  return { license: stated, licenseText: licenseText || null };
}

// LICENSE.md is kept once per text (keyed by its SHA-256), not once per Character: a pack's 20 Characters share it.
export const PACK_LICENSE_STORE_KEY = "saku.workspace.packLicenses";
export function rememberPackLicense(storage, sha256, text) {
  try {
    const all = JSON.parse(storage.getItem(PACK_LICENSE_STORE_KEY) || "{}");
    if (all[sha256] !== text) { all[sha256] = text; storage.setItem(PACK_LICENSE_STORE_KEY, JSON.stringify(all)); }
    return true;
  } catch { return false; }
}
export function packLicenseText(storage, sha256) {
  if (!sha256) return null;
  try { return JSON.parse(storage.getItem(PACK_LICENSE_STORE_KEY) || "{}")[sha256] || null; } catch { return null; }
}

/**
 * The source block for a Library entry. A pack entry is PUBLISHER_PACK_ENTRY with the pack's license id and
 * NOT_VERIFIED (stage 1); anything else is SELF_MADE, UNSIGNED, NOASSERTION. A pack entry imported before the host
 * passed the license id on has none: it is refused (PACK_LICENSE_UNKNOWN) rather than guessed — import it again.
 */
export function exportSourceFor(entry, licenseLookup = () => null) {
  // G4: without the row the Character came from, its origin is unknown; it is not guessed as self-made.
  if (!entry) throw new ExportError("ENTRY_NOT_RESOLVED", "the list row of this Character is not known; choose it again in the list");
  const provenance = entry.provenance;
  // A return from AMU Studio is a candidate, not the Character (TV-B-09). Whether a candidate may be exported is the
  // Owner's to decide (00A 2026-10-14, outside §10); until then it is not written out.
  // 00A 2026-10-14 (ADR #32 §14-3, Owner 「確認のために払い出すので」): a return may be exported unsigned, with its
  // pack's terms. The caller traces it to its pack first (Library.editedProvenance(entry, entries)); untraced, it stops.
  if (provenance && provenance.source === "AMU_STUDIO_RETURN") {
    throw new ExportError("RETURN_PACK_UNKNOWN", "the pack this return came from is not in the list; import that pack, then export");
  }
  // A pack Character changed in SAKU keeps the pack's terms and is not WI-T.COM's (ADR-0026 §10, §14): PUBLISHER_PACK_DERIVED.
  if (provenance && provenance.kind === "PACK_EDITED" && provenance.edited_from) {
    const from = provenance.edited_from;
    if (!from.pack_id || !from.pack_version) throw new ExportError("PACK_DERIVED_ORIGIN_UNKNOWN", "the pack this Character was edited from is not recorded");
    if (!from.license) throw new ExportError("PACK_LICENSE_UNKNOWN", "the pack this Character was edited from carries no license id; import the pack again");
    const { license, licenseText } = exportLicenseFor(from.license, licenseLookup(from.license_md_sha256 || ""));
    if (!PACK_LICENSE_ID.test(license)) throw new ExportError("DERIVED_LICENSE_NOT_PACK", "a changed pack Character must carry the pack's license id");
    if (!licenseText) throw new ExportError("LICENSE_TEXT_MISSING", "the pack's LICENSE.md is not kept; import the pack again");
    return { source: { kind: PACK_DERIVED_KIND, signature_state: "UNSIGNED", license, derived_from: { pack_id: from.pack_id, pack_version: from.pack_version, license } }, licenseText };
  }
  // A self-made ZIP that names a pack records no license (its two-entry format has no room for one): the terms cannot be stated.
  if (provenance && provenance.kind === "SELF_MADE_ZIP" && provenance.edited_from) {
    throw new ExportError("PACK_DERIVED_LICENSE_UNKNOWN", "this ZIP names a pack but not its license; export from the row that was edited in SAKU");
  }
  if (provenance && typeof provenance.pack_id === "string" && provenance.pack_id) {
    // A pack whose signatures failed is not written out (00A 2026-10-04); the intake refuses such a pack anyway.
    if (provenance.signature_state === "FAIL") throw new ExportError("PACK_SIGNATURE_FAILED", "this pack entry failed its signature check");
    const stated = typeof provenance.license === "string" ? provenance.license : "";
    if (!stated) throw new ExportError("PACK_LICENSE_UNKNOWN", "this pack entry carries no license id; import the pack again");
    const { license, licenseText } = exportLicenseFor(stated, licenseLookup(provenance.license_md_sha256 || ""));
    return { source: { kind: "PUBLISHER_PACK_ENTRY", pack_id: provenance.pack_id, signature_state: "NOT_VERIFIED", license }, licenseText };
  }
  // G5: a row whose origin is not known (rebuilt from the workspace, an old handoff) is not guessed as self-made.
  if (originOf(entry).kind !== "SELF_MADE") throw new ExportError("ORIGIN_UNKNOWN", "where this Character came from is not known; import it again");
  return { source: { kind: "SELF_MADE", signature_state: "UNSIGNED", license: SELF_MADE_LICENSE }, licenseText: null };
}

const WI_T_LICENSE_ID = /^LicenseRef-WIT-(?:Commercial|Subscriber)-[0-9]+\.[0-9]+$/;
const STALE_LICENSE_ID = /^wi-t\.com-ai-product-terms-/;
const NAME_RULE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const encoder = new TextEncoder();
export async function sha256Hex(text) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new ExportError("SHA256_UNAVAILABLE", "WebCrypto is not available");
  const digest = await subtle.digest("SHA-256", encoder.encode(String(text)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Character digest by the profile saku.sha256-rfc8785-ijson@1.0.0, domain CHARACTER_FULL_SEMANTICS: SHA-256 of the JCS of the
 * preimage (domain, profile id/version, target Schema id/version, target id/revision, the whole Character incl. root extensions),
 * not of the bare Character. Source: -SAKU-1-7-Character-System@4817af7 schemas/saku-64alpha-foundation/digest-profile.v1.schema.json
 * (preimage_contract); same value as ADR c063088 characterFullDigest and KOKOROAMU-characterpack unifiedV1CharacterDigest
 * (00A 2026-10-07, ADR #27).
 */
export async function characterFullDigest(character) {
  const target = {
    target_schema_id: character?.schema?.schema_id, target_schema_version: character?.schema?.schema_version,
    target_id: character?.identity?.character_id, target_version: character?.identity?.character_revision,
  };
  for (const [member, value] of Object.entries(target)) {
    if (typeof value !== "string" || value.length === 0) throw new ExportError("CHARACTER_PREIMAGE_INCOMPLETE", `${member} is missing`);
  }
  const preimage = { digest_domain: "CHARACTER_FULL_SEMANTICS", digest_profile_id: "saku.sha256-rfc8785-ijson", digest_profile_version: "1.0.0", ...target, normative_payload: character };
  return sha256Hex(canonicalJson(preimage));
}

/** Agent Skills name = character_id (a-z 0-9 and -, no leading, trailing or double -, at most 64). Refused, never cut. */
export function skillNameFor(characterId) {
  if (typeof characterId !== "string" || !NAME_RULE.test(characterId)) throw new ExportError("SKILL_NAME_INVALID", "character_id does not fit the Agent Skills name rule");
  if (characterId.length > 64) throw new ExportError("SKILL_NAME_TOO_LONG", "character_id is longer than 64 characters; refused, never cut");
  return characterId;
}

/** SKILL.md license. A WI-T.COM id points at the bundled LICENSE.md; the stale pack id is refused, not copied. */
export function skillLicenseFor(license) {
  if (typeof license !== "string" || license.length === 0) throw new ExportError("LICENSE_ID_MISSING", "no license id");
  if (STALE_LICENSE_ID.test(license)) throw new ExportError("LICENSE_ID_STALE", "the pack carries the stale license id; map it from the bundled LICENSE.md version first");
  return WI_T_LICENSE_ID.test(license) ? `${license}. ${LICENSE_FILE} has complete terms` : license;
}

/** True when the id is one of WI-T.COM's own pack licenses (then LICENSE.md must travel with the export). */
export const isWitLicenseId = license => WI_T_LICENSE_ID.test(String(license || ""));

/** SKILL.md frontmatter (agentskills.io: name and description required; license, compatibility, metadata optional; metadata holds strings only). */
export function skillFrontmatter(character, overlay) {
  return {
    name: skillNameFor(character.identity.character_id),
    description: String(character.purpose.summary).slice(0, 1024),
    license: skillLicenseFor(overlay.source.license),
    compatibility: "Seat 8 decisions need a human; read references/seat8-human-gate.md. Verify wi-t-overlay.json before trusting the origin.",
    metadata: {
      "wi-t-character-id": overlay.character.character_id,
      "wi-t-character-revision": overlay.character.character_revision,
      "wi-t-character-digest": overlay.character.character_digest.value,
      "wi-t-overlay": OVERLAY_FILE,
      "wi-t-seat8": "human",
    },
  };
}

// YAML 1.2 reads a JSON string as a double-quoted scalar, so every value is written that way: no value can open a
// block, a comment or a new key, whatever the Character's text holds.
const yamlString = value => JSON.stringify(String(value));
export function frontmatterYaml(frontmatter) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object") {
      lines.push(`${key}:`);
      for (const [inner, text] of Object.entries(value)) lines.push(`  ${inner}: ${yamlString(text)}`);
    } else {
      lines.push(`${key}: ${key === "name" ? value : yamlString(value)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

const oneLine = value => String(value ?? "").replace(/[\r\n\u2028\u2029\u0085\u000b\u000c]+/g, " ").trim();

// The words around the body: ライター&SNS 2026-10-03 (two lines changed, the rest approved as drafted). The Seat 8
// sentence is the approved one of the 03 text (D-20261002-seat8-wording).
export const SKILL_WORDING = Object.freeze({
  lead: name => `このスキルは、キャラクター「${name}」として振る舞うための定義です。`,
  rules: [
    "1. この定義に従って振る舞ってください。",
    "2. 定義に書かれていない必要な情報を、勝手に作って埋めないでください。分からないことは分からないと言ってください。",
    `3. 正本は ${CHARACTER_VERBATIM_PATH} です。この SKILL.md の本文と食い違うときは、正本に従ってください。`,
    `4. 人に判断を渡す条件に当たったら、${SEAT8_GATE_PATH} に従って止まり、人に尋ねてください。`,
  ],
  seat8: [
    "席8は論理上の人の席です。AIはこの席を埋めません。席8の判断は、実在の人が行います。利用者への答えでは、席の番号や「席8の人間」という言い方を使いません。",
  ],
  gateTitle: "# 席 8（論理上の人）と人の関門",
  gateConditions: "## 人に判断を渡す条件",
  gateContribution: "## 人に期待すること",
  gateNone: "（このキャラクターの定義には書かれていません）",
  gateEnforcement: "このスキルを読み込む実行環境は、この関門を強制しません。守るのは、このスキルを使う AI と人です。",
});

/** references/seat8-human-gate.md, from the Character's own handoff conditions and expected human contribution. */
export function seat8GateMarkdown(character) {
  const conditions = (character?.character_core?.human_handoff_conditions || [])
    .map(condition => `- ${oneLine(condition?.trigger)} → ${oneLine(condition?.boundary_statement)}`)
    .filter(line => line !== "-  → ");
  const seat8 = character?.assistant_composition?.seat8 || {};   // as platform-prompt.mjs reads it
  const contribution = (seat8.expected_human_contribution || []).map(item => `- ${oneLine(item)}`);
  return [
    SKILL_WORDING.gateTitle, "",
    ...SKILL_WORDING.seat8, "",
    SKILL_WORDING.gateConditions, "",
    ...(conditions.length ? conditions : [SKILL_WORDING.gateNone]), "",
    SKILL_WORDING.gateContribution, "",
    ...(contribution.length ? contribution : [SKILL_WORDING.gateNone]), "",
    SKILL_WORDING.gateEnforcement, "",
  ].join("\n");
}

/** SKILL.md: frontmatter, a short lead, then the body the 03 screen hands over (characterPromptText), unchanged. */
export function skillMarkdown(frontmatter, displayName, body, followLine = "") {
  const name = oneLine(displayName) || frontmatter.name;
  return [
    frontmatterYaml(frontmatter), "",
    `# ${name}`, "",
    SKILL_WORDING.lead(name), "",
    ...SKILL_WORDING.rules, "",
    body.replace(/\s+$/, ""),
    ...(followLine ? ["", followLine] : []),
    "",
  ].join("\n");
}

/** The file list of the layer, in path order; the layer itself is never listed. */
export async function filesDigestList(files) {
  const paths = Object.keys(files).filter(path => path !== OVERLAY_FILE).sort();
  const out = [];
  for (const path of paths) out.push({ path, sha256: await sha256Hex(files[path]) });
  return out;
}

/**
 * Build the skill folder for one Character.
 *   character   canonical Unified V1 Character (object)
 *   body        characterPromptText(character, options) — the 03 layers (Base, Character, directives)
 *   followLine  FOLLOW_LINE when the body carries directives, else ""
 *   source      { kind, signature_state, license, pack_id?, package_digest? }
 *   licenseText the pack's LICENSE.md, required when the license is a WI-T.COM id
 *   generatorVersion  the app version (APP_VERSION), recorded in persona.rendering
 *   createdAt   ISO date-time
 * Returns { name, files } where files maps relative paths to UTF-8 text, wi-t-overlay.json included.
 */
export async function buildAgentSkillExport({ character, body, followLine = "", source, licenseText = null, generatorVersion, createdAt }) {
  const id = skillNameFor(character?.identity?.character_id);
  if (!body || typeof body !== "string") throw new ExportError("BODY_MISSING", "no body to write (a base layer that does not check out yields none)");
  if (!source || !source.kind || !source.signature_state) throw new ExportError("SOURCE_MISSING", "the source of the Character is not known");
  if (!WRITABLE_SIGNATURE_STATES.has(source.signature_state)) {
    // Stage 1 (00A 2026-10-04, ADR-0026 #21): a pack entry is NOT_VERIFIED; PUBLISHER_SIGNED waits for stage 2, where the
    // pack signature is checked against keys looked up in the kokoroamu-trust index.
    throw new ExportError("SIGNATURE_STATE_UNVERIFIED", "SAKU Builder writes only signature states it has established");
  }
  const license = source.license;
  skillLicenseFor(license);   // stale or missing ids stop here, before anything is written
  if (isWitLicenseId(license) && !licenseText) throw new ExportError("LICENSE_FILE_MISSING", "a WI-T.COM license id needs the pack's LICENSE.md");
  const derived = source.kind === PACK_DERIVED_KIND;
  if (derived) {
    if (source.signature_state !== "UNSIGNED") throw new ExportError("SIGNATURE_STATE_UNVERIFIED", "a changed pack Character is written UNSIGNED only");
    if (!PACK_LICENSE_ID.test(license)) throw new ExportError("DERIVED_LICENSE_NOT_PACK", "a changed pack Character must carry the pack's license id");
    if (!source.derived_from || source.derived_from.license !== license || !source.derived_from.pack_id || !source.derived_from.pack_version) throw new ExportError("DERIVED_LICENSE_MISMATCH", "derived_from must name the pack, its version and the same license");
    if (!licenseText) throw new ExportError("LICENSE_FILE_MISSING", "a changed pack Character needs the pack's LICENSE.md");
  } else if (source.derived_from) throw new ExportError("DERIVED_FROM_NOT_ALLOWED", "only a changed pack Character carries derived_from");
  if (!generatorVersion) throw new ExportError("GENERATOR_VERSION_MISSING", "the app version is not known");

  const characterText = `${JSON.stringify(character, null, 2)}\n`;
  const digest = await characterFullDigest(character);
  const overlay = {
    schema: OVERLAY_SCHEMA,
    export_target: "AGENT_SKILLS",
    target_spec: { ...TARGET_SPEC },
    character: {
      character_id: id,
      character_revision: String(character.identity.character_revision ?? ""),
      display_name: String(character.identity.display_name ?? ""),
      character_digest: { algorithm: "sha-256", value: digest, domain: "CHARACTER_FULL_SEMANTICS", profile: "saku.sha256-rfc8785-ijson@1.0.0" },
    },
    source: Object.fromEntries(Object.entries({ kind: source.kind, pack_id: source.pack_id, package_digest: source.package_digest, signature_state: source.signature_state, license, derived_from: source.derived_from ? { pack_id: source.derived_from.pack_id, pack_version: source.derived_from.pack_version, license: source.derived_from.license } : undefined }).filter(([, value]) => value !== undefined && value !== null && value !== "")),
    persona: { source_schema: "SAKU_UNIFIED_SCHEMA_V1", verbatim_path: CHARACTER_VERBATIM_PATH, rendering: { generator_id: GENERATOR_ID, generator_version: String(generatorVersion), rendered_paths: [SKILL_FILE, SEAT8_GATE_PATH] } },
    responsible: { seat8: "human", state: "UNBOUND", binding: null },
    files: [],
    claims: { endorsement: "NOT_ENDORSEMENT", enforcement: "NOT_ENFORCED_BY_TARGET_RUNTIME" },
    created_at: createdAt,
  };
  if (!overlay.character.character_revision || !overlay.character.display_name) throw new ExportError("CHARACTER_IDENTITY_INCOMPLETE", "character_revision and display_name are required");
  const files = {
    [SKILL_FILE]: skillMarkdown(skillFrontmatter(character, overlay), overlay.character.display_name, body, followLine),
    [CHARACTER_VERBATIM_PATH]: characterText,
    [SEAT8_GATE_PATH]: seat8GateMarkdown(character),
  };
  if (licenseText) files[LICENSE_FILE] = String(licenseText);
  overlay.files = await filesDigestList(files);
  files[OVERLAY_FILE] = `${JSON.stringify(overlay, null, 2)}\n`;
  return { name: id, overlay, files };
}

const invalid = code => ({ status: "invalid", code });

/** The checks of the reference verifier for an unsigned layer (ADR-0026 §6, steps 1–4). A signed layer is not SAKU's to read. */
export async function verifyAgentSkillExport({ overlay, files }) {
  const listed = overlay?.files ?? [];
  if (listed.some(f => f.path === OVERLAY_FILE)) return invalid("OVERLAY_LISTS_ITSELF");
  for (const f of listed) {
    if (!Object.prototype.hasOwnProperty.call(files, f.path)) return invalid("FILE_MISSING");
    if (await sha256Hex(files[f.path]) !== f.sha256) return invalid("FILE_DIGEST_MISMATCH");
  }
  for (const path of Object.keys(files)) if (path !== OVERLAY_FILE && !listed.some(f => f.path === path)) return invalid("FILE_NOT_LISTED");
  if (isWitLicenseId(overlay.source?.license) && !listed.some(f => f.path === LICENSE_FILE)) return invalid("LICENSE_FILE_MISSING");
  // The derived branch of the reference verifier (wi-tcom/ADR #32 d13c0d0 src/character-export-overlay.mjs, 00A QA10): the
  // same order and the same four refusals.
  const derived = overlay.source?.kind === PACK_DERIVED_KIND;
  if (derived) {
    if (overlay.signature) return invalid("WI_T_SIGNATURE_ON_DERIVED");
    if (!PACK_LICENSE_ID.test(overlay.source.license ?? "")) return invalid("DERIVED_LICENSE_NOT_PACK");
    if (overlay.source.derived_from?.license !== overlay.source.license) return invalid("DERIVED_LICENSE_MISMATCH");
    if (!listed.some(f => f.path === LICENSE_FILE)) return invalid("LICENSE_FILE_MISSING");
  }
  if (listed.some(f => f.path === CHARACTER_VERBATIM_PATH)) {
    let character;
    try { character = JSON.parse(files[CHARACTER_VERBATIM_PATH]); } catch { return invalid("CHARACTER_NOT_JSON"); }
    let digest;
    try { digest = await characterFullDigest(character); } catch (error) { if (error instanceof ExportError) return invalid(error.code); throw error; }
    if (digest !== overlay.character.character_digest.value) return invalid("CHARACTER_DIGEST_MISMATCH");
    if (character.identity?.character_id !== overlay.character.character_id) return invalid("CHARACTER_ID_MISMATCH");
  }
  if (overlay.responsible?.seat8 !== "human") return invalid("SEAT8_NOT_HUMAN");
  if (overlay.signature) return invalid("SIGNATURE_NOT_EXPECTED");
  const responsible = overlay.responsible.state === "BOUND" ? `BOUND:${overlay.responsible.binding.assurance_level}` : "UNBOUND";
  return derived ? { status: "valid", signature: "NONE", responsible, origin: "PACK_DERIVED_MODIFIED" } : { status: "valid", signature: "NONE", responsible };
}
