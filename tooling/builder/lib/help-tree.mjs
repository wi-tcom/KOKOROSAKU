// Help tree (U2, Owner 2026-09-22 §8 ③④): the right pane's Help is a tree
// 章 > 項目 > 選択肢 built from the field guide data. It is shared by the
// edit screen, 03 and 04 (U4). The model is pure; the mount is DOM-only and
// talks back through callbacks — it never reads or writes a Character.
//
//   buildHelpTreeModel(guide, locale)  → { chapters:[{id,title,fields:[{path,label,note,kind,options:[…],detail}]}] }
//   mountHelpTree(root, model, hooks)  → controller { expandChapter, expandField, highlightOption, setLocale, destroy }
//   hooks: onNavigate(fieldPath) — tree node → left input; onHash(fieldPath|null) — URL hash owner
//
// Visible strings live in STRINGS so the writer team can review them in one place.
//
// `lead` / `leadNoSync`: the pane says it is synced with the input fields on the
// left only where that is true. Syncing means the tree can show 「現在の選択：」 and
// light the option a field is set to, which only works when the screen passes
// `currentValue` — so the sentence follows that fact rather than a memory of
// which screens were wired (統制卓 2026-09-23: 03, the Trainer and the speed test
// were all claiming it; 03 since the 「渡し方を選ぶ」 step was removed, the other
// two from the start). `leadNoSync` is, for now, the approved sentence with the
// clause that is not true removed — the two confirmed variants are with
// ライター&SNS → 翻訳チーム and drop into these two keys when they arrive.

export const HELP_TREE_PROFILE = "saku.help-tree@1";
export const STRINGS = Object.freeze({
  ja: Object.freeze({
    title: "ヘルプ", lead: "章 › 項目 › 選択肢。左の入力欄と同期します。", leadNoSync: "章 › 項目 › 選択肢。", toInput: "入力欄へ", currentNote: "現在の内容", currentValue: "現在の選択：", notSelected: "未選択",
    options: "選択肢", meaning: "意味", effect: "効果", source: "出典", notMeasured: "未確認（設計上の意図のみ）", presentationOnly: "表示専用", details: "詳しい説明",
    nonCanonical: "Character 本体には保存されない項目", enPending: "EN 準備中", empty: "ヘルプ情報を読み込めませんでした。アプリを再起動しても直らない場合は、サポートにお知らせください。",
    effectNotice: "※ 傾向であり断定ではありません。AI プラットフォームや事前のメモリー・学習・知識により、思いどおりの傾向にならないことがあります。Trainer で実際の応答を確認してください。", multiSelectNotice: "複数選ぶとそれぞれの傾向が混ざります。", expert: "専門情報",
    sourceNames: Object.freeze({ PARAMETER_BEHAVIOR_MAP: "設計上の対応表から生成", "AMU_CONFIRMED_2026-09-22": "AMU での動作を確認済み（2026-09-22）", OPERATION_FACT: "利用時の動作（確認済み）", "PROMPT_INCLUDED_03 + DESIGN_INTENT": "03 のプロンプトに含まれる項目（設計上の意図）", DESIGN_INTENT: "設計上の意図", PRESENTATION_ONLY: "表示専用（見た目・雰囲気のみ）", NOT_MEASURED: "出典なし" }),
    rows: Object.freeze({ humanQuestion: "人が答える問い", about: "この項目について", why: "なぜ今決めるか", what: "何を書くか", example: "入力例", caution: "注意点", relatedAiBehavior: "関連する AI の動き", relatedItems: "関連項目", usedAt: "どこで使うか", persistence: "保存・書き出し", boundary: "境界" }),
  }),
  en: Object.freeze({
    // EN = 英語翻訳チーム納品（Wi-t_Site translation/saku-visible-strings-A-G_EN.json@fe6a45f、EF_strings 36、ライター&SNS 照合）。自筆しない。
    title: "Help", lead: "Chapter › Item › Option. Synced with the input fields on the left.", leadNoSync: "Chapter › Item › Option.", toInput: "Go to input", currentNote: "Current content", currentValue: "Current selection: ", notSelected: "Not selected",
    options: "Options", meaning: "Meaning", effect: "Effect", source: "Source", notMeasured: "Not confirmed (design intent only)", presentationOnly: "Display only", details: "Details",
    nonCanonical: "Item not saved in the Character itself", enPending: "EN in preparation", empty: "Help information could not be loaded. If restarting the app does not fix this, please let Support know.",
    effectNotice: "* These are tendencies, not certainties. Depending on the AI platform and on prior memory, training or knowledge, the tendency may not turn out as intended. Check the actual responses in the Trainer.", multiSelectNotice: "If you select more than one, their tendencies mix.", expert: "Expert information",
    sourceNames: Object.freeze({ PARAMETER_BEHAVIOR_MAP: "Generated from the design correspondence table", "AMU_CONFIRMED_2026-09-22": "Behavior confirmed in AMU (2026-09-22)", OPERATION_FACT: "Behavior in use (confirmed)", "PROMPT_INCLUDED_03 + DESIGN_INTENT": "Item included in the 03 prompt (design intent)", DESIGN_INTENT: "Design intent", PRESENTATION_ONLY: "Display only (look and feel only)", NOT_MEASURED: "No source" }),
    rows: Object.freeze({ humanQuestion: "Question for a person to answer", about: "About this item", why: "Why decide it now", what: "What to write", example: "Example input", caution: "Points to note", relatedAiBehavior: "Related AI behavior", relatedItems: "Related items", usedAt: "Where it is used", persistence: "Saving and export", boundary: "Boundary" }),
  }),
});

