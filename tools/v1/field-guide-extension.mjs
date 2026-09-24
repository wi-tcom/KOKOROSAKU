// Field guide extension (U1, Owner 2026-09-22 §8): the writer-editable
// `manual/saku-field-guide.extension.json` is merged into the generated
// `manual/saku-field-guide.data.json`, which the edit screen, the desktop
// screens and manual.html all read.  Nothing here invents an effect: a
// selectable option carries an `effect` only when it comes from
// PARAM_BEHAVIOR_MAP (generated here, never typed) or from a recorded fact;
// everything else says 「未確認（設計上の意図のみ）」.
import { PARAM_BEHAVIOR_MAP, PRESENTATION_AXES } from "../unified-v1/derived-profile-engine.mjs";
import { PROMPT_MEANING_FIELDS } from "../unified-v1/platform-prompt.mjs";

/** Revision tag for map-derived effects: the engine file's sha256, supplied by the generator (writer C1). */
let MAP_SOURCE_REV = null;
export function setBehaviorMapSourceRev(rev) { MAP_SOURCE_REV = rev ? String(rev) : null; }

export const EXTENSION_PROFILE = "saku.field-guide-extension@1";
export const NOT_MEASURED_TEXT = "未確認（設計上の意図のみ）";  // the 「効果:」 label belongs to the renderer (writer M1)
export const EFFECT_SOURCE_KINDS = Object.freeze(["PARAMETER_BEHAVIOR_MAP", "AMU_CONFIRMED_2026-09-22", "PROMPT_INCLUDED_03 + DESIGN_INTENT", "DESIGN_INTENT", "PRESENTATION_ONLY", "OPERATION_FACT", "NOT_MEASURED"]);
/** Effect bodies never carry these (Owner criterion + 統制卓 2026-09-22: 断定語なし、製品名は出典欄へ). */
export const EFFECT_FORBIDDEN_WORDS = Object.freeze(["必ず", "常に", "確実に", "保証", "絶対"]);
export const EFFECT_FORBIDDEN_PRODUCT_NAMES = Object.freeze(["AMU", "MACHI", "ERABAZU", "KOKOROAMU", "KOKOROSAKU", "03 では", "03では", "04 では", "04では"]);
/** Truth of the PROMPT_INCLUDED_03 label: it may only sit on a field whose selected value the 03 prompt hands over as a meaning sentence. */
export const PROMPT_INCLUDED_LABEL = "PROMPT_INCLUDED_03 + DESIGN_INTENT";
export const isPromptIncludedField = canonicalPath => PROMPT_MEANING_FIELDS.includes(String(canonicalPath || ""));
export const CANDIDATE_SOURCE_PATTERN = /^(OSS_SAMPLE:[a-z0-9-]+|SCHEMA:[^@\s]+@[0-9a-f]{7,40}|OWNER_APPROVED:\d{4}-\d{2}-\d{2})$/;

const strengthWord = value => value >= 2 ? "大きく上がります" : value > 0 ? "上がります" : value <= -2 ? "大きく下がります" : "下がります";

/**
 * Japanese effect sentence for one PARAM_BEHAVIOR_MAP entry, in the writer
 * team's form: rising traits first, at most three, no numbers.
 *   { fact_orientation: +2, structural_thinking: +1, convergence: -1 }
 *   → 「Expected Profile の『事実重視』が大きく上がり、『構造で捉える力』が上がります。『一案への収束』は下がります。」
 */
