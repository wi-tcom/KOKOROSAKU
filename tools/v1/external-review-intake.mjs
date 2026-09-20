// SAKU external review-only Trainer intake.
//
// Receives an AMU Trainer v0.2 Return packet (`amu.trainer-return/1`) and
// stores it as a Review Candidate the Owner can read.  That is the whole job.
// The record it writes is not a Change Candidate, is not eligible for the
// Builder handoff, cannot be selected, and cannot be applied: none of the
// `saku.trainer.frozen-ia@1` handoff, candidate, or apply functions are
// imported here, and the storage namespace is separate from every key that
// contract owns.  If the Owner wants a change after reading the evidence, they
// open the existing Trainer themselves and go through its own human steps.
//
// Everything below is fail-closed: a packet that cannot be verified from the
// bytes alone is refused as a whole, and a refusal is never a partial write.
// Reference for the wire rules: KOKOROAMU-STUDIO core/trainer/return-packet.js
// (the Builder refuses everything that refuses, for the same reasons).

import {
  LEGACY_SCHEMA_TARGETS,
  characterBinding,
  contentDigest,
  stableStringify,
} from "./trainer-frozen-ia.mjs";
import {
  DIFF_MODELS,
  STATE_MODELS,
  TUNING_ITEMS,
  diffState,
} from "../unified-v1/tuning/tuning-projection.mjs";

export const EXTERNAL_REVIEW_INTAKE_CONTRACT_ID = "saku.trainer.external-review-intake@1";
export const EXTERNAL_REVIEW_RECORD_SCHEMA_ID = "saku.trainer.external-review-record@1";
export const EXTERNAL_REVIEW_INDEX_SCHEMA_ID = "saku.trainer.external-review-index@1";
export const RETURN_PACKET_SCHEMA = "amu.trainer-return/1";
export const REVIEW_CANDIDATE_SCHEMA = "amu.trainer-review-candidate/1";
export const RETURN_CONFIRMATION_SUBJECT = "TRAINER_CANDIDATE_RETURN";
export const EXPECTED_MAPPING_VERSION = "amu-trainer-expected-observed-mapping/1";
export const ACCEPTED_DESTINATION = "SAKU_BUILDER";

// Separate namespace.  Nothing under `saku.trainer.sessions.*`,
// `saku.trainer.pendingChangeCandidates*`, or `saku.trainer.builderHandoffContext`.
export const EXTERNAL_REVIEW_KEYS = Object.freeze({
  index: "saku.trainer.externalReviewIntake.v1.index",
  itemPrefix: "saku.trainer.externalReviewIntake.v1.item.",
});
export const externalReviewItemKey = candidateId => `${EXTERNAL_REVIEW_KEYS.itemPrefix}${candidateId}`;

// States of a stored record.  The stored state only ever moves
// REVIEW_ONLY_STORED -> ARCHIVED by an explicit human action; STALE_READ_ONLY is
// derived at view time when the Builder's own Character binding no longer
// matches.  There is no READY_FOR_BUILDER, SELECTED_BY_HUMAN, or APPLIED here.
export const EXTERNAL_REVIEW_STATES = Object.freeze(["REVIEW_ONLY_STORED", "STALE_READ_ONLY", "ARCHIVED"]);

// The carried SAKU knowledge this Builder ships.  A packet must have been
// projected from exactly these bytes.  `verify_external_review_intake.mjs`
// re-hashes tools/unified-v1/tuning/*.json and fails on drift, so this pin
// cannot silently diverge from the files.
export const EXTERNAL_REVIEW_KNOWLEDGE_PIN = Object.freeze({
  knowledge_id: "saku.cognitive-tuning-20.knowledge",
  knowledge_carried_sha256: "a85ea1309690046fe1266ec4d44182702accff3ce16d90ca77970d372c347571",
  provenance_sha256: "83759276cd1d025bafbe181a70e7ae6364e2ea359a9b6cc5537b7aaf11b9ad37",
  authoritative_source_role: "SAKU_COGNITIVE_TUNING_20_INTEGRATION_REVIEW_PACKET_2026_09_05",
  manifest_sha256: "61669bbd8be27771b0395ff9989c43c8c4a73a56c233f8cce4ade1c30a39c050",
  carried_from: Object.freeze({
    repository: "wi-tcom/-SAKU-builder",
    main_revision: "9b0af0e56cb6cd7459e39f6d6e585cb487566c58",
    knowledge_path: "tools/unified-v1/tuning/tuning-knowledge-20.json",
    provenance_path: "tools/unified-v1/tuning/tuning-provenance.json",
  }),
});

