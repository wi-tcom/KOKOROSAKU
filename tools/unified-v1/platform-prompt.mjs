// 03 AI プラットフォーム — the text handed to an external AI (U4 boundary module).
//
// Pure functions, no DOM. Whatever the caller passes, only the Unified V1
// top-level keys of the Character leave through here: Library provenance,
// verification, the Active SAKU envelope, authoring leftovers and anything
// else outside the adopted schema are dropped before a byte is rendered.
// `verify_platform_prompt_boundary.mjs` holds the falsifiable version of that
// sentence.
//
// Layout (Owner 2026-09-22, DESIGN_2026-09-22_prompt_directive_glossary §1/§3/§7):
//   B   the shared base layer (`baseLayer` / `baseText`): identical bytes in every
//       repo, first, ending in Precedence. A layer whose sha256 does not match the
//       one the product shipped stops the text (設計 2026-09-23 §9, fail closed)
//   L3  persona in Japanese, verbatim — name, role, purpose, values, invariants, voice
//   L1  the selected tokens in a fixed shape (work_modes / axes / handoff reasons)
//   L2  the Directive Glossary lines for those tokens only (English policy DSL)
//   L4  output rules: Japanese reply, persona voice, invariants and handoff conditions win
// A bare token never stands alone: its meaning travels as the L2 lines. The
// five presentation axes (a/i/j/k/l) stay home.
import { axisLetter, renderDirectiveBlock } from "./directive-glossary.mjs";

export const PROMPT_AXES = Object.freeze(["b_companion_domain", "c_intelligence_vector", "d_socratic_angle", "e_vocabulary_tone", "f_acknowledgement", "g_pulse", "h_tactile", "m_error_narrative", "n_crystallization", "o_closing"]);
export const PROMPT_EXCLUDED_AXES = Object.freeze(["a_motif", "i_thinking_pause_ms", "j_theme_color", "k_whitespace_percent", "l_weathering_presentation"]);
/** Fields whose selected values reach the 03 prompt as directives. The only fields an effect text may label PROMPT_INCLUDED_03. */
export const PROMPT_MEANING_FIELDS = Object.freeze(["purpose.work_modes", ...PROMPT_AXES.map(axis => `personality_axes.${axis}`)]);
export const REASON_CLASS_PATH = "character_core.human_handoff_conditions.reason_class";
/** The operation class lives outside the Character (Catalog Release facet), so it is always passed in, never read from the Character. */
export const OPERATION_CLASS_PATH = "meta.operation_class";
/** Everything L2 can carry: the eleven fields above plus the handoff reason classes named in the Character. */
export const PROMPT_DIRECTIVE_FIELDS = Object.freeze([...PROMPT_MEANING_FIELDS, REASON_CLASS_PATH]);
/** Said in the provenance line when a pack shipped a glossary that could not be read (統制卓 2026-09-23: never degrade silently). */
export const GLOSSARY_FELL_BACK = "bundled with the app — the Character Pack's own glossary could not be read";
export const GLOSSARY_UNAVAILABLE = "(directive glossary unavailable — tokens only; meanings are not being handed over)";
export const DIRECTIVE_UNREGISTERED = "(no directive registered)";
/** Heading of the shared base layer (B). Its text is written elsewhere and shipped identically by every repo; 03 only carries it. */
export const BASE_HEADING = "## Base";   // = SECTION_HEADINGS.base, kept for callers from before the 3-layer layout
/**
 * B closes with a PRECEDENCE block saying which layer wins. 03 checks that the
 * block is there and says something — not that it says one exact sentence.
 *
 * It used to require the sentence from the design draft verbatim. The approved
 * B v0.4 states the same rule in three lines of its own, so the exact match
 * would have refused the approved text at run time while the grammar lint
 * passed it (統制卓 2026-09-23). Checking the structure keeps the point of the
 * check — the layer must not arrive truncated — without holding B's wording
 * hostage to a draft sentence.
 */
export const PRECEDENCE_HEADING = /^PRECEDENCE\b/m;
/** Kept for callers that quoted the draft sentence; the check no longer requires it. */
export const PRECEDENCE_OPENING = "Hard invariants and handoff conditions override everything.";

