// The 20 cognitive-tuning items, projected from a Unified V1 Character.
//
// The twenty items are not Canonical fields and are never stored as any. They
// are a derived view over fields the adopted schema already has, plus a
// recommendation that names those fields exactly. The review that produced the
// knowledge concluded the existing schema is sufficient for all twenty
// (`existing_schema_sufficient_count: 20`, `schema_extension_required_count: 0`),
// so nothing here adds a field.
//
// Two rules shape the whole module:
//
//   RECOMMENDATION != CANONICAL_MUTATION
//     Nothing writes to a Character. `applyRecommendation` returns a new object
//     and only when a caller asks for it; the Owner's explicit Apply is the only
//     thing that turns a recommendation into a revision.
//
//   arbitrary_free_text_inference = PROHIBITED
//     A state is derived only from structural evidence — a requirement that
//     exists, a reference that resolves, a probe result that was recorded. Where
//     there is no such evidence the state is NOT_ASSESSED, which the projection
//     contract names as the correct answer rather than a gap to fill with a
//     guess.
//
// Knowledge source: tools/unified-v1/tuning/tuning-knowledge-20.json, carried from
// the authoritative packet with tuning-provenance.json recording its digests.
// `verify_cognitive_tuning.mjs` re-reads the packet and fails on drift.

// Plain module rather than a JSON import: the installed WebView2 does not
// resolve `with { type: "json" }`, and the host failed to boot while every
// browser gate passed. Generated from the carried JSON, which keeps the
// provenance and is what the packet check compares against.
import KNOWLEDGE from "./tuning-knowledge-20.data.mjs";
import { INPUT_INTEGRITY_STATEMENT } from "./unified-schema.mjs";

export const TUNING_KNOWLEDGE = KNOWLEDGE;
export const TUNING_ITEMS = KNOWLEDGE.items;
export const PROJECTION_CONTRACT = KNOWLEDGE.projection_contract;
export const LAYER_CONTRACT = KNOWLEDGE.layer_contract;
export const STATE_MODELS = KNOWLEDGE.projection_contract.state_models;
export const DIFF_MODELS = KNOWLEDGE.projection_contract.diff_models;
export const NOT_ASSESSED = "NOT_ASSESSED";

// The knowledge records where earlier drafts named a field that the adopted
// schema spells differently. Translation applies these rather than carrying two
// vocabularies forward.
const CORRECTIONS = KNOWLEDGE.field_name_corrections || {};
const REMOVED = new Set(KNOWLEDGE.removed_or_inactive_fields_not_usable || []);

export function itemById(id) {
  return TUNING_ITEMS.find(item => item.id === id) || null;
}

/**
 * Translation contract: the item's concepts to fields that actually exist in
 * SAKU_UNIFIED_SCHEMA_V1.
 *
 * A field the adoption removed is never returned as a target. A corrected name
 * is returned in its adopted spelling, and one that resolves to something
 * outside the Canonical is reported as such rather than offered for editing.
 */
export function translate(itemId) {
  const item = itemById(itemId);
  if (!item) return { ok: false, code: "UNKNOWN_ITEM", targets: [], excluded: [] };
  const targets = [];
  const excluded = [];
  for (const raw of item.existing_fields || []) {
    const corrected = CORRECTIONS[raw] || raw;
    if (REMOVED.has(corrected) || REMOVED.has(raw)) { excluded.push({ field: raw, reason: "REMOVED_FROM_ACTIVE_SCHEMA" }); continue; }
    if (String(corrected).startsWith("DERIVED_OUTSIDE_CANONICAL") || String(corrected).startsWith("NOT_A_SEAT")) {
      excluded.push({ field: raw, reason: corrected });
      continue;
    }
    targets.push({ field: corrected, renamed_from: corrected === raw ? null : raw });
  }
  return { ok: targets.length > 0, code: targets.length ? "TRANSLATED" : "NO_ACTIVE_TARGET", item_id: itemId, targets, excluded };
}

// ── structural evidence, never free text ────────────────────────────────────
const at = (character, path) => path.split(".").reduce((node, key) => (node == null ? node : node[key]), character);

