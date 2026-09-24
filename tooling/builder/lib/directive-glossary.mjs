// Directive Glossary (Owner 2026-09-22, DESIGN_2026-09-22_prompt_directive_glossary §7/§8).
//
// The meaning of a selected option reaches the external AI as English policy
// lines in a six-word DSL, not as a bare token and not as prose. The single
// source is the field guide (manual/saku-field-guide.data.json → option
// `directive`), so 03 here and AMU's prompt assembly read the same lines;
// `glossaryDigest()` is the version both sides compare. Nothing here reads
// or writes a Character.

export const DIRECTIVE_GLOSSARY_PROFILE = "saku.directive-glossary@1";
export const DSL_KEYWORDS = Object.freeze(["ALWAYS", "NEVER", "PREFER", "IF", "HANDOFF WHEN", "OUTPUT"]);
export const MAX_WORDS = 12;
const HEAD = /^(ALWAYS|NEVER|PREFER|IF|HANDOFF WHEN|OUTPUT)\b/;
// relative "that" after a noun (a point that needs checking) passed the translation team review; demonstratives do not
const PRONOUNS = /\b(I|you|your|it|its|they|them|their|he|she|his|her|we|us|our|this|these|those|which|who|what)\b/i;
const DEGREE = /\b(very|somewhat|appropriately|reasonably|as needed|sufficient|insufficient|quite|fairly|rather|enough|properly|adequately)\b/i;
const REPEATED = /\b(always|never|guarantee)\b/i;
/** Lines allowed past MAX_WORDS by an explicit Owner decision. Empty since v0.2 (統制卓 2026-09-22: B 行 3 を 12 語に). */
export const OWNER_FIXED_LINES = Object.freeze([]);

/** Lint one block of DSL lines (§7 grammar). Returns [] when clean. */
export function lintDirective(lines, label = "") {
  const problems = [];
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 5) problems.push(`${label}: 2–5 lines required`);
  for (const line of Array.isArray(lines) ? lines : []) {
    if (typeof line !== "string" || !HEAD.test(line)) { problems.push(`${label}: line must start with a DSL keyword: ${line}`); continue; }
    if (/^IF\b/.test(line) && !/\bTHEN\b/.test(line)) problems.push(`${label}: IF without THEN: ${line}`);
    if (/^PREFER\b/.test(line) && !/\bOVER\b/.test(line)) problems.push(`${label}: PREFER without OVER: ${line}`);
    const words = line.trim().split(/\s+/).length;
    if (words > MAX_WORDS && !OWNER_FIXED_LINES.includes(line)) problems.push(`${label}: ${words} words (max ${MAX_WORDS}): ${line}`);
    const body = line.replace(HEAD, "");
    if (PRONOUNS.test(body)) problems.push(`${label}: pronoun or deictic word: ${line}`);
    if (DEGREE.test(body)) problems.push(`${label}: degree word: ${line}`);
    if (REPEATED.test(body)) problems.push(`${label}: always / never / guarantee repeated in the body: ${line}`);
  }
  return problems;
}

/** path → value → lines, from the field guide (fields, structured enums, non-canonical fields). */
export function buildDirectiveLookup(fieldGuide) {
  const lookup = new Map();
  const put = (path, value, lines) => { if (!Array.isArray(lines) || !lines.length) return; if (!lookup.has(path)) lookup.set(path, new Map()); lookup.get(path).set(String(value), lines.slice()); };
  for (const field of fieldGuide?.fields || []) for (const option of field.help?.optionDetails || []) put(field.canonicalPath, option.value, option.directive);
  for (const [path, entry] of Object.entries(fieldGuide?.structured_enums || {})) for (const option of entry.options || []) put(path, option.value, option.directive);
  for (const item of fieldGuide?.non_canonical_fields || []) for (const option of item.options || []) put(item.path, option.value, option.directive);
  return lookup;
}

