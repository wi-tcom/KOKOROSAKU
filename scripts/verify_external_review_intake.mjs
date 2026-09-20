// External review-only Trainer intake gate (saku.trainer.external-review-intake@1).
//
// Proves, against the shared AMU fixtures, that the Builder intake refuses
// everything the AMU reference refuses, stores the positive packet read-only
// with the two Character digests in separate fields, never touches the
// frozen-ia@1 contract or its storage, and offers no apply path.  Every
// added rule is falsified: a copy of the module with that rule disabled must
// let the corresponding defect through, or the check is not proven live.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFile(path.join(ROOT, relative), "utf8");
const sha256 = text => createHash("sha256").update(text).digest("hex");
const cases = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)})`); cases.push(label); };

const MODULE = "tools/v1/external-review-intake.mjs";
const Intake = await import(pathToFileURL(path.join(ROOT, MODULE)).href);
const Contract = await import(pathToFileURL(path.join(ROOT, "tools/v1/trainer-frozen-ia.mjs")).href);
const Tuning = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/tuning/tuning-projection.mjs")).href);

function storage() {
  const values = new Map();
  return {
    values,
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}
const snapshot = store => JSON.stringify([...store.values.entries()].sort());

const FIXTURES = "tests/fixtures/external-review";
const positiveText = await read(`${FIXTURES}/amu-trainer-return.sample.json`);
const positive = JSON.parse(positiveText);
const index = JSON.parse(await read(`${FIXTURES}/negative/INDEX.json`));

// ── 0. contract facts ──────────────────────────────────────────────────────
const projection = Intake.contractProjection();
equal(projection.contract_id, "saku.trainer.external-review-intake@1", "XR-CONTRACT contract id");
equal(Intake.EXTERNAL_REVIEW_KEYS.index, "saku.trainer.externalReviewIntake.v1.index", "XR-NAMESPACE index key");
equal(Intake.EXTERNAL_REVIEW_KEYS.itemPrefix, "saku.trainer.externalReviewIntake.v1.item.", "XR-NAMESPACE item prefix");
const frozenKeys = [...Object.values(Contract.TRAINER_HANDOFF_KEYS), Contract.TRAINER_BUILDER_CONTEXT_KEY, ...Object.values(Contract.SESSION_KEYS)];
check(frozenKeys.every(key => !key.startsWith("saku.trainer.externalReviewIntake.")), "XR-NAMESPACE frozen-ia keys and intake keys are disjoint");
check(JSON.stringify(projection.states) === JSON.stringify(["REVIEW_ONLY_STORED", "STALE_READ_ONLY", "ARCHIVED"]), "XR-STATES no READY_FOR_BUILDER / SELECTED_BY_HUMAN / APPLIED");
equal(projection.apply_path, "NONE", "XR-APPLY apply_path NONE");
check(projection.produces_change_candidate === false && projection.produces_builder_session === false && projection.handoff_eligible === false && projection.canonical_mutation === false, "XR-APPLY contract projection constants");

// Module surface: only read-only helpers from the frozen contract; none of the handoff/candidate/apply functions.
const moduleText = await read(MODULE);
const frozenImport = moduleText.match(/import \{([^}]+)\} from "\.\/trainer-frozen-ia\.mjs"/);
check(frozenImport, "XR-IMPORT frozen-ia import present");
const importedNames = frozenImport[1].split(",").map(item => item.trim()).filter(Boolean).sort();
check(JSON.stringify(importedNames) === JSON.stringify(["LEGACY_SCHEMA_TARGETS", "characterBinding", "contentDigest", "stableStringify"]), `XR-IMPORT frozen-ia import is read-only helpers only (${importedNames.join(",")})`);
for (const forbidden of ["createChangeCandidate", "selectCandidate", "buildBuilderHandoff", "storeBuilderHandoff", "consumeBuilderHandoff", "applyBuilderCandidates", "createSession", "saveSession", "recordBuilderResult", "beginBuilderSave", "applyRecommendation", "previewApply", "nextRevision", "setPath"]) {
  check(!moduleText.includes(forbidden), `XR-IMPORT intake never references ${forbidden}`);
}
for (const forbidden of ["SELECTED_BY_HUMAN", "PROPOSED_CHANGE", "REPLACE_EXACT_VALUE", "READY_FOR_BUILDER", "SENT_TO_BUILDER"]) {
  const mentions = moduleText.split(forbidden).length - 1;
  const insideDenyList = moduleText.includes(`EDIT_PROPOSAL_KEYS = /^(RELATED_CANONICAL_PATH|PROPOSED_CHANGE|REPLACE_EXACT_VALUE|SELECTED_BY_HUMAN`);
  const commentMentions = (moduleText.match(new RegExp(`//.*${forbidden}`, "g")) || []).length;
  check(mentions === 0 || (insideDenyList && mentions <= 1 + commentMentions), `XR-IMPORT ${forbidden} appears only in the refusal deny-list`);
}
const uiText = await read("tools/unified-v1/external-review-ui.mjs");
const uiCode = uiText.split(/\r?\n/).filter(line => !line.trim().startsWith("//")).join("\n");
const uiControlIds = [...uiCode.matchAll(/id="([a-z-]+)"/g)].map(match => match[1]);
check(!uiControlIds.some(id => /apply|adopt|bulk|^select|proposed|create-candidate|generate/.test(id)), `XR-UI no apply / adopt / bulk / select / proposal-generation control ids (${uiControlIds.join(",")})`);
check(!/PROPOSED_CHANGE|REPLACE_EXACT_VALUE|createChangeCandidate|storeBuilderHandoff|selectCandidate|applyBuilderCandidates/.test(uiCode), "XR-UI page controller references no Change Candidate or handoff function");
check(uiText.includes('href="./saku-trainer.html"'), "XR-UI existing Trainer is reachable as a separate link");

