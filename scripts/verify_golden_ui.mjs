import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFile(path.join(ROOT, relative), "utf8");
const json = async relative => JSON.parse(await read(relative));
const digest = value => createHash("sha256").update(value).digest("hex");
const bytes = value => Buffer.byteLength(value, "utf8");
const block = (source, expression, label) => {
  const match = source.match(expression);
  assert.ok(match, `${label} missing`);
  return match[0];
};
const normalized = value => value.replace(/\s+/g, " ").trim();

function toolbarBlock(source) {
  const start = source.indexOf('<div class="toolbar">');
  const end = source.indexOf('<div class="wrap">', start);
  assert.ok(start >= 0 && end > start, "toolbar projection boundaries missing");
  return source.slice(start, end).trim();
}

function removeBalancedElement(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const tag = /<\/?div\b[^>]*>/g;
  tag.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = tag.exec(source))) {
    if (!match[0].startsWith("</")) depth += 1;
    else depth -= 1;
    if (depth === 0) return `${source.slice(0, start)}${source.slice(tag.lastIndex)}`;
  }
  throw new Error("desktop toolbar additions are not balanced");
}

const contract = await json("tests/fixtures/owner-golden-ui-contract.json");
const html = await read("tools/saku-builder.html");
const additions = await read("tools/saku-builder-desktop-additions.css");
const ui = await read("tools/v1/builder-golden-ui.mjs");
const desktop = await read("desktop/index.html");
const desktopApp = await read("desktop/app.mjs");
const desktopLocale = await read("desktop/i18n.mjs");
const unifiedV1Builder = await read("tools/saku-builder-unified-v1.html");
const tauri = await json("src-tauri/tauri.conf.json");

assert.equal(contract.source_sha256, "b4a8aa8aacb262eb6a1484a30dfb0943cb355aefa8b75a10cd9e829728e0189c");
assert.equal(contract.source_bytes, 99553);

const style = block(html, /<style>[\s\S]*?<\/style>/, "Golden inline style");
const header = block(html, /<header>[\s\S]*?<\/header>/, "Golden header");
assert.equal(digest(style), contract.source_style_sha256, "Owner Golden inline CSS must be byte-identical");
assert.equal(bytes(style), contract.source_style_bytes);
assert.equal(digest(header), contract.source_header_sha256, "Owner Golden header must be byte-identical");
assert.equal(bytes(header), contract.source_header_bytes);

const projectedToolbar = removeBalancedElement(toolbarBlock(html), '<div class="desktop-toolbar-additions">');
assert.equal(digest(normalized(projectedToolbar)), contract.source_toolbar_projection_sha256, "Golden toolbar projection changed");

const sectionTags = [...html.matchAll(/<\/?section\b[^>]*>/g)].map(match => match[0]);
let sectionDepth = 0;
let maximumSectionDepth = 0;
for (const tag of sectionTags) {
  sectionDepth += tag.startsWith("</") ? -1 : 1;
  assert.ok(sectionDepth >= 0, "chapter section closes before it opens");
  maximumSectionDepth = Math.max(maximumSectionDepth, sectionDepth);
}
assert.equal(sectionDepth, 0, "chapter section tags must be balanced");
// The chapter model follows the latest Owner direction: the standalone Persona
// Test chapter moved into 04 Trainer, organization participation is MACHI-owned
// and is no longer authored here, and a consolidated 人間と引き渡し chapter was
// added. The count is pinned to the contract rather than to a stale literal.
assert.equal(sectionTags.filter(tag => !tag.startsWith("</")).length, contract.chapter_count, `Golden Builder must retain ${contract.chapter_count} chapters`);
assert.equal(maximumSectionDepth, 1, "Golden chapters must remain independent top-level siblings");

for (const id of contract.required_control_ids) assert.match(html, new RegExp(`id=["']${id}["']`), `Golden control missing: ${id}`);
for (const id of contract.deprecated_noncanonical_controls) assert.doesNotMatch(html, new RegExp(`id=["']${id}["']`), `deprecated semantic control restored: ${id}`);
for (const tab of contract.preview_tabs) assert.ok(html.includes(tab), `Golden preview tab missing: ${tab}`);
for (const name of contract.golden_function_names) assert.match(html, new RegExp(`function\\s+${name}\\s*\\(`), `Golden function missing: ${name}`);

