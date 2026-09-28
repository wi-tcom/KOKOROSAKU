// β.8 regression findings (サイト構築, 2026-09-24; Owner: fix them in β.9).
// The ones that change behaviour are checked where they are cheapest to check:
//   D-1  the static Builder's help link  → public:tooling:verify
//   O-10 no stray copy into a new folder → workspace:verify
//   O-1  and O-9 below, each with a falsification that restores the old code.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFileSync(path.join(ROOT, relative), "utf8");
const cases = [];

// O-1: the Trainer refuses only a Character handed over on purpose; a working
// draft that does not fit the adopted schema is simply not preselected.
const O1_OLD = "const character=handoff.status==='ACCEPTED'?handoff.character:ActiveSaku.getWorkingCharacter();if(character&&!admissible(character))throw new Error('CHARACTER_INVALID');";
const o1Problems = source => {
  const problems = [];
  if (!source.includes("if(handed&&!admissible(handoff.character))throw new Error('CHARACTER_INVALID');")) problems.push("a handed-over Character that does not fit is no longer refused (F6)");
  if (!source.includes("const character=handed?handoff.character:(working&&admissible(working)?working:null);")) problems.push("a working draft that does not fit is not dropped");
  if (/if\(character&&!admissible\(character\)\)throw/.test(source)) problems.push("the working draft can still stop the Trainer");
  return problems;
};
{
  const trainer = read("tools/unified-v1/trainer-ux4-ui.mjs");
  assert.deepEqual(o1Problems(trainer), [], "O-1");
  const start = trainer.indexOf("const handed=");
  const end = trainer.indexOf("\n", trainer.indexOf("const character=handed?"));
  assert.ok(start > 0 && end > start, "O-1 the new lines are where the falsification expects them");
  assert.ok(o1Problems(trainer.slice(0, start) + O1_OLD + trainer.slice(end)).length > 0, "O-1 falsification: the old line is caught");
  cases.push("O-1 the Trainer opens with nothing selected instead of stopping on a working draft; a handed-over Character is still refused (falsified 1/1)");
}

// O-9 and O-8 are superseded (Owner 2026-09-27, AMU DECISION 2026-09-27-11): 04
// Trainer and the AI speed test left the Builder's screens. 03 no longer has a
// 「04 へ」 button to hand a Character over, and the platform guide no longer has
// the speed-test item whose 「入力欄へ」 O-8 dealt with. What is checked now is
// that neither comes back; the help tree keeps honouring "toInput": false.
{
  const app = read("desktop/app.mjs"), index = read("desktop/index.html");
  const gone = (a, h) => !/platform-to-trainer|platformToTrainer/.test(a + h);
  assert.ok(gone(app, index), "O-9 superseded: no 03 → 04 button and no hand-over to the Trainer");
  assert.ok(!gone(app, index + '<button id="platform-to-trainer"></button>'), "O-9 falsification: a returning 03 → 04 button is caught");
  cases.push("O-9 superseded 2026-09-27: 03 → 04 is gone with the Trainer (falsified 1/1)");
}
{
  const { buildHelpTreeModel } = await import("../tools/v1/help-tree.mjs");
  const guide = JSON.parse(read("manual/platform-guide.data.json"));
  assert.ok(!guide.fields.some(field => field.canonicalPath === "platform.speed_test"), "O-8 superseded: the platform guide no longer carries the speed-test item");
  assert.ok(!guide.chapters.some(chapter => chapter.id === "speed"), "O-8 superseded: …nor its chapter");
  const fieldOf = (model, path) => model.chapters.flatMap(chapter => chapter.fields).find(field => field.path === path);
  const probe = structuredClone(guide); probe.fields[0] = { ...probe.fields[0], toInput: false };
  assert.equal(fieldOf(buildHelpTreeModel(probe, "ja"), probe.fields[0].canonicalPath).toInput, false, "O-8 the help tree still honours \"toInput\": false");
  assert.equal(fieldOf(buildHelpTreeModel(guide, "ja"), guide.fields[0].canonicalPath).toInput, true, "O-8 …and a field without it keeps 「入力欄へ」");
  cases.push("O-8 superseded 2026-09-27: the speed-test item left the platform guide; the toInput mark still works");
}

// O-5: no 「BUILD UNSTAMPED」 and no cut-off stand-in revision.
{
  const app = read("desktop/app.mjs");
  const o5Problems = source => {
    const problems = [];
    if (source.includes('"BUILD UNSTAMPED"')) problems.push("the home still prints BUILD UNSTAMPED");
    if (!/invoke\("get_runtime_state"\)\.then\(state => paint\(state\?\.app_version/.test(source)) problems.push("the app version is not shown");
    return problems;
  };
  assert.deepEqual(o5Problems(app), [], "O-5 home");
  assert.ok(o5Problems(app.replace('.filter(Boolean).join(" · ");', '.filter(Boolean).join(" · ") || "BUILD UNSTAMPED";').replace("|| \"BUILD UNSTAMPED\"", '|| "BUILD UNSTAMPED"')).length > 0, "O-5 falsification: the old word is caught");
  // The static Trainer page left the ZIP on 2026-09-27 (Owner: the Trainer leaves the screens), so the
  // stand-in check reads the page source that the separate tool will start from.
  const trainerHtml = read("tools/saku-trainer.html");
  assert.ok(!trainerHtml.includes("UNRELEASED_STATIC_CANDIDATE"), "O-5 the Trainer page source carries no stand-in revision");
  cases.push("O-5 the home shows the app version (and a revision only when a build stamps one); the Trainer page source shows no stand-in (falsified 1/1)");
}

// O-11: no shipped screen asks through the WebView's confirm() (titled 「tauri.localhost
// の内容」); the Golden page keeps confirm() only as the fallback when the module is absent.
{
  const surfaces = { "desktop/app.mjs": read("desktop/app.mjs"), "tools/v1/builder-golden-ui.mjs": read("tools/v1/builder-golden-ui.mjs"), "tools/saku-builder.html": read("tools/saku-builder.html") };
  const o11Problems = files => {
    const problems = [];
    for (const [name, text] of Object.entries(files)) {
      const lines = text.split("\n").filter(line => /(?:window\.)?\bconfirm\(/.test(line) && !line.trim().startsWith("//"));
      for (const line of lines) if (!/window\.sakuConfirmFor\s*\?/.test(line)) problems.push(`${name}: ${line.trim().slice(0, 80)}`);
    }
    return problems;
  };
  assert.deepEqual(o11Problems(surfaces), [], "O-11 every shipped confirmation goes through the app's dialog");
  const broken = { ...surfaces, "desktop/app.mjs": surfaces["desktop/app.mjs"] + '\nif (!window.confirm("x")) {}\n' };
  assert.ok(o11Problems(broken).length > 0, "O-11 falsification: a bare confirm() is caught");
  const dialog = read("tools/unified-v1/confirm-dialog.mjs");
  assert.match(dialog, /dialog\.addEventListener\("cancel", event => \{ event\.preventDefault\(\); finish\(false\); \}\);/, "O-11 Esc cancels");
  assert.match(dialog, /actions\.append\(ok, cancel\);/, "O-11 the order is the action, then cancel, on every screen");
  assert.match(dialog, /\n    cancel\.focus\(\);\n/, "O-11 the focus starts on cancel");
  cases.push("O-11 app.mjs, the edit screen and the Golden page ask through the app's dialog: Esc cancels, focus on cancel, one order (falsified 1/1)");
}

for (const label of cases) console.log(`  PASS ${label}`);
console.log(`REGRESSION_BETA8 PASS ${cases.length}/${cases.length}`);