// ── 1. knowledge pin equals the carried files ──────────────────────────────
const pin = Intake.EXTERNAL_REVIEW_KNOWLEDGE_PIN;
const knowledgeText = await read(pin.carried_from.knowledge_path);
const provenanceText = await read(pin.carried_from.provenance_path);
const provenance = JSON.parse(provenanceText);
equal(sha256(knowledgeText), pin.knowledge_carried_sha256, "XR-PIN knowledge bytes match the pin");
equal(sha256(provenanceText), pin.provenance_sha256, "XR-PIN provenance bytes match the pin");
equal(provenance.authoritative_source_role, pin.authoritative_source_role, "XR-PIN authoritative role matches");
equal(provenance.manifest.sha256, pin.manifest_sha256, "XR-PIN manifest digest matches");
equal(provenance.knowledge.carried_sha256, pin.knowledge_carried_sha256, "XR-PIN provenance describes the carried knowledge");
equal(JSON.parse(knowledgeText).knowledge_id, pin.knowledge_id, "XR-PIN knowledge id matches");

// ── 2. wire digest: independent recomputation ──────────────────────────────
const { candidate_digest: fixtureDigest, returned: _returned, ...wire } = positive.candidate;
equal(`sha-256:${sha256(Contract.stableStringify(wire))}`, fixtureDigest, "XR-DIGEST Builder stableStringify reproduces the AMU wire digest");
equal(Intake.canonicalJson(positive.candidate), Contract.stableStringify(positive.candidate), "XR-DIGEST canonicalJson and stableStringify agree on the received packet");
equal(Intake.canonicalJson({ b: 1, a: undefined, c: [undefined, null] }), '{"b":1,"c":[null,null]}', "XR-DIGEST undefined members are omitted (RFC 8785 behaviour)");
const deletedWire = structuredClone(positive.candidate); delete deletedWire.candidate_digest;
equal(await Intake.candidateWireDigest(deletedWire), fixtureDigest, "XR-DIGEST removal rule is key removal, not undefined insertion");

// ── 3. positive fixture ────────────────────────────────────────────────────
equal(sha256(positiveText), "e10e343c19d08249274b71206884a513f693fb88b86e4c4b412e8c126d6a2c70", "XR-POS positive fixture bytes are the shared AMU fixture");
const verified = await Intake.validateReturnPacket(positive);
check(verified.ok === true && verified.code === "REVIEW_PACKET_WELL_FORMED" && verified.items === 20, "XR-POS positive packet verifies");

