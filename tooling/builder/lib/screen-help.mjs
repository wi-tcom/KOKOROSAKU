// Screen help pane (U4, Owner 2026-09-22 §8 ⑤⑥): the same help tree the edit
// screen uses, mounted beside 03 AI プラットフォーム, 04 Trainer and the speed
// test. A screen guide (manual/<screen>-guide.data.json) names, per field,
// the `screenSection` element id it explains, and the tree's 「入力欄へ」 scrolls
// back to it. Nothing here reads or writes a Character, a Session or a run.
//
// The pane used to also stamp a 「同期」 button onto each of those sections.
// Owner removed it from all three screens on 2026-09-23: the pane is already
// beside the screen, so the button was a second way to the same place, and the
// way a screen points at help is now one expression everywhere. The function
// that added it is deleted rather than left unused, so a new screen cannot
// quietly bring it back.
import { buildHelpTreeModel, hashFor, mountHelpTree, pathFromHash } from "../lib/help-tree.mjs";

export const SCREEN_HELP_PROFILE = "saku.screen-help@1";
async function loadGuide(urls) {
  for (const url of urls) {
    try { const response = await fetch(url); if (!response.ok) continue; return { url, guide: await response.json() }; }
    catch { /* try the next location */ }
  }
  return { url: null, guide: null };
}

/**
 * Mount the pane. `locale` is "ja" | "en"; `currentValue(path)` (optional)
 * returns the screen's current value for an option field so the tree can
 * show 「現在の選択：」 and highlight the option node.
 */
export async function mountScreenHelp({ aside, guideUrls, locale = "ja", currentValue = null, onNavigateFallback = null } = {}) {
  if (!aside) return null;
  const { url, guide } = await loadGuide(guideUrls || []);
  const sectionOf = new Map((guide?.fields || []).map(field => [field.canonicalPath, field.screenSection || null]));
  const state = { locale, guide, url, controller: null, shown: null };
  const scrollToSection = path => {
    const id = sectionOf.get(path); const target = id ? document.getElementById(id) : null;
    if (!target) { onNavigateFallback?.(path); return false; }
    const details = target.closest("details"); if (details) details.open = true;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.remove("help-target-pulse"); void target.offsetWidth; target.classList.add("help-target-pulse");
    (target.matches("input,select,textarea,button") ? target : target.querySelector("input,select,textarea,button"))?.focus?.({ preventScroll: true });
    return true;
  };
  const mount = () => {
    const model = buildHelpTreeModel(guide, state.locale);
    state.controller = mountHelpTree(aside, model, {
      onNavigate: scrollToSection,
      onHash: path => { try { history.replaceState(null, "", path ? hashFor(path) : location.pathname + location.search); } catch { /* sandboxed */ } },
      // Only when the screen actually supplies one. Wrapping an absent hook in a
      // function would have told the tree it is synced when it is not — which is
      // how three screens came to claim it (統制卓 2026-09-23).
      ...(currentValue ? { currentValue: path => currentValue(path) ?? null } : {}),
    });
    aside.dataset.screenHelp = SCREEN_HELP_PROFILE;
    aside.dataset.guideUrl = url || "";
    state.shown = null;
    refresh();
  };
  const refresh = () => {
    if (!state.controller || !guide) return;
    for (const field of guide.fields || []) if (field.help?.optionDetails?.length) state.controller.highlightOption(field.canonicalPath, currentValue?.(field.canonicalPath) ?? null);
  };
  const api = {
    profile: SCREEN_HELP_PROFILE, guide, url,
    /** Open the tree at a field (from a hash, or from code). */
    show(path) { if (!state.controller) return false; const ok = state.controller.expandField(path); if (ok) state.shown = path; return ok; },
    refresh,
    setLocale(next) { const l = next === "en" ? "en" : "ja"; if (l === state.locale && state.controller) return; state.locale = l; mount(); if (state.shown) state.controller.expandField(state.shown, { scroll: false, hash: false }); },
    fromHash() { const path = pathFromHash(location.hash); return path && sectionOf.has(path) ? api.show(path) : false; },
  };
  mount();
  return api;
}