function requirementTexts(character) {
  const core = (character && character.character_core) || {};
  const conformance = (character && character.conformance_expectations) || {};
  return {
    invariants: (core.hard_invariants || []).map(item => String((item && item.statement) || "")),
    prohibited_drift: (core.expressive_range || {}).prohibited_drift || [],
    allowed_variation: (core.expressive_range || {}).allowed_variation || [],
    non_goals: ((character && character.purpose) || {}).non_goals || [],
    must_preserve_refs: conformance.must_preserve_refs || [],
    prohibited_drift_refs: conformance.prohibited_drift_refs || [],
    continuity_refs: conformance.continuity_refs || [],
    handoffs: (core.human_handoff_conditions || []),
  };
}

/**
 * Does the Character carry explicit, structural expression for this item?
 *
 * "Explicit" means a requirement or reference exists in one of the item's own
 * translated target fields. It deliberately does not read what those entries
 * say — matching wording would be the free-text inference the contract
 * prohibits.
 */
function structuralCoverage(character, itemId) {
  const { targets } = translate(itemId);
  const covered = [];
  for (const target of targets) {
    const value = at(character, target.field);
    const present = Array.isArray(value) ? value.length > 0 : (value !== undefined && value !== null && String(value).trim() !== "");
    if (present) covered.push(target.field);
  }
  return { covered, total: targets.length };
}

/**
 * Expected state, derived from the Character alone.
 *
 * PROTECTION items answer PROTECTED when the protection is actually written
 * into the Character's own requirements; otherwise NOT_ASSESSED. AT_RISK and
 * OBSERVED are observations, so they are never derived from a definition.
 *
 * BAND and CATALOG_DISTINCTNESS items are NOT_ASSESSED from a definition alone:
 * a band is a behavioral reading, and the contract forbids inventing one from
 * the presence of a field.
 */
export function deriveExpectedState(character, itemId) {
  const item = itemById(itemId);
  if (!item) return { state: NOT_ASSESSED, basis: "UNKNOWN_ITEM", evidence: [] };
  const coverage = structuralCoverage(character, itemId);

  if (item.state_model === "PROTECTION") {
    // T10 is the Input Integrity item: its protection is a named invariant, so
    // it can be answered exactly rather than by field presence.
    if (itemId === "T10") {
      const has = requirementTexts(character).invariants.some(text => text.includes(INPUT_INTEGRITY_STATEMENT));
      return has
        ? { state: "PROTECTED", basis: "INPUT_INTEGRITY_HARD_INVARIANT_PRESENT", evidence: [INPUT_INTEGRITY_STATEMENT] }
        : { state: NOT_ASSESSED, basis: "INPUT_INTEGRITY_HARD_INVARIANT_ABSENT", evidence: [] };
    }
    if (coverage.covered.length === coverage.total && coverage.total > 0) {
      return { state: "PROTECTED", basis: "ALL_MAPPED_REQUIREMENT_FIELDS_POPULATED", evidence: coverage.covered };
    }
    return { state: NOT_ASSESSED, basis: coverage.covered.length ? "PARTIALLY_EXPRESSED" : "NOT_EXPRESSED", evidence: coverage.covered };
  }

  return {
    state: NOT_ASSESSED,
    basis: coverage.covered.length ? "DEFINITION_ONLY_NO_BEHAVIOURAL_EVIDENCE" : "NOT_EXPRESSED",
    evidence: coverage.covered,
  };
}

/**
 * Observed state, from recorded probe results only.
 *
 * `observed` maps item id to a state already produced by an explicit rubric.
 * Anything not in it stays NOT_ASSESSED; nothing is inferred from a transcript.
 */
export function deriveObservedState(observed, itemId) {
  const item = itemById(itemId);
  if (!item) return { state: NOT_ASSESSED, basis: "UNKNOWN_ITEM" };
  const allowed = STATE_MODELS[item.state_model] || [NOT_ASSESSED];
  const value = observed && observed[itemId];
  const state = typeof value === "string" ? value : (value && value.state);
  if (!state || !allowed.includes(state)) return { state: NOT_ASSESSED, basis: "NO_RUBRIC_RESULT" };
  return { state, basis: "PROBE_EVIDENCE_PLUS_EXPLICIT_RUBRIC_RESULT", probe_ids: item.probe_ids || [] };
}