/** The PRECEDENCE block: the heading, plus the lines under it up to a blank line or the end. */
export function precedenceBlock(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const at = lines.findIndex(line => PRECEDENCE_HEADING.test(line));
  if (at < 0) return null;
  const body = [];
  for (const line of lines.slice(at + 1)) {
    if (!line.trim()) { if (body.length) break; continue; }
    body.push(line.trim());
  }
  return { heading: lines[at].trim(), body };
}
/** Profile of the shared base layer, so the provenance line can name what was handed over. */
export const BASE_LAYER_PROFILE = "saku.base-directives@1";
/**
 * The base layer the product ships, and the digest it must have (統制卓 2026-09-23,
 * Owner-approved v1.0). The file is compared against this before anything leaves
 * 03: a byte out of place — a CRLF from a checkout, an edited line — stops the
 * hand-off rather than sending a base layer nobody approved.
 */
export const BASE_LAYER_VERSION = "1.0";
export const BASE_LAYER_SHA256 = "ab4745a3617e5b8e49125146a47ee99d1adde7ad8436c953431518ac23358654";
export const BASE_LAYER_FILE = "base/saku-base-directives.v1.txt";

/** sha256 of a text, the way the base layer's digest is taken (UTF-8 bytes, Web Crypto). */
export async function sha256Of(text) {
  const hash = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text ?? "")));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Read the shipped base layer and hand back a layer ready for platformLaunchText, or the reason it cannot be used. */
export async function loadBaseLayer(fetchText) {
  const text = await fetchText(BASE_LAYER_FILE);
  if (typeof text !== "string" || !text) return { layer: null, problems: ["the base layer file could not be read"] };
  const layer = { text, version: BASE_LAYER_VERSION, sha256: await sha256Of(text), expectedSha256: BASE_LAYER_SHA256 };
  const problems = baseLayerProblems(layer);
  return { layer: problems.length ? null : layer, problems };
}

/**
 * Fail-closed check of a base layer before anything leaves 03 (設計 §9): the
 * bytes must be the ones the product shipped and must end with Precedence.
 * The caller computes the digest (Web Crypto is async) and passes it in.
 */
export function baseLayerProblems(layer) {
  const problems = [];
  if (!layer || typeof layer !== "object") return ["no base layer"];
  const text = typeof layer.text === "string" ? layer.text.trim() : "";
  if (!text) problems.push("base layer text is empty");
  if (!layer.version) problems.push("base layer version is missing");
  if (!/^[0-9a-f]{64}$/.test(String(layer.expectedSha256 || ""))) problems.push("expected base layer sha256 is missing");
  if (!/^[0-9a-f]{64}$/.test(String(layer.sha256 || ""))) problems.push("base layer sha256 was not computed");
  else if (layer.sha256 !== layer.expectedSha256) problems.push("base layer sha256 does not match the one the product shipped");
  const precedence = text ? precedenceBlock(text) : null;
  if (text && !precedence) problems.push("base layer does not carry a PRECEDENCE block");
  else if (text && !precedence.body.length) problems.push("the base layer's PRECEDENCE block says nothing");
  return problems;
}

/**
 * Text that comes from a Character or a Character Pack enters the hand-off on
 * a line of its own label, never as lines of its own (Owner 2026-09-23). A line
 * break inside a value would otherwise let that value write
 * `--- … ここまで ---`, `## Base` or `B0 CORE:` at the start of a line, where
 * the external AI reads it as structure. Every break — CRLF, CR, LF, VT, FF,
 * NEL, LS, PS — becomes a space. No Character that ships carries one, so the
 * text handed over for them is byte-for-byte what it was. The base layer is
 * not passed through this: it is multi-line by design and pinned by sha256.
 */
const LINE_BREAKS = /\r\n|[\r\n\u000b\u000c\u0085\u2028\u2029]/g;
export function oneLine(value) {
  return String(value ?? "").replace(LINE_BREAKS, " ");
}
/** Whether `text` has a line that is exactly `line` (a heading), not merely contains it. */
const hasLine = (text, line) => String(text).split("\n").includes(line);

/** One line right before whatever the person types (uncached tail): what to obey and what wins. */
export const FOLLOW_LINE = "Follow the directives above. Hard invariants and handoff conditions come first.";
/** Section headings shared by 03, AMU and MACHI (設計 2026-09-23 §2). */
export const SECTION_HEADINGS = Object.freeze({ base: "## Base", character: "## Character", directives: "## Character directives", instance: "## Instance" });
/** Output rules. They belong to B; 03 falls back to these only when no base layer is supplied. */
export const OUTPUT_RULES = Object.freeze([
  "Reply in Japanese, in the voice defined above.",
  "Directives use ALWAYS / NEVER / PREFER / IF-THEN / HANDOFF / OUTPUT. Follow them as strong tendencies; hard invariants and handoff conditions override them.",
  "Never claim certainty you do not have.",
]);