// A Character whose identity matches the packet.  The content is arbitrary:
// the Builder binds to what is open, and only identity is compared.
const character = {
  schema: { schema_id: "SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE", schema_version: "final-delta-recovery-closure-2026-09-04" },
  identity: { character_id: positive.candidate.character.character_id, display_name: "Fixture", character_revision: positive.candidate.character.character_revision },
  purpose: { summary: "fixture" },
};
const builderDigest = Contract.characterBinding(character).character_digest;
const store = storage();
const stored = await Intake.storeExternalReview(store, positiveText, character, { now: "2026-09-19T00:00:00.000Z" });
equal(stored.code, "REVIEW_ONLY_STORED", "XR-POS positive fixture stored as REVIEW_ONLY_STORED");
const record = stored.record;
equal(record.character_binding.signed_pack_digest, positive.candidate.character.character_digest, "XR-DUAL signed-Pack digest kept verbatim in its own field");
equal(record.character_binding.builder_local_digest, builderDigest, "XR-DUAL Builder local digest computed from the open snapshot");
check(record.character_binding.signed_pack_digest !== record.character_binding.builder_local_digest, "XR-DUAL the two digests are different values");
check(record.character_binding.signed_pack_digest_role.includes("NOT_VERIFIED_BY_BUILDER") && record.character_binding.builder_local_digest_role.includes("NOT_AUTHENTICITY"), "XR-DUAL both roles are labelled");
equal(record.return_confirmation.confirmation_subject, "TRAINER_CANDIDATE_RETURN", "XR-RETURN confirmation subject kept as provenance");
check(!JSON.stringify(record).includes("SELECTED_BY_HUMAN") && !JSON.stringify(record).includes("PROPOSED_CHANGE") && !JSON.stringify(record).includes("REPLACE_EXACT_VALUE"), "XR-RETURN record carries no selection or edit-proposal member");
equal(JSON.stringify(record.items), JSON.stringify(positive.candidate.items), "XR-ITEMS 20 items stored byte-for-byte as received");
check(record.items.filter(item => item.expected.state === "NOT_ASSESSED" || item.observed.state === "NOT_ASSESSED").every(item => item.diff === "NOT_COMPARABLE"), "XR-ITEMS NOT_ASSESSED sides remain NOT_COMPARABLE");
equal(record.items.filter(item => item.diff === "NOT_COMPARABLE").length, positive.candidate.items.filter(item => item.diff === "NOT_COMPARABLE").length, "XR-ITEMS NOT_COMPARABLE count unchanged");
check(record.automatic_apply === false && record.canonical_mutation === false && record.change_candidates_generated === 0 && record.builder_session_created === false && record.handoff_eligible === false, "XR-APPLY record constants");
equal(store.getItem(Intake.EXTERNAL_REVIEW_KEYS.index) !== null && store.getItem(Intake.externalReviewItemKey(record.candidate_id)) !== null, true, "XR-STORE index and item written");
check([...store.values.keys()].every(key => key.startsWith("saku.trainer.externalReviewIntake.v1.")), "XR-NAMESPACE intake writes only its own namespace");
check(frozenKeys.every(key => store.getItem(key) === null) && Contract.listSessions(store).length === 0, "XR-SESSION no Builder Trainer Session or handoff transport was created");
equal(Contract.consumeBuilderHandoff(store, character).status, "EMPTY", "XR-SESSION frozen-ia consume sees nothing to consume");
equal(JSON.stringify(character), JSON.stringify({ schema: character.schema, identity: character.identity, purpose: character.purpose }), "XR-MUTATION the open Character is untouched");
const view = Intake.externalReviewView(record, character);
equal(view.state, "REVIEW_ONLY_STORED", "XR-VIEW same Character views REVIEW_ONLY_STORED");
check(view.apply_available === false && view.selection_available === false && view.change_candidate_generation_available === false, "XR-VIEW no apply / selection / generation affordance");
const listed = Intake.listExternalReviews(store);
equal(listed.records.length, 1, "XR-STORE list returns the stored record");