/** Expected vs Observed, in the item's own diff vocabulary. */
export function diffState(expected, observed, stateModel) {
  const vocabulary = DIFF_MODELS[stateModel] || ["NOT_COMPARABLE"];
  const notComparable = vocabulary.includes("NOT_COMPARABLE") ? "NOT_COMPARABLE" : vocabulary[vocabulary.length - 1];
  if (expected === NOT_ASSESSED || observed === NOT_ASSESSED) return notComparable;
  if (stateModel === "BAND") {
    const order = ["LOW", "MEDIUM", "HIGH"];
    const delta = order.indexOf(observed) - order.indexOf(expected);
    if (delta === 0) return "ALIGNED";
    return delta < 0 ? "BELOW_EXPECTED" : "ABOVE_EXPECTED";
  }
  if (stateModel === "PROTECTION") {
    if (observed === "PROTECTED" || observed === expected) return "ALIGNED";
    return observed === "AT_RISK" ? "AT_RISK" : "VIOLATION";
  }
  if (stateModel === "CATALOG_DISTINCTNESS") {
    if (observed === "DISTINCT") return "ALIGNED";
    return observed === "AT_RISK" ? "AT_RISK" : "FLATTENED";
  }
  return notComparable;
}

/** The whole 20-item projection for one Character. Derived, never stored. */
export function projectAll(character, observed = {}) {
  return TUNING_ITEMS.map(item => {
    const expected = deriveExpectedState(character, item.id);
    const seen = deriveObservedState(observed, item.id);
    const assignment = (LAYER_CONTRACT.assignments || {})[item.id] || {};
    return {
      id: item.id,
      name: item.name,
      symptom: item.symptom,
      state_model: item.state_model,
      classification: assignment.classification || [],
      expected_state: expected.state,
      expected_basis: expected.basis,
      observed_state: seen.state,
      observed_basis: seen.basis,
      diff: diffState(expected.state, seen.state, item.state_model),
      probe_ids: item.probe_ids || [],
      evidence: expected.evidence || [],
    };
  });
}

/**
 * A recommendation for one item, in the direction the Owner chose.
 *
 * Everything returned comes from the knowledge: what to change, what it is for,
 * what it costs, which professions widen or narrow it. The SAKU half names real
 * V1 fields; the AMU half is kept separate and is never presented as a Character
 * change, because it is not one.
 */
export function recommend(itemId, direction = "DOWN", character = null) {
  const item = itemById(itemId);
  if (!item) return { ok: false, code: "UNKNOWN_ITEM" };
  const assignment = (LAYER_CONTRACT.assignments || {})[itemId] || {};
  const translation = translate(itemId);
  const expected = character ? deriveExpectedState(character, itemId) : { state: NOT_ASSESSED, basis: "NO_CHARACTER" };
  return {
    ok: true,
    item_id: itemId,
    name: item.name,
    symptom: item.symptom,
    direction,
    current_state: expected.state,
    current_basis: expected.basis,
    change: direction === "UP" ? item.tuning_up_if_legitimate : item.tuning_down,
    expected_effect: direction === "UP" ? item.tuning_up_if_legitimate : item.tuning_down,
    side_effects: item.side_effects,
    profession_dependency: item.profession_dependency,
    saku: { classification: "SAKU", guidance: assignment.saku || "", fields: translation.targets.map(target => target.field) },
    // An AMU-owned change is reported as an AMU recommendation. Dressing it up
    // as a Character edit would put a runtime decision into Canonical.
    amu: assignment.classification && assignment.classification.includes("AMU")
      ? { classification: "AMU", guidance: assignment.amu || "", character_change: false }
      : null,
    reserved: assignment.reserved || "NOT_USED",
    probe_ids: item.probe_ids || [],
    excluded_fields: translation.excluded,
    mapping_version: KNOWLEDGE.version,
  };
}

/**
 * Preview an Apply: the Character that would result, and the difference.
 *
 * The input is never touched. A recommendation carries guidance, not values, so
 * this appends the Owner's own text to the fields the translation named — an
 * edit the Owner can read in full before committing it.
 */
