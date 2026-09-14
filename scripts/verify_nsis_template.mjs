import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM_SHA256 = "20f4ecc730defb71f1342eaeaec4021df13be3d843abba0effe88ea5835fa079";
const TEMPLATE = path.join(ROOT, "src-tauri/windows/installer.nsi");
const MARKERS = [
  "variables",
  "finish-page",
  "action",
  "language",
  "uninstall-only-selection",
  "uninstall-continuation-option",
  "uninstall-only-exit",
  "uninstall-finish-page",
  "uninstall-finish-option",
  "uninstall-continuation-autoclose",
  "uninstall-finish-skip",
  // The generated deleteAppData string reads like cache and settings. This block
  // replaces it with wording that names what the option actually deletes.
  "destructive-uninstall-wording",
  "uninstall-destructive-checkbox-metrics",
  "uninstall-destructive-checkbox-layout"
];

const read = target => readFile(target, "utf8");
const sha256 = value => createHash("sha256").update(value).digest("hex");

const template = await read(TEMPLATE);
let reconstructed = template;
for (const marker of MARKERS) {
  const pattern = new RegExp(
    `; SAKU_CUSTOM_GETTING_STARTED_BEGIN: ${marker}\\n[\\s\\S]*?; SAKU_CUSTOM_GETTING_STARTED_END: ${marker}\\n`,
    "g"
  );
  const matches = reconstructed.match(pattern) || [];
  assert.equal(matches.length, 1, `expected one bounded custom block: ${marker}`);
  reconstructed = reconstructed.replace(pattern, "");
}
assert.equal(sha256(reconstructed), UPSTREAM_SHA256, "custom template drifted outside the bounded blocks");

assert.match(template, /MUI_PAGE_CUSTOMFUNCTION_SHOW SakuFinishPageShow/);
assert.match(template, /NSD_CreateLink.*sakuGettingStartedAction/);
assert.match(template, /RunAsUser.*--getting-started/);
assert.match(template, /FinishPage\.Run.*BM_SETCHECK.*BST_UNCHECKED/);
assert.match(template, /LangString sakuGettingStartedAction \${LANG_ENGLISH}/);
assert.match(template, /LangString sakuGettingStartedAction \${LANG_JAPANESE}/);

