// Screen help gate (U4, Owner 2026-09-22 §8 ⑤⑥): the same help tree beside
// 03 AI プラットフォーム, 04 Trainer and the speed test, fed by two screen guides.
//
//   guides: platform / trainer guide data — version bound to the app, every
//     field names a screen section, notes ≤ 120 chars / ≤ 2 sentences, option
//     dictionaries equal the screen's real vocabularies (formats, Trainer
//     human choices), every option effect sourced (OPERATION_FACT)
//   headless (.desktop-dist only): 03 panel shows the pane, 「同期」 on the
//     step headings opens the node + hash, the format buttons light the option
//     node and 「現在の選択：」, 「入力欄へ」 scrolls to the step; 04 Trainer and
//     the speed test page mount the pane, 同期 survives a re-render
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
const X3 = await import(pathToFileURL(path.join(ROOT, "tools/v1/trainer-ux3.mjs")).href);
const pkg = JSON.parse(read("package.json"));
const guides = { platform: JSON.parse(read("manual/platform-guide.data.json")), trainer: JSON.parse(read("manual/trainer-guide.data.json")) };

// ── guides ──────────────────────────────────────────────────────────────────
for (const [name, guide] of Object.entries(guides)) {
  equal(guide.applies_to_app_version, pkg.version, `SH-GUIDE ${name}: applies_to_app_version = package.json`);
  equal(guide.profile, "saku.screen-guide@1", `SH-GUIDE ${name}: profile`);
  const model = T.buildHelpTreeModel(guide, "ja");
  check(!model.empty && model.chapters.length === guide.chapters.length && model.chapters.reduce((n, c) => n + c.fields.length, 0) === guide.fields.length, `SH-GUIDE ${name}: help tree model = ${guide.chapters.length} chapters / ${guide.fields.length} fields`);
  for (const field of guide.fields) {
    assert.ok(field.screenSection, `SH-GUIDE ${name}: ${field.canonicalPath} names a screen section`);
    const note = field.currentNote?.ja || "";
    assert.ok(note && note.length <= 120 && (note.match(/。/g) || []).length <= 2, `SH-GUIDE ${name}: ${field.canonicalPath} note ≤ 120 chars, ≤ 2 sentences (${note.length})`);
    assert.ok(!/必ず|常に|確実に|保証|絶対|価格|円/.test(note), `SH-GUIDE ${name}: ${field.canonicalPath} note has no assertive / price words`);
    for (const option of field.help?.optionDetails || []) assert.ok(option.effect?.ja && option.effect.source === "OPERATION_FACT" && !/必ず|常に|確実に|保証|絶対/.test(option.effect.ja), `SH-GUIDE ${name}: option ${field.canonicalPath}.${option.value} effect sourced OPERATION_FACT, no assertive words`);
  }
  cases.push(`SH-GUIDE ${name}: every field has a section, a note within the rules and sourced option effects`);
  check(guide.effect_notice?.ja === T.STRINGS.ja.effectNotice, `SH-GUIDE ${name}: carries the Owner-fixed effect notice verbatim`);
  check(guide.content_review?.en?.status === "NOT_YET" ? guide.fields.every(f => f.currentNote.en === null) : true, `SH-GUIDE ${name}: EN NOT_YET ⇒ no EN note claimed`);
  check(guide.content_review?.ja?.status !== "APPROVED" || (guide.content_review.ja.approved_on && guide.content_review.ja.approved_by === "Owner" && guide.content_review.ja.approval_route), `SH-GUIDE ${name}: an APPROVED JA guide records the date, approver and route (Owner 2026-09-22, 打鍵確認後の修正可)`);
  check(guide.content_review?.en?.status !== "DELIVERED" || (/@[0-9a-f]{7}/.test(guide.content_review.en.source) && guide.content_review.en.translated_by && guide.content_review.en.checked_by && guide.chapters.every(c => c.title.en && c.question.en) && guide.fields.every(f => f.uiLabel.en && f.currentNote.en && (f.help.optionDetails || []).every(o => o.name.en && o.meaning.en && o.effect.en))), `SH-GUIDE ${name}: a DELIVERED EN guide is complete (chapters, labels, notes, option name/meaning/effect) and records its source rev`);
}
// ── the lead only claims what the screen actually does ────────────────────
// Syncing means the tree can show 「現在の選択：」 and light the option a field is
// set to. That works only where the screen passes `currentValue`, so the lead
// follows that fact. Walked from the same kind of list as HELP-REF: a screen
// added here is checked from that moment.
{
  const T = await import(pathToFileURL(path.join(ROOT, "tools/v1/help-tree.mjs")).href);
  check(Boolean(T.STRINGS.ja.leadNoSync) && Boolean(T.STRINGS.en.leadNoSync), "SYNC-LEAD the pane has a second lead for the screens that are not synced");
  check(T.STRINGS.ja.lead.includes("同期") && !T.STRINGS.ja.leadNoSync.includes("同期"), "SYNC-LEAD only the synced lead says 「同期」");
  check(/sync/i.test(T.STRINGS.en.lead) && !/sync/i.test(T.STRINGS.en.leadNoSync), "SYNC-LEAD and the same holds in English");
  const help = read("tools/unified-v1/screen-help.mjs");
  check(help.includes("...(currentValue ? { currentValue:"), "SYNC-LEAD the pane passes currentValue only when the screen supplies one — wrapping an absent hook would claim a sync that is not there");
  const tree = read("tools/v1/help-tree.mjs");
  check(tree.includes('const synced = typeof hooks.currentValue === "function";') && tree.includes("synced ? S.lead : S.leadNoSync"), "SYNC-LEAD the tree decides from the hook it was given, not from a note kept by hand");
  // which screens supply one, read from the screens themselves
  const SUPPLIES = Object.freeze([
    { id: "02 編集画面", file: "tools/saku-builder.html", synced: true },
    { id: "03 AI プラットフォーム", file: "desktop/app.mjs", synced: false },
    { id: "04 Trainer", file: "tools/saku-trainer.html", synced: false },
    { id: "AI スピードテスト", file: "tools/saku-speed-test.html", synced: false },
  ]);
  for (const screen of SUPPLIES) {
    const source = read(screen.file);
    const mounts = /mountScreenHelp\(\{[^}]*\}/.exec(source) || /mountHelpTree\([^;]*?\{[\s\S]*?\}\s*\)/.exec(source);
    const supplies = Boolean(mounts && /currentValue\s*:/.test(mounts[0]));
    equal(supplies, screen.synced, `SYNC-LEAD ${screen.id}: supplies currentValue = ${screen.synced}`);
  }
  cases.push(`SYNC-LEAD ${SUPPLIES.length} screens: the wiring and the sentence agree`);
}