export function previewApply(character, itemId, entries = []) {
  const translation = translate(itemId);
  if (!translation.ok) return { ok: false, code: translation.code, diff: [] };
  const next = structuredClone(character);
  const diff = [];
  for (const entry of entries) {
    const target = translation.targets.find(item => item.field === entry.field);
    if (!target) { diff.push({ field: entry.field, result: "NOT_A_TARGET_FOR_THIS_ITEM" }); continue; }
    const segments = entry.field.split(".");
    const leaf = segments.pop();
    const parent = segments.reduce((node, key) => (node[key] = node[key] || {}), next);
    const before = parent[leaf];
    if (Array.isArray(before)) {
      const after = [...before, entry.value];
      parent[leaf] = after;
      diff.push({ field: entry.field, before: [...before], after, result: "APPENDED" });
    } else {
      parent[leaf] = entry.value;
      diff.push({ field: entry.field, before, after: entry.value, result: "SET" });
    }
  }
  return { ok: true, item_id: itemId, character: next, diff, mutated_input: false };
}

/**
 * Apply, explicitly. Returns the new Character; the caller stores it.
 *
 * There is no path from a recommendation to a stored Character that does not
 * pass through here with `confirmed: true`.
 */
export function applyRecommendation(character, itemId, entries = [], { confirmed = false } = {}) {
  if (!confirmed) return { applied: false, code: "EXPLICIT_CONFIRMATION_REQUIRED", character };
  const preview = previewApply(character, itemId, entries);
  if (!preview.ok) return { applied: false, code: preview.code, character };
  return { applied: true, code: "APPLIED", character: preview.character, diff: preview.diff };
}

// ── occupation input ────────────────────────────────────────────────────────
export const OCCUPATION_EXAMPLES = KNOWLEDGE.occupation_examples || [];

/**
 * Recommend items from what the work actually involves.
 *
 * The knowledge marks title-only inference as prohibited, so a row matches on
 * its required signals; an occupation name with no signals returns nothing and
 * says why.
 */
export function recommendFromOccupation({ occupation = "", signals = [] } = {}) {
  const given = new Set(signals.map(signal => String(signal).trim().toLowerCase()).filter(Boolean));
  const matches = [];
  for (const row of OCCUPATION_EXAMPLES) {
    const required = (row.required_signals || []).map(signal => String(signal).trim().toLowerCase());
    const met = required.filter(signal => given.has(signal));
    if (!met.length) continue;
    matches.push({
      occupation_type: row.type,
      matched_signals: met,
      priority_items: row.priority || [],
      allow_more_review: row.allow_more_review_when || [],
      caution_items: row.detail_caution || [],
    });
  }
  if (!given.size) return { ok: false, code: "TITLE_ONLY_INFERENCE_PROHIBITED", reason: "職種名だけでは決めません。実際の業務・成果物・レビュー責任などの手がかりが必要です。", matches: [] };
  if (!matches.length) return { ok: false, code: "NO_SIGNAL_MATCH", reason: "与えられた手がかりに一致する例がありません。", matches: [] };
  return { ok: true, code: "MATCHED", occupation, matches };
}

// ── probes ──────────────────────────────────────────────────────────────────
/** Which of the 20 items each probe can speak to. Probes are reused, not multiplied. */
export function probeMap() {
  const map = new Map();
  for (const item of TUNING_ITEMS) {
    for (const probe of item.probe_ids || []) {
      if (!map.has(probe)) map.set(probe, []);
      map.get(probe).push(item.id);
    }
  }
  return [...map.entries()].map(([probe_id, items]) => ({ probe_id, items }));
}

// ── occupation characteristics, from the CSV the Builder already imports ────
//
// The existing Occupation CSV is `path,value` pairs applied to `role_source`.
// Nothing is added to it: the signals below are read out of fields it already
// carries, so an older CSV keeps working unchanged.
//
// Three derivations are prohibited outright and are not attempted anywhere in
// this module ensures an occupation never implies authority, a credential, or a
// permission. `license_jp` and `license_world` are deliberately not read for
// that reason — a licence in a market survey is not a grant to anyone.
export const OCCUPATION_SIGNAL_SOURCES = {
  work_summary: ["deliverable", "routine nature", "exploratory nature"],
  decomposition: ["system complexity", "cross-team dependency"],
  scenes: ["stakeholder diversity", "customer impact"],
  legal_risk: ["external consequence", "safety/regulatory consequence", "irreversibility"],
  ai_dependency_reason: ["evidence standard", "fact claim boundary"],
  feasibility: ["reversibility", "testability"],
  profitability: ["materiality"],
  role: ["review responsibility", "decision duty"],
};