export function effectSentence(contribution, traitLabels) {
  const entries = Object.entries(contribution || {}).filter(([, v]) => Number.isFinite(v) && v !== 0);
  if (!entries.length) return null;
  const label = trait => `『${traitLabels?.[trait] || trait}』`;
  const up = entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const down = entries.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
  const kept = [...up, ...down].slice(0, 3);
  const ups = kept.filter(([, v]) => v > 0), downs = kept.filter(([, v]) => v < 0);
  const parts = [];
  if (ups.length) {
    const groups = new Map();
    for (const [t, v] of ups) { const w = strengthWord(v); if (!groups.has(w)) groups.set(w, []); groups.get(w).push(label(t)); }
    const clauses = [...groups.entries()].map(([w, ts]) => `${ts.join("と")}が${w}`);
    parts.push(`Expected Profile の${clauses.join("、").replace(/上がります、/g, "上がり、")}。`);
  }
  if (downs.length) {
    const groups = new Map();
    for (const [t, v] of downs) { const w = strengthWord(v); if (!groups.has(w)) groups.set(w, []); groups.get(w).push(label(t)); }
    parts.push(`${[...groups.entries()].map(([w, ts]) => `${ts.join("と")}は${w}`).join("。")}。`);
  }
  return parts.join("");
}

/** The section of PARAM_BEHAVIOR_MAP that explains a canonical field, if any. */
export function behaviorMapSection(canonicalPath) {
  const key = String(canonicalPath || "").replace(/^personality_axes\./, "");
  return Object.prototype.hasOwnProperty.call(PARAM_BEHAVIOR_MAP, key) ? key : null;
}

/** effect + source for one option of one field.  Generated for the map, recorded facts from the extension, otherwise NOT_MEASURED. */
export function optionEffect(canonicalPath, value, extension) {
  const recorded = extension?.fields?.[canonicalPath]?.options?.[String(value)];
  const section = behaviorMapSection(canonicalPath);
  if (recorded?.effect_ja && recorded?.effect_source) {
    // a PROMPT_INCLUDED_03 label on a field the prompt does not carry is demoted, never shown as fact
    const demoted = /^PROMPT_INCLUDED_03/.test(recorded.effect_source) && !isPromptIncludedField(canonicalPath);
    const source = demoted ? "DESIGN_INTENT" : recorded.effect_source;
    // v2 (Owner 2026-09-22): the map-sourced text is written (traits translated into behavior) but stays pinned to the map entry
    const mapped = source === "PARAMETER_BEHAVIOR_MAP" && section && PARAM_BEHAVIOR_MAP[section][String(value)];
    return {
      ja: recorded.effect_ja, ...(recorded.effect_en ? { en: recorded.effect_en } : {}), source,
      ...(demoted ? { demoted_from: recorded.effect_source } : {}),
      ...(mapped ? { section: `${section}.${value}`, ...(MAP_SOURCE_REV ? { source_rev: MAP_SOURCE_REV } : {}) } : extension?.effect_sources?.[source]?.section ? { section: extension.effect_sources[source].section } : {}),
      ...(source === "PRESENTATION_ONLY" ? { presentation_only: true } : {}),
      ...(recorded.source_note_ja ? { source_note: { ja: recorded.source_note_ja } } : {}),
    };
  }
  if (section && PARAM_BEHAVIOR_MAP[section][String(value)]) {
    const ja = effectSentence(PARAM_BEHAVIOR_MAP[section][String(value)], extension?.trait_labels_ja);
    if (ja) return { ja, source: "PARAMETER_BEHAVIOR_MAP", section: `${section}.${value}`, ...(MAP_SOURCE_REV ? { source_rev: MAP_SOURCE_REV } : {}) };
  }
  const axis = String(canonicalPath || "").replace(/^personality_axes\./, "");
  return { ja: NOT_MEASURED_TEXT, source: "NOT_MEASURED", ...(PRESENTATION_AXES.has(axis) ? { presentation_only: true } : {}) };
}

/** Distinct values of a semi-open text field across the OSS sample Characters, each tagged with its source. */
export function ossSampleCandidates(canonicalPath, sampleCharacters) {
  const out = []; const seen = new Set();
  for (const character of sampleCharacters || []) {
    const id = character?.identity?.character_id; if (!id) continue;
    const value = canonicalPath.split(".").reduce((node, key) => (node && typeof node === "object") ? node[key] : undefined, character);
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item !== "string" || !item.trim() || seen.has(item)) continue;
      seen.add(item); out.push({ value: item, source: `OSS_SAMPLE:${id}` });
    }
  }
  return out;
}

