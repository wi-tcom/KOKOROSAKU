// wording:verify (統制卓 2026-09-23) — wording that ships before its review
// route has finished must be an exception someone decided on, not the default.
//
// β.6 was built carrying 14 Japanese strings that had not been through
// ライター&SNS 様式チェック. That was right: the Owner asked for the build knowing
// it, and refusing would have overridden their decision. What must not happen is
// the same state carrying forward quietly into the next version and the one after,
// until "unapproved wording aboard" is simply how the product is.
//
// So the authorization is written down and **expires with the version**:
// `docs/collaboration/provisional-wording.json` names the flag, what it covers,
// the Owner's instruction and where that is recorded, and the one version it is
// good for. Raise the version and the gate refuses until either the approved
// wording has arrived or the Owner authorizes again.
//
// This is a gate, not an interlock in the bundler: `tauri build` does not call
// it. It is in the build procedure's sweep, and it is what a reviewer reads.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)})`); cases.push(label); };
const read = rel => readFileSync(path.join(ROOT, rel), "utf8");

/**
 * The modules that may hold wording still in review. A list, walked — a module
 * added here is covered from that moment, the same shape as HANDOFF_ROUTES and
 * the screen lists.
 */
const WORDING_MODULES = Object.freeze([
  "tools/unified-v1/speed-test-ui.mjs",
  "tools/v1/speed-test.mjs",
  "tools/unified-v1/trainer-ux4-ui.mjs",
  "tools/unified-v1/screen-help.mjs",
  "tools/v1/help-tree.mjs",
  "desktop/app.mjs",
  "desktop/i18n.mjs",
]);

const FLAG = /export const (\w*_APPROVED) = (true|false);/g;
const VERSION = JSON.parse(read("package.json")).version;
const RECORD = "docs/collaboration/provisional-wording.json";

/** Every string literal declared in `export const NAME = Object.freeze({ … })`. */
function countStrings(source, name) {
  const at = source.indexOf(`export const ${name} = Object.freeze({`);
  if (at < 0) return null;
  const close = source.indexOf("});", at);
  if (close < 0) return null;
  return (source.slice(at, close).match(/:\s*"/g) || []).length;
}

// ── what the code says ─────────────────────────────────────────────────────
const flags = [];
for (const rel of WORDING_MODULES) {
  if (!existsSync(path.join(ROOT, rel))) continue;
  const source = read(rel);
  for (const match of source.matchAll(FLAG)) flags.push({ module: rel, flag: match[1], approved: match[2] === "true", source });
}
check(flags.length > 0, `WORDING the ${WORDING_MODULES.length} listed modules declare at least one approval flag (found ${flags.length})`);

const unapproved = flags.filter(entry => !entry.approved);
const record = existsSync(path.join(ROOT, RECORD)) ? JSON.parse(read(RECORD)) : null;
const entries = record?.entries || [];

// ── an unapproved flag needs a live authorization ─────────────────────────
for (const { module, flag, source } of unapproved) {
  const entry = entries.find(item => item.flag === flag && item.module === module);
  check(Boolean(entry), `WORDING ${flag} in ${module} is false, so ${RECORD} must carry an entry for it — wording still in review does not ship without one`);

  equal(entry.authorized_for_version, VERSION, `WORDING ${flag}: the authorization is for ${VERSION}. Raising the version expires it on purpose: either the approved wording has arrived, or the Owner authorizes again`);

  const instruction = entry.owner_instruction || {};
  check(instruction.said && instruction.on, `WORDING ${flag}: the entry records what the Owner said and when`);
  check(instruction.recorded_in && existsSync(path.join(ROOT, instruction.recorded_in)), `WORDING ${flag}: ${instruction.recorded_in} exists`);
  check(read(instruction.recorded_in).includes(instruction.said), `WORDING ${flag}: that record carries the instruction verbatim — a reference nobody can follow is not a record`);

  // the count in the record must be the count in the code
  const counted = (entry.constants || []).filter(name => /_JA$/.test(name)).reduce((total, name) => total + (countStrings(source, name) ?? 0), 0);
  equal(counted, entry.ja_strings, `WORDING ${flag}: the entry says ${entry.ja_strings} Japanese strings and the module holds that many — a record that drifts from the code stops being one`);
  for (const name of entry.constants || []) check(source.includes(`export const ${name} = `), `WORDING ${flag}: ${name} is where the entry says it is`);
}
cases.push(`WORDING ${unapproved.length} flag(s) are false, each with a live authorization for ${VERSION}`);

// ── and an authorization must not outlive what it covers ──────────────────
for (const entry of entries) {
  const live = flags.find(item => item.flag === entry.flag && item.module === entry.module);
  check(Boolean(live), `WORDING ${RECORD} names ${entry.flag} in ${entry.module}, which still declares it`);
  check(!live.approved, `WORDING ${entry.flag} is still false — an entry left behind after approval would authorize nothing and read as though something were pending`);
}
cases.push(`WORDING ${entries.length} authorization(s), none of them stale`);

console.log(`PENDING_WORDING PASS ${cases.length}/${cases.length}`);
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log(`WORDING version ${VERSION} / ${unapproved.length} flag(s) in review / authorization expires when the version is raised`);