// ── every field points at a section that exists on its screen ─────────────
// 03, the Trainer and the speed test pass no onNavigateFallback, so a field
// with no screenSection — or one naming an id that is not there — would give a
// button that does nothing and says nothing (統制卓 2026-09-23).
{
  // The Trainer's sections are spread over three stages, so their existence is
  // read from the source that renders them rather than from one rendered state.
  const RENDERED_BY = Object.freeze({
    platform: ["desktop/index.html", "desktop/app.mjs"],
    trainer: ["tools/saku-trainer.html", "tools/unified-v1/trainer-ux4-ui.mjs", "tools/unified-v1/trainer-ui.mjs", "tools/unified-v1/trainer-ux3-ui.mjs", "tools/unified-v1/speed-test-ui.mjs"],
  });
  for (const [name, guide] of Object.entries(guides)) {
    const sources = RENDERED_BY[name].map(rel => { try { return read(rel); } catch { return ""; } }).join(String.fromCharCode(10));
    for (const field of guide.fields || []) {
      assert.ok(field.screenSection, `SECTION ${name}: ${field.canonicalPath} names no screen section`);
      assert.ok(sources.includes(`"${field.screenSection}"`) || sources.includes(`'${field.screenSection}'`) || sources.includes(`id="${field.screenSection}"`),
        `SECTION-SRC ${name}: ${field.canonicalPath} points at 「${field.screenSection}」, which nothing on that screen renders — the button would do nothing and say nothing`);
    }
    cases.push(`SECTION ${name}: all ${guide.fields.length} fields name a section the screen renders`);
  }
}