// Members that would make the packet an edit proposal or a Builder-side
// selection.  Their presence anywhere in the packet is a refusal: a review-only
// packet carries states, never a change or a choice.
const EDIT_PROPOSAL_KEYS = /^(RELATED_CANONICAL_PATH|PROPOSED_CHANGE|REPLACE_EXACT_VALUE|SELECTED_BY_HUMAN|CURRENT_VALUE|OPERATION|proposed_change|related_canonical_path|selected_by_human)$/;
const LEGACY_KEYS = new RegExp(`^(${LEGACY_SCHEMA_TARGETS.join("|")})$`);
const ITEM_ID = /^T(0[1-9]|1[0-9]|20)$/;
const SHA256_PREFIXED = /^sha-256:[0-9a-f]{64}$/;
const HEX64 = /^[0-9a-f]{64}$/;

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = value => typeof value === "string" && value.trim().length > 0;
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const nowIso = now => typeof now === "string" ? now : (now instanceof Date ? now : new Date()).toISOString();

/**
 * RFC 8785-equivalent canonical JSON for the shapes a received packet holds:
 * keys sorted by UTF-16 code units, no whitespace, arrays in order, primitives
 * as JSON.stringify.  A received JSON object never carries `undefined`, so
 * the omission rule is stated for completeness only.
 */