/** Top-level keys of the adopted Unified V1 schema (properties, additionalProperties:false). */
export const UNIFIED_TOP_LEVEL_KEYS = Object.freeze(["schema", "identity", "purpose", "character_core", "expression_semantics", "assistant_composition", "personality_axes", "conformance_expectations", "extensions"]);

/** The Character alone: keys outside the adopted schema never reach the prompt, the JSON or the YAML. */
export function canonicalOnly(character) {
  if (!character || typeof character !== "object" || Array.isArray(character)) return null;
  const out = {};
  for (const key of UNIFIED_TOP_LEVEL_KEYS) if (key in character) out[key] = character[key];
  return out;
}

/** The one format 03 and the Trainer hand over. Kept as a value so callers and gates name the same thing. */
export const HANDOFF_FORMAT = "prompt";

/**
 * The full text to paste. `options.directives` is the lookup from
 * directive-glossary.mjs (path → value → lines) and `options.glossaryDigest`
 * the field guide's recorded sha256; without them the L2 section says so.
 *
 * `format` is kept for callers written before 03's JSON and YAML buttons were
 * removed (Owner 2026-09-23). Only "prompt" composes a hand-off. JSON and YAML
 * went through this function without the base layer and without the directive
 * blocks, while still telling the AI to follow directives that were not there;
 * asking for one now yields nothing rather than that text. The Character's JSON
 * and YAML still exist where they have a purpose — the edit screen's output tab.
 */
export function platformLaunchText(rawCharacter, format = HANDOFF_FORMAT, options = {}) {
  if (format !== HANDOFF_FORMAT) return "";
  const character = canonicalOnly(rawCharacter);
  if (!character) return "";
  // Fail closed (設計 2026-09-23 §9): a base layer that is not the one the product
  // shipped stops the whole text — nothing partial goes to an external AI.
  if (options.baseLayer && baseLayerProblems(options.baseLayer).length) return "";
  const name = oneLine(character?.identity?.display_name || "").trim() || "(display_name 未設定)";
  const body = characterPromptText(character, options);
  if (!body) return "";
  const instruction = [
    "以下はあなたが演じるキャラクターの定義です。",
    "1. この定義に従って振る舞ってください。",
    "2. 定義に書かれていない必要な情報を、勝手に作って埋めないでください。分からないことは分からないと言ってください。",
    "3. まずキャラクターとして短いあいさつをしてください。",
    "",
    `--- ${name} のキャラクター定義 ここから ---`,
    body,
    `--- ${name} のキャラクター定義 ここまで ---`,
  ];
  // FOLLOW_LINE names directives above it, so it is only written when there are
  // some: the base layer, or the Character's own directive block. A Character
  // with no selected token and no base layer gets the definition without the
  // closing line rather than a closing line that points at nothing.
  // A heading counts when it is a line, not when a value merely quotes it.
  if (hasLine(body, SECTION_HEADINGS.base) || hasLine(body, SECTION_HEADINGS.directives)) {
    instruction.push("", FOLLOW_LINE);   // the person's own text follows this line
  }
  return instruction.join("\n");
}

/** 04 Trainer puts its menu after the 03 text, with this between them. */
export const TRAINING_MENU_SEPARATOR = "\n\n===== SAKU TRAINING MENU =====\n\n";

/**
 * What 04 Trainer hands to an external AI: the 03 text byte for byte, then the
 * training menu (Owner 2026-09-23). The Trainer observes behaviour, so it has
 * to observe the configuration that ships; until β.4 it sent the raw JSON
 * snapshot, which carried neither the base layer nor the directive blocks, so
 * its records were not evidence about what ships. The snapshot keeps the place
 * it belongs — the record of what was tested, not the text handed over.
 */
export function trainerHandoffText(rawCharacter, { menu = "", ...options } = {}) {
  const text = platformLaunchText(rawCharacter, HANDOFF_FORMAT, options);
  if (!text) return "";   // fail closed reaches this route too
  const tail = String(menu ?? "");
  return tail ? `${text}${TRAINING_MENU_SEPARATOR}${tail}` : text;
}

/**
 * Every route that hands composed text to an external AI. Gates walk this list
 * rather than naming screens one at a time, so a route added here is checked
 * for the base layer from the moment it exists. Both holes β.4 showed — 03's
 * JSON and YAML buttons and the Trainer — were routes no check ever looked at.
 */