// ── how a screen points at help: one expression, on every screen ───────────
// Owner 2026-09-23: 「ヘルプへの参照は一律同じとしてください」. The screens are a
// list, not a habit — a screen added to SCREENS is checked from that moment,
// the same way HANDOFF_ROUTES covers a new hand-off route.
//
// The editor's per-chapter 「同期」 button is deliberately not in the retired set:
// it syncs the preview pane between Help, character.yaml and Character File, so
// it is a preview control on a chapter heading, not a pointer at help. Owner
// named 03, the Trainer and the speed test; this is reported rather than assumed.
{
  const HELP_REFERENCE = Object.freeze({ ja: "詳細はヘルプ参照 →", en: "See help →" });
  const RETIRED = Object.freeze(["この項目のHelp", "Help for this field"]);
  const SCREENS = Object.freeze([
    { id: "02 編集画面", files: ["tools/saku-builder.html", "tools/v1/frozen-ia-ui.mjs", "tools/v1/builder-golden-ui.mjs"] },
    { id: "03 AI プラットフォーム", files: ["desktop/index.html", "desktop/app.mjs"] },
    { id: "04 Trainer", files: ["tools/saku-trainer.html", "tools/unified-v1/trainer-ux4-ui.mjs"] },
    { id: "AI スピードテスト", files: ["tools/saku-speed-test.html", "tools/unified-v1/speed-test-ui.mjs"] },
    { id: "ヘルプの木（全画面共通）", files: ["tools/unified-v1/screen-help.mjs", "tools/v1/help-tree.mjs"] },
  ]);
  for (const screen of SCREENS) {
    for (const rel of screen.files) {
      const source = read(rel);
      for (const retired of RETIRED) assert.ok(!source.includes(retired), `HELP-REF ${screen.id}: 「${retired}」 is retired and must not come back (${rel})`);
      // `helpSynced` is the lead's truth flag, not a button: the boundary is exact.
      assert.ok(!/data-help-sync(?!ed)|helpSync(?![a-z])|SYNC_LABEL/.test(source), `HELP-REF ${screen.id}: no 「同期」 button stamps this screen's help (${rel})`);
    }
  }
  cases.push(`HELP-REF ${SCREENS.length} screens: no retired help label and no 「同期」 button on any of them`);
  // and the one expression has one home, in both languages
  const home = read("tools/saku-builder.html");
  check(home.includes(`detailLink:"${HELP_REFERENCE.ja}"`) && home.includes(`detailLink:"${HELP_REFERENCE.en}"`), "HELP-REF the one expression is defined once, in Japanese and in English");
  // Carriers, not mentions: a comment may name the expression, but only one file
  // may define it as a string the screen renders.
  const quoted = new RegExp(`["'\`]${HELP_REFERENCE.ja}["'\`]`);
  const carriers = SCREENS.flatMap(screen => screen.files).filter(rel => quoted.test(read(rel)));
  equal(carriers.join(","), "tools/saku-builder.html", "HELP-REF the expression is defined on one screen only — no screen writes its own wording for the same link");
  // and no screen defines a second wording for it
  const OTHER = [/["'`][^"'`]*ヘルプを見る *→["'`]/, /["'`][^"'`]*ヘルプはこちら[^"'`]*["'`]/, /["'`][^"'`]*この項目の説明[^"'`]*["'`]/];
  for (const screen of SCREENS) for (const rel of screen.files) for (const shape of OTHER) {
    assert.ok(!shape.test(read(rel)), `HELP-REF ${screen.id}: a second wording for the help link (${rel})`);
  }
  cases.push("HELP-REF no screen defines a second wording for the help link");
}

{
  // 03 hands over one text now (Owner 2026-09-23): the JSON and YAML buttons are
  // gone, and so is the step that chose between them, so the guide must not still
  // explain a choice the screen does not offer.
  equal(guides.platform.fields.filter(f => f.canonicalPath === "platform.format").length, 0, "SH-GUIDE the guide no longer carries platform.format");
  equal([...read("desktop/index.html").matchAll(/data-platform-format="(\w+)"/g)].length, 0, "SH-GUIDE 03 offers no format buttons");
  equal(read("desktop/index.html").includes("渡し方を選ぶ"), false, "SH-GUIDE the 「渡し方を選ぶ」 step is gone from the screen");
  equal(guides.platform.chapters.map(c => c.numeral).join(","), guides.platform.chapters.map((_, i) => String(i + 1)).join(","), "SH-GUIDE the remaining chapters are numbered 1..n with no gap");
  const conclusion = guides.trainer.fields.find(f => f.canonicalPath === "trainer.conclusion");
  equal(conclusion.options.join(","), Object.keys(X3.CHOICES.conclusion).join(","), "SH-GUIDE trainer.conclusion = Trainer human choices (conclusion)");
  equal(guides.trainer.fields.find(f => f.canonicalPath === "trainer.confirmed").options.join(","), Object.keys(X3.CHOICES.confirmed).join(","), "SH-GUIDE trainer.confirmed = Trainer human choices (confirmed)");
  equal(guides.trainer.fields.find(f => f.canonicalPath === "trainer.reasons").options.join(","), Object.keys(X3.CHOICES.reasons).join(","), "SH-GUIDE trainer.reasons = Trainer human choices (reasons)");
  for (const [value, [ja]] of Object.entries(X3.CHOICES.conclusion)) assert.equal(conclusion.help.optionDetails.find(o => o.value === value).name.ja, ja, `SH-GUIDE conclusion ${value} name = Trainer wording`);
  cases.push("SH-GUIDE Trainer option names equal the Trainer's displayed wording");
  const sections = [...read("desktop/index.html").matchAll(/id="([a-z-]+)"/g)].map(m => m[1]);
  check(guides.platform.fields.every(f => sections.includes(f.screenSection)), "SH-GUIDE every platform section id exists in desktop/index.html");
  // The echo-back result is a report, never a verification (Owner 承認の線, 統制卓 2026-09-23):
  // no success styling, no tick, no 「検証済み」 anywhere in the block or its wiring.
  {
    const html = read("desktop/index.html");
    const app = read("desktop/app.mjs");
    const block = html.slice(html.indexOf('id="platform-echo"'), html.indexOf("</details>", html.indexOf('id="platform-echo"')));
    const wiring = app.slice(app.indexOf("function showEchoResult"), app.indexOf("$(\"platform-copy\").addEventListener"));
    check(block.includes("読み込めたか AI に聞く（任意）") && html.includes('<details id="platform-echo"') && !/open/.test(block.slice(0, block.indexOf(">"))), "SH-ECHO the block carries the approved label and is closed by default");
    check(!/検証済|確認済|✓|✔|success|is-ok/.test(block + wiring), "SH-ECHO nothing in the echo block or its wiring claims verification (no tick, no success styling)");
    check(wiring.includes("ECHO_CHECK_LABEL") && wiring.includes('complete ? "info" : "warning"') && wiring.includes("申告であって検証ではありません"), "SH-ECHO the result is labelled 「AI 申告値（検証不能）」 and says a complete echo is still only a report");
    check(app.includes("ECHO_REQUEST[echoLocale()]") && !/『## Character directives』[^"]*"/.test(app.replace("ECHO_REQUEST", "")), "SH-ECHO the request text comes from the approved constant, not a copy in the screen");
    const i18n = read("desktop/i18n.mjs");
    const copied = "コピーしました。AIの入力欄に貼り付けてください。";
    check(app.split(copied).length - 1 === 2 && i18n.includes(`"${copied}":"Copied. Paste it into the AI's input field."`), "SH-ECHO the copy-done message is one wording shared by 03 and the echo block, and the EN table maps that exact string");
  }
  const manifest = read("desktop/resources/manifests/native-public.json");
  check(["manual/platform-guide.data.json", "manual/trainer-guide.data.json", "tools/unified-v1/screen-help.mjs", "tools/unified-v1/help-pane.css", "tools/v1/help-tree.mjs"].every(p => manifest.includes(`"${p}"`)), "SH-GUIDE guides, screen-help, pane CSS and help-tree are bundled");
  check(!/help-pane|screen-help|help-tree/.test(read("desktop/desktop.css")) && !/help-pane|screen-help|help-tree/.test(read("desktop/viewer.mjs")), "SH-GUIDE desktop.css / viewer.mjs carry nothing of the pane (AMU exact pin)");
}

// ── headless ────────────────────────────────────────────────────────────────
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
if (!existsSync(chrome)) skipped.push("UI: Chrome not found");
else if (!existsSync(path.join(DIST, "index.html"))) skipped.push("UI: .desktop-dist not prepared (run desktop:prepare)");
else {
  const handed = JSON.parse(read("tools/unified-v1/sample-pack/sample-characters.json")).characters.find(c => c.identity.character_id === "sample-wit-guide");
  const harness = `<!doctype html><meta charset="utf-8"><pre id="report">RUNNING</pre><script type="module">
const checks=[],check=(v,l)=>{if(!v)throw new Error(l);checks.push(l);};const wait=ms=>new Promise(r=>setTimeout(r,ms));const until=async (fn,n=400)=>{for(let i=0;i<n;i++){if(fn())return;await wait(25);}throw new Error('TIMEOUT: '+fn.toString().slice(0,90));};
const HANDED=${JSON.stringify(handed)};
// Every section the guides point at, so the screens can be asked for them.
const GUIDE_SECTIONS=${JSON.stringify({ platform: guides.platform.fields.map(field => field.screenSection), trainer: guides.trainer.fields.map(field => field.screenSection) })};
const ActiveSaku=await import('/tools/unified-v1/active-saku.mjs');
let frame,doc,win;const load=async src=>{if(frame)frame.remove();frame=document.createElement('iframe');frame.style.cssText='width:1400px;height:1000px';frame.src=src;document.body.append(frame);await new Promise(r=>frame.onload=r);doc=frame.contentDocument;win=frame.contentWindow;};
try{
 localStorage.clear();ActiveSaku.setActive(HANDED,{source:'gate'});
 // 03
 await load('/index.html?stub=1&stay=1&open=platform');await until(()=>win.__saku_platform_help&&doc.querySelector('#platform-help[data-screen-help]'),600);await wait(300);
 const pane=doc.getElementById('platform-help');check(pane.dataset.screenHelp==='saku.screen-help@1'&&doc.getElementById('platform-panel').hidden===false,'SH-03 the pane is mounted beside the platform panel');
 check(pane.querySelectorAll('[data-help-chapter]').length===4&&pane.querySelectorAll('[data-help-field]').length===4,'SH-03 4 chapters / 4 fields from the platform guide');
 check(pane.dataset.helpSynced==='false'&&!pane.querySelector('.help-tree-lead').textContent.includes('同期'),'SYNC-LEAD 03 does not claim to be synced with the input fields — it passes no current value');
 for(const id of GUIDE_SECTIONS.platform) check(doc.getElementById(id),'SECTION 03 the section '+id+' the guide points at exists on the screen');
 check(!doc.querySelector('[data-platform-format]')&&!doc.body.textContent.includes('渡し方を選ぶ'),'SH-03 the screen offers one way to hand the Character over, and no step that chooses between forms');
 // Owner removed the 「同期」 buttons from 03 on 2026-09-23: the pane is already
 // beside the steps, so a button that opens it was a second way to the same place.
 check(!doc.querySelector('[data-help-sync]'),'SH-03 no 「同期」 button anywhere on the 03 screen');
 pane.querySelector('[data-help-field="platform.paste"] summary')?.click();await wait(200);
 check(pane.querySelector('[data-help-field="platform.paste"]'),'SH-03 the step is still explained in the pane, reached from the tree itself');
 const go=pane.querySelector('[data-help-field="platform.boundary"] [data-help-to-input]');go.click();await wait(300);
 check(doc.getElementById('platform-boundary').classList.contains('help-target-pulse'),'SH-03 「入力欄へ」 scrolls to the step (pulse on the section)');
 check(doc.getElementById('platform-launch').value.includes('--- WI-T ガイド のキャラクター定義 ここから ---'),'SH-03 the launch text still renders the Character');
 await until(()=>/## Character directives/.test(doc.getElementById('platform-launch').value)&&!/glossary unavailable/.test(doc.getElementById('platform-launch').value),400);
 const launch=doc.getElementById('platform-launch').value;check(/glossary: saku\\.directive-glossary@1 sha256:[0-9a-f]{16}/.test(launch)&&/\\nANALYSIS:\\n  ALWAYS split the input into facts, hypotheses and unknowns/.test(launch)&&/\\nc=EMOTIONAL_RESOLUTION:\\n  ALWAYS /.test(launch)&&/## Character directives/.test(launch)&&launch.trim().endsWith('Hard invariants and handoff conditions come first.')&&!/QUIET_GARDENER|AMBER_KAKISHIBU|a_motif/.test(launch),'SH-03 the real launch text carries L1 tokens + L2 directive blocks from the bundled glossary + L4 rules, and withholds the presentation axes');
 // the shared base layer B: bundled, digest-checked, and actually handed over (統制卓 2026-09-23)
 check(/^## Base/m.test(launch),'SH-BASE the pasted text opens with the shared base layer');
 check(launch.indexOf('## Base')<launch.indexOf('## Character'),'SH-BASE the base layer sits above the persona');
 check(/^base: saku\.base-directives@1 v1\.0 sha256:ab4745a3617e5b8e/m.test(launch),'SH-BASE the provenance line names the bundled version and digest');
 check(!/## Output rules/.test(launch),'SH-BASE with a base layer 03 does not repeat the output rules (B carries them)');
 check(launch.length>3000,'SH-BASE the text is actually there — fail closed would have left it empty');
 // echo-back (Owner-approved wording 2026-09-23): default off, and the result is a report, never a verification
 const echo=doc.getElementById('platform-echo');check(echo&&echo.open===false,'SH-ECHO the echo-back block is closed until the person opens it (default off)');
 echo.open=true;await wait(50);
 check(doc.getElementById('platform-echo-title').textContent==='読み込めたか AI に聞く（任意）','SH-ECHO the button carries the approved wording');
 const request=doc.getElementById('platform-echo-request').value;check(request==="この会話に読み込んだ『## Character directives』の行を、書き換えずにそのまま列挙してください。説明は不要です。",'SH-ECHO the request text is the approved one');
 check(request.includes('## Character directives')&&launch.includes('## Character directives'),'SH-ECHO the heading the request quotes is the heading the prompt actually uses');
 const KW=['ALWAYS','NEVER','PREFER','IF ','HANDOFF WHEN','OUTPUT'];const afterHeading=launch.slice(launch.indexOf('## Character directives'));const sent=afterHeading.split(String.fromCharCode(10)).filter(l=>l.startsWith('  ')&&KW.some(k=>l.trim().startsWith(k))).map(l=>l.trim());check(sent.length>=4&&!sent.some(x=>x.includes('Seat 8 as a human role')),'SH-ECHO the echo set is the Character block only — the base layer sits above the heading');
 doc.getElementById('platform-echo-answer').value=sent.join(String.fromCharCode(10));doc.getElementById('platform-echo-check').click();await wait(80);
 const result=doc.getElementById('platform-echo-result');check(result.hidden===false&&result.dataset.echoState==='REPORTED_COMPLETE','SH-ECHO a complete echo reports REPORTED_COMPLETE');
 check(result.textContent.includes('AI 申告値（検証不能）')&&result.textContent.includes('申告であって検証ではありません')&&!/検証済|確認できました/.test(result.textContent),'SH-ECHO the result is labelled as a report and never claims verification');
 doc.getElementById('platform-echo-answer').value=sent.slice(1).join(String.fromCharCode(10));doc.getElementById('platform-echo-check').click();await wait(80);
 check(result.dataset.echoState==='REPORTED_MISSING'&&result.className.includes('warning')&&result.textContent.includes('貼り直すか、AMU をお使いください'),'SH-ECHO a dropped line is reported as missing, in the approved wording');
 // EN locale: the approved I/J strings, and the request text switches too
 win.SAKU_DESKTOP_I18N.setLocale('en-US');await wait(150);
 check(doc.getElementById('platform-echo-title').textContent==='Ask the AI what it loaded (optional)','SH-ECHO-EN the block title reads the approved English');
 check(doc.getElementById('platform-echo-copy').textContent==='Copy the request'&&doc.getElementById('platform-echo-check').textContent==='Compare','SH-ECHO-EN the two buttons read the approved English (no verify/validate/confirm)');
 check(doc.getElementById('platform-echo-request').value.startsWith("List every line under the heading '## Character directives'"),'SH-ECHO-EN the request text switches to the approved I12');
 doc.getElementById('platform-echo-answer').value='nothing like a directive';doc.getElementById('platform-echo-check').click();await wait(80);
 check(result.textContent.includes("AI self-reported value (unverifiable)")&&result.textContent.includes("Paste them again, or use AMU"),'SH-ECHO-EN the result reads the approved English and still says it is a report');
 check(!/verif(y|ied)|validate|confirmed/i.test(result.textContent),'SH-ECHO-EN the English result never claims verification');
 win.SAKU_DESKTOP_I18N.setLocale('ja-JP');await wait(150);
 check(doc.getElementById('platform-echo-title').textContent==='読み込めたか AI に聞く（任意）','SH-ECHO-EN switching back restores the Japanese');
 // 04 Trainer
 await load('/tools/saku-trainer.html?stub=1');await until(()=>win.__saku_trainer_help&&doc.querySelector('#trainer-help[data-screen-help]'),800);await wait(500);
 const tp=doc.getElementById('trainer-help');check(tp.querySelectorAll('[data-help-chapter]').length===3&&tp.querySelectorAll('[data-help-field]').length===10,'SH-04 3 chapters / 10 fields from the trainer guide');
 check(tp.dataset.helpSynced==='false'&&!tp.querySelector('.help-tree-lead').textContent.includes('同期'),'SYNC-LEAD the Trainer does not claim to be synced either');
 // The Trainer's sections are spread over its three stages, so they are collected
 // as the screen moves rather than demanded all at once.
 const trainerSeen=new Set(GUIDE_SECTIONS.trainer.filter(id=>doc.getElementById(id)));
 await until(()=>tp.querySelector('[data-help-field="trainer.character"]'),400);
 check(!doc.querySelector('[data-help-sync]'),'SH-04 no 「同期」 button anywhere on the Trainer screen either');
 check(tp.querySelector('[data-help-field="trainer.method"] [data-help-to-input]'),'SH-04 the tree still walks back to the stage it explains (「入力欄へ」)');
 check(tp.querySelector('[data-help-field="trainer.conclusion"] .help-option[data-option-value="NOT_ASSESSED"] .help-option-name').textContent==='まだ判断しない','SH-04 conclusion options show the Trainer wording');
 // What the Trainer gives an external AI is what 03 gives it (Owner 2026-09-23).
 // Driven on the real screen: generate a menu, start the training, then read the
 // text the copy buttons would put on the clipboard.
 await until(()=>win.__saku_trainer?.getHandoffContext,600);
 doc.getElementById('generate-menu').click();await until(()=>doc.getElementById('start-training')&&!doc.getElementById('start-training').disabled,1500);
 doc.getElementById('start-training').click();await until(()=>win.__saku_trainer.getStage()===2,1500);await wait(200);
 const context=win.__saku_trainer.getHandoffContext();
 check(context.baseLayer&&context.baseLayer.sha256==='ab4745a3617e5b8e49125146a47ee99d1adde7ad8436c953431518ac23358654','SH-04 the Trainer reads the same shared base layer, and it checks out');
 for(const id of GUIDE_SECTIONS.trainer) if(doc.getElementById(id)) trainerSeen.add(id);
 // Stage 1 and stage 2 between them must account for some of them; the rest
 // belong to later stages and are checked in the source instead (SECTION-SRC).
 check(trainerSeen.size>0,'SECTION 04 the sections the guide points at are on the screen at the stages this gate reaches ('+[...trainerSeen].join(',')+')');
 const handed=win.__saku_trainer.getHandoffText('character');
 check(handed.startsWith('以下はあなたが演じるキャラクターの定義です。'),'SH-04 the Trainer hands over the composed text, not the raw JSON snapshot');
 check(/^## Base/m.test(handed)&&handed.includes('## Character directives')&&handed.indexOf('## Base')<handed.indexOf('## Character'),'SH-04 that text carries the base layer above the persona and the directive block');
 check(handed.trim().endsWith('Hard invariants and handoff conditions come first.'),'SH-04 it closes with the same reminder 03 closes with');
 check(!handed.startsWith('{')&&!/"identity"\s*:/.test(handed),'SH-04 the raw JSON snapshot is no longer what goes to the AI');
 check(win.__saku_trainer.getHandoffText('both').startsWith(handed),'SH-04 「両方をコピー」 is that same text followed by the menu');
 // speed test page mounts the platform guide at the speed chapter
 await load('/tools/saku-speed-test.html?stub=1');await until(()=>win.__saku_speed_test_help&&doc.querySelector('#speed-test-help[data-screen-help]'),600);await wait(300);
 check(doc.querySelector('#speed-test-help .help-field.is-current')?.dataset.helpField==='platform.speed_test','SH-ST the speed test page opens the pane at the speed-test node');
 check(doc.getElementById('speed-test-help').dataset.helpSynced==='false','SYNC-LEAD the speed test does not claim to be synced');
 check(doc.body.innerText.includes('AI スピードテスト（貼り付けモード）'),'SH-ST speed test page still renders (its heading; the pane no longer says AI 申告値 since F2)');
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',checks});document.getElementById('report').dataset.status='PASS';
}catch(error){document.getElementById('report').textContent=JSON.stringify({status:'FAIL',error:String(error.stack||error),checks,body:doc?.body?.innerText.slice(-1200)});document.getElementById('report').dataset.status='FAIL';}
</script>`;
  const stub = "<script>window.__TAURI__={__stub:true,core:{invoke:async(command)=>{if(command==='save_workspace_character')return 'C:/ws/characters/x/character.json';if(command==='get_runtime_state'||command==='runtime_state')return{workspace:'C:/ws',first_run:false,app_version:'0.1.0-beta.3'};if(command==='list_workspace_characters')return{status:'OK',artifacts:[]};return null;}}};</script>";
  const mime = { ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/__sh__") { response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(harness); return; }
      const requested = decodeURIComponent(url.pathname).replace(/^\//, "");
      const file = path.resolve(DIST, requested);
      if (!file.startsWith(DIST + path.sep)) throw new Error("outside dist");
      let body = await readFile(file);
      if (url.searchParams.get("stub") === "1" && file.endsWith(".html")) body = Buffer.from(body.toString("utf8").replace(/<head>/i, `<head>${stub}`), "utf8");
      response.setHeader("Content-Type", `${mime[path.extname(file)] || "text/plain"};charset=utf-8`); response.end(body);
    } catch { response.statusCode = 404; response.end("not found"); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const profile = await mkdtemp(path.join(tmpdir(), "saku-sh-browser-"));
  const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", stderr = "", socket; child.stderr.on("data", c => stderr += c); const pause = ms => new Promise(r => setTimeout(r, ms));
  try {
    let port = 0; for (let i = 0; i < 200 && !port; i++) { const m = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); else await pause(100); }
    if (!port) throw new Error(`CHROME_NOT_READY ${stderr.slice(-500)}`);
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/__sh__`)}`, { method: "PUT" })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => socket.onopen = r); let seq = 0; const pending = new Map();
    socket.onmessage = e => { const d = JSON.parse(e.data); if (d.id) { pending.get(d.id)?.(d); pending.delete(d.id); } };
    const call = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); socket.send(JSON.stringify({ id, method, params })); });
    for (let i = 0; i < 900; i++) { const r = await call("Runtime.evaluate", { expression: 'document.getElementById("report")?.dataset.status', returnByValue: true }); if (r.result?.result?.value) { output = (await call("Runtime.evaluate", { expression: 'document.getElementById("report").textContent', returnByValue: true })).result.result.value; break; } await pause(100); }
  } finally { socket?.close(); child.kill(); await new Promise(r => child.exitCode !== null ? r() : child.once("exit", r)); server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => {}); }
  const report = JSON.parse(output || '{"status":"NO_OUTPUT"}');
  if (report.status !== "PASS") { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
  for (const label of report.checks) cases.push(label);
}

console.log(`SCREEN_HELP PASS ${cases.length}/${cases.length}${skipped.length ? ` (${skipped.length} skipped: ${skipped.join("; ")})` : ""}`);
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log("PANES 03 / 04 / speed test share help-tree via screen-help / GUIDES version-bound, sections real, option dictionaries = screen vocabularies / desktop.css + viewer.mjs untouched");