/** Canonical text of the whole glossary (sorted, one block per line group) and its sha256 — the version 03 and AMU compare. */
export function glossaryCanonicalText(lookup) {
  const out = [];
  for (const path of [...lookup.keys()].sort()) for (const value of [...lookup.get(path).keys()].sort()) out.push(`${path}=${value}`, ...lookup.get(path).get(value).map(line => `  ${line}`));
  return out.join("\n") + "\n";
}
export async function glossaryDigest(lookup) {
  const bytes = new TextEncoder().encode(glossaryCanonicalText(lookup));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);   // Web Crypto: Node ≥ 19 and the desktop WebView alike
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** One L2 block: `TOKEN:` (or `c=TOKEN:` for an axis) followed by the indented lines. */
export function renderDirectiveBlock(head, lines) { return [`${head}:`, ...lines.map(line => `  ${line}`)].join("\n"); }

/** Short axis key (personality_axes.c_intelligence_vector → c). */
export const axisLetter = key => String(key).match(/^([a-o])_/)?.[1] || key;

// ── per-Character subset (Owner 2026-09-23: the glossary travels inside the
// Character Pack as `directives.json`, so a pack is self-contained and the
// lines are covered by the pack signature). The subset holds only the blocks
// the Character's own tokens need, plus the glossary version it came from.
export const DIRECTIVES_FILE = "directives.json";
export const DIRECTIVES_FILE_PROFILE = "saku.directives-file@1";

/** `directives.json` for one Character: its selected tokens' blocks, in canonical order. */
export function directivesFileFor(selected, lookup, { version = null, sha256 = null } = {}) {
  const wanted = new Map();
  for (const [path, value] of selected || []) {
    const lines = lookup?.get?.(path)?.get?.(String(value));
    if (!lines) continue;
    if (!wanted.has(path)) wanted.set(path, new Map());
    wanted.get(path).set(String(value), lines.slice());
  }
  const directives = {};
  for (const path of [...wanted.keys()].sort()) directives[path] = Object.fromEntries([...wanted.get(path).keys()].sort().map(value => [value, wanted.get(path).get(value)]));
  return { profile: DIRECTIVES_FILE_PROFILE, glossary: { profile: DIRECTIVE_GLOSSARY_PROFILE, version, sha256 }, counts: { blocks: [...wanted.values()].reduce((n, m) => n + m.size, 0) }, directives };
}

/** The lookup a pack-supplied `directives.json` provides (same shape as buildDirectiveLookup). */
export function lookupFromDirectivesFile(file) {
  const lookup = new Map();
  if (file?.profile !== DIRECTIVES_FILE_PROFILE) return lookup;
  for (const [path, values] of Object.entries(file.directives || {})) {
    const map = new Map();
    for (const [value, lines] of Object.entries(values || {})) if (Array.isArray(lines) && lines.length) map.set(String(value), lines.slice());
    if (map.size) lookup.set(path, map);
  }
  return lookup;
}

/**
 * Which glossary 03 should use for one Character. A pack that ships its own is
 * preferred: it travelled inside the signed pack and is pinned to that
 * Character. A file that is missing, malformed or inconsistent is not fatal —
 * the Character can still be handed over with the app's own glossary — but the
 * reason comes back so the screen can say so instead of switching silently.
 */
/**
 * Why a pack's glossary could not be used, in the words the person reads
 * (ライター&SNS 2026-09-23: the internal English belongs in the expert row, not
 * in the sentence). The raw reason travels beside it for support.
 */
export const GLOSSARY_PROBLEM_JA = Object.freeze({ PROFILE: "形式が違います", EMPTY: "中身が空です", COUNT: "数が合いません" });
export const GLOSSARY_FALLBACK_JA = Object.freeze([
  (reason) => `このキャラクターに同梱された『AI への指示文』は使えませんでした（${reason}）。`,
  () => "アプリに同梱の指示文に切り替えて、貼り付け文を作っています。",
  () => "キャラクターの内容はそのまま渡ります。",
]);
/** The three sentences, in the writer's order: what happened → what is being done → what it costs. */
export function glossaryFallbackText(problems) {
  const kind = problems?.[0]?.kind || "PROFILE";
  return GLOSSARY_FALLBACK_JA.map(line => line(GLOSSARY_PROBLEM_JA[kind] || GLOSSARY_PROBLEM_JA.PROFILE)).join("");
}