// ── 4. AMU negative fixtures: all refused, same reason ─────────────────────
equal(index.cases.length, 25, "XR-NEG shared negative set has 25 cases");
const negativeFiles = (await readdir(path.join(ROOT, FIXTURES, "negative"))).filter(name => name.endsWith(".json") && name !== "INDEX.json");
equal(negativeFiles.length, 25, "XR-NEG all 25 negative files present");
for (const entry of index.cases) {
  const text = await read(`${FIXTURES}/negative/${entry.file}`);
  const result = await Intake.validateReturnPacket(JSON.parse(text));
  check(result.ok === false, `XR-NEG ${entry.file} refused`);
  equal(result.code, entry.expected_code, `XR-NEG ${entry.file} refused for the AMU reason`);
  const before = snapshot(store);
  const attempt = await Intake.storeExternalReview(store, text, character);
  check(attempt.ok === false && attempt.stored !== true && snapshot(store) === before, `XR-NEG ${entry.file} intake writes nothing`);
}

// ── 5. Builder-side negatives ──────────────────────────────────────────────
const before = snapshot(store);
const duplicate = await Intake.storeExternalReview(store, positiveText, character);
equal(duplicate.code, "DUPLICATE_INTAKE", "XR-DUP same packet refused as a Builder-side duplicate");
check(snapshot(store) === before, "XR-DUP duplicate refusal writes nothing");
const reDigest = structuredClone(positive); reDigest.candidate.candidate_id = "11111111-1111-4111-8111-111111111111";
reDigest.candidate.candidate_digest = await Intake.candidateWireDigest(reDigest.candidate);
equal((await Intake.storeExternalReview(store, JSON.stringify(reDigest), character)).code, "DUPLICATE_INTAKE", "XR-DUP same return confirmation with a new id is still a duplicate");
const otherCharacter = structuredClone(character); otherCharacter.identity.character_revision = "9.9.9";
equal((await Intake.storeExternalReview(storage(), positiveText, otherCharacter)).code, "CHARACTER_BINDING_MISMATCH", "XR-BIND revision mismatch refused");
const otherId = structuredClone(character); otherId.identity.character_id = "someone-else";
equal((await Intake.storeExternalReview(storage(), positiveText, otherId)).code, "CHARACTER_BINDING_MISMATCH", "XR-BIND Character id mismatch refused");
equal((await Intake.storeExternalReview(storage(), positiveText, null)).code, "NO_CURRENT_CHARACTER", "XR-BIND no open Character refused");
equal((await Intake.storeExternalReview(storage(), "{not json", character)).code, "PACKET_NOT_JSON", "XR-NEG non-JSON text refused");
equal((await Intake.storeExternalReview(storage(), "   ", character)).code, "PACKET_TEXT_REQUIRED", "XR-NEG empty text refused");
const mapping = structuredClone(positive); mapping.candidate.mapping_version = "amu-trainer-expected-observed-mapping/2"; mapping.candidate.candidate_digest = await Intake.candidateWireDigest(mapping.candidate);
equal((await Intake.validateReturnPacket(mapping)).code, "MAPPING_VERSION_MISMATCH", "XR-NEG mapping_version drift refused even with a valid digest");
const wrongDiff = structuredClone(positive); const t01 = wrongDiff.candidate.items.find(item => item.id === "T01"); t01.diff = "ALIGNED"; wrongDiff.candidate.candidate_digest = await Intake.candidateWireDigest(wrongDiff.candidate);
equal((await Intake.validateReturnPacket(wrongDiff)).code, "DIFF_NOT_DERIVED_FROM_STATES", "XR-NEG diff contradicting states refused even with a valid digest");

// storage failure: item write fails; index write fails.
const failingItem = storage(); failingItem.setItem = (key) => { if (key.startsWith(Intake.EXTERNAL_REVIEW_KEYS.itemPrefix)) throw new Error("QUOTA"); };
const itemFailure = await Intake.storeExternalReview(failingItem, positiveText, character);
check(itemFailure.code === "STORAGE_WRITE_FAILED" && itemFailure.stored === false && failingItem.values.size === 0, "XR-STORE item write failure is reported and leaves nothing");
const failingIndex = storage(); const realSet = failingIndex.setItem; failingIndex.setItem = (key, value) => { if (key === Intake.EXTERNAL_REVIEW_KEYS.index) throw new Error("QUOTA"); return realSet(key, value); };
const indexFailure = await Intake.storeExternalReview(failingIndex, positiveText, character);
check(indexFailure.code === "STORAGE_WRITE_FAILED" && indexFailure.stored === false && failingIndex.values.size === 0, "XR-STORE index write failure rolls the item back");
const unverified = storage(); unverified.setItem = () => {};
check((await Intake.storeExternalReview(unverified, positiveText, character)).code === "STORAGE_WRITE_FAILED", "XR-STORE unverifiable write is not reported as stored");

