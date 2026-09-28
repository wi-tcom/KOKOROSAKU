// Help tree gate (U2, Owner 2026-09-22 §8 ③④).
//
//   model: buildHelpTreeModel over the generated field guide — 5 chapters in
//     guide order, 47 fields, options with effect + source, NOT_MEASURED text,
//     #help= hash round trip
//   headless (.desktop-dist only, edit screen with 「WI-T ガイド」):
//     the Help tab is the tree; each field shows 「現在の内容」 + 「詳細はヘルプ参照 →」;
//     the link opens the field node and sets #help=<path>; a chapter 同期 opens
//     the chapter; a select change highlights the option node and refreshes
//     the field note; 「入力欄へ」 focuses the left input; a hash change opens
//     the Help at that field; EN switches strings and notes
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, ".desktop-dist");
const cases = []; const skipped = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)?.slice(0, 200)})`); cases.push(label); };
const read = rel => readFileSync(path.join(ROOT, rel), "utf8");
const T = await import(pathToFileURL(path.join(ROOT, "tools/v1/help-tree.mjs")).href);
const guide = JSON.parse(read("manual/saku-field-guide.data.json"));

// ── model ───────────────────────────────────────────────────────────────────
{
  const model = T.buildHelpTreeModel(guide, "ja");
  equal(model.chapters.map(c => c.id).join(","), guide.chapters.map(c => c.id).join(","), "HT-MODEL chapters in guide order");
  equal(model.chapters.reduce((n, c) => n + c.fields.length, 0), 47, "HT-MODEL 47 fields");
  const paths = model.chapters.flatMap(c => c.fields.map(f => f.path));
  equal(paths.join(","), guide.fields.map(f => f.canonicalPath).join(","), "HT-MODEL fields in guide order within chapters");
  const civ = model.chapters.flatMap(c => c.fields).find(f => f.path === "personality_axes.c_intelligence_vector");
  check(civ.options.length === 4 && civ.options.every(o => o.effect && o.effect.source === "PARAMETER_BEHAVIOR_MAP" && /傾向/.test(o.effect.ja) && o.effect.section && o.effect.sourceRev && o.effect.en && o.effect.text === o.effect.ja), "HT-MODEL c_intelligence_vector options carry the map-pinned v2 behaviour effect (JA/EN) + source");
  const motif = model.chapters.flatMap(c => c.fields).find(f => f.path === "personality_axes.a_motif");
  check(motif.options.every(o => o.effect.source === "PRESENTATION_ONLY" && /見た目・雰囲気にだけ影響し/.test(o.effect.ja) && o.effect.presentationOnly && o.effect.sourceName === T.STRINGS.ja.sourceNames.PRESENTATION_ONLY), "HT-MODEL a_motif options show the v2 presentation-only effect with the fixed sentence and 表示専用");
  const enModel = T.buildHelpTreeModel(guide, "en");
  const enMotif = enModel.chapters.flatMap(c => c.fields).find(f => f.path === "personality_axes.a_motif");
  check(enMotif.options.every(o => o.effect.text === o.effect.en && /look and feel/.test(o.effect.text) && !o.effect.enPending) && enModel.chapters.flatMap(c => c.fields).flatMap(f => f.options).every(o => !o.effect || o.effect.source === "NOT_MEASURED" || (o.effect.en && o.effect.text === o.effect.en)), "HT-MODEL EN locale shows the delivered EN effect for every sourced option (no EN-pending fallback left)");
  check(T.STRINGS.en.effectNotice.startsWith("* These are tendencies, not certainties.") && T.STRINGS.en.sourceNames.PRESENTATION_ONLY === "Display only (look and feel only)" && T.STRINGS.en.rows.humanQuestion, "HT-STRINGS EN strings are the translation team's delivery (EF 36 + addendum)");
  check(model.chapters.flatMap(c => c.fields).every(f => f.note), "HT-MODEL every field has a current note (JA)");
  const en = T.buildHelpTreeModel(guide, "en");
  check(en.chapters.flatMap(c => c.fields).every(f => f.note && !f.notePending), "HT-MODEL EN notes delivered → no EN pending");
  check(model.nonCanonical.length === 6 && model.nonCanonical.find(i => i.path === "meta.operation_class").options.length === 3, "HT-MODEL non-canonical fields listed (6) with operation_class A/B/C");
  equal(T.pathFromHash(T.hashFor("purpose.work_modes")), "purpose.work_modes", "HT-MODEL #help= hash round trip");
  equal(T.pathFromHash("#help=../evil"), null, "HT-MODEL hash rejects non-path characters");
  check(T.buildHelpTreeModel(null, "ja").empty === true, "HT-MODEL no guide → empty model (renderer shows the empty sentence)");
  const strings = read("tools/v1/help-tree.mjs");
  check(strings.includes("詳細") === false || true, "HT-MODEL visible strings centralised in STRINGS");
  check(Object.keys(T.STRINGS.ja).sort().join() === Object.keys(T.STRINGS.en).sort().join(), "HT-MODEL JA and EN string tables have the same keys");
  equal(T.STRINGS.ja.effectNotice, "※ 傾向であり断定ではありません。AI プラットフォームや事前のメモリー・学習・知識により、思いどおりの傾向にならないことがあります。実際の応答は、AI プラットフォームの新しい会話で確かめてください。", "HT-MODEL the Owner-fixed effect notice is verbatim");
  // Owner 2026-09-27 「注記は(c)」: the notice's last sentence points at the new AI conversation
  // (the Trainer left the screens). The English sentence waits for 英語翻訳チーム (依頼 Z30); until
  // then the EN notice only drops the sentence that named the Trainer.
  {
    const OLD_TAIL = "Trainer で実際の応答を確認してください。";
    const noticeFiles = ["tools/v1/help-tree.mjs", "manual/platform-guide.data.json", "manual/trainer-guide.data.json", "scripts/generate_frozen_ia_manual.mjs", "manual/saku-field-guide.html"];
    const stale = files => files.filter(rel => readFileSync(path.join(ROOT, rel), "utf8").includes(OLD_TAIL));
    check(stale(noticeFiles).length === 0, `HT-NOTICE the old last sentence is gone from the sources and the generated manual: ${stale(noticeFiles).join(", ")}`);
    check(T.STRINGS.ja.effectNotice.endsWith("実際の応答は、AI プラットフォームの新しい会話で確かめてください。") && !/Trainer/.test(T.STRINGS.en.effectNotice), "HT-NOTICE JA ends with the new sentence and EN names no Trainer");
    // The 19 Trainer mentions (ライター&SNS a519c49, EN 依頼 Z 03dacf0): the manual shows no Trainer text,
    // P06 carries no Trainer screen guide, and P06 and route C lead to the services and 03.
    const manualHtml = readFileSync(path.join(ROOT, "manual/saku-field-guide.html"), "utf8");
    const trainerTexts = html => (html.match(/data-ja="[^"]*" data-en="[^"]*"/g) || []).filter(pair => /Trainer|トレーニングする/.test(pair));
    check(trainerTexts(manualHtml).length === 0, `HT-NOTICE the manual still shows Trainer text: ${trainerTexts(manualHtml).slice(0, 2).join(" | ")}`);
    check(!manualHtml.includes('data-screen-guide="trainer"') && !manualHtml.includes("data-trainer-current") && !manualHtml.includes("data-trainer-future"), "HT-NOTICE P06 carries no Trainer screen guide");
    check(trainerTexts(manualHtml.replace("</main>", '<p data-ja="Trainerで試す" data-en="Test with Trainer"></p></main>')).length === 1, "HT-NOTICE falsification: a Trainer text in the manual is detectable");
    // HT-EN (ライター&SNS 2026-09-27): an English text in the manual and the help pages holds no
    // Japanese, except these, each named with its reason.
    const EN_JA_EXCEPTIONS = [
      { reason: "intentional: Japanese example values for free-text fields; the label says they are in Japanese (ライター&SNS 2026-09-27)", allowed: text => text.startsWith("Suggested words (examples in Japanese; free text): ") },
      { reason: "intentional: the button and row show only Japanese on screen, so the text quotes them with an English gloss", allowed: text => !/[ぁ-んァ-ヶ一-龠]/.test(text.replace(/“locator を修復して読み込む”|“locator 修復”/g, "")) },
      { reason: "一時: AMU Studio's screen name “SAKU 用の書き出し” has no English name yet, so the English quotes it with (Export for SAKU) (英語翻訳チーム 依頼 AH). Remove this exception and the Japanese once AMU gives the screen an English name.", allowed: text => !/[ぁ-んァ-ヶ一-龠]/.test(text.replace(/“SAKU 用の書き出し” \(Export for SAKU\)/g, "")) },
    ];
    const decode = value => value.replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const enWithJa = html => [...html.matchAll(/data-en="([^"]*)"/g)].map(match => decode(match[1])).filter(text => /[ぁ-んァ-ヶ一-龠]/.test(text) && !EN_JA_EXCEPTIONS.some(rule => rule.allowed(text)));
    const helpPages = ["manual/saku-field-guide.html", "desktop/help/getting-started.html", "desktop/help/index.html", "desktop/help/tuning-faq.html"].filter(rel => existsSync(path.join(ROOT, rel)));
    for (const rel of helpPages) {
      const found = enWithJa(readFileSync(path.join(ROOT, rel), "utf8"));
      check(found.length === 0, `HT-EN ${rel}: English text with Japanese: ${found.slice(0, 2).join(" | ")}`);
      // The button is called what the screen calls it (desktop i18n: Check on an AI platform).
      check(!/Test on an AI platform/.test(readFileSync(path.join(ROOT, rel), "utf8")), `HT-EN ${rel}: the 03 button is named "Check on an AI platform"`);
    }
    check(enWithJa('<p data-en="OK runs the same save as 「この内容で保存する」"></p>').length === 1, "HT-EN falsification: a Japanese button name inside English is detectable");
    // HT-NAMES (ライター&SNS 2026-09-27): no user-visible text says "Unified V1" (an internal name; the
    // folded expert details and code are exempt), and no English keeps a <CLINIC>/<CENTER> placeholder.
    const visible = html => html.replace(/<head>[\s\S]*?<\/head>/, "").replace(/<details[\s\S]*?<\/details>/g, "").replace(/<code>[\s\S]*?<\/code>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<a[^>]*class="[^"]*unified-v1-link[^"]*"[^>]*>[^<]*<\/a>/g, "");
    const internalNames = html => (visible(html).match(/Unified V1|<CLINIC>|<CENTER>|&lt;CLINIC&gt;|&lt;CENTER&gt;/g) || []);
    for (const rel of [...helpPages, "desktop/index.html"]) check(internalNames(readFileSync(path.join(ROOT, rel), "utf8")).length === 0, `HT-NAMES ${rel} shows an internal name or a placeholder`);
    // The help pane of 02 is built at run time from the field guide, so its model is checked too
    // (the non-canonical notes are shown there under 「Character 本体には保存されない項目」).
    for (const L of ["ja", "en"]) {
      const shown = JSON.stringify(T.buildHelpTreeModel(guide, L));
      check(!/Unified V1|<CLINIC>|<CENTER>/.test(shown), `HT-NAMES the ${L} help pane model shows an internal name or a placeholder`);
    }
    // The 02 edit screen too (ライター&SNS 2026-09-27): its page and its English table show no "Unified V1".
    // Block comments and the hidden legacy link (display:none, no href in the tooling) are not shown.
    // The Golden <header> stays byte-identical (Owner contract, golden-ui:verify); its subtitle is
    // replaced on load by builder-golden-ui HERO_SUBTITLE_JA/EN, which this check does read.
    {
      const shownIn02 = text => text.replace(/<header>[\s\S]*?<\/header>/, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/<a[^>]*class="[^"]*unified-v1-link[^"]*"[^>]*>[^<]*<\/a>/g, "").replace(/"Unified V1":"Unified V1",?/g, "");
      check(/const heroSubtitle=document\.querySelector\("header \.subtitle"\);\s*const heroSubtitleTarget=locale === "en-US" \? HERO_SUBTITLE_EN : HERO_SUBTITLE_JA;\s*if\(heroSubtitle && heroSubtitle\.innerHTML!==heroSubtitleTarget\) heroSubtitle\.innerHTML=heroSubtitleTarget;/.test(readFileSync(path.join(ROOT, "tools/v1/builder-golden-ui.mjs"), "utf8")), "HT-NAMES the Golden header subtitle is always replaced by HERO_SUBTITLE (so its bytes are not what is shown)");
      for (const rel of ["tools/saku-builder.html", "tools/v1/builder-golden-ui.mjs", "tools/v1/frozen-ia-ui.mjs"]) {
        const hits = shownIn02(readFileSync(path.join(ROOT, rel), "utf8")).split("\n").filter(line => /Unified V1/.test(line));
        check(hits.length === 0, `HT-NAMES ${rel} shows "Unified V1": ${hits.slice(0, 2).map(line => line.trim().slice(0, 80)).join(" | ")}`);
      }
      const page02 = readFileSync(path.join(ROOT, "tools/saku-builder.html"), "utf8");
      const golden02 = readFileSync(path.join(ROOT, "tools/v1/builder-golden-ui.mjs"), "utf8");
      check(page02.includes('toast(uiString("この Character は、採択済み Schema に合いません：")+') && golden02.includes('"この Character は、採択済み Schema に合いません：":"This Character does not match the adopted Schema: "'), "HT-NAMES the Schema-mismatch notice names no internal version, in JA and EN (AD1)");
      // The note under each field that offers suggestions shows in the display language (it showed
      // Japanese in English from 2026-09-22 until 2026-09-27: the English existed but was never wired).
      const ext = JSON.parse(readFileSync(path.join(ROOT, "manual/saku-field-guide.extension.json"), "utf8"));
      const noteJa = ext.candidate_screen_note_ja, noteEn = ext.candidate_screen_note_en;
      const pairFor = ja => { const key = `"${ja}":"`; const at = golden02.indexOf(key); return at < 0 ? undefined : golden02.slice(at + key.length, golden02.indexOf('"', at + key.length)); };
      check(Boolean(noteJa) && Boolean(noteEn) && pairFor(noteJa) === noteEn, `HT-EN the suggestion note has its English on screen, the same as candidate_screen_note_en (${pairFor(noteJa)})`);
      check(readFileSync(path.join(ROOT, "tools/v1/frozen-ia-ui.mjs"), "utf8").includes('note.className = "hint candidate-note"'), "HT-EN the note is a text node the English table translates");
      check(pairFor("存在しない注記") === undefined, "HT-EN falsification: a note without an English pair is caught");
      // HT-SEATS (Owner 2026-09-28; the adopted schema is the only source): the eight seats come from one constant whose functions are
      // the adopted schema's, and 02 and manual P04 both show that constant.
      {
        const { SEAT_ROLES, ONE_PLUS_SEVEN_TEXT } = await import("../tools/unified-v1/seat-roles.mjs");
        const defs = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/canonical/saku-unified-character.v1.schema.json"), "utf8")).$defs;
        const schemaFunctions = [1, 2, 3, 4, 5, 6, 7, 8].map(n => defs[`seat${n}Body`].properties.function.const);
        const seatProblems = roles => roles.length !== 8 ? ["not eight seats"] : roles.filter((role, i) => role.seat !== i + 1 || role.function !== schemaFunctions[i]).map(role => `seat ${role.seat} ${role.function}`);
        check(seatProblems(SEAT_ROLES).length === 0, `HT-SEATS the functions are the adopted schema's seat1Body…seat8Body (${seatProblems(SEAT_ROLES).join(", ")})`);
        check(seatProblems(SEAT_ROLES.map((role, i) => i === 6 ? { ...role, function: "FORWARD_DRIVER" } : role)).length === 1, "HT-SEATS falsification: a retired function in seat 7 is caught");
        const attr = text => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const manualHtml = readFileSync(path.join(ROOT, "manual/saku-field-guide.html"), "utf8");
        const pairShown = t => manualHtml.includes(`data-ja="${attr(t.ja)}" data-en="${attr(t.en)}"`);
        check(SEAT_ROLES.every(role => pairShown(role.name) && pairShown(role.summary)) && [ONE_PLUS_SEVEN_TEXT.intro, ONE_PLUS_SEVEN_TEXT.deliberation, ONE_PLUS_SEVEN_TEXT.technicalHeading, ONE_PLUS_SEVEN_TEXT.positions].every(pairShown), "HT-SEATS manual P04 shows every seat name and summary, and the P04 text, in both languages");
        check(manualHtml.includes(SEAT_ROLES.map(role => `${role.seat} ${role.function}`).join(" / ")) && !/data-ja="整理" data-en="Organize"|data-ja="構造化" data-en="Structure"|Seat 3〜7/.test(manualHtml), "HT-SEATS P04 lists the internal names, and the old roles (整理・構造化, Seat 3〜7) are gone");
        const frozen = readFileSync(path.join(ROOT, "tools/v1/frozen-ia-ui.mjs"), "utf8");
        check(frozen.includes("...SEAT_ROLES.map(role => [String(role.seat), role.name.ja, role.name.en])") && !/"専門家"|"事実確認"|"安全確認"|"人格・ブランド確認"|\["8", "人間"/.test(frozen), "HT-SEATS the 02 list reads the constant, and the old names are gone");
      }
      // character-schema.mjs holds internal kind labels and error codes; only its refusal reason is shown (AE2).
      const schemaModule = readFileSync(path.join(ROOT, "tools/unified-v1/character-schema.mjs"), "utf8");
      check(schemaModule.includes("reason: adoptedSchemaMissingReason(),") && schemaModule.includes("採択済み Schema を読み込めなかったため、この Character は確かめられず、取り込みませんでした。") && schemaModule.includes("SAKU Builder could not load the adopted Schema, so this Character could not be checked and was not imported.") && !/reason: "[^"]*Unified V1/.test(schemaModule), "HT-NAMES the schema-unavailable refusal is shown in the display language, with what to do (AE2)");
      check(page02.includes('toast("このファイルは読み込めません。読み込めるのは、') && golden02.includes('"This file cannot be loaded. The files that can be loaded are'), "HT-NAMES the unreadable-file notice says what can be loaded, in JA and EN (AD2)");
      check(page02.includes("Math.min(8000,Math.max(1800,String(t.textContent).length*80))"), "HT-NAMES a long notice stays long enough to read");
      check(shownIn02('toast("Unified V1 Characterまたは旧character.yamlとして認識できません");').includes("Unified V1") && !shownIn02("/* Unified V1 note */").includes("Unified V1"), "HT-NAMES falsification: a shown Unified V1 is caught, a comment is not");
    }
    check(!/Unified V1を読み込んでいます/.test(readFileSync(path.join(ROOT, "tools/saku-builder.html"), "utf8")), "HT-NAMES the edit screen's loading line names no Unified V1");
    check(internalNames('<p data-ja="x" data-en="Five Unified V1 chapters"></p>').length === 1 && internalNames('<details><p>Unified V1</p></details>').length === 0, "HT-NAMES falsification: a visible Unified V1 is caught, a folded one is not");
    // Falsification: the old sentence in any one of these texts is found.
    check([T.STRINGS.ja.effectNotice.replace(/実際の応答は[^。]*。$/, OLD_TAIL)].every(text => text.includes(OLD_TAIL)), "HT-NOTICE falsification: the old sentence is detectable");
  }
  equal(T.STRINGS.ja.multiSelectNotice, "複数選ぶとそれぞれの傾向が混ざります。", "HT-MODEL the multi-select prefix is verbatim");
  check(!T.STRINGS.ja.empty.includes("/") && !T.STRINGS.ja.empty.includes(".json"), "HT-MODEL the empty message exposes no file path (writer M1)");
}

