// The frame every SAKU Builder screen shares (Owner 2026-10-14, 画面改修): the header, the menu bar and the
// selected-Character line, laid out like AMU Studio's (KOKOROAMU-STUDIO main 200dc27 shells/desktop/index.html,
// amu.css .amu-nav / .amu-active-line). One module so that 01–⑤ show the same thing on all three pages.
//
//   header   「KOKOROSAKU 1+7 Character System」「SAKU Builder」 and the Owner's line; 日本語／English at the top right.
//            No build version here (it stays in the footer and near Help, Q17).
//   menu     準備と進め方 ／ ①キャラクター選択 ／ ②キャラクター編集 ／ ③実行（プロンプト） ／ ④出力 ／
//            ⑤SAKU診療所・AMUトレーニングセンター (Q1).
//   line     the selected Character, its badge (B1–B9, origin-badges.mjs), the three-step bar of the 30 fields the
//            save needs (required-progress.mjs, Q12) and one message with a link to the next screen.
//
// Pure parts (frameModel, frameMarkup) are exported for the gates; mountFrame touches the DOM.
import { badgeFor, badgeLabel } from "./origin-badges.mjs";
import { STEPS, progressFromIssues, firstMissingField } from "./required-progress.mjs";
import { editableTarget, keepContextMenuToFields } from "./context-menu-guard.mjs";

export const SCREENS = Object.freeze(["prep", "select", "edit", "run", "out", "svc"]);

const TEXT = Object.freeze({
  ja: Object.freeze({
    eyebrow: "KOKOROSAKU 1+7 Character System",
    title: "SAKU Builder",
    lead: "心が咲く　ー　人格・役割・専門性・対応範囲・心の内面を定義してSAKUキャラクターとして咲かせます。",
    nav: Object.freeze({ prep: "準備と進め方", select: "キャラクター選択", edit: "キャラクター編集", run: "実行（プロンプト）", out: "出力", svc: "SAKU診療所・AMUトレーニングセンター" }),
    navLabel: "SAKU Builder の画面",
    languageLabel: "言語 / Language",
    selected: "選択中のキャラクター",
    none: "未選択",
    unnamed: "（名前未入力）",
    revision: "revision {revision}",
    msgNone: "キャラクターを選んでください。",
    linkNone: "①キャラクター選択へ",
    msgMissing: "保存に要る定義があと {count} 項目あります。",
    msgOther: "保存の照合で、ほかに {count} 件の指摘があります。",
    linkEdit: "②キャラクター編集で埋める",
    msgReady: "定義はそろっています。",
    linkRun: "③実行（プロンプト）で AI に渡す",
    msgChecking: "定義を確かめています。",
    clear: "選択を解除",
    stepCount: "{label} {done}/{total}",
  }),
  en: Object.freeze({
    eyebrow: "KOKOROSAKU 1+7 Character System",
    title: "SAKU Builder",
    lead: "A heart in bloom — define the personality, role, expertise, scope and inner life, and let it bloom as a SAKU Character.",
    nav: Object.freeze({ prep: "Setup and steps", select: "Choose a Character", edit: "Edit the Character", run: "Run (prompt)", out: "Export", svc: "SAKU Repair Desk · AMU Evaluation Center" }),
    navLabel: "SAKU Builder screens",
    languageLabel: "言語 / Language",
    selected: "Selected Character",
    none: "None selected",
    unnamed: "(no name yet)",
    revision: "revision {revision}",
    msgNone: "Choose a Character.",
    linkNone: "Go to ① Choose a Character",
    msgMissing: "{count} more definitions are needed before you can save.",
    msgOther: "The save check found {count} other issues.",
    linkEdit: "Fill them in at ② Edit the Character",
    msgReady: "The definition is complete.",
    linkRun: "Give it to an AI in ③ Run (prompt)",
    msgChecking: "Checking the definition.",
    clear: "Clear selection",
    stepCount: "{label} {done}/{total}",
  }),
});
const NUMBERS = Object.freeze({ prep: "", select: "1", edit: "2", run: "3", out: "4", svc: "5" });

const lang = locale => (locale === "en-US" || locale === "en" ? "en" : "ja");
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (all, key) => (Object.hasOwn(values, key) ? String(values[key]) : all));
export const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

/**
 * The links of the menu for a page. `page` is "desktop" (desktop/index.html, which holds prep/select/run/out and
 * the tuning screen), "builder" (tools/saku-builder.html) or "services" (tools/saku-services.html).
 */