export function canonicalJson(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => (item === undefined ? "null" : canonicalJson(item))).join(",")}]`;
  return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export async function sha256Hex(text) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error("SHA256_UNAVAILABLE");
  const bytes = new TextEncoder().encode(String(text));
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** The fixed wire rule: the candidate without `candidate_digest` and `returned`. */
export async function candidateWireDigest(candidate) {
  const { candidate_digest, returned, ...wire } = candidate || {};
  void candidate_digest; void returned;
  return `sha-256:${await sha256Hex(canonicalJson(wire))}`;
}

function walkKeys(value, onKey, path = "$") {
  if (Array.isArray(value)) value.forEach((item, index) => walkKeys(item, onKey, `${path}[${index}]`));
  else if (isObject(value)) for (const [key, item] of Object.entries(value)) { onKey(key, `${path}.${key}`); walkKeys(item, onKey, `${path}.${key}`); }
}

const refusal = (code, detail = "", extra = {}) => ({ ok: false, code, detail, ...extra });

/**
 * Validate a Return packet from its JSON alone.  Order follows the AMU
 * reference so that the same defect is refused for the same reason: apply
 * flags before the digest, vocabulary before the digest, digest last.
 */
export async function validateReturnPacket(packet, { pin = EXTERNAL_REVIEW_KNOWLEDGE_PIN } = {}) {
  if (!isObject(packet) || packet.schema !== RETURN_PACKET_SCHEMA || packet.destination !== ACCEPTED_DESTINATION) {
    return refusal("PACKET_SCHEMA_INVALID", "not an amu.trainer-return/1 packet for SAKU_BUILDER");
  }
  const candidate = packet.candidate;
  if (!isObject(candidate) || candidate.schema !== REVIEW_CANDIDATE_SCHEMA) {
    return refusal("PACKET_SCHEMA_INVALID", "candidate is not amu.trainer-review-candidate/1");
  }
  if (packet.automatic_apply !== false || candidate.automatic_apply !== false) {
    return refusal("AUTOMATIC_APPLY_FORBIDDEN", "automatic_apply must be exactly false on packet and candidate");
  }
  if (candidate.canonical_fields_added !== 0) {
    return refusal("CANONICAL_FIELDS_FORBIDDEN", "canonical_fields_added must be exactly 0");
  }
  const provenance = packet.provenance;
  if (!isObject(provenance) || provenance.confirmation_subject !== RETURN_CONFIRMATION_SUBJECT
    || !nonEmpty(provenance.confirmation_id) || !SHA256_PREFIXED.test(provenance.subject_digest ?? "")) {
    return refusal("RETURN_SUBJECT_MISMATCH", "provenance must carry a TRAINER_CANDIDATE_RETURN confirmation reference");
  }
  let keyRefusal = null;
  walkKeys(packet, (key, at) => {
    if (keyRefusal) return;
    if (EDIT_PROPOSAL_KEYS.test(key)) keyRefusal = refusal("EDIT_PROPOSAL_IN_REVIEW_PACKET", `edit/selection member ${at}`);
    else if (LEGACY_KEYS.test(key)) keyRefusal = refusal("LEGACY_SCHEMA_TARGET_PROHIBITED", `legacy member ${at}`);
  });
  if (keyRefusal) return keyRefusal;
  const character = candidate.character;
  if (!isObject(character) || !nonEmpty(character.character_id) || !nonEmpty(character.character_revision) || !HEX64.test(character.character_digest ?? "")) {
    return refusal("CHARACTER_IDENTITY_INVALID", "character identity incomplete");
  }
  for (const [where, knowledge] of [["candidate.knowledge", candidate.knowledge], ["provenance.knowledge", provenance.knowledge]]) {
    if (!isObject(knowledge)
      || knowledge.knowledge_id !== pin.knowledge_id
      || knowledge.knowledge_sha256 !== pin.knowledge_carried_sha256
      || knowledge.provenance_sha256 !== pin.provenance_sha256
      || knowledge.authoritative_source_role !== pin.authoritative_source_role
      || knowledge.manifest_sha256 !== pin.manifest_sha256
      || knowledge.carried_from?.repository !== pin.carried_from.repository
      || knowledge.carried_from?.main_revision !== pin.carried_from.main_revision
      || knowledge.carried_from?.knowledge_path !== pin.carried_from.knowledge_path
      || knowledge.carried_from?.provenance_path !== pin.carried_from.provenance_path) {
      return refusal("KNOWLEDGE_PROVENANCE_MISMATCH", `${where} does not match the carried SAKU knowledge`);
    }
  }
  if (candidate.mapping_version !== EXPECTED_MAPPING_VERSION || provenance.mapping_version !== EXPECTED_MAPPING_VERSION) {
    return refusal("MAPPING_VERSION_MISMATCH", "mapping_version is not amu-trainer-expected-observed-mapping/1");
  }
  const items = candidate.items;
  if (!Array.isArray(items) || items.length !== TUNING_ITEMS.length) {
    return refusal("ITEM_SET_INVALID", `exactly ${TUNING_ITEMS.length} items required`);
  }
  const models = new Map(TUNING_ITEMS.map(item => [item.id, item.state_model]));
  const seen = new Set();
  for (const item of items) {
    if (!isObject(item) || !ITEM_ID.test(item.id ?? "") || seen.has(item.id) || !models.has(item.id)) {
      return refusal("ITEM_SET_INVALID", `bad or duplicate item id ${item?.id}`);
    }
    seen.add(item.id);
    const model = models.get(item.id);
    if (item.state_model !== model) return refusal("ITEM_SET_INVALID", `${item.id} state_model must be ${model}`);
    const states = STATE_MODELS[model] || [];
    const diffs = DIFF_MODELS[model] || [];
    if (!isObject(item.expected) || !states.includes(item.expected.state)
      || !isObject(item.observed) || !states.includes(item.observed.state)
      || !diffs.includes(item.diff)) {
      return refusal("STATE_VOCABULARY_INVALID", `${item.id} state/diff outside the ${model} model`);
    }
    if ((item.expected.state === "NOT_ASSESSED" || item.observed.state === "NOT_ASSESSED") && item.diff !== "NOT_COMPARABLE") {
      return refusal("STATE_VOCABULARY_INVALID", `${item.id}: a NOT_ASSESSED side must yield NOT_COMPARABLE`);
    }
    // The Builder derives the same diff from the same two states.  A packet
    // whose diff disagrees is refused, never repaired.
    if (diffState(item.expected.state, item.observed.state, model) !== item.diff) {
      return refusal("DIFF_NOT_DERIVED_FROM_STATES", `${item.id}: diff is not the derivation of expected/observed`);
    }
  }
  if (!SHA256_PREFIXED.test(candidate.candidate_digest ?? "")) return refusal("CANDIDATE_DIGEST_MISMATCH", "candidate_digest missing");
  const recomputed = await candidateWireDigest(candidate);
  if (recomputed !== candidate.candidate_digest) {
    return refusal("CANDIDATE_DIGEST_MISMATCH", "candidate_digest does not match the canonical JSON of the candidate", { expected: candidate.candidate_digest, actual: recomputed });
  }
  return {
    ok: true,
    code: "REVIEW_PACKET_WELL_FORMED",
    candidate_id: candidate.candidate_id,
    candidate_digest: candidate.candidate_digest,
    character: { character_id: character.character_id, character_revision: character.character_revision, signed_pack_digest: character.character_digest },
    confirmation_id: provenance.confirmation_id,
    items: items.length,
    meaning: "Well-formed review-only packet. Not approval, selection, adoption, or apply.",
  };
}

function readJson(storage, key) {
  let raw;
  try { raw = storage.getItem(key); } catch { return { ok: false, code: "STORAGE_READ_FAILED" }; }
  if (raw === null || raw === undefined) return { ok: true, value: null, raw: null };
  try { return { ok: true, value: JSON.parse(raw), raw }; } catch { return { ok: false, code: "STORAGE_RECORD_INVALID" }; }
}

function readIndex(storage) {
  const read = readJson(storage, EXTERNAL_REVIEW_KEYS.index);
  if (!read.ok) return read;
  if (read.value === null) return { ok: true, index: { schema_id: EXTERNAL_REVIEW_INDEX_SCHEMA_ID, candidate_ids: [] }, raw: null };
  if (read.value?.schema_id !== EXTERNAL_REVIEW_INDEX_SCHEMA_ID || !Array.isArray(read.value.candidate_ids)) {
    return { ok: false, code: "STORAGE_RECORD_INVALID" };
  }
  return { ok: true, index: read.value, raw: read.raw };
}

/** Builder-side identity of the Character currently open, computed here and only here. */
export function builderLocalBinding(currentCharacter) {
  if (!currentCharacter || typeof currentCharacter !== "object") return null;
  const binding = characterBinding(currentCharacter);
  return {
    character_id: binding.character_id,
    character_revision: binding.character_revision,
    builder_local_digest: binding.character_digest,
    builder_local_digest_role: "BUILDER_LOCAL_CONTENT_BINDING_FNV1A32_NOT_AUTHENTICITY",
  };
}

/**
 * Verify and store one packet as a review-only record.
 *
 * Refuses (no write at all) when: the packet fails validation, no Character is
 * open, the packet names a different Character or revision than the one open,
 * or the same candidate / digest / confirmation is already stored.  A storage
 * failure after the item write rolls the item back and is reported as a
 * failure, never as "stored".
 */
export async function storeExternalReview(storage, packetText, currentCharacter, { now = new Date() } = {}) {
  if (typeof packetText !== "string" || !packetText.trim()) return refusal("PACKET_TEXT_REQUIRED", "paste or load the packet JSON");
  let packet;
  try { packet = JSON.parse(packetText); } catch { return refusal("PACKET_NOT_JSON", "the packet is not valid JSON"); }
  const verified = await validateReturnPacket(packet);
  if (!verified.ok) return verified;

  const local = builderLocalBinding(currentCharacter);
  if (!local) return refusal("NO_CURRENT_CHARACTER", "open the Character the packet was returned for");
  if (local.character_id !== verified.character.character_id || String(local.character_revision) !== String(verified.character.character_revision)) {
    return refusal("CHARACTER_BINDING_MISMATCH", "the packet names a different Character or revision than the one open", {
      packet_character: verified.character, current_character: { character_id: local.character_id, character_revision: local.character_revision },
    });
  }

  const indexRead = readIndex(storage);
  if (!indexRead.ok) return refusal(indexRead.code, "the intake index could not be read");
  const existing = [];
  for (const id of indexRead.index.candidate_ids) {
    const read = readJson(storage, externalReviewItemKey(id));
    if (!read.ok) return refusal(read.code, `stored record ${id} could not be read`);
    if (read.value) existing.push(read.value);
  }
  // Duplicate prevention is the Builder's own: it stops the same packet being
  // stored twice here.  It is not, and is not presented as, an independent
  // proof of the AMU Seat8 single-use rule.
  const duplicate = existing.find(record => record.candidate_id === verified.candidate_id
    || record.candidate_digest === verified.candidate_digest
    || record.return_confirmation?.confirmation_id === verified.confirmation_id);
  if (duplicate) return refusal("DUPLICATE_INTAKE", "this candidate, digest, or return confirmation is already stored in the Builder intake", { duplicate_of: duplicate.candidate_id });

  const received = nowIso(now);
  const record = {
    schema_id: EXTERNAL_REVIEW_RECORD_SCHEMA_ID,
    contract_id: EXTERNAL_REVIEW_INTAKE_CONTRACT_ID,
    candidate_id: verified.candidate_id,
    candidate_digest: verified.candidate_digest,
    received_at: received,
    source_system: String(packet.provenance.studio || ""),
    packet_text: packetText,
    packet_sha256: await sha256Hex(packetText),
    packet: clone(packet),
    // Two digests, two roles, two fields.  Neither is ever written into the other.
    character_binding: {
      character_id: verified.character.character_id,
      character_revision: verified.character.character_revision,
      signed_pack_digest: verified.character.signed_pack_digest,
      signed_pack_digest_role: "AMU_SIGNED_PACK_PROVENANCE_IDENTITY_NOT_VERIFIED_BY_BUILDER",
      builder_local_digest: local.builder_local_digest,
      builder_local_digest_role: local.builder_local_digest_role,
    },
    return_confirmation: {
      confirmation_id: packet.provenance.confirmation_id,
      confirmation_subject: packet.provenance.confirmation_subject,
      subject_digest: packet.provenance.subject_digest,
      chain_head: packet.provenance.chain_head || null,
      meaning: "HUMAN_CONFIRMED_RETURN_TO_BUILDER_ONLY_NOT_SELECTION_NOT_APPROVAL_NOT_APPLY",
    },
    knowledge: clone(packet.candidate.knowledge),
    mapping_version: packet.candidate.mapping_version,
    items: clone(packet.candidate.items),
    seat_proposals: clone(packet.candidate.seat_proposals || []),
    state: "REVIEW_ONLY_STORED",
    archived_at: null,
    human_next_step: "OPEN_EXISTING_TRAINER_SEPARATELY_IF_A_CHANGE_IS_WANTED",
    automatic_apply: false,
    canonical_mutation: false,
    change_candidates_generated: 0,
    builder_session_created: false,
    handoff_eligible: false,
  };
  record.record_content_digest = contentDigest(recordContentProjection(record));

  const itemKey = externalReviewItemKey(record.candidate_id);
  const itemText = JSON.stringify(record);
  const nextIndex = { ...indexRead.index, candidate_ids: [...indexRead.index.candidate_ids, record.candidate_id] };
  const indexText = JSON.stringify(nextIndex);
  try {
    storage.setItem(itemKey, itemText);
    if (storage.getItem(itemKey) !== itemText) throw new Error("ITEM_WRITE_UNVERIFIED");
  } catch (error) {
    try { storage.removeItem(itemKey); } catch { /* nothing durable was written */ }
    return refusal("STORAGE_WRITE_FAILED", String(error?.message || error), { stored: false });
  }
  try {
    storage.setItem(EXTERNAL_REVIEW_KEYS.index, indexText);
    if (storage.getItem(EXTERNAL_REVIEW_KEYS.index) !== indexText) throw new Error("INDEX_WRITE_UNVERIFIED");
  } catch (error) {
    // Roll the item back so a failed intake leaves nothing behind.
    try { storage.removeItem(itemKey); } catch { /* reported below either way */ }
    try {
      if (indexRead.raw === null) storage.removeItem(EXTERNAL_REVIEW_KEYS.index);
      else storage.setItem(EXTERNAL_REVIEW_KEYS.index, indexRead.raw);
    } catch { /* the index is rechecked on next read */ }
    return refusal("STORAGE_WRITE_FAILED", String(error?.message || error), { stored: false });
  }
  return { ok: true, code: "REVIEW_ONLY_STORED", stored: true, record: clone(record) };
}

function recordContentProjection(record) {
  const projection = clone(record);
  delete projection.record_content_digest;
  return projection;
}

export function listExternalReviews(storage) {
  const indexRead = readIndex(storage);
  if (!indexRead.ok) return { ok: false, code: indexRead.code, records: [] };
  const records = [];
  const problems = [];
  for (const id of indexRead.index.candidate_ids) {
    const read = readJson(storage, externalReviewItemKey(id));
    if (!read.ok || !read.value) { problems.push({ candidate_id: id, code: read.code || "STORAGE_RECORD_MISSING" }); continue; }
    if (read.value.record_content_digest !== contentDigest(recordContentProjection(read.value))) { problems.push({ candidate_id: id, code: "STORAGE_RECORD_TAMPERED" }); continue; }
    records.push(read.value);
  }
  return { ok: true, records, problems };
}

export function loadExternalReview(storage, candidateId) {
  const read = readJson(storage, externalReviewItemKey(candidateId));
  if (!read.ok) return { ok: false, code: read.code };
  if (!read.value) return { ok: false, code: "STORAGE_RECORD_MISSING" };
  if (read.value.record_content_digest !== contentDigest(recordContentProjection(read.value))) return { ok: false, code: "STORAGE_RECORD_TAMPERED" };
  return { ok: true, record: read.value };
}

/**
 * What the Owner sees for a record right now.  STALE_READ_ONLY is derived: the
 * record is unchanged, but the Character open in the Builder is not the one
 * the packet was received against.
 */
export function externalReviewView(record, currentCharacter) {
  if (!record) return null;
  const local = builderLocalBinding(currentCharacter);
  const bound = record.character_binding || {};
  const matches = Boolean(local)
    && local.character_id === bound.character_id
    && String(local.character_revision) === String(bound.character_revision)
    && local.builder_local_digest === bound.builder_local_digest;
  const state = record.state === "ARCHIVED" ? "ARCHIVED" : (matches ? "REVIEW_ONLY_STORED" : "STALE_READ_ONLY");
  const stale_reason = state !== "STALE_READ_ONLY" ? null
    : !local ? "NO_CURRENT_CHARACTER"
      : local.character_id !== bound.character_id ? "CHARACTER_ID_DIFFERS"
        : String(local.character_revision) !== String(bound.character_revision) ? "CHARACTER_REVISION_DIFFERS"
          : "BUILDER_LOCAL_DIGEST_DIFFERS";
  return {
    state,
    stale_reason,
    current_binding: local,
    apply_available: false,
    selection_available: false,
    change_candidate_generation_available: false,
  };
}

/** Explicit human action.  The record stays; it just stops being current. */
export function archiveExternalReview(storage, candidateId, { now = new Date() } = {}) {
  const loaded = loadExternalReview(storage, candidateId);
  if (!loaded.ok) return { ok: false, code: loaded.code };
  if (loaded.record.state === "ARCHIVED") return { ok: true, code: "ALREADY_ARCHIVED", record: loaded.record };
  const record = { ...loaded.record, state: "ARCHIVED", archived_at: nowIso(now) };
  record.record_content_digest = contentDigest(recordContentProjection(record));
  const text = JSON.stringify(record);
  try {
    storage.setItem(externalReviewItemKey(candidateId), text);
    if (storage.getItem(externalReviewItemKey(candidateId)) !== text) throw new Error("ITEM_WRITE_UNVERIFIED");
  } catch (error) {
    return { ok: false, code: "STORAGE_WRITE_FAILED", detail: String(error?.message || error) };
  }
  return { ok: true, code: "ARCHIVED", record };
}

/** Frozen facts about this contract, for gates and for the page footer. */
export function contractProjection() {
  return {
    contract_id: EXTERNAL_REVIEW_INTAKE_CONTRACT_ID,
    accepts: { packet_schema: RETURN_PACKET_SCHEMA, candidate_schema: REVIEW_CANDIDATE_SCHEMA, destination: ACCEPTED_DESTINATION, confirmation_subject: RETURN_CONFIRMATION_SUBJECT, mapping_version: EXPECTED_MAPPING_VERSION },
    storage_keys: { ...EXTERNAL_REVIEW_KEYS },
    states: [...EXTERNAL_REVIEW_STATES],
    knowledge_pin: clone(EXTERNAL_REVIEW_KNOWLEDGE_PIN),
    frozen_ia_contract_touched: false,
    produces_change_candidate: false,
    produces_builder_session: false,
    handoff_eligible: false,
    apply_path: "NONE",
    canonical_mutation: false,
  };
}