export const OCCUPATION_FIELDS_NEVER_READ = ["license_jp", "license_world"];

// Words that actually appear in the master's own wording. A signal is raised
// only when the CSV says something; an empty field raises nothing, which is why
// a title alone still yields no recommendation.
const SIGNAL_CUES = {
  "review responsibility": ["レビュー", "審査", "査読", "承認", "監査", "review"],
  "review duty": ["レビュー", "審査", "監査"],
  "decision duty": ["判断", "決定", "意思決定", "決裁"],
  "cross-team dependency": ["連携", "調整", "部門", "他部署", "関係者", "横断"],
  "deadline": ["納期", "期限", "スケジュール", "締切"],
  "time constraint": ["納期", "期限", "即時", "リアルタイム"],
  "deliverable": ["成果物", "納品", "報告書", "資料", "設計書"],
  "routine nature": ["定型", "反復", "日次", "月次", "ルーチン"],
  "exploratory nature": ["探索", "研究", "調査", "企画", "新規"],
  "system complexity": ["システム", "構成", "アーキ", "複雑"],
  "stakeholder diversity": ["顧客", "利用者", "関係者", "社外"],
  "customer impact": ["顧客", "利用者", "クレーム", "満足"],
  "external consequence": ["社外", "公開", "対外", "法令", "規制"],
  "safety/regulatory consequence": ["安全", "法令", "規制", "コンプライアンス", "事故"],
  "irreversibility": ["不可逆", "取り消せ", "恒久", "確定"],
  "evidence standard": ["根拠", "出典", "証跡", "エビデンス"],
  "fact claim boundary": ["事実", "断定", "推測", "正確"],
  "reversibility": ["やり直", "可逆", "復旧", "ロールバック"],
  "testability": ["検証", "テスト", "再現"],
  "materiality": ["重要", "影響度", "金額", "規模"],
};

/**
 * Read the occupation's characteristics out of an imported role_source row.
 *
 * Returns the signals it actually found and the fields they came from, so a
 * recommendation can be traced back to the words in the CSV rather than to a
 * job title.
 */
export function occupationSignalsFrom(roleSource = {}) {
  const found = new Map();
  for (const [field, candidateSignals] of Object.entries(OCCUPATION_SIGNAL_SOURCES)) {
    if (OCCUPATION_FIELDS_NEVER_READ.includes(field)) continue;
    const text = String(roleSource[field] || "");
    if (!text.trim()) continue;
    for (const signal of candidateSignals) {
      const cues = SIGNAL_CUES[signal] || [];
      if (cues.some(cue => text.includes(cue))) {
        if (!found.has(signal)) found.set(signal, []);
        found.get(signal).push(field);
      }
    }
  }
  return [...found.entries()].map(([signal, fields]) => ({ signal, from_fields: fields }));
}

/**
 * The whole chain the instruction asks for, in one call:
 *
 *   Occupation CSV → occupation characteristics → tuning knowledge
 *   → T01..T20 recommendation → Unified V1 field recommendation
 */
export function recommendFromRoleSource(roleSource = {}) {
  const signals = occupationSignalsFrom(roleSource);
  if (!signals.length) {
    return {
      ok: false,
      code: "NO_CHARACTERISTICS_IN_CSV",
      reason: "職種名だけでは決めません。業務内容・成果物・レビュー責任などが CSV に入っていると推奨を出せます。",
      signals: [], items: [], fields: [],
    };
  }
  const matched = recommendFromOccupation({ occupation: roleSource.role || "", signals: signals.map(entry => entry.signal) });
  if (!matched.ok) return { ...matched, signals, items: [], fields: [] };
  const itemIds = [...new Set(matched.matches.flatMap(match => match.priority_items))];
  const items = itemIds.map(id => {
    const recommendation = recommend(id, "DOWN", null);
    return { id, name: recommendation.name, symptom: recommendation.symptom, fields: recommendation.saku.fields, side_effects: recommendation.side_effects };
  });
  return {
    ok: true, code: "MATCHED",
    occupation: roleSource.role || "",
    signals,
    matched_types: matched.matches.map(match => match.occupation_type),
    items,
    fields: [...new Set(items.flatMap(item => item.fields))],
    mapping_version: KNOWLEDGE.version,
  };
}