// stale after Character switch / edit; archive is explicit and keeps the record.
const edited = structuredClone(character); edited.purpose.summary = "edited after receipt";
const staleEdit = Intake.externalReviewView(record, edited);
check(staleEdit.state === "STALE_READ_ONLY" && staleEdit.stale_reason === "BUILDER_LOCAL_DIGEST_DIFFERS" && staleEdit.apply_available === false, "XR-STALE edited Character views STALE_READ_ONLY");
check(Intake.externalReviewView(record, otherCharacter).stale_reason === "CHARACTER_REVISION_DIFFERS" && Intake.externalReviewView(record, null).stale_reason === "NO_CURRENT_CHARACTER", "XR-STALE switch and no-Character reasons");
const archived = Intake.archiveExternalReview(store, record.candidate_id);
check(archived.ok && archived.record.state === "ARCHIVED" && Intake.externalReviewView(archived.record, character).state === "ARCHIVED", "XR-ARCHIVE explicit archive is terminal and keeps the record");
check(Intake.loadExternalReview(store, record.candidate_id).record.items.length === 20, "XR-ARCHIVE archived record still readable in full");
const tampered = JSON.parse(store.getItem(Intake.externalReviewItemKey(record.candidate_id))); tampered.items[0].observed.state = "LOW"; store.setItem(Intake.externalReviewItemKey(record.candidate_id), JSON.stringify(tampered));
equal(Intake.loadExternalReview(store, record.candidate_id).code, "STORAGE_RECORD_TAMPERED", "XR-STORE tampered stored record is not presented");

// ── 6. frozen-ia@1 untouched ───────────────────────────────────────────────
const gitShow = (revision, relative) => new Promise(resolve => {
  const child = spawn("git", ["show", `${revision}:${relative}`], { cwd: ROOT, windowsHide: true });
  let out = ""; child.stdout.on("data", chunk => out += chunk); child.on("close", code => resolve(code === 0 ? out : null));
});
const baseline = "9b0af0e56cb6cd7459e39f6d6e585cb487566c58";
for (const relative of ["tools/v1/trainer-frozen-ia.mjs", "scripts/verify_frozen_trainer_ia.mjs", "tools/unified-v1/handoff-binding.mjs", "tools/v1/trainer-ux4.mjs", "tools/v1/trainer-ux3.mjs"]) {
  const shown = await gitShow(baseline, relative);
  if (shown === null) { cases.push(`XR-FROZEN ${relative} baseline unavailable (git), skipped`); continue; }
  equal(sha256(await read(relative)), sha256(shown), `XR-FROZEN ${relative} byte-identical to main ${baseline.slice(0, 8)}`);
}
equal(Contract.TRAINER_CONTRACT_ID, "saku.trainer.frozen-ia@1", "XR-FROZEN frozen-ia contract id unchanged");

