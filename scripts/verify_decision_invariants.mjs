// A Character made with "新しく作る" starts with the three decision invariants (Owner 2026-10-09).
//
// Owner, result 97: 「重大事故としてすべてのキャラに入れてください。」 統括's reading of it (2026-10-09):
// the template a new Character starts from carries them from the start. The statements are the Owner's
// words, character for character (INV-DEC-3); the same three are in every Unified V1 Character of
// wi-tcom/-SAKU-1-7-Character-System (#30, scripts/verify_decision_invariants.py).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const Schema = await import("../tools/unified-v1/unified-schema-v1.mjs");
const Authoring = await import("../tools/v1/unified-authoring.mjs");
const Projection = await import("../tooling/builder/lib/unified-schema.mjs");

// The Owner's words, as UTF-8 SHA-256 of the quoted decision (not computed from the module under test).
const OWNER = [
  ["INV-DEC-1", "知っている決定を後ろに置いて、作業を完了させない。", "6650aec6ef45f34280107c34920ada0d16fcaccbcc273774e40c9b9699b78242"],
  ["INV-DEC-2", "決定に無い制約を、変えられない事実として出さない。", "fe08ec5de439f8a58d7ade6608b1ee8a044c93f993e25b96814bd972876c879f"],
  ["INV-DEC-3", "決裁事項の原文を、自分の要約で置き換えない。", "12255378f406a50d3673b1d226c15dd99ae1dee61fbc2393486d7258204cdef4"],
];
const PRE_CHANGE_BLANK_SHA256 = "cad17464406cb8a409c38f023253c2b695ac333f616a1579ddc2419776e0e82c"; // JSON.stringify(blankUnifiedCharacter()) at main 9304345
const sha256 = (text) => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

let passed = 0;
const failures = [];
function check(id, fn) {
  try { fn(); passed += 1; console.log(`  PASS ${id}`); }
  catch (error) { failures.push(id); console.log(`  FAIL ${id}: ${error.message.split("\n")[0]}`); }
}

function decisionRows(character) {
  return character.character_core.hard_invariants.filter((item) => OWNER.some(([id]) => id === item.id));
}

function assertCarries(character, label) {
  const hard = character.character_core.hard_invariants;
  const tail = hard.slice(-3);
  OWNER.forEach(([id, statement, digest], offset) => {
    assert.deepEqual(tail[offset], { id, statement }, `${label}: hard_invariants[${hard.length - 3 + offset}] is not ${id} in the Owner's words`);
    assert.equal(sha256(tail[offset].statement), digest, `${label}: ${id} differs from the Owner's words`);
  });
  assert.equal(decisionRows(character).length, 3, `${label}: a decision invariant appears more than once`);
  for (const list of ["must_preserve_refs", "continuity_refs"]) {
    for (const [id] of OWNER) {
      const refs = character.conformance_expectations[list].filter((ref) => ref.requirement_id === id);
      assert.equal(refs.length, 1, `${label}: ${list} holds ${refs.length} refs to ${id}`);
      assert.equal(refs[0].locator, `/character_core/hard_invariants/${hard.findIndex((item) => item.id === id)}`, `${label}: ${list} ref to ${id} points elsewhere`);
    }
  }
  assert.ok(!character.conformance_expectations.prohibited_drift_refs.some((ref) => OWNER.some(([id]) => id === ref.requirement_id)), `${label}: prohibited_drift_refs holds a decision invariant (Owner: not added there)`);
  assert.deepEqual(Schema.conformanceLocatorMismatches(character), [], `${label}: a locator does not resolve`);
}

console.log("Decision invariants (Owner 2026-10-09, results 97 and 102)");

check("DI-1 the exported constant is the Owner's words, in order", () => {
  assert.deepEqual(Schema.DECISION_INVARIANTS.map((item) => [item.id, item.statement]), OWNER.map(([id, statement]) => [id, statement]));
  for (const [index, [, , digest]] of OWNER.entries()) assert.equal(sha256(Schema.DECISION_INVARIANTS[index].statement), digest);
  assert.ok(Object.isFrozen(Schema.DECISION_INVARIANTS) && Schema.DECISION_INVARIANTS.every(Object.isFrozen));
});

check("DI-2 a blank Character carries them after Input Integrity, with refs in must_preserve and continuity only", () => {
  const blank = Schema.blankUnifiedCharacter();
  assert.deepEqual(blank.character_core.hard_invariants[0], { id: "INV-INPUT-INTEGRITY", statement: Schema.INPUT_INTEGRITY_STATEMENT });
  assert.equal(blank.character_core.hard_invariants.length, 4);
  assertCarries(blank, "blank");
});

check("DI-3 two blanks do not share the rows (editing one leaves the other and the constant alone)", () => {
  const a = Schema.blankUnifiedCharacter();
  a.character_core.hard_invariants[1].statement = "x";
  a.conformance_expectations.must_preserve_refs[0].locator = "/x";
  assertCarries(Schema.blankUnifiedCharacter(), "second blank");
});

check("DI-4 an untouched new Character saved through the screen form keeps them and their refs", () => {
  const form = Authoring.fromUnifiedCharacter(Schema.blankUnifiedCharacter());
  assert.deepEqual(form.unified.hard_invariants.map((item) => item.id), OWNER.map(([id]) => id), "the screen shows the three as rows");
  const saved = Authoring.toUnifiedCharacter(form, null);
  assertCarries(saved, "saved new Character");
});

check("DI-5 a new Character with an author's own invariant keeps the three and points every ref at the right row", () => {
  const form = Authoring.fromUnifiedCharacter(Schema.blankUnifiedCharacter());
  form.unified.hard_invariants.push({ id: "INV-AUTHOR-1", statement: "作者の不変条件" });
  const saved = Authoring.toUnifiedCharacter(form, null);
  assert.ok(saved.character_core.hard_invariants.some((item) => item.id === "INV-AUTHOR-1"));
  for (const [id, statement] of OWNER) assert.ok(saved.character_core.hard_invariants.some((item) => item.id === id && item.statement === statement));
  assert.deepEqual(Schema.conformanceLocatorMismatches(saved), []);
});

check("DI-6 the public tooling projection carries the same template", () => {
  assert.deepEqual(Projection.DECISION_INVARIANTS, Schema.DECISION_INVARIANTS);
  assert.deepEqual(Projection.blankUnifiedCharacter(), Schema.blankUnifiedCharacter());
});

check("DI-7 nothing else in the blank changed (the template differs from main 9304345 only by the three and their refs)", () => {
  const blank = Schema.blankUnifiedCharacter();
  blank.character_core.hard_invariants = blank.character_core.hard_invariants.filter((item) => !OWNER.some(([id]) => id === item.id));
  for (const list of ["must_preserve_refs", "continuity_refs"]) blank.conformance_expectations[list] = blank.conformance_expectations[list].filter((ref) => !OWNER.some(([id]) => id === ref.requirement_id));
  const canonical = JSON.stringify(blank);
  assert.equal(sha256(canonical), PRE_CHANGE_BLANK_SHA256, "the blank's other fields changed");
});

const source = await readFile(new URL("../tools/unified-v1/unified-schema-v1.mjs", import.meta.url), "utf8");
check("DI-8 the statements are written once in the source (one place to read the Owner's words)", () => {
  for (const [, statement] of OWNER) assert.equal(source.split(statement).length - 1, 1, `${statement} is written ${source.split(statement).length - 1} times`);
});

console.log(`DECISION_INVARIANTS ${passed}/${passed + failures.length}`);
if (failures.length) process.exit(1);
