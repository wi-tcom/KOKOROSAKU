// How far a Character is from saving: the 30 fields the adopted schema requires, in three steps
// (Owner 2026-10-14, Q12: 「必須項目を３分割してバーや進捗を出せますか」 — 「案の通りで進めてください」).
//
//   ① 目的と役割            7  identity and purpose
//   ② 判断と人への引き継ぎ    8  values, ranges, hand-off to a person (seat 8)
//   ③ 人格の軸              15  personality axes a–o
//
// The count comes from the same check that blocks the save (validateCompleteAdoptedCharacter): a field is done
// when no issue points at it or inside it. An issue outside the 30 is counted as `other`, so the bar never reads
// complete while the save would still be refused. Step names are provisional (ライター&SNS).
export const STEPS = Object.freeze([
  Object.freeze({ id: "purpose", label: Object.freeze({ ja: "目的と役割", en: "Purpose and role" }), fields: Object.freeze([
    "/identity/character_id", "/identity/display_name", "/purpose/summary", "/purpose/primary_value",
    "/purpose/work_modes", "/purpose/non_goals", "/character_core/character_role",
  ]) }),
  Object.freeze({ id: "handoff", label: Object.freeze({ ja: "判断と人への引き継ぎ", en: "Judgment and hand-off to a person" }), fields: Object.freeze([
    "/character_core/values", "/character_core/expressive_range/allowed_variation", "/character_core/expressive_range/prohibited_drift",
    "/character_core/human_handoff_conditions", "/assistant_composition/seat8/human_required_condition_refs",
    "/assistant_composition/seat8/expected_human_contribution", "/assistant_composition/seat8/handoff_question_requirements",
    "/assistant_composition/seat8/handoff_material_requirements",
  ]) }),
  Object.freeze({ id: "axes", label: Object.freeze({ ja: "人格の軸", en: "Personality axes" }), fields: Object.freeze([
    "a_motif", "b_companion_domain", "c_intelligence_vector", "d_socratic_angle", "e_vocabulary_tone", "f_acknowledgement",
    "g_pulse", "h_tactile", "i_thinking_pause_ms", "j_theme_color", "k_whitespace_percent", "l_weathering_presentation",
    "m_error_narrative", "n_crystallization", "o_closing",
  ].map(axis => `/personality_axes/${axis}`)) }),
]);

// One required field has no label in the semantic registry (the alert showed its path). Named here for the bar.
export const EXTRA_LABELS = Object.freeze({
  "/assistant_composition/seat8/human_required_condition_refs": Object.freeze({ ja: "席 8 に渡す条件（人に任せる条件のうち 1 つ以上）", en: "Conditions handed to seat 8 (at least one hand-off condition)" }),
});

// Where ② shows a field that has no place of its own: the seat-8 refs are marked inside the hand-off conditions.
export const FIELD_ANCHORS = Object.freeze({
  "/assistant_composition/seat8/human_required_condition_refs": "/character_core/human_handoff_conditions",
});

/** The schema path as ② names its places (data-canonical-path): "/purpose/summary" → "purpose.summary". */
export const canonicalOf = issuePath => String(issuePath || "").replace(/^\//, "").replace(/\//g, ".").replace(/~1/g, "/").replace(/~0/g, "~");

/** The place in ② to go to for a field: its anchor's canonical path. */
export const placeOf = field => canonicalOf(FIELD_ANCHORS[field] || field);

const inside = (issuePath, field) => issuePath === field || issuePath.startsWith(`${field}/`);

/**
 * issues: the `errors` of validateCompleteAdoptedCharacter ([{ path, ... }]).
 * Returns { steps: [{ id, done, total, missing: [path] }], other: [path], complete }.
 */
export function progressFromIssues(issues) {
  const paths = (issues || []).map(issue => String(issue && issue.path || ""));
  const claimed = new Set();
  const steps = STEPS.map(step => {
    const missing = step.fields.filter(field => {
      const hit = paths.filter(path => inside(path, field));
      hit.forEach(path => claimed.add(path));
      return hit.length > 0;
    });
    return { id: step.id, done: step.fields.length - missing.length, total: step.fields.length, missing };
  });
  const other = [...new Set(paths.filter(path => !claimed.has(path)))];
  return { steps, other, complete: steps.every(step => step.done === step.total) && other.length === 0 };
}

/** The first field the save still needs, in step order, then the first other issue; null when nothing is missing. */
export function firstMissingField(progress) {
  for (const step of progress.steps) if (step.missing.length) return step.missing[0];
  return progress.other[0] || null;
}

/**
 * The save warning's lines (Q12: the same words as the bar): each required field by its name and 「未入力」, then any other
 * issue by its name — never the check's English text or an internal path. labelOf(canonicalPath, lang) → a name or "".
 */
export function saveWarningLines(issues, labelOf, locale = "ja") {
  const lang = locale === "en" || locale === "en-US" ? "en" : "ja";
  const progress = progressFromIssues(issues);
  const nameOf = issuePath => {
    if (EXTRA_LABELS[issuePath]) return EXTRA_LABELS[issuePath][lang];
    // An issue inside a field (one list item) is named by the nearest field that has a name.
    for (let parts = canonicalOf(issuePath).split("."); parts.length; parts.pop()) {
      const name = labelOf(parts.join("."), lang);
      if (name) return name;
    }
    return lang === "en" ? "Another field" : "そのほかの項目";
  };
  const lines = [];
  for (const step of progress.steps) for (const field of step.missing) lines.push(lang === "en" ? `${nameOf(field)}: not filled in` : `${nameOf(field)}：未入力`);
  // Outside the 30: an empty or absent value is 「未入力」 too; anything else does not fit the form.
  const EMPTY_KEYWORDS = new Set(["required", "minItems", "minLength", "minProperties"]);
  for (const issuePath of progress.other) {
    const empty = (issues || []).some(issue => String(issue && issue.path || "") === issuePath && EMPTY_KEYWORDS.has(issue.keyword));
    lines.push(lang === "en"
      ? `${nameOf(issuePath)}: ${empty ? "not filled in" : "does not fit the required form"}`
      : `${nameOf(issuePath)}：${empty ? "未入力" : "入力の形が合いません"}`);
  }
  return [...new Set(lines)];
}

/** The bar for one Character, with the same check the save uses. */
export function progressFor(character, schema, validate) {
  const verdict = validate(character, schema);
  return progressFromIssues(verdict.errors);
}