export const HANDOFF_ROUTES = Object.freeze([
  Object.freeze({ id: "platform.launch", screen: "03 AI プラットフォーム", control: "貼り付ける文", compose: (character, options = {}) => platformLaunchText(character, HANDOFF_FORMAT, options) }),
  Object.freeze({ id: "trainer.definition", screen: "04 Trainer", control: "キャラクターの定義をコピー", compose: (character, options = {}) => trainerHandoffText(character, options) }),
]);

/**
 * Which construction a Trainer record was measured under (Owner 2026-09-23,
 * decision 3). Records made before the Trainer was changed carry no mark; they
 * are read as `rawSnapshot`, whose digest is the one already in the record,
 * because what was handed over then was exactly that snapshot. Nothing stored
 * is rewritten and nothing is deleted.
 */
export const PROMPT_CONSTRUCTION = Object.freeze({
  composed: "COMPOSED_BASE_CHARACTER_DIRECTIVES@1",
  rawSnapshot: "RAW_CHARACTER_SNAPSHOT_BEFORE_2026_09_23",
});

// The Character's YAML rendering lived here. It existed for 03's YAML button,
// which handed over a Character with no base layer and no directive blocks; the
// button is gone (Owner 2026-09-23) and the edit screen's output tab renders
// character.yaml with its own writer, so nothing called this any more.

/**
 * The selected tokens (L1). `operationClass` is not part of the Character: it
 * comes from the signed Catalog Release facet, and only the Character's own
 * value is ever passed (統制卓 2026-09-23, condition (i)).
 */
export function selectedTokens(rawCharacter, { operationClass = null } = {}) {
  const character = canonicalOnly(rawCharacter) || {};
  const axes = character.personality_axes || {};
  const workModes = Array.isArray(character.purpose?.work_modes) ? character.purpose.work_modes.map(String) : [];
  const axisEntries = PROMPT_AXES.filter(key => axes[key] !== undefined && axes[key] !== null && String(axes[key]).trim() !== "").map(key => [key, String(axes[key])]);
  const reasons = [...new Set((character.character_core?.human_handoff_conditions || []).map(c => c?.reason_class).filter(Boolean).map(String))];
  return { workModes, axisEntries, reasons, operationClass: operationClass ? String(operationClass) : null };
}

/**
 * The [path, value] pairs a Character Pack cuts into `directives.json`. Every
 * repo uses this one function so the three of them cut the same set.
 */
export function packSelection(rawCharacter, { operationClass = null } = {}) {
  const { workModes, axisEntries, reasons, operationClass: operation } = selectedTokens(rawCharacter, { operationClass });
  return [
    ...workModes.map(mode => ["purpose.work_modes", mode]),
    ...axisEntries.map(([key, value]) => [`personality_axes.${key}`, value]),
    ...reasons.map(reason => [REASON_CLASS_PATH, reason]),
    ...(operation ? [[OPERATION_CLASS_PATH, operation]] : []),
  ];
}

/** L1 + L2 + L4 for a Character. Exported so a golden test and AMU's assembly can compare the block alone. */
export function directiveSection(rawCharacter, { directives = null, glossaryDigest = null, withBase = false, glossarySource = "bundled", glossaryFallback = false, baseLayer = null, operationClass = null } = {}) {
  const { workModes, axisEntries, reasons, operationClass: operation } = selectedTokens(rawCharacter, { operationClass });
  if (!workModes.length && !axisEntries.length && !reasons.length && !operation) return "";
  const lookup = directives instanceof Map ? directives : null;
  const lines = [SECTION_HEADINGS.directives];
  if (!lookup) lines.push(GLOSSARY_UNAVAILABLE);
  else lines.push(`glossary: saku.directive-glossary@1${glossaryDigest ? ` sha256:${String(glossaryDigest).slice(0, 16)}` : ""} (${glossarySource === "pack" ? "from the Character Pack" : glossaryFallback ? GLOSSARY_FELL_BACK : "bundled with the app"})`);
  if (baseLayer) lines.push(`base: ${BASE_LAYER_PROFILE} v${baseLayer.version} sha256:${String(baseLayer.sha256).slice(0, 16)}`);
  // Tokens are looked up as they are and rendered through oneLine(): a token
  // the glossary knows has no line break, and one it does not know is shown,
  // flattened, as unregistered.
  if (workModes.length) lines.push(`work_modes: [${workModes.map(oneLine).join(", ")}]`);
  if (axisEntries.length) lines.push(`axes: {${axisEntries.map(([key, value]) => `${axisLetter(key)}: ${oneLine(value)}`).join(", ")}}`);
  if (reasons.length) lines.push(`handoff_reasons: [${reasons.map(oneLine).join(", ")}]`);
  if (operation) lines.push(`operation_class: ${oneLine(operation)}`);
  if (lookup) {
    // Glossary lines can come from a Character Pack's directives.json, so they are flattened too.
    const block = (path, head, value) => { const found = lookup.get(path)?.get(value); lines.push("", found ? renderDirectiveBlock(oneLine(head), found.map(oneLine)) : `${oneLine(head)}: ${DIRECTIVE_UNREGISTERED}`); };
    for (const mode of workModes) block("purpose.work_modes", mode, mode);
    for (const [key, value] of axisEntries) block(`personality_axes.${key}`, `${axisLetter(key)}=${value}`, value);
    for (const reason of reasons) block(REASON_CLASS_PATH, `reason=${reason}`, reason);
    if (operation) block(OPERATION_CLASS_PATH, `operation_class=${operation}`, operation);
  }
  // The output rules live in B; without a base layer 03 still has to carry them.
  if (!withBase) lines.push("", "## Output rules", ...OUTPUT_RULES);
  return lines.join("\n");
}