const text = (value, locale) => value == null ? "" : typeof value === "string" ? value : (value[locale] || value.ja || "");
// One option's effect as shown: NOT_MEASURED is the fixed sentence; EN falls back to JA + 「EN 準備中」 until the translation team delivers.
const effectView = (effect, L, S) => {
  const ja = effect.source === "NOT_MEASURED" ? S.notMeasured : effect.ja;
  const en = effect.source === "NOT_MEASURED" ? S.notMeasured : (effect.en || null);
  const pending = L === "en" && !en;
  return { ja, en, text: L === "en" ? (en || `${ja}（${S.enPending}）`) : ja, enPending: pending, source: effect.source, sourceName: S.sourceNames[effect.source] || effect.source, section: effect.section || null, sourceRev: effect.source_rev || null, sourceNote: text(effect.source_note, L), presentationOnly: Boolean(effect.presentation_only) };
};
const hashId = path => `help=${path}`;
export const hashFor = path => `#${hashId(path)}`;
export function pathFromHash(hash) { const m = String(hash || "").match(/^#help=([A-Za-z0-9_.\-]+)$/); return m ? m[1] : null; }

/** Pure model from the guide data (chapters and fields in guide order). */
export function buildHelpTreeModel(guide, locale = "ja") {
  const L = locale === "en" ? "en" : "ja";
  const S = STRINGS[L];
  if (!guide || !Array.isArray(guide.fields) || !Array.isArray(guide.chapters)) return { locale: L, chapters: [], nonCanonical: [], empty: true };
  const chapters = guide.chapters.map(chapter => ({ id: chapter.id, numeral: chapter.numeral || "", title: text(chapter.title, L), question: text(chapter.question, L), fields: [] }));
  const byId = new Map(chapters.map(chapter => [chapter.id, chapter]));
  for (const field of guide.fields) {
    const chapter = byId.get(field.chapter); if (!chapter) continue;
    const options = (field.help?.optionDetails || []).map(option => ({
      value: String(option.value), name: text(option.name, L), meaning: text(option.meaning, L), when: text(option.when, L), tradeoff: text(option.tradeoff, L),
      effect: option.effect ? effectView(option.effect, L, S) : null,
    }));
    const noteJa = field.currentNote?.ja || ""; const noteEn = field.currentNote?.en || "";
    chapter.fields.push({
      path: field.canonicalPath, label: text(field.uiLabel || field.label, L) || text(field.label, L), kind: field.kind, manualType: field.manualType, requiredness: field.requiredness,
      note: L === "en" ? (noteEn || noteJa) : noteJa, notePending: L === "en" && !noteEn && Boolean(noteJa),
      options, candidates: field.candidates || null,
      detail: Object.fromEntries(["humanQuestion", "about", "why", "what", "example", "caution", "relatedAiBehavior", "relatedItems", "usedAt", "persistence", "boundary"].map(key => [key, text(key === "humanQuestion" || key === "boundary" ? field[key] : field.help?.[key], L)])),
      examples: (field.help?.examples || []).map(value => text(value, L)),
      structured: field.help?.structuredGuide ? { entryMeaning: text(field.help.structuredGuide.entryMeaning, L), addWhen: text(field.help.structuredGuide.addWhen, L), separateRule: text(field.help.structuredGuide.separateRule, L), examples: (field.help.structuredGuide.examples || []).map(value => text(value, L)) } : null,
    });
  }
  const nonCanonical = (guide.non_canonical_fields || []).map(item => ({ path: item.path, label: text(item.uiLabel, L), goesTo: text(item.goesTo, L), note: text(item.currentNote, L), options: (item.options || []).map(option => ({ value: option.value, meaning: text(option.meaning, L), effect: option.effect ? effectView(option.effect, L, S) : null })) }));
  const structuredEnums = Object.entries(guide.structured_enums || {}).map(([key, entry]) => ({ key, options: (entry.options || []).map(option => ({ value: option.value, meaning: text(option.meaning, L), effect: option.effect ? effectView(option.effect, L, S) : null })) }));
  return { locale: L, chapters, nonCanonical, structuredEnums, appliesTo: guide.applies_to_app_version || null, empty: false };
}

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) { if (value === null || value === undefined || value === false) continue; if (key === "class") node.className = value; else if (key === "text") node.textContent = value; else if (key.startsWith("data-")) node.setAttribute(key, value); else node.setAttribute(key, value); }
  for (const child of children) if (child !== null && child !== undefined) node.append(child);
  return node;
};