assert.equal((html.match(/data-builder-locale=/g) || []).length, 2);
assert.match(html, /saku-builder-desktop-additions\.css/);
assert.match(html, /builder-golden-ui\.mjs/);
assert.doesNotMatch(html, /saku-builder-golden\.css/);
assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|Shippori Mincho|EDO TOWN THEME|--washi:|class="hdr-in"|class="shina"|class="kanban"/);
// The template select was a source-management control and moved off this
// screen with the rest of them. Its styling pin goes with it.
assert.match(html, /class="desktop-toolbar-additions"/);
for (const id of ["collapseAll", "expandAll", "desktopWorkspaceSelect", "desktopPackageImport"]) assert.match(html, new RegExp(`id=["']${id}["']`));
assert.match(html, /id="openDesktopHome" href="\.\.\/index\.html\?stay=1" hidden/);
assert.doesNotMatch(html, /class="ch-body"/);

for (const token of ["--ground:#E4E6DF", "--surface:#F2F3EE", "--surface-2:#EBEDE6", "--sumi:#22241F", "--accent:#4A5560", "minmax(0,440px)"]) assert.ok(style.includes(token), `Golden presentation token missing: ${token}`);
for (const breakpoint of contract.presentation.responsive_breakpoints_px) assert.match(style, new RegExp(`max-width:${breakpoint}px`), `Golden responsive breakpoint missing: ${breakpoint}`);
assert.match(style, /\.preview\{position:sticky;top:0;height:100vh/);

for (const font of ["Noto Serif JP", "Yu Mincho", "Noto Sans JP", "Yu Gothic UI", "Meiryo"]) assert.ok(additions.includes(font), `offline font fallback missing: ${font}`);
for (const breakpoint of contract.presentation.desktop_addition_breakpoints_px) assert.match(additions, new RegExp(`max-width:\\s*${breakpoint}px`), `Desktop addition breakpoint missing: ${breakpoint}`);
assert.doesNotMatch(additions, /@font-face|https?:\/\/|prefers-color-scheme\s*:\s*dark|color-scheme\s*:\s*dark/i);
for (const forbidden of ["body", "header", ".toolbar", ".wrap", ".form", ".preview", ".chapter", "input", "select", "textarea", "button"]) {
  const escaped = forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.doesNotMatch(additions, new RegExp(`(?:^|})\\s*${escaped}\\s*{`, "m"), `unintended base selector override: ${forbidden}`);
}
assert.match(additions, /color-scheme:\s*light/);
assert.equal(tauri.app.windows[0].theme, "Light");
assert.equal(tauri.app.windows[0].backgroundColor, "#E4E6DF");

assert.match(ui, /saku\.ui\.locale/);
assert.match(ui, /event\.currentTarget\.dataset\.builderLocale/);
assert.match(ui, /心が咲く — 表人格・1\+7構造・境界・黒子接続・試験までを一枚で設計し/);
assert.match(ui, /HERO_SUBTITLE_EN/);
assert.match(ui, /document\.querySelectorAll\("body \*"\)/);
assert.match(ui, /pre,code,\.charname,\.pv-path/);
assert.match(ui, /\["placeholder","title","aria-label"\]/);
assert.match(ui, /#heroName \.ph/);
assert.match(ui, /choose_workspace/);
assert.match(ui, /get_runtime_state/);
assert.match(ui, /MutationObserver/);
assert.doesNotMatch(ui, /document\.body\.addEventListener\(["']click/);
assert.doesNotMatch(ui, /innerHTML\s*=\s*translate/);
assert.match(html, /const push=\(\)=>\{[\s\S]*?current=getPath\(data,path\)[\s\S]*?current\.push\(v\)/, "dynamic list add must resolve the current Character array after data replacement");
assert.match(html, /edit\.addEventListener\("input",\(\)=>\{[\s\S]*?current=getPath\(data,path\)[\s\S]*?current\[i\]=edit\.value/, "dynamic list edit must resolve the current Character array after data replacement");
assert.match(html, /del\.addEventListener\("click",\(\)=>\{[\s\S]*?current=getPath\(data,path\)[\s\S]*?current\.splice\(i,1\)/, "dynamic list removal must resolve the current Character array after data replacement");
assert.match(html, /function replaceCharacterData\(next\)\{[\s\S]*?resetBoundarySelections\(\)/, "Character replacement must clear Boundary Quick Setup DOM state");
// Save/Export acceptance: the user must always be told exactly what happened.
// Browser fallback reports the request only; it must never imply the app saved the file.
assert.match(html, /ブラウザへダウンロードを要求しました/, "browser fallback must report the request, not an unobserved save");
assert.match(html, /Download requested in browser/, "browser fallback must report the request in English as well");
assert.doesNotMatch(html, /ダウンロードが完了しました|ダウンロードを完了しました|保存が完了しました/, "browser download must never claim completion");
// Native save must surface the real destination path and must not present cancel or failure as success.
assert.ok(html.includes("保存しました") && html.includes("${result.path}"), "native save feedback must show the actual saved path");
assert.ok(html.includes("Saved") && html.includes("${result.path}"), "native save feedback must show the saved path in English");
assert.ok(html.includes('status==="CANCELLED"') && html.includes("保存をキャンセルしました"), "cancelled save must be reported as cancelled");
assert.ok(html.includes("保存に失敗しました：${reason}"), "failed save must report the reason");
assert.match(ui, /const chapterState=key\.match/, "chapter-state accessibility labels must follow the active UI language");
assert.match(ui, /任意スキルの採否が未定（\(\\d\+\)件\[）\)\]/, "optional-skill warning must accept and translate the emitted punctuation");

// 新規作成 now creates the list entry before it navigates, so the route lives in
// app.mjs rather than in the markup. Both routes must still exist and be reachable.
const shell = desktop + desktopApp;
assert.ok(shell.includes("./tools/saku-builder.html?desktop=app") && shell.includes("./tools/saku-builder.html?desktop=new"), "desktop shell must link to the Builder for both edit and new entries");
assert.equal((desktop.match(/data-desktop-locale=/g) || []).length, 2);
assert.match(desktop, /class="boot-pending"/);
assert.match(desktop, /__SAKU_DESKTOP_BOOT_FALLBACK/);
assert.match(desktop, /HOST_BOOT_FAILED/);
assert.match(desktop, /id="view-characters"/);
assert.match(desktop, /id="viewer-panel"/);
assert.doesNotMatch(desktopApp, /location\.replace\("\.\/tools\/saku-builder\.html\?desktop=app"\)/);
assert.ok(desktopApp.includes("./tools/saku-builder.html?desktop=new"), "desktop app must offer the new-Character entry into the Builder");
// The list hands editing to the Builder the home screen names (entry 04), which
// reads the Active SAKU on load rather than validating an identity passed in the
// URL. The handoff must still happen; it no longer goes through the Unified V1 route.
assert.ok(desktopApp.includes("./tools/saku-builder.html?desktop=viewer-copy"), "viewer must hand off to the V1 Builder for editing");
assert.ok(!desktopApp.includes("saku-builder-unified-v1.html"), "the desktop app must not route to the legacy Unified V1 Builder");
assert.match(desktopApp, /__SAKU_DESKTOP_BOOTED/);
assert.match(desktopLocale, /saku\.ui\.locale/);
assert.ok(unifiedV1Builder.includes('get("ui_locale")'), "Unified V1 must honour the ui_locale parameter");
assert.ok(unifiedV1Builder.includes('localStorage.getItem("saku.ui.locale")'), "Unified V1 must fall back to the stored locale");
assert.ok(unifiedV1Builder.includes('try{ stored=localStorage.getItem("saku.ui.locale"); }'), "Unified V1 locale read must tolerate unavailable storage");

console.log("OWNER_GOLDEN_PRESENTATION_BASE_AND_FUNCTIONAL_SURFACE PASS");
console.log(`OWNER_SOURCE_REFERENCE ${contract.source_sha256} ${contract.source_bytes} bytes`);
console.log(`GOLDEN_STYLE ${contract.source_style_sha256} ${contract.source_style_bytes} bytes`);
console.log(`GOLDEN_HEADER ${contract.source_header_sha256} ${contract.source_header_bytes} bytes`);
console.log(`GOLDEN_CHAPTER_STRUCTURE ${contract.chapter_count}/${contract.chapter_count} TOP_LEVEL PASS`);
console.log(`GOLDEN_ACTIVE_CONTROLS ${contract.required_control_ids.length}/${contract.required_control_ids.length} PASS`);
console.log(`GOLDEN_FUNCTIONS ${contract.golden_function_names.length}/${contract.golden_function_names.length} PASS`);
// Context Help and Save feedback are Desktop additions: every rule must live in the
// additions layer, never in the byte-locked Owner Golden inline CSS.
for (const selector of [".context-help", ".context-help h3", ".context-help h4", ".context-help p", ".save-feedback", '.save-feedback[data-kind="success"]', '.save-feedback[data-kind="error"]']) {
  assert.ok(additions.includes(selector + " {") || additions.includes(selector + "{"), "addition layer must style: " + selector);
  assert.ok(!style.includes(selector), "Golden inline CSS must not absorb the addition: " + selector);
}
assert.ok(html.includes('class="context-help"'), "context help surface must exist in the Builder");
assert.ok(html.includes('class="save-feedback"'), "save feedback surface must exist in the Builder");
console.log("DESKTOP_ADDITION_STYLING_ISOLATED " + 7 + " RULES PASS");
console.log("DESKTOP_ADDITIONS_ISOLATED PASS");
console.log("BUILDER_LANGUAGE_CONTROL JA/EN EXPLICIT_ONLY PASS");