export function characterPromptText(rawCharacter, options = {}) {
  const character = canonicalOnly(rawCharacter) || {};
  const identity = character?.identity || {};
  const purpose = character?.purpose || {};
  const core = character?.character_core || {};
  const expression = character?.expression_semantics || {};
  const seat7 = character?.assistant_composition?.seat7 || {};
  const seat8 = character?.assistant_composition?.seat8 || {};
  const lines = [];
  // Every value from the Character goes through oneLine(): it stays on its label's line.
  const add = (label, value) => { if (value !== undefined && value !== null && String(value).trim()) lines.push(`${label}: ${oneLine(value)}`); };
  const addList = (label, list) => { if (Array.isArray(list) && list.length) lines.push(`${label}: ${list.map(oneLine).join(" / ")}`); };
  const required = (label, value) => lines.push(`${label}: ${value !== undefined && value !== null && String(value).trim() ? oneLine(value) : "未設定（推測しない）"}`);
  // B: the shared base layer, identical in every repo, always first (it carries the
  // output rules and the Precedence line, so nothing below repeats them). A layer
  // that does not check out stops the text rather than going out silently (設計 §9).
  const layer = options.baseLayer && typeof options.baseLayer === "object" ? options.baseLayer : null;
  if (layer && baseLayerProblems(layer).length) return "";
  const base = layer ? String(layer.text ?? "").trim() : (typeof options.baseText === "string" ? options.baseText.trim() : "");
  if (base) lines.push(SECTION_HEADINGS.base, base, "");
  lines.push(SECTION_HEADINGS.character);
  lines.push("【Identity】");
  add("名前", identity.display_name);
  add("Character ID", identity.character_id);
  add("Revision", identity.character_revision);
  required("役割", core.character_role);
  lines.push("");
  lines.push("【Purpose / Values】");
  required("目的", purpose.summary);
  required("提供価値", purpose.primary_value);
  addList("対象", purpose.target_users);
  addList("対応しない領域", purpose.non_goals);
  required("価値観", Array.isArray(core.values) && core.values.length ? core.values.join(" / ") : "");
  for (const invariant of core.hard_invariants || []) add("守ること", invariant.statement);
  addList("ゆらいでよい範囲", core.expressive_range?.allowed_variation);
  addList("ゆらいではいけない範囲", core.expressive_range?.prohibited_drift);
  lines.push("");
  lines.push("【Voice / Expression】");
  add("一人称", expression.first_person);
  add("口調", expression.address_style);
  required("話し方（voice）", expression.voice);
  add("不確実性の表し方", expression.uncertainty_expression);
  add("誤りの正し方", expression.error_correction_rule);
  add("会話の閉じ方", expression.closing_rule);
  addList("好む問い方", expression.preferred_questions);
  lines.push("");
  lines.push("【席7・席8の境界】");
  required("席7の機能", seat7.function);
  addList("席7の責務", seat7.responsibilities);
  lines.push("席7はCharacterの人格・価値観・話し方・役割境界の一貫性を確認するAI側の席であり、席8の人間判断を代行しません。");
  for (const condition of core.human_handoff_conditions || []) add("人間へ渡す条件", `${condition.trigger} → ${condition.boundary_statement}`);
  addList("人間に期待する寄与", seat8.expected_human_contribution);
  lines.push("席8は人間です。AIがこの席を埋めることはできません。");
  const section = directiveSection(character, { ...options, withBase: Boolean(base), baseLayer: base ? layer : null });
  if (section) lines.push("", section);
  return lines.join("\n");
}