/**
 * Merge the extension into the enriched manual fields.  Returns new field
 * objects; every enum option gains `effect`, every field gains `currentNote`,
 * semi-open fields gain `candidates` (OSS samples + Owner-approved list).
 */
export function mergeExtension(fields, extension, { sampleCharacters = [] } = {}) {
  return fields.map(field => {
    const ext = extension?.fields?.[field.canonicalPath] || {};
    const help = { ...field.help };
    if (Array.isArray(help.optionDetails) && help.optionDetails.length) {
      help.optionDetails = help.optionDetails.map(option => ({ ...option, effect: optionEffect(field.canonicalPath, option.value, extension), ...directiveOf(extension?.fields?.[field.canonicalPath]?.options?.[String(option.value)]) }));
    }
    const merged = {
      ...field,
      help,
      currentNote: { ja: ext.current_note_ja ?? null, en: ext.current_note_en ?? null },
      uiLabel: ext.ui_label_ja ? { ja: ext.ui_label_ja } : null,
    };
    if (ext.candidates) {
      const stamp = `OWNER_APPROVED:${ext.candidates.owner_approved_on || "0000-00-00"}`;
      const approved = (ext.candidates.owner_approved || []).map(item => typeof item === "string" ? { value: item, source: stamp } : { value: item.value, source: item.source || stamp, ...(item.note ? { note: item.note } : {}), ...(item.value_en ? { value_en: item.value_en } : {}), ...(item.note_en ? { note_en: item.note_en } : {}) });
      const items = [...ossSampleCandidates(field.canonicalPath, sampleCharacters), ...approved];
      // A datalist is offered only once three or more Owner-approved words exist;
      // anything shorter (or long OSS sentences) is shown as 入力例 (writer M3).
      const render = approved.length >= 3 ? "datalist" : "examples";
      merged.candidates = { policy: ext.candidates.policy, render, items, ...(render === "datalist" ? { screen_note: { ja: extension?.candidate_screen_note_ja || "例です。自由に書けます", en: extension?.candidate_screen_note_en ?? null } } : {}) };
    }
    return merged;
  });
}

/** The Directive Glossary lines of one option (DSL, English) — passed through untouched; lint lives in directive-glossary.mjs. */
const directiveOf = option => Array.isArray(option?.directive) && option.directive.length ? { directive: option.directive.slice() } : {};

const factEffect = (option, extension) => {
  const source = option.effect_source || "NOT_MEASURED";
  const section = extension?.effect_sources?.[source]?.section;
  return { ja: option.effect_ja || NOT_MEASURED_TEXT, ...(option.effect_en ? { en: option.effect_en } : {}), source, ...(section ? { section } : {}), ...(option.source_note_ja ? { source_note: { ja: option.source_note_ja } } : {}) };
};

/** Structured-enum dictionaries (values inside repeating rows, e.g. reason_class) with their effects. */
export function structuredEnums(extension) {
  const out = {};
  for (const [key, entry] of Object.entries(extension?.structured_enums || {})) {
    out[key] = { schema_path: entry.schema_path, options: Object.entries(entry.options || {}).map(([value, option]) => ({ value, meaning: { ja: option.meaning_ja, en: option.meaning_en ?? null }, effect: factEffect(option, extension), ...directiveOf(option) })) };
  }
  return out;
}

/** Non-canonical authoring fields: what they are and that they never reach the Character. */
export function nonCanonicalFields(extension) {
  return (extension?.non_canonical_fields || []).map(item => ({
    path: item.path, uiLabel: { ja: item.ui_label_ja, en: item.ui_label_en ?? null }, canonicalOutput: Boolean(item.canonical_output), goesTo: { ja: item.goes_to, en: item.goes_to_en ?? null }, currentNote: { ja: item.current_note_ja, en: item.current_note_en ?? null },
    options: item.options ? Object.entries(item.options).map(([value, option]) => ({ value, meaning: { ja: option.meaning_ja, en: option.meaning_en ?? null }, effect: factEffect(option, extension), ...directiveOf(option) })) : null,
  }));
}