export function chooseGlossary({ packFile = null, bundled = null, bundledSha256 = null } = {}) {
  if (!packFile) return { source: "bundled", lookup: bundled, sha256: bundledSha256, problems: [] };
  const problems = [];
  if (packFile.profile !== DIRECTIVES_FILE_PROFILE) problems.push({ kind: "PROFILE", detail: `pack glossary profile is ${packFile.profile ?? "(none)"}` });
  const lookup = problems.length ? null : lookupFromDirectivesFile(packFile);
  const blocks = lookup ? [...lookup.values()].reduce((total, values) => total + values.size, 0) : 0;
  if (!problems.length && !blocks) problems.push({ kind: "EMPTY", detail: "pack glossary carries no directive block" });
  if (!problems.length && packFile.counts?.blocks !== undefined && packFile.counts.blocks !== blocks) problems.push({ kind: "COUNT", detail: `pack glossary says ${packFile.counts.blocks} blocks but carries ${blocks}` });
  if (problems.length) return { source: "bundled", lookup: bundled, sha256: bundledSha256, problems };
  return { source: "pack", lookup, sha256: packFile.glossary?.sha256 || null, problems: [] };
}

/** Canonical bytes of a `directives.json` (stable key order, one trailing newline) — what a pack manifest digests. */
export function directivesFileText(file) { return `${JSON.stringify(file, null, 2)}\n`; }

// ── echo-back check (設計 2026-09-23 §7-3) ──────────────────────────────────
// 03 is hand-pasted, so nothing here proves what the AI received: a signature
// cannot show that a line was deleted on the way. Asking the AI to echo the
// directive lines back only tells us what it *says* it has. The result is
// therefore labelled as a reported value, never as verification — AMU's API
// path is where a run can actually be checked.
export const ECHO_CHECK_LABEL = Object.freeze({ ja: "AI 申告値（検証不能）", en: "AI self-reported value (unverifiable)" });
export const ECHO_REQUEST = Object.freeze({
  ja: "この会話に読み込んだ『## Character directives』の行を、書き換えずにそのまま列挙してください。説明は不要です。",
  en: "List every line under the heading '## Character directives' that you loaded in this conversation. Copy each line verbatim. Add no commentary.",
});

/** Normalise one echoed line: the AI may add a bullet, a number or stray spaces. */
const normaliseEcho = line => String(line).replace(/^[\s>*\-•]*(?:\d+[.)]\s*)?/, "").replace(/\s+/g, " ").trim();

/**
 * Compare what the AI says it loaded with what 03 actually handed over.
 * `reported: true` is part of the result on purpose: a match is the AI's
 * claim, not proof.
 */
export function compareEchoedDirectives(sentLines, echoedText) {
  const sent = (sentLines || []).map(normaliseEcho).filter(Boolean);
  const echoed = String(echoedText || "").split(/\r?\n/).map(normaliseEcho).filter(Boolean);
  const pool = new Map();
  for (const line of echoed) pool.set(line, (pool.get(line) || 0) + 1);
  const matched = [], missing = [];
  for (const line of sent) {
    const left = pool.get(line) || 0;
    if (left > 0) { pool.set(line, left - 1); matched.push(line); } else missing.push(line);
  }
  const extra = [...pool.entries()].flatMap(([line, count]) => Array.from({ length: count }, () => line))
    .filter(line => /^(ALWAYS|NEVER|PREFER|IF|HANDOFF WHEN|OUTPUT)\b/.test(line));
  return { reported: true, sent: sent.length, matched: matched.length, missing, extra, state: missing.length === 0 && extra.length === 0 ? "REPORTED_COMPLETE" : missing.length ? "REPORTED_MISSING" : "REPORTED_EXTRA" };
}