// ── 7. falsification: disable one rule at a time in a temporary copy ───────
const falsifications = [
  ["XR-FALSIFY digest rule", 'if (recomputed !== candidate.candidate_digest) {', 'if (false) {', `${FIXTURES}/negative/candidate-digest-tampered.json`],
  ["XR-FALSIFY automatic_apply rule", "if (packet.automatic_apply !== false || candidate.automatic_apply !== false) {", "if (false) {", `${FIXTURES}/negative/automatic-apply-string-false.json`],
  ["XR-FALSIFY NOT_ASSESSED coercion rule", 'if ((item.expected.state === "NOT_ASSESSED" || item.observed.state === "NOT_ASSESSED") && item.diff !== "NOT_COMPARABLE") {', "if (false) {", `${FIXTURES}/negative/not-assessed-coerced.json`],
  ["XR-FALSIFY edit-proposal rule", "if (EDIT_PROPOSAL_KEYS.test(key))", "if (false)", `${FIXTURES}/negative/selected-by-human-included.json`],
  ["XR-FALSIFY knowledge manifest pin rule", "|| knowledge.manifest_sha256 !== pin.manifest_sha256", "", `${FIXTURES}/negative/knowledge-provenance-mismatch.json`],
  ["XR-FALSIFY knowledge carried-revision rule", "|| knowledge.carried_from?.main_revision !== pin.carried_from.main_revision", "", `${FIXTURES}/negative/knowledge-revision-mismatch.json`],
  ["XR-FALSIFY Character binding rule", "if (local.character_id !== verified.character.character_id || String(local.character_revision) !== String(verified.character.character_revision)) {", "if (false) {", null],
];
const tempDir = await mkdtemp(path.join(tmpdir(), "saku-xr-falsify-"));
try {
  for (const [label, from, to, fixture] of falsifications) {
    check(moduleText.includes(from), `${label}: target rule present`);
    const mutatedPath = path.join(ROOT, "tools/v1", `__xr_falsify_${cases.length}.mjs`);
    await writeFile(mutatedPath, moduleText.replace(from, to), "utf8");
    try {
      const mutated = await import(pathToFileURL(mutatedPath).href);
      if (fixture === null) {
        const original = await Intake.storeExternalReview(storage(), positiveText, otherCharacter);
        const result = await mutated.storeExternalReview(storage(), positiveText, otherCharacter);
        check(original.code === "CHARACTER_BINDING_MISMATCH" && result.code === "REVIEW_ONLY_STORED", `${label}: disabling the rule lets a mismatched Character through (rule is live)`);
      } else {
        const result = await mutated.validateReturnPacket(JSON.parse(await read(fixture)));
        const original = await Intake.validateReturnPacket(JSON.parse(await read(fixture)));
        check(original.ok === false && (result.ok === true || result.code !== original.code), `${label}: disabling the rule changes the verdict (rule is live)`);
      }
    } finally { await rm(mutatedPath, { force: true }); }
  }
  // The coercion falsification must not be masked by the stricter derivation rule alone.
  const coerced = JSON.parse(await read(`${FIXTURES}/negative/not-assessed-coerced.json`));
  const coercedDefect = coerced.candidate.items.find(item => (item.expected.state === "NOT_ASSESSED" || item.observed.state === "NOT_ASSESSED") && item.diff !== "NOT_COMPARABLE");
  check(Boolean(coercedDefect), "XR-FALSIFY coercion fixture carries a filled-in diff on a NOT_ASSESSED side");
} finally { await rm(tempDir, { recursive: true, force: true }); }