export function screenHref(page, screen, field = null) {
  const home = page === "desktop" ? "./index.html" : "../index.html";
  const tools = page === "desktop" ? "./tools/" : "./";
  // field: a required field still missing (Q12: pressing it opens ② at that field).
  if (screen === "edit") return `${tools}saku-builder.html?desktop=app${field ? `&field=${encodeURIComponent(field)}` : ""}`;
  if (screen === "svc") return `${tools}saku-services.html`;
  return `${home}#${screen}`;
}

/**
 * What the selected-Character line shows. active: ActiveSaku.getActive(); entry: the list row it came from
 * (Library.entryForActive); issues: the save check's errors for the Character, or null while not known yet.
 */
export function frameModel({ active, entry, issues, locale = "ja-JP", badgeOf = badgeFor }) {
  const t = TEXT[lang(locale)];
  const character = active && active.character;
  if (!character) return { selected: false, name: t.none, revision: "", badge: null, steps: [], message: t.msgNone, link: { screen: "select", label: t.linkNone } };
  const identity = character.identity || {};
  const name = String(identity.display_name || "").trim() || t.unnamed;
  const revision = identity.character_revision ? fill(t.revision, { revision: identity.character_revision }) : "";
  const badge = entry ? badgeOf(entry) : { id: null, class: "UNKNOWN" };
  const badgeView = { id: badge.id, class: badge.class, label: badgeLabel(badge.id, locale) };
  if (!Array.isArray(issues)) return { selected: true, name, revision, badge: badgeView, steps: [], message: t.msgChecking, link: null };
  const progress = progressFromIssues(issues);
  const steps = progress.steps.map((step, index) => ({ id: step.id, done: step.done, total: step.total, label: STEPS[index].label[lang(locale)], field: step.missing[0] || null }));
  const field = firstMissingField(progress);
  const missing = progress.steps.reduce((sum, step) => sum + (step.total - step.done), 0);
  if (missing > 0) return { selected: true, name, revision, badge: badgeView, steps, message: fill(t.msgMissing, { count: missing }), link: { screen: "edit", label: t.linkEdit, field } };
  if (progress.other.length) return { selected: true, name, revision, badge: badgeView, steps, message: fill(t.msgOther, { count: progress.other.length }), link: { screen: "edit", label: t.linkEdit, field } };
  return { selected: true, name, revision, badge: badgeView, steps, message: t.msgReady, link: { screen: "run", label: t.linkRun } };
}

/** The frame's markup (no Character-derived text unescaped). */
export function frameMarkup({ page, current, model, locale = "ja-JP", clearable = false }) {
  const t = TEXT[lang(locale)];
  const nav = SCREENS.map(screen => {
    const number = NUMBERS[screen] ? `<span class="sf-num">${NUMBERS[screen]}</span>` : `<span class="sf-num sf-num-prep" aria-hidden="true">·</span>`;
    const currentAttr = screen === current ? ' aria-current="page"' : "";
    return `<a class="sf-nav-item" data-sf-screen="${screen}" href="${escapeHtml(screenHref(page, screen))}"${currentAttr}>${number}<span>${escapeHtml(t.nav[screen])}</span></a>`;
  }).join("");
  const steps = model.steps.length
    ? `<div class="sf-bar" role="img" aria-label="${escapeHtml(model.steps.map(step => fill(t.stepCount, step)).join(" / "))}"><div class="sf-segs">${model.steps.map((step, index) => `<span class="sf-seg sf-seg-${index + 1}"><i data-sf-fill="${step.total ? Math.round((step.done / step.total) * 100) : 0}"></i></span>`).join("")}</div><div class="sf-seg-labels">${model.steps.map(step => step.field
      ? `<a class="sf-seg-link" style="--sf-span:${step.total}" data-sf-screen="edit" data-sf-field="${escapeHtml(step.field)}" href="${escapeHtml(screenHref(page, "edit", step.field))}">${escapeHtml(fill(t.stepCount, step))}</a>`
      : `<span style="--sf-span:${step.total}">${escapeHtml(fill(t.stepCount, step))}</span>`).join("")}</div></div>`
    : `<div class="sf-bar sf-bar-empty" aria-hidden="true"><div class="sf-segs"><span class="sf-seg" style="--sf-span:7"></span><span class="sf-seg" style="--sf-span:8"></span><span class="sf-seg" style="--sf-span:15"></span></div></div>`;
  const badge = model.badge ? `<span class="sf-badge sf-badge-${escapeHtml(String(model.badge.class).toLowerCase())}" data-sf-badge="${escapeHtml(model.badge.id || "")}">${escapeHtml(model.badge.label)}</span>` : "";
  // 「選択を解除」 stays where the selection is shown (it was on the old Home card); offered by pages that can clear.
  const clear = clearable && model.selected ? `<button type="button" class="sf-clear" data-sf-clear>${escapeHtml(t.clear)}</button>` : "";
  const linkField = model.link && model.link.field ? ` data-sf-field="${escapeHtml(model.link.field)}"` : "";
  const link = model.link ? `<a class="sf-next" data-sf-screen="${model.link.screen}"${linkField} href="${escapeHtml(screenHref(page, model.link.screen, model.link.field || null))}">${escapeHtml(model.link.label)} →</a>` : "";
  return `<div class="sf-hero" role="banner">
  <div class="sf-hero-text"><p class="sf-eyebrow">${escapeHtml(t.eyebrow)}</p><p class="sf-title">${escapeHtml(t.title)}</p><p class="sf-lead">${escapeHtml(t.lead)}</p></div>
  <div class="sf-lang" role="group" aria-label="${escapeHtml(t.languageLabel)}"><button type="button" data-sf-locale="ja-JP" aria-pressed="${String(lang(locale) === "ja")}">日本語</button><button type="button" data-sf-locale="en-US" aria-pressed="${String(lang(locale) === "en")}">English</button></div>
</div>
<nav class="sf-nav" aria-label="${escapeHtml(t.navLabel)}">${nav}</nav>
<div class="sf-active" aria-live="polite">
  <div class="sf-who"><span class="sf-who-label">${escapeHtml(t.selected)}</span><strong class="sf-who-name" data-runtime-value>${escapeHtml(model.name)}</strong><span class="sf-who-meta">${escapeHtml(model.revision)} ${badge} ${clear}</span></div>
  ${steps}
  <div class="sf-msg"><span>${escapeHtml(model.message)}</span>${link}</div>
</div>`;
}

