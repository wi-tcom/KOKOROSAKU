import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argument = process.argv[2];
assert.ok(argument, "usage: node scripts/verify_generated_nsis.mjs <isolated-target-label-or-installer.nsi>");

// A relative argument is the isolated target label; the Cargo target directory
// is `src-tauri/target`. It read `src-tauri/src-tauri/target` until 2026-09-23,
// so every relative label failed with ENOENT and the check was only ever run by
// absolute path — found while building β.5.
const candidate = path.isAbsolute(argument)
  ? argument
  : argument.endsWith(".nsi")
    ? path.resolve(ROOT, argument)
    : path.join(ROOT, "src-tauri/target", argument, "release/nsis/x64/installer.nsi");
await stat(candidate);
const generated = await readFile(candidate, "utf8");

assert.doesNotMatch(generated, /{{|}}/, "generated NSIS still contains template placeholders");
assert.match(generated, /MUI_FINISHPAGE_RUN_FUNCTION RunMainBinary/);
assert.match(generated, /MUI_FINISHPAGE_SHOWREADME_FUNCTION CreateOrUpdateDesktopShortcut/);
assert.match(generated, /!include ".*hooks\.nsh"/);
const hooks = await readFile(path.join(ROOT, "src-tauri/windows/hooks.nsh"), "utf8");
assert.match(hooks, /MUI_FINISHPAGE_LINK_LOCATION "\$INSTDIR"/);
assert.match(generated, /MUI_PAGE_CUSTOMFUNCTION_SHOW SakuFinishPageShow/);
assert.match(generated, /NSD_CreateLink.*sakuGettingStartedAction/);
assert.match(generated, /RunAsUser.*--getting-started/);
assert.match(generated, /FinishPage\.Run.*BM_SETCHECK.*BST_UNCHECKED/);
assert.match(generated, /LangString sakuGettingStartedAction \${LANG_ENGLISH}/);
assert.match(generated, /LangString sakuGettingStartedAction \${LANG_JAPANESE}/);
assert.match(generated, /MUI_PAGE_DIRECTORY/);
assert.match(generated, /MUI_UNPAGE_INSTFILES/);
assert.match(generated, /MUI_UNPAGE_FINISH/);

const autoCloseDefine = generated.indexOf("!define MUI_FINISHPAGE_NOAUTOCLOSE");
const autoCloseUndef = generated.indexOf("!undef MUI_FINISHPAGE_NOAUTOCLOSE");
const installFinishPage = generated.indexOf("!insertmacro MUI_PAGE_FINISH");
assert.ok(autoCloseDefine >= 0 && autoCloseDefine < autoCloseUndef);
assert.ok(autoCloseUndef < installFinishPage, "successful install must auto-advance to the finish page");
assert.equal((generated.match(/!undef MUI_FINISHPAGE_NOAUTOCLOSE/g) || []).length, 1);

const sameVersionBranch = generated.indexOf("${If} $R0 = 0 ; Same version, proceed");
const upgradeBranch = generated.indexOf("${ElseIf} $R0 = 1 ; Upgrading");
const uninstallOnlySet = generated.indexOf("StrCpy $SakuUninstallOnly 1");
assert.ok(sameVersionBranch >= 0 && sameVersionBranch < uninstallOnlySet);
assert.ok(uninstallOnlySet < upgradeBranch, "uninstall-only state must not bind upgrade/downgrade paths");
assert.equal((generated.match(/\$SakuUninstallOnly/g) || []).length, 3);

const continuationOption = generated.indexOf('StrCpy $R1 "$R1 /SKIPFINISH"');
const updateOption = generated.indexOf('StrCpy $R1 "$R1 /UPDATE"');
assert.ok(continuationOption > upgradeBranch && continuationOption < updateOption);
assert.equal((generated.match(/\/SKIPFINISH/g) || []).length, 2);

const uninstallExit = generated.indexOf("${If} $SakuUninstallOnly = 1");
const parentBringToFront = generated.indexOf("    BringToFront", uninstallExit);
const directoryPage = generated.indexOf("!insertmacro MUI_PAGE_DIRECTORY");
assert.ok(uninstallExit >= 0 && uninstallExit < parentBringToFront);
assert.ok(parentBringToFront < directoryPage);
assert.match(
  generated.slice(uninstallExit, parentBringToFront),
  /\$\{IfNot\} \$\{Errors\}[\s\S]*?\$\{If\} \$0 = 0[\s\S]*?\$\{IfNot\} \$\{FileExists\}[\s\S]*?Quit/
);

const uninstallProgressPage = generated.indexOf("!insertmacro MUI_UNPAGE_INSTFILES");
const uninstallFinishPre = generated.indexOf("!define MUI_PAGE_CUSTOMFUNCTION_PRE un.SakuSkipUninstallFinishPage");
const uninstallFinishPage = generated.indexOf("!insertmacro MUI_UNPAGE_FINISH");
assert.ok(uninstallProgressPage >= 0 && uninstallProgressPage < uninstallFinishPre);
assert.ok(uninstallFinishPre < uninstallFinishPage);
assert.equal((generated.match(/MUI_UNPAGE_FINISH/g) || []).length, 1);
assert.equal((generated.match(/\$SakuSkipUninstallFinish/g) || []).length, 4);
assert.match(
  generated,
  /Function un\.SakuSkipUninstallFinishPage[\s\S]*?\$\{If\} \$PassiveMode = 1[\s\S]*?\$\{OrIf\} \$UpdateMode = 1[\s\S]*?\$\{OrIf\} \$SakuSkipUninstallFinish = 1[\s\S]*?Abort[\s\S]*?FunctionEnd/
);
assert.match(
  generated,
  /Auto close if passive mode or updating[\s\S]*?\$\{OrIf\} \$SakuSkipUninstallFinish = 1[\s\S]*?SetAutoClose true/
);
assert.match(generated, /MUI_LANGUAGE "Japanese"/);
assert.match(generated, /MUI_LANGUAGE "English"/);
assert.match(generated, /INSTALLMODE "currentUser"/);
assert.match(generated, /DISPLAYLANGUAGESELECTOR "true"/);
assert.equal((generated.match(/MUI_LANGDLL_DISPLAY/g) || []).length, 1);
assert.match(generated, /INSTALLWEBVIEW2MODE "downloadBootstrapper"/);
assert.match(generated, /WebView2.*download|download.*WebView2/i);

console.log("GENERATED_NSIS_VERIFY PASS");
console.log(`GENERATED_NSIS ${candidate}`);
console.log("FINISH_ACTIONS launch,desktop-shortcut,install-directory,getting-started PASS");
console.log("FLOW_TRANSITIONS install-auto-finish,uninstall-finish-and-exit PASS");