// The destructive-option label is the one string on this dialog that can grow
// long enough to clip. The Owner saw exactly that. Estimate how many lines each
// translation wraps to at the control's declared width, and require the control
// to be tall enough for the longest one, so a future edit to the wording fails
// here instead of on the Owner's screen.
const boxWidth = Number(/SAKU_DELETE_APPDATA_BOX_WIDTH (\d+)/.exec(template)?.[1] || 0);
const boxHeight = Number(/SAKU_DELETE_APPDATA_BOX_HEIGHT (\d+)/.exec(template)?.[1] || 0);
assert.ok(boxWidth > 0 && boxHeight > 0, "the destructive checkbox must declare its own metrics");
assert.match(template, /IntOp \$8 \$8 \| \$\{BS_MULTILINE\}/, "the destructive checkbox must actually be given the multiline style, not merely define it");
assert.match(template, /SetWindowLongW\(p \$DeleteAppDataCheckbox, i -16, i r8\)/, "the multiline style must actually be applied to the control");
assert.match(template, /MoveWindow\(p \$DeleteAppDataCheckbox/, "the control must be resized to the declared height");

const CHECKBOX_GLYPH_PX = 20;   // the box and its gap, before any text
const LINE_PX = 19;             // one line of the dialog font
const WIDE_PX = 15;             // a CJK glyph at that size
const NARROW_PX = 7;            // a latin glyph at that size
const usable = boxWidth - CHECKBOX_GLYPH_PX;
for (const [language, pattern] of [["Japanese", /LangString deleteAppData \${LANG_JAPANESE} "([^"]+)"/], ["English", /LangString deleteAppData \${LANG_ENGLISH} "([^"]+)"/]]) {
  const text = pattern.exec(template)?.[1];
  assert.ok(text, `deleteAppData is not translated for ${language}`);
  let width = 0;
  for (const character of text) width += /[　-鿿＀-￯]/.test(character) ? WIDE_PX : NARROW_PX;
  const lines = Math.ceil(width / usable);
  const needed = lines * LINE_PX;
  assert.ok(boxHeight >= needed, `${language} destructive label needs ${needed}px (${lines} lines at ${usable}px) but the control is ${boxHeight}px`);
  console.log(`UNINSTALL_DESTRUCTIVE_LABEL ${language} ${text.length} chars -> ${lines} lines, needs ${needed}px, control ${boxHeight}px`);
}
console.log("UNINSTALL_DIALOG_TEXT_CLIPPING 0");
assert.match(template, /MUI_FINISHPAGE_RUN_FUNCTION RunMainBinary/);
assert.match(template, /MUI_FINISHPAGE_SHOWREADME_FUNCTION CreateOrUpdateDesktopShortcut/);
assert.match(template, /MUI_PAGE_DIRECTORY/);
assert.match(template, /MUI_UNPAGE_INSTFILES/);
assert.match(template, /MUI_UNPAGE_FINISH/);

const autoCloseDefine = template.indexOf("!define MUI_FINISHPAGE_NOAUTOCLOSE");
const autoCloseUndef = template.indexOf("!undef MUI_FINISHPAGE_NOAUTOCLOSE");
const installFinishPage = template.indexOf("!insertmacro MUI_PAGE_FINISH");
assert.ok(autoCloseDefine >= 0 && autoCloseDefine < autoCloseUndef);
assert.ok(autoCloseUndef < installFinishPage, "successful install must auto-advance to the finish page");
assert.equal((template.match(/!undef MUI_FINISHPAGE_NOAUTOCLOSE/g) || []).length, 1);

const sameVersionBranch = template.indexOf("${If} $R0 = 0 ; Same version, proceed");
const upgradeBranch = template.indexOf("${ElseIf} $R0 = 1 ; Upgrading");
const uninstallOnlySet = template.indexOf("StrCpy $SakuUninstallOnly 1");
assert.ok(sameVersionBranch >= 0 && sameVersionBranch < uninstallOnlySet);
assert.ok(uninstallOnlySet < upgradeBranch, "uninstall-only state must not bind upgrade/downgrade paths");
assert.equal((template.match(/\$SakuUninstallOnly/g) || []).length, 3);

const continuationOption = template.indexOf('StrCpy $R1 "$R1 /SKIPFINISH"');
const updateOption = template.indexOf('StrCpy $R1 "$R1 /UPDATE"');
assert.ok(continuationOption > upgradeBranch && continuationOption < updateOption);
assert.equal((template.match(/\/SKIPFINISH/g) || []).length, 2);

const uninstallExit = template.indexOf("${If} $SakuUninstallOnly = 1");
const parentBringToFront = template.indexOf("    BringToFront", uninstallExit);
const directoryPage = template.indexOf("!insertmacro MUI_PAGE_DIRECTORY");
assert.ok(uninstallExit >= 0 && uninstallExit < parentBringToFront);
assert.ok(parentBringToFront < directoryPage);
assert.match(
  template.slice(uninstallExit, parentBringToFront),
  /\$\{IfNot\} \$\{Errors\}[\s\S]*?\$\{If\} \$0 = 0[\s\S]*?\$\{IfNot\} \$\{FileExists\}[\s\S]*?Quit/
);

const uninstallProgressPage = template.indexOf("!insertmacro MUI_UNPAGE_INSTFILES");
const uninstallFinishPre = template.indexOf("!define MUI_PAGE_CUSTOMFUNCTION_PRE un.SakuSkipUninstallFinishPage");
const uninstallFinishPage = template.indexOf("!insertmacro MUI_UNPAGE_FINISH");
assert.ok(uninstallProgressPage >= 0 && uninstallProgressPage < uninstallFinishPre);
assert.ok(uninstallFinishPre < uninstallFinishPage);
assert.equal((template.match(/MUI_UNPAGE_FINISH/g) || []).length, 1);
assert.equal((template.match(/\$SakuSkipUninstallFinish/g) || []).length, 4);
assert.match(
  template,
  /Function un\.SakuSkipUninstallFinishPage[\s\S]*?\$\{If\} \$PassiveMode = 1[\s\S]*?\$\{OrIf\} \$UpdateMode = 1[\s\S]*?\$\{OrIf\} \$SakuSkipUninstallFinish = 1[\s\S]*?Abort[\s\S]*?FunctionEnd/
);
assert.match(
  template,
  /Auto close if passive mode or updating[\s\S]*?\$\{OrIf\} \$SakuSkipUninstallFinish = 1[\s\S]*?SetAutoClose true/
);

const hooks = await read(path.join(ROOT, "src-tauri/windows/hooks.nsh"));
assert.match(hooks, /MUI_FINISHPAGE_LINK_LOCATION "\$INSTDIR"/);

const config = JSON.parse(await read(path.join(ROOT, "src-tauri/tauri.conf.json")));
assert.equal(config.bundle.windows.nsis.template, "./windows/installer.nsi");
assert.deepEqual(config.bundle.icon, [
  "icons/32x32.png",
  "icons/64x64.png",
  "icons/128x128.png",
  "icons/128x128@2x.png",
  "icons/icon.ico",
  "icons/icon.icns",
  "icons/icon.png",
]);
assert.match(template, /!define INSTALLERICON "\{\{installer_icon\}\}"/);
assert.match(template, /!define MUI_ICON "\$\{INSTALLERICON\}"/);
assert.deepEqual(config.bundle.windows.webviewInstallMode, { type: "downloadBootstrapper", silent: true });
assert.equal(config.bundle.windows.nsis.displayLanguageSelector, true);
assert.deepEqual(config.bundle.windows.nsis.languages, ["Japanese", "English"]);

const mainRs = await read(path.join(ROOT, "src-tauri/src/main.rs"));
assert.match(mainRs, /get_startup_route/);
assert.match(mainRs, /--getting-started/);
const desktopApp = await read(path.join(ROOT, "desktop/app.mjs"));
assert.match(desktopApp, /get_startup_route/);
assert.match(desktopApp, /help\/getting-started\.html/);

console.log("NSIS_TEMPLATE_VERIFY PASS");
console.log(`UPSTREAM_TEMPLATE_SHA256 ${UPSTREAM_SHA256}`);
console.log("FINISH_ACTIONS launch,desktop-shortcut,install-directory,getting-started PASS");
console.log("FLOW_TRANSITIONS install-auto-finish,uninstall-finish-and-exit PASS");