/**
 * Put the frame at the top of the page and keep it current.
 *   page      "desktop" | "builder" | "services"
 *   current   the screen this page shows now (a function, so a page with several screens can answer)
 *   read      () => ({ active, entry }) — the selected Character and its row
 *   check     async character => issues ([]) — the save check (validateCompleteAdoptedCharacter's errors)
 *   setLocale the page's own locale switch; the frame re-renders on "saku-ui-locale-changed"
 *   onNavigate(screen, event, field) — a page with screens of its own may handle a menu click itself (return true);
 *             field is the required field a bar segment or the next-step link points at, or null
 */
// The WebView's own right-click menu is not offered outside the fields (context-menu-guard.mjs: one rule for every page,
// SAKU β.13 S-10 = L3).
export { editableTarget };

// badgeOf: the page's own reading of a row's mark (L10, 統括 照らし NG-4: legacy-origin.mjs originBadge); the kit's badge otherwise.
export function mountFrame({ page, current, read, check, getLocale, setLocale, onNavigate, onClear, badgeOf = badgeFor }) {
  keepContextMenuToFields(document);
  let root = document.getElementById("saku-frame");
  if (!root) {
    root = document.createElement("div");
    root.id = "saku-frame";
    root.className = "saku-frame";
    document.body.prepend(root);
  }
  let issues = null;
  let checkedFor = "";
  const render = () => {
    const { active, entry } = read();
    const locale = getLocale();
    root.innerHTML = frameMarkup({ page, current: current(), model: frameModel({ active, entry, issues, locale, badgeOf }), locale, clearable: typeof onClear === "function" });
    // The fill is set through the style object: the app's CSP (Tauri adds a nonce) drops inline style attributes, which
    // left every segment fully painted at 0/7 (2026-10-14 keying 1-9).
    for (const fill of root.querySelectorAll("[data-sf-fill]")) fill.style.width = `${Number(fill.dataset.sfFill) || 0}%`;
  };
  const refresh = async () => {
    const { active } = read();
    const key = active && active.character ? JSON.stringify(active.character) : "";
    if (key !== checkedFor) {
      checkedFor = key;
      issues = null;
      render();
      if (key) {
        try { issues = await check(active.character); } catch { issues = null; }
      }
    }
    render();
  };
  root.addEventListener("click", event => {
    const localeButton = event.target.closest("[data-sf-locale]");
    if (localeButton) { setLocale(localeButton.dataset.sfLocale); return; }
    if (event.target.closest("[data-sf-clear]") && onClear) { void Promise.resolve(onClear()).then(() => refresh()); return; }
    const link = event.target.closest("[data-sf-screen]");
    if (link && onNavigate && onNavigate(link.dataset.sfScreen, event, link.dataset.sfField || null)) event.preventDefault();
  });
  window.addEventListener("saku-ui-locale-changed", render);
  window.addEventListener("storage", () => { void refresh(); });
  void refresh();
  return { refresh, render };
}