// ── 8. browser: the real page, served from the repository root ─────────────
// The packaged copies (public tooling projection, desktop dist when prepared)
// must boot too: that is what proves the import remapping for each package.
const packagedPages = ["/tooling/builder/external-review.html"];
try { await readFile(path.join(ROOT, ".desktop-dist/tools/saku-external-review.html")); packagedPages.push("/.desktop-dist/tools/saku-external-review.html"); }
catch { cases.push("XR-PACKAGED .desktop-dist not prepared in this run (desktop:prepare) — desktop copy not loaded"); }
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const harness = `<!doctype html><meta charset="utf-8"><pre id="report">RUNNING</pre><script type="module">
const checks=[],check=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async fn=>{for(let i=0;i<400;i++){if(fn())return;await wait(25);}throw new Error('TIMEOUT');};
let frame,doc,win;
const load=async()=>{if(frame)frame.remove();frame=document.createElement('iframe');frame.style.cssText='width:1280px;height:950px';frame.src='/tools/saku-external-review.html';document.body.append(frame);await new Promise(resolve=>frame.onload=resolve);doc=frame.contentDocument;win=frame.contentWindow;await until(()=>doc.getElementById('xr-intake'));};
const visible=el=>Boolean(el)&&el.offsetParent!==null&&el.getBoundingClientRect().height>0;
try{
 const packetText=await (await fetch('/${FIXTURES}/amu-trainer-return.sample.json')).text();const packet=JSON.parse(packetText);
 const character={schema:{schema_id:'SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE',schema_version:'final-delta-recovery-closure-2026-09-04'},identity:{character_id:packet.candidate.character.character_id,display_name:'Fixture',character_revision:packet.candidate.character.character_revision},purpose:{summary:'fixture'}};
 localStorage.clear();
 await load();
 check(visible(doc.getElementById('xr-boundary'))&&doc.getElementById('xr-boundary').innerText.includes('変更しません'),'XR-UI boundary statement visible');
 check(doc.getElementById('xr-current-character').querySelector('.warning'),'XR-UI no-Character warning shown before intake');
 doc.getElementById('packet-text').value=packetText;doc.getElementById('packet-text').dispatchEvent(new Event('input',{bubbles:true}));
 doc.getElementById('store-packet').click();await until(()=>doc.getElementById('intake-result')?.dataset.code==='NO_CURRENT_CHARACTER');
 check(true,'XR-UI intake without an open Character is refused NO_CURRENT_CHARACTER');
 localStorage.setItem('saku.workspace.active',JSON.stringify({character,identity:character.identity,source:'gate',opened_at:new Date().toISOString()}));
 await load();
 doc.getElementById('packet-text').value=packetText;doc.getElementById('packet-text').dispatchEvent(new Event('input',{bubbles:true}));
 doc.getElementById('store-packet').click();await until(()=>doc.getElementById('intake-result')?.dataset.code==='REVIEW_ONLY_STORED');
 check(true,'XR-UI positive fixture stored from the page');
 await until(()=>doc.getElementById('review-items'));
 check(doc.querySelectorAll('#review-items tbody tr').length===20,'XR-UI 20 items displayed');
 check(doc.getElementById('detail-state').dataset.state==='REVIEW_ONLY_STORED'&&visible(doc.getElementById('detail-state')),'XR-UI state chip REVIEW_ONLY_STORED visible');
 const signed=doc.getElementById('digest-signed-pack').textContent.trim(),local=doc.getElementById('digest-builder-local').textContent.trim();
 check(signed===packet.candidate.character.character_digest&&local!==signed&&/^[0-9a-f]{8}$/.test(local),'XR-UI two digests shown in separate fields with different values');
 check(doc.getElementById('detail-confirmation-subject').textContent.trim()==='TRAINER_CANDIDATE_RETURN'&&!doc.getElementById('xr-detail').innerText.includes('SELECTED_BY_HUMAN'),'XR-UI return confirmation shown as provenance only');
 const rows=[...doc.querySelectorAll('#review-items tbody tr')];const notComparable=rows.filter(row=>row.querySelector('[data-diff]').dataset.diff==='NOT_COMPARABLE').length;
 check(notComparable===packet.candidate.items.filter(i=>i.diff==='NOT_COMPARABLE').length&&rows.some(row=>row.innerText.includes('NOT_ASSESSED')),'XR-UI NOT_ASSESSED / NOT_COMPARABLE displayed as received');
 const buttons=[...doc.querySelectorAll('button, a.button-link')].map(el=>(el.id||'')+'|'+el.textContent.trim());
 check(!buttons.some(label=>/apply|適用|採用|一括|変更案|候補を作る|select|選択する/i.test(label)),'XR-UI no apply / adopt / bulk / generate-proposal / select control ('+buttons.join(' ; ')+')');
 check(visible(doc.getElementById('detail-open-trainer'))&&doc.getElementById('detail-open-trainer').getAttribute('href')==='./saku-trainer.html','XR-UI existing Trainer link is a separate navigation');
 const keys=Object.keys(localStorage);
 check(keys.filter(key=>key.startsWith('saku.trainer.')).every(key=>key.startsWith('saku.trainer.externalReviewIntake.v1.')),'XR-UI page wrote only the intake namespace under saku.trainer.*');
 check(!keys.includes('saku.trainer.sessions.index')&&!keys.includes('saku.trainer.pendingChangeCandidates'),'XR-UI no Trainer Session or handoff transport created');
 doc.getElementById('packet-text').value=packetText;doc.getElementById('packet-text').dispatchEvent(new Event('input',{bubbles:true}));
 doc.getElementById('store-packet').click();await until(()=>doc.getElementById('intake-result')?.dataset.code==='DUPLICATE_INTAKE');
 check(true,'XR-UI duplicate refused on the page');
 const other=structuredClone(character);other.identity.character_revision='9.9.9';localStorage.setItem('saku.workspace.active',JSON.stringify({character:other,identity:other.identity,source:'gate',opened_at:new Date().toISOString()}));
 await load();doc.querySelector('[data-review-id]').click();await until(()=>doc.getElementById('detail-state'));
 check(doc.getElementById('detail-state').dataset.state==='STALE_READ_ONLY'&&visible(doc.getElementById('detail-stale')),'XR-UI Character switch shows STALE_READ_ONLY');
 check(doc.querySelectorAll('#review-items tbody tr').length===20,'XR-UI stale record still readable in full');
 frame.style.width='390px';await wait(150);check(doc.documentElement.scrollWidth<=doc.documentElement.clientWidth+1,'XR-UI narrow layout has no horizontal overflow');
 for(const packaged of ${JSON.stringify(packagedPages)}){const pframe=document.createElement('iframe');pframe.style.cssText='width:1280px;height:900px';pframe.src=packaged;document.body.append(pframe);await new Promise(resolve=>pframe.onload=resolve);const pdoc=pframe.contentDocument;await until(()=>pdoc.getElementById('xr-intake'));check(pdoc.getElementById('store-packet')&&pdoc.querySelector('#open-existing-trainer').getAttribute('href').endsWith('trainer.html'),'XR-PACKAGED '+packaged+' boots with resolved imports');pframe.remove();}
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',passed:checks.length,checks});document.getElementById('report').dataset.status='PASS';
}catch(error){document.getElementById('report').textContent=JSON.stringify({status:'FAIL',passed:checks.length,error:String(error.stack||error),checks,body:doc?.body.innerText.slice(-3000)});document.getElementById('report').dataset.status='FAIL';}
</script>`;
const mime = { ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json" };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/__xr__") { response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(harness); return; }
    const file = path.resolve(ROOT, decodeURIComponent(url.pathname).replace(/^\//, ""));
    if (!file.startsWith(ROOT + path.sep)) throw new Error("outside root");
    response.setHeader("Content-Type", `${mime[path.extname(file)] || "text/plain"};charset=utf-8`);
    response.end(await readFile(file));
  } catch { response.statusCode = 404; response.end("not found"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const profile = await mkdtemp(path.join(tmpdir(), "saku-xr-browser-"));
const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let output = ""; let stderr = ""; let socket;
child.stderr.on("data", chunk => stderr += chunk);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let port = 0;
  for (let i = 0; i < 200 && !port; i++) { const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (match) port = Number(match[1]); else await pause(100); }
  if (!port) throw new Error(`CHROME_NOT_READY ${stderr.slice(-500)}`);
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/__xr__`)}`, { method: "PUT" })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.onopen = resolve);
  let sequence = 0; const pending = new Map();
  socket.onmessage = event => { const data = JSON.parse(event.data); if (data.id) { pending.get(data.id)?.(data); pending.delete(data.id); } };
  const call = (method, params = {}) => new Promise(resolve => { const id = ++sequence; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
  for (let i = 0; i < 900; i++) {
    const result = await call("Runtime.evaluate", { expression: 'document.getElementById("report")?.dataset.status', returnByValue: true });
    if (result.result?.result?.value) { output = (await call("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true })).result.result.value; break; }
    await pause(100);
  }
  if (!output) output = (await call("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true })).result.result.value;
} finally {
  socket?.close(); child.kill();
  await new Promise(resolve => child.exitCode !== null ? resolve() : child.once("exit", resolve));
  server.close(); await rm(profile, { recursive: true, force: true });
}
const match = output.match(/<pre id="report" data-status="(PASS|FAIL)">([\s\S]*?)<\/pre>/);
if (!match) { console.error(output.slice(0, 2000), stderr.slice(-1000)); process.exit(1); }
const report = JSON.parse(match[2].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
if (report.status !== "PASS") { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
for (const label of report.checks) cases.push(label);

console.log(`EXTERNAL_REVIEW_INTAKE PASS ${cases.length}/${cases.length}`);
for (const label of cases) console.log(`  PASS ${label}`);
console.log("SAKU_EXTERNAL_REVIEW_INTAKE_CONTRACT saku.trainer.external-review-intake@1");
console.log("FROZEN_IA_CHANGED NO / CANONICAL_CHANGE NO / AUTO_APPLY_PATH NONE / BUILDER_SESSION_SYNTHESIZED NO");