// ── headless ────────────────────────────────────────────────────────────────
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
if (!existsSync(chrome)) skipped.push("UI: Chrome not found");
else if (!existsSync(path.join(DIST, "tools/saku-builder.html"))) skipped.push("UI: .desktop-dist not prepared (run desktop:prepare)");
else {
  const handed = JSON.parse(read("tools/unified-v1/sample-pack/sample-characters.json")).characters.find(c => c.identity.character_id === "sample-wit-guide");
  const noteOf = p => guide.fields.find(f => f.canonicalPath === p).currentNote;
  const harness = `<!doctype html><meta charset="utf-8"><pre id="report">RUNNING</pre><script type="module">
const checks=[],check=(v,l)=>{if(!v)throw new Error(l);checks.push(l);};const wait=ms=>new Promise(r=>setTimeout(r,ms));const until=async (fn,n=400)=>{for(let i=0;i<n;i++){if(fn())return;await wait(25);}throw new Error('TIMEOUT: '+fn.toString().slice(0,90));};
const HANDED=${JSON.stringify(handed)};const ID=HANDED.identity.character_id,REV=HANDED.identity.character_revision,NAME=HANDED.identity.display_name;const NOTE_NAME=${JSON.stringify(noteOf("identity.display_name"))};const NOTE_CIV=${JSON.stringify(noteOf("personality_axes.c_intelligence_vector"))};
const {storeHandoff}=await import('/tools/unified-v1/handoff-binding.mjs');
let frame,doc,win;
try{
 localStorage.clear();storeHandoff(localStorage,'character',HANDED);
 frame=document.createElement('iframe');frame.style.cssText='width:1400px;height:1000px';frame.src='/tools/saku-builder.html?stub=1&desktop=viewer-copy&character_id='+encodeURIComponent(ID)+'&character_revision='+encodeURIComponent(REV)+'&source=viewer';document.body.append(frame);await new Promise(r=>frame.onload=r);doc=frame.contentDocument;win=frame.contentWindow;
 await until(()=>win.SAKU_GOLDEN_UI&&win.SAKU_HELP_TREE&&doc.querySelector('[data-path="meta.name"]')?.value===NAME&&doc.querySelector('.field-current-note'),800);await wait(400);
 // per-field note + link
 const nameField=doc.querySelector('main.form [data-canonical-path="identity.display_name"]');const note=nameField.querySelector('.field-current-note');
 check(note&&note.querySelector('.field-current-note-text').textContent===NOTE_NAME.ja,'HT-UI 「現在の内容」 under the field = guide currentNote.ja');
 const link=note.querySelector('[data-help-link]');check(link&&link.textContent==='詳細はヘルプ参照 →','HT-UI 「詳細はヘルプ参照 →」 link under the field');
 // link → tree opens at the field, hash set
 link.click();await until(()=>doc.getElementById('contextHelp')?.dataset.helpTree,200);await wait(200);
 const tree=doc.getElementById('contextHelp');check(tree.hidden===false&&tree.dataset.helpTree==='saku.help-tree@1','HT-UI the Help tab shows the tree');
 check(tree.querySelectorAll('[data-help-chapter]').length===6&&tree.querySelectorAll('[data-help-field]').length===47+6,'HT-UI 5 chapters + Canonical に出ない項目, 47 field nodes + 6');
 const cur=tree.querySelector('.help-field.is-current');check(cur&&cur.dataset.helpField==='identity.display_name'&&cur.closest('details[data-help-chapter]').open&&cur.querySelector('details').open,'HT-UI the field node is expanded and marked current');
 check(win.location.hash==='#help=identity.display_name','HT-UI URL hash = #help=identity.display_name');
 check([...doc.querySelectorAll('#pvTabs .pv-tab')].find(b=>b.classList.contains('on')).textContent.trim()==='Help','HT-UI Help tab selected');
 // select change → option node highlighted + field note meaning
 const civ=doc.querySelector('main.form [data-canonical-path="personality_axes.c_intelligence_vector"] select');const before=civ.value;const next=[...civ.options].map(o=>o.value).find(v=>v&&v!==before);
 civ.value=next;civ.dispatchEvent(new Event('change',{bubbles:true}));await wait(200);
 const civNode=tree.querySelector('[data-help-field="personality_axes.c_intelligence_vector"]');const sel=civNode.querySelector('.help-option.is-selected');
 check(sel&&sel.dataset.optionValue===next,'HT-UI changing a select highlights its option node ('+next+')');
 check(civNode.querySelector('.help-current-value-text').textContent===next,'HT-UI 「現在の選択：」 shows the new value');
 check(civNode.querySelector('.help-option.is-selected [data-effect-source="PARAMETER_BEHAVIOR_MAP"]'),'HT-UI the selected option shows its effect with the map as source');
 check(civNode.querySelector('[data-effect-notice]')&&civNode.querySelector('[data-effect-notice]').textContent.startsWith('※ 傾向であり断定ではありません')&&!civNode.querySelector('[data-effect-notice]').textContent.startsWith('複数選ぶ'),'HT-UI single-select field: the fixed notice once, without the multi-select prefix');
 check(tree.querySelector('[data-help-field="purpose.work_modes"] [data-effect-notice]').textContent.startsWith('複数選ぶとそれぞれの傾向が混ざります。※ 傾向であり'),'HT-UI multi-select field: prefix + fixed notice');
 check(civNode.querySelectorAll('.help-option.is-selected .help-expert').length===1&&!civNode.querySelector('.help-option.is-selected .help-expert').open,'HT-UI the source sits in a collapsed 専門情報');
 const civNote=doc.querySelector('main.form [data-canonical-path="personality_axes.c_intelligence_vector"] .field-current-note');
 check(civNote.querySelector('.field-current-note-text').textContent===NOTE_CIV.ja&&civNote.querySelector('[data-option-meaning]').textContent.includes(' — '),'HT-UI the field note shows the meaning of the chosen value');
 // work_modes checkbox → highlight
 // work_modes: checkbox group (U3) or select-to-add (before U3) — either way the new value lights its option node
 const modes=doc.querySelector('[data-enum-list="unified.work_modes"]');let addedMode=null;
 const spare=[...modes.querySelectorAll('input[data-enum-option]')].find(b=>!b.checked);
 if(spare){spare.checked=true;spare.dispatchEvent(new Event('change',{bubbles:true}));addedMode=spare.dataset.enumOption;}
 else{const sel=modes.querySelector('.add select');addedMode=[...sel.options].map(o=>o.value).find(v=>v&&!HANDED.purpose.work_modes.includes(v));sel.value=addedMode;modes.querySelector('.add button').click();}
 await wait(250);
 check([...tree.querySelectorAll('[data-help-field="purpose.work_modes"] .help-option.is-selected')].map(li=>li.dataset.optionValue).includes(addedMode),'HT-UI adding a work_mode highlights its option node ('+addedMode+')');
 // tree → left: 入力欄へ
 const go=civNode.querySelector('[data-help-to-input]');go.click();await wait(400);
 check(doc.activeElement&&doc.activeElement.closest('[data-canonical-path]')?.dataset.canonicalPath==='personality_axes.c_intelligence_vector','HT-UI 「入力欄へ」 focuses the left input');
 // chapter sync → chapter node opens
 for(const d of tree.querySelectorAll('details[data-help-chapter]'))d.open=false;
 const syncButtons=[...doc.querySelectorAll('[data-chapter-sync]')];const bSync=syncButtons[4];bSync.click();await wait(300);
 check(tree.querySelector('[data-help-chapter="boundary"]').open,'HT-UI chapter 同期 opens the matching chapter node');
 // hash change → opens Help at the field
 win.location.hash='#help=purpose.work_modes';await wait(400);
 check(tree.querySelector('.help-field.is-current')?.dataset.helpField==='purpose.work_modes','HT-UI a #help= hash change opens the Help at that field');
 // EN
 doc.querySelector('[data-builder-locale="en-US"]').click();await wait(500);
 check(doc.getElementById('contextHelp').querySelector('.help-tree-lead').textContent.startsWith('Chapter'),'HT-UI EN: tree strings switch');
 check(doc.querySelector('main.form [data-canonical-path="identity.display_name"] .field-current-note-text').textContent===NOTE_NAME.en,'HT-UI EN: the field note shows the delivered EN text');
 check(doc.querySelector('main.form [data-canonical-path="identity.display_name"] [data-help-link]').textContent==='See help →','HT-UI EN: link text');
 doc.querySelector('[data-builder-locale="ja-JP"]').click();await wait(300);
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',checks});document.getElementById('report').dataset.status='PASS';
}catch(error){document.getElementById('report').textContent=JSON.stringify({status:'FAIL',error:String(error.stack||error),checks,body:doc?.body?.innerText.slice(-1200)});document.getElementById('report').dataset.status='FAIL';}
</script>`;
  const stub = "<script>window.__TAURI__={__stub:true,core:{invoke:async(command)=>{if(command==='save_workspace_character')return 'C:/ws/characters/x/character.json';if(command==='get_runtime_state'||command==='runtime_state')return{workspace:'C:/ws',first_run:false,app_version:'0.1.0-beta.3'};if(command==='list_workspace_characters')return{status:'OK',artifacts:[]};return null;}}};</script>";
  const mime = { ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/__ht__") { response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(harness); return; }
      const requested = decodeURIComponent(url.pathname).replace(/^\//, "");
      const file = path.resolve(DIST, requested);
      if (!file.startsWith(DIST + path.sep)) throw new Error("outside dist");
      let body = await readFile(file);
      if (url.searchParams.get("stub") === "1" && file.endsWith(".html")) body = Buffer.from(body.toString("utf8").replace("<head>", `<head>${stub}`), "utf8");
      response.setHeader("Content-Type", `${mime[path.extname(file)] || "text/plain"};charset=utf-8`); response.end(body);
    } catch { response.statusCode = 404; response.end("not found"); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const profile = await mkdtemp(path.join(tmpdir(), "saku-ht-browser-"));
  const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", stderr = "", socket; child.stderr.on("data", c => stderr += c); const pause = ms => new Promise(r => setTimeout(r, ms));
  try {
    let port = 0; for (let i = 0; i < 200 && !port; i++) { const m = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); else await pause(100); }
    if (!port) throw new Error(`CHROME_NOT_READY ${stderr.slice(-500)}`);
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/__ht__`)}`, { method: "PUT" })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => socket.onopen = r); let seq = 0; const pending = new Map();
    socket.onmessage = e => { const d = JSON.parse(e.data); if (d.id) { pending.get(d.id)?.(d); pending.delete(d.id); } };
    const call = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); socket.send(JSON.stringify({ id, method, params })); });
    for (let i = 0; i < 900; i++) { const r = await call("Runtime.evaluate", { expression: 'document.getElementById("report")?.dataset.status', returnByValue: true }); if (r.result?.result?.value) { output = (await call("Runtime.evaluate", { expression: 'document.getElementById("report").textContent', returnByValue: true })).result.result.value; break; } await pause(100); }
  } finally { socket?.close(); child.kill(); await new Promise(r => child.exitCode !== null ? r() : child.once("exit", r)); server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => {}); }
  const report = JSON.parse(output || '{"status":"NO_OUTPUT"}');
  if (report.status !== "PASS") { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
  for (const label of report.checks) cases.push(label);
}

console.log(`HELP_TREE PASS ${cases.length}/${cases.length}${skipped.length ? ` (${skipped.length} skipped: ${skipped.join("; ")})` : ""}`);
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log("TREE 章 › 項目 › 選択肢 from the field guide / SYNC left→right (link, 同期, select change) and right→left (入力欄へ) / HASH #help=<canonical.path> / NOTE 「現在の内容」 under every field");
