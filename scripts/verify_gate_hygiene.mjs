// Gate hygiene (2026-09-23).
//
// Two browser gates failed now and then when the whole set ran, and passed when
// run alone. Reproduced under load: the checks had passed, then removing the
// temporary Chrome profile threw EBUSY — Chrome's child processes were still
// holding a file after the main process was killed — and the uncaught error
// ended the gate with exit 1. Thirteen gates removed the profile that way.
//
// A leftover temporary folder harms nothing; a gate that reports a failure its
// checks did not find misleads. Every gate that starts Chrome with its own
// profile removes it with retries and reports, rather than fails on, a folder
// it could not remove. Walked over scripts/, so a new browser gate is covered
// from the moment it exists.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };

const gates = readdirSync(path.join(ROOT, "scripts")).filter(name => /\.mjs$/.test(name) && name !== "verify_gate_hygiene.mjs");
const browserGates = gates.filter(name => readFileSync(path.join(ROOT, "scripts", name), "utf8").includes("--user-data-dir"));
check(browserGates.length >= 10, `HYGIENE found the gates that start Chrome with their own profile (${browserGates.length})`);
for (const name of browserGates) {
  const text = readFileSync(path.join(ROOT, "scripts", name), "utf8");
  const removals = [...text.matchAll(/rm(?:Sync)?\(\s*profile\b[^;]*/g)].map(match => match[0]);
  check(removals.length > 0, `HYGIENE ${name} removes its Chrome profile`);
  for (const removal of removals) {
    check(/maxRetries/.test(removal) && /\.catch\(/.test(removal), `HYGIENE ${name}: the profile is removed with retries, and a folder Chrome still holds does not fail the gate`);
  }
}
console.log(`GATE_HYGIENE PASS ${cases.length}/${cases.length}`);
console.log(`BROWSER_GATES ${browserGates.length} / PROFILE_CLEANUP retrying and non-fatal in all of them`);
