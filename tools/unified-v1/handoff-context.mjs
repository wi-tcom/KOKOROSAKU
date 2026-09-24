// What a hand-off is composed from: the shared base layer B and the directive
// glossary, plus the Character Pack's own glossary and operation class when it
// brought them.
//
// 03 and 04 Trainer read them through this one module and compose through
// `HANDOFF_ROUTES`, so neither screen can quietly hand over a different text.
// Both holes β.4 showed were a screen doing its own composition: 03's JSON and
// YAML buttons carried neither B nor the directive blocks, and the Trainer sent
// the raw JSON snapshot (統制卓 2026-09-23).
import { BASE_LAYER_FILE, loadBaseLayer } from "./platform-prompt.mjs";
import { buildDirectiveLookup, chooseGlossary } from "./directive-glossary.mjs";

export { BASE_LAYER_FILE };

/**
 * The message shown when the shared base layer cannot be used. Four sentences
 * in the writer's order: what happened, what is not being done and why, what to
 * do, and the question a person actually has first — whether their own work is
 * gone (ライター&SNS 2026-09-23). Every screen that hands text over shows this
 * same text, so it lives in one place.
 */
export const BASE_DIRECTIVES_UNUSABLE = Object.freeze([
  "共通の指示文（すべてのキャラクターに共通の土台）を読み込めませんでした。",
  "安全のため、貼り付ける文は作っていません。",
  "アプリを再インストールしてから開き直してください。直らない場合はサポートにお知らせください。",
  "作成したキャラクターは、この操作では失われません。",
]);

/** Fetch the first URL that answers, parsed by `parse`; null when none does. */
async function firstThatAnswers(urls, parse) {
  for (const url of urls) {
    try { const response = await fetch(url); if (!response.ok) continue; return await parse(response); }
    catch { /* try the next location */ }
  }
  return null;
}

/**
 * Read the base layer and the app's glossary. `baseDirs` are the directories to
 * look for `BASE_LAYER_FILE` in, in order; `guideUrls` the field guide.
 * A base layer that does not check out comes back as `null` with the reasons —
 * every route then composes nothing at all (設計 2026-09-23 §9).
 */
export async function loadHandoffContext({ baseDirs = [], guideUrls = [] } = {}) {
  const base = await loadBaseLayer(name => firstThatAnswers(baseDirs.map(dir => `${dir}${name}`), response => response.text()));
  const guide = await firstThatAnswers(guideUrls, response => response.json());
  return {
    baseLayer: base.layer,
    baseLayerProblems: base.problems,
    directives: guide ? buildDirectiveLookup(guide) : null,
    glossaryDigest: guide?.directive_glossary?.sha256 || null,
  };
}

/** True when nothing may be handed over: the base layer is missing or is not the one that shipped. */
export const handoffBlocked = context => !context || !context.baseLayer;

/**
 * The options every route composes with, for one Character. `entry` is that
 * Character's Library entry, which carries the pack's own glossary and its
 * operation class as provenance — neither is part of the Character.
 */
export function handoffOptions(context, entry = null) {
  const packFile = entry?.provenance?.directives;
  const chosen = chooseGlossary({
    packFile: packFile && typeof packFile === "object" ? packFile : null,
    bundled: context?.directives || null,
    bundledSha256: context?.glossaryDigest || null,
  });
  const operationClass = entry?.provenance?.operation_class ? String(entry.provenance.operation_class) : null;
  return {
    options: {
      directives: chosen.lookup,
      glossaryDigest: chosen.sha256,
      glossarySource: chosen.source,
      glossaryFallback: chosen.problems.length > 0,
      operationClass,
      baseLayer: context?.baseLayer || null,
    },
    glossaryProblems: chosen.problems,
  };
}
