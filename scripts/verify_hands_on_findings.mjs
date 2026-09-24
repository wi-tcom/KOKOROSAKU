// β.7 hands-on findings gate (Owner 2026-09-24 「見つかった所見は修正してください。」).
//
// The hands-on check of 0.1.0-beta.7 and the Chrome check of the browser build
// found seven places where the screen said something that was no longer true
// or not in the reader's language. Three are checked in the browser by the
// gates that own those screens (speed-test:verify F3/F4/F7, workspace:verify
// F5); this gate reads the sources of the rest.
//
//   F1 the help's data-location paragraph names the Workspace as where the
//      list lives, not the WebView working copy (#68)
//   F2 the speed-test guide entry describes the clock readings, not the manual
//      aggregate and the 処理時間 line
//   F5 an empty import state says so instead of UNKNOWN ×6 and an English reason
//   F6 the Trainer's refusal of an inadmissible Character says what happened
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => readFileSync(path.join(ROOT, rel), "utf8");
const cases = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };

// F1
{
  const help = read("desktop/help/index.html");
  check(help.includes(".saku-builder フォルダーに保存されます") && help.includes("作業用の写し"), "F1 the help says the list is kept in the Workspace's .saku-builder folder and the WebView copy is a working copy");
  check(!help.includes("作業用一覧は"), "F1 …and no longer says the list lives under %LOCALAPPDATA%");
  check(read("scripts/generate_frozen_ia_manual.mjs").includes("同じ Workspace を開けば、一覧は元に戻ります"), "F1 the generator carries the same sentence, so a regeneration keeps it");
}

// F2
{
  const guide = JSON.parse(read("manual/platform-guide.data.json"));
  const find = node => {
    if (Array.isArray(node)) { for (const item of node) { const hit = find(item); if (hit) return hit; } return null; }
    if (node && typeof node === "object") { if (node.canonicalPath === "platform.speed_test") return node; for (const value of Object.values(node)) { const hit = find(value); if (hit) return hit; } }
    return null;
  };
  const entry = find(guide);
  check(Boolean(entry), "F2 the speed-test guide entry exists");
  const texts = [entry.currentNote.ja, entry.help.about.ja, entry.help.caution.ja];
  check(texts.every(text => !/probe|手計測だけ|処理時間: <秒>/.test(text)), "F2 the entry no longer says probe, manual-only statistics or the 処理時間 line");
  check(texts.some(text => text.includes("開始時刻と終了時刻の差")) && texts.some(text => text.includes("集計から外します")), "F2 it describes the clock readings and the mark on a claim longer than the window");
  check(!read("manual/saku-field-guide.html").includes("統計は手計測だけで出します"), "F2 the regenerated manual carries no trace of the old sentence");
}

// F5
{
  const app = read("desktop/app.mjs");
  check(/export const PACKAGE_EMPTY_JA = "[^"]+";/.test(app), "F5 the empty-import sentence is declared once");
  check(/if \(summary\.status === "UNKNOWN" && summary\.code === "NOT_PROVIDED"\) \{[\s\S]{0,300}PACKAGE_EMPTY_JA[\s\S]{0,80}return;/.test(app), "F5 an empty import state shows that sentence instead of the six UNKNOWN rows");
  check(read("desktop/viewer.mjs").includes('"No current validation result is available."'), "F5 viewer.mjs is untouched (AMU pins it); the page decides what to show");
}

// F6
{
  const trainer = read("tools/unified-v1/trainer-ux4-ui.mjs");
  check(/CHARACTER_INVALID:\['[^']*採択済みSchemaに合わない[^']*'/.test(trainer), "F6 the Trainer names the refusal of an inadmissible Character instead of the generic save failure");
}

// English (英語翻訳チーム via ライター&SNS 2026-09-24, Wi-t_Site 922d0b9, 依頼 O)
{
  const help = read("desktop/help/index.html");
  check(help.includes('data-en="The Character list, the import history, and the Character currently selected are saved in the .saku-builder folder') && !/EN in preparation/.test(help.split("Data locations and uninstall")[1] || ""), "EN F1 the help paragraph carries the delivered English (O1), not the pending marker");
  const guide = JSON.parse(read("manual/platform-guide.data.json"));
  const entry = JSON.stringify(guide).includes('"canonicalPath":"platform.speed_test"') ? (function find(node) { if (Array.isArray(node)) { for (const item of node) { const hit = find(item); if (hit) return hit; } return null; } if (node && typeof node === "object") { if (node.canonicalPath === "platform.speed_test") return node; for (const value of Object.values(node)) { const hit = find(value); if (hit) return hit; } } return null; })(guide) : null;
  check([entry.currentNote.en, entry.help.about.en, entry.help.caution.en].every(text => text && !/[぀-ヿ㐀-鿿]/.test(text.replace(/開始時刻|終了時刻/g, ""))), "EN F2 the three guide fields are English (O2–O4), with only the protected labels in Japanese");
  check((entry.currentNote.en.match(/\./g) || []).length <= 2 && guide.content_review.en.status === "DELIVERED" && !guide.content_review.en.pending, "EN F2 the note keeps two sentences and the guide's English is complete again");
  const app = read("desktop/app.mjs");
  check(/export const PACKAGE_EMPTY_EN = "No Package has been imported since the app started\./.test(app) && app.includes('locale() === "en-US" ? PACKAGE_EMPTY_EN : PACKAGE_EMPTY_JA'), "EN F5 the empty import state has its English and follows the locale");
  check(/CHARACTER_INVALID:\['[^']+',"This Character does not match the adopted Schema/.test(read("tools/unified-v1/trainer-ux4-ui.mjs")), "EN F6 the Trainer refusal has its English (the adopted Schema, D-13)");
}

console.log(JSON.stringify({ status: "PASS", passed: cases.length, cases }, null, 2));
console.log(`HANDS_ON_FINDINGS PASS ${cases.length}/${cases.length}`);