// ── the shared base layer B (統制卓 2026-09-23) ─────────────────────────────
// B is not an option's directive block: it has headings, prose between its
// directive lines, and no fixed length. Running lintDirective over it would
// refuse the approved text — for the wrong reasons — so B has its own reading
// of the same grammar: prose is read past, and the two self-referential words
// the approved text needs are allowed by name rather than by loosening the
// pronoun rule for everyone.
export const BRITISH_SPELLINGS = Object.freeze({
  behaviour: "behavior", behavioural: "behavioral", colour: "color", organisation: "organization",
  organise: "organize", recognise: "recognize", authorise: "authorize", labour: "labor", centre: "center",
  analyse: "analyze", judgement: "judgment", defence: "defense", fulfil: "fulfill", enrol: "enroll",
  modelling: "modeling", travelled: "traveled", programme: "program", practise: "practice",
  summarise: "summarize", prioritise: "prioritize", catalogue: "catalog",
});
const BRITISH = new RegExp(String.raw`\b(` + Object.keys(BRITISH_SPELLINGS).join("|") + String.raw`)(s|d|ing)?\b`, "i");
/** Words the approved base text needs: the free relative `what`, and the self-reference the echo-back depends on. */
const BASE_PRONOUN_EXCEPTIONS = Object.freeze(["these directives"]);

/**
 * Lint the base layer. Same grammar as a directive block, read differently:
 * no line count, prose and headings skipped, and two named exceptions.
 * Returns [] when the text is clean.
 */
export function lintBaseLayer(text, label = "base") {
  const problems = [];
  const lines = String(text ?? "").split(/\r?\n/);
  let directives = 0;
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) continue;
    const where = `${label}:${index + 1}`;
    const british = BRITISH.exec(line);
    if (british) problems.push(`${where}: British spelling "${british[0]}" → "${BRITISH_SPELLINGS[british[1].toLowerCase()]}"`);
    // A directive line is indented; a paragraph is not. B's prose may well begin
    // with a word like "Never", and reading that as a directive would refuse the
    // approved text, so the indent — not the first word — decides.
    if (!/^\s+\S/.test(raw) || !HEAD.test(line)) continue;
    directives += 1;
    if (/^IF\b/.test(line) && !/\bTHEN\b/.test(line)) problems.push(`${where}: IF without THEN: ${line}`);
    if (/^PREFER\b/.test(line) && !/\bOVER\b/.test(line)) problems.push(`${where}: PREFER without OVER: ${line}`);
    const words = line.split(/\s+/).length;
    if (words > MAX_WORDS) problems.push(`${where}: ${words} words (max ${MAX_WORDS}): ${line}`);
    let body = line.replace(HEAD, "");
    for (const allowed of BASE_PRONOUN_EXCEPTIONS) body = body.replace(new RegExp(allowed, "gi"), "");
    body = body.replace(/\bwhat\b/gi, "");   // free relative: "assert what cannot be confirmed"
    if (PRONOUNS.test(body)) problems.push(`${where}: pronoun or deictic word: ${line}`);
    if (DEGREE.test(body)) problems.push(`${where}: degree word: ${line}`);
    if (REPEATED.test(body)) problems.push(`${where}: always / never / guarantee repeated in the body: ${line}`);
  }
  if (!directives) problems.push(`${label}: no directive line`);
  // A keyword at the left margin is either a directive that lost its indent or a
  // paragraph that reads like one. Either way it is worth saying out loud.
  for (const [index, raw] of lines.entries()) {
    if (/^\s/.test(raw) || !HEAD.test(raw.trim())) continue;
    problems.push(`${label}:${index + 1}: a line at the left margin starts with a DSL keyword — indent it if it is a directive, reword it if it is prose: ${raw.trim()}`);
  }
  return problems;
}