/**
 * Mount the tree. `hooks.currentValue(path)` (optional) returns the value(s)
 * currently entered on the left so select fields can show 「現在の選択：」.
 * Passing it is what makes the pane synced, and the lead says so accordingly.
 */
export function mountHelpTree(root, model, hooks = {}) {
  root.replaceChildren();
  root.classList.add("help-tree");
  root.dataset.helpTree = HELP_TREE_PROFILE;
  const S = STRINGS[model.locale];
  if (model.empty) { console.warn("help tree: field guide not loaded (manual/saku-field-guide.data.json)"); root.append(el("p", { class: "help-tree-empty", role: "status", text: S.empty })); return { expandChapter() {}, expandField() {}, highlightOption() {}, destroy() { root.replaceChildren(); } }; }
  // The fact, not a note kept by hand: a screen that passes no currentValue
  // cannot show a current selection, so the pane does not claim to be synced.
  const synced = typeof hooks.currentValue === "function";
  root.dataset.helpSynced = String(synced);
  root.append(el("p", { class: "help-tree-lead", text: synced ? S.lead : S.leadNoSync }));
  const fieldNodes = new Map(); const chapterNodes = new Map();
  const optionRow = (option, fieldPath) => {
    const li = el("li", { class: "help-option", "data-option-value": option.value, "data-field-path": fieldPath });
    li.append(el("div", { class: "help-option-head" }, el("code", { text: option.value }), option.name ? el("span", { class: "help-option-name", text: option.name }) : null));
    const dl = el("dl", { class: "help-option-body" });
    if (option.meaning) dl.append(el("dt", { text: S.meaning }), el("dd", { text: option.meaning }));
    if (option.effect) {
      dl.append(el("dt", { text: S.effect }), el("dd", { class: `help-effect${option.effect.source === "NOT_MEASURED" ? " is-not-measured" : ""}${option.effect.enPending ? " is-en-pending" : ""}`, "data-effect-source": option.effect.source }, document.createTextNode(option.effect.text), option.effect.presentationOnly ? el("span", { class: "help-tag", text: ` ${S.presentationOnly}` }) : null));
      const expert = el("details", { class: "help-expert" }, el("summary", { text: S.expert }), el("p", { class: "help-source", text: `${S.source}: ${option.effect.sourceName}${option.effect.section ? ` · ${option.effect.section}` : ""}${option.effect.sourceRev ? ` · ${option.effect.sourceRev}` : ""}${option.effect.sourceNote ? ` — ${option.effect.sourceNote}` : ""}` }));
      dl.append(el("dt", { text: "" }), el("dd", {}, expert));
    }
    li.append(dl); return li;
  };
  for (const [index, chapter] of model.chapters.entries()) {
    const details = el("details", { class: "help-chapter", "data-help-chapter": chapter.id, "data-chapter-index": String(index) });
    details.append(el("summary", {}, el("span", { class: "help-chapter-num", text: chapter.numeral }), el("span", { class: "help-chapter-title", text: chapter.title }), el("span", { class: "help-count", text: String(chapter.fields.length) })));
    if (chapter.question) details.append(el("p", { class: "help-chapter-question", text: chapter.question }));
    const list = el("ul", { class: "help-fields" });
    for (const field of chapter.fields) {
      const li = el("li", { class: "help-field", "data-help-field": field.path, id: hashId(field.path) });
      const fd = el("details", { class: "help-field-details" });
      const summary = el("summary", {}, el("span", { class: "help-field-label", text: field.label }), el("code", { class: "help-field-path", text: field.path }));
      fd.append(summary);
      const body = el("div", { class: "help-field-body" });
      if (field.note) body.append(el("p", { class: "help-current-note" }, el("strong", { text: `${S.currentNote}: ` }), document.createTextNode(field.note), field.notePending ? el("span", { class: "help-tag", text: ` ${S.enPending}` }) : null));
      const go = el("button", { type: "button", class: "btn-sm help-to-input", "data-help-to-input": field.path, text: S.toInput });
      go.addEventListener("click", () => hooks.onNavigate?.(field.path));
      body.append(el("p", { class: "help-actions" }, go));
      if (field.options.length) {
        const current = el("p", { class: "help-current-value", "data-help-current": field.path }, el("strong", { text: S.currentValue }), el("span", { class: "help-current-value-text", text: S.notSelected }));
        body.append(current);
        const od = el("details", { class: "help-options", open: "" }, el("summary", { text: `${S.options} (${field.options.length})` }));
        const ol = el("ul", { class: "help-option-list" }); for (const option of field.options) ol.append(optionRow(option, field.path)); od.append(ol);
        // Owner-fixed notice once per field: 複数選択 prefix only for multi-select fields.
        od.append(el("p", { class: "help-effect-notice", "data-effect-notice": field.path, text: `${field.manualType === "SELECT_MULTI" ? S.multiSelectNotice : ""}${S.effectNotice}` }));
        body.append(od);
      }
      const detail = el("details", { class: "help-field-detail" }, el("summary", { text: S.details }));
      const rows = el("dl", { class: "help-detail-rows" });
      for (const [key, label] of Object.entries(S.rows)) { const value = field.detail[key]; if (value) rows.append(el("dt", { text: label }), el("dd", { text: value })); }
      if (field.examples.length) { rows.append(el("dt", { text: S.rows.example })); const ol = el("ol"); for (const ex of field.examples) ol.append(el("li", { text: ex })); rows.append(el("dd", {}, ol)); }
      if (field.structured) { rows.append(el("dt", { text: model.locale === "en" ? "Repeating entries" : "繰り返し入力" }), el("dd", { text: [field.structured.entryMeaning, field.structured.addWhen, field.structured.separateRule].filter(Boolean).join(" ") })); }
      detail.append(rows); body.append(detail);
      fd.append(body); li.append(fd); list.append(li);
      fieldNodes.set(field.path, { li, details: fd, chapter: details });
    }
    details.append(list); root.append(details); chapterNodes.set(chapter.id, details);
  }
  if (model.nonCanonical.length) {
    const nc = el("details", { class: "help-chapter help-non-canonical", "data-help-chapter": "non-canonical" }, el("summary", {}, el("span", { class: "help-chapter-title", text: S.nonCanonical }), el("span", { class: "help-count", text: String(model.nonCanonical.length) })));
    const ul = el("ul", { class: "help-fields" });
    for (const item of model.nonCanonical) {
      const li = el("li", { class: "help-field", "data-help-field": item.path });
      li.append(el("p", {}, el("strong", { text: item.label }), document.createTextNode(` — ${item.note}`)), el("p", { class: "help-source", text: item.goesTo }));
      if (item.options.length) { const ol = el("ul", { class: "help-option-list" }); for (const option of item.options) ol.append(optionRow(option, item.path)); li.append(ol); }
      ul.append(li);
    }
    nc.append(ul); root.append(nc);
  }
  let currentField = null;
  const clearHighlights = () => { for (const node of root.querySelectorAll(".is-current")) node.classList.remove("is-current"); };
  const controller = {
    expandChapter(indexOrId, { scroll = true } = {}) {
      const target = typeof indexOrId === "number" ? root.querySelector(`[data-chapter-index="${indexOrId}"]`) : chapterNodes.get(indexOrId);
      if (!target) return false; target.open = true; if (scroll) target.scrollIntoView({ block: "start", behavior: "smooth" }); return true;
    },
    expandField(path, { scroll = true, hash = true } = {}) {
      const node = fieldNodes.get(path); if (!node) return false;
      node.chapter.open = true; node.details.open = true; clearHighlights(); node.li.classList.add("is-current"); currentField = path;
      if (scroll) node.li.scrollIntoView({ block: "start", behavior: "smooth" });
      if (hash) hooks.onHash?.(path);
      controller.refreshCurrentValue(path);
      return true;
    },
    highlightOption(path, value) {
      const node = fieldNodes.get(path); if (!node) return false;
      for (const li of node.li.querySelectorAll(".help-option.is-selected")) li.classList.remove("is-selected");
      const values = Array.isArray(value) ? value.map(String) : [String(value ?? "")];
      let hit = false; for (const li of node.li.querySelectorAll(".help-option")) if (values.includes(li.dataset.optionValue)) { li.classList.add("is-selected"); hit = true; }
      controller.refreshCurrentValue(path);
      return hit;
    },
    refreshCurrentValue(path) {
      const node = fieldNodes.get(path); const slot = node?.li.querySelector(".help-current-value-text"); if (!slot) return;
      const value = hooks.currentValue?.(path); const list = Array.isArray(value) ? value : value ? [value] : [];
      slot.textContent = list.length ? list.map(String).join(" / ") : S.notSelected;
    },
    currentField: () => currentField,
    destroy() { root.replaceChildren(); },
  };
  return controller;
}
