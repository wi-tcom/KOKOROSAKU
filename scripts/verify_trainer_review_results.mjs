import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCandidate, deriveExpectedProfile } from "../tools/unified-v1/derived-profile-engine.mjs";
import { consumeHandoff, storeHandoff } from "../tools/unified-v1/handoff-binding.mjs";
import { REVIEW_STATES, buildReviewResults, classifyReviewRound, reviewCopy } from "../tools/unified-v1/review-results.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFile(path.join(ROOT, relative), "utf8");
let count = 0;
const check = (actual, expected, message) => { assert.equal(actual, expected, message); count += 1; };
const ok = (value, message) => { assert.ok(value, message); count += 1; };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const ordered = (source, tokens) => {
  let cursor = -1;
  return tokens.every(token => {
    const next = source.indexOf(token, cursor + 1);
    if (next < 0) return false;
    cursor = next;
    return true;
  });
};

const fixtures = JSON.parse(await read("tools/unified-v1/fixtures/characters.json"));
const character = structuredClone(fixtures["fx-core-a"]);
const expected = deriveExpectedProfile(character);
const trait = "forward_progress";
const expectedScore = expected.traits[trait].score;
const answer = "Observed response with explicit source evidence.";
const round = (overrides = {}) => ({ probeId: "PB-FWD", trait, answer, score: expectedScore, reviewed: true, held: false, observations: [], ...overrides });

check(REVIEW_STATES.join(","), "MATCH,DIFFERENT,UNKNOWN,NOT_TESTED,INVALID", "Review state contract");
check(classifyReviewRound(round(), expected), "MATCH", "MATCH classification");
check(classifyReviewRound(round({ score: Math.max(0, expectedScore - .3) }), expected), "DIFFERENT", "DIFFERENT classification");
check(classifyReviewRound(round({ answer: "", held: true, score: null }), expected), "UNKNOWN", "Held result remains UNKNOWN");
check(classifyReviewRound(round({ answer: "", score: expectedScore }), expected), "UNKNOWN", "Missing evidence remains UNKNOWN");
check(classifyReviewRound(round({ score: null }), expected), "UNKNOWN", "Missing Human rubric remains UNKNOWN");
check(classifyReviewRound(round({ reviewed: false }), expected), "NOT_TESTED", "Untested result remains NOT_TESTED");
check(classifyReviewRound({ reviewed: true }, expected), "INVALID", "Malformed result is INVALID");
check(classifyReviewRound(round({ trait: "missing_trait" }), expected), "UNKNOWN", "Missing Expected is UNKNOWN");

const rounds = [round(), round({ score: Math.max(0, expectedScore - .3) }), round({ answer: "", held: true, score: null }), round({ reviewed: false })];
const suggestions = { suggestions: [{ trait, possible_explanation: "Observed difference may reflect current composition.", candidate_changes: [{ path: "assistant_composition.seat4.intensity", from: "HIGH", to: "MEDIUM" }] }] };
const sourceCharacter = JSON.stringify(character);
const sourceRounds = JSON.stringify(rounds);
const sourceSuggestions = JSON.stringify(suggestions);
const model = buildReviewResults({ character, expected, rounds, suggestions });
check(model.status, "READY", "Review model status");
check(model.character.id, character.identity.character_id, "Character identity projection");
check(model.character.revision, character.identity.character_revision, "Character revision projection");
check(model.results.length, 4, "Review history count");
check(model.counts.MATCH, 1, "MATCH count");
check(model.counts.DIFFERENT, 1, "DIFFERENT count");
check(model.counts.UNKNOWN, 1, "UNKNOWN count");
check(model.counts.NOT_TESTED, 1, "NOT_TESTED count");
check(model.counts.INVALID, 0, "INVALID count");
check(model.results[0].evidence_source, "USER_PASTED_EXTERNAL_AI_RESPONSE", "Evidence source");
check(model.results[0].observation_source, "HUMAN_RUBRIC", "Observed source");
check(model.results[2].evidence_present, false, "Unknown has no evidence");
check(model.results[2].observed, "UNKNOWN", "Unknown observed is not inferred");
check(model.results[3].state, "NOT_TESTED", "History preserves not tested");
check(model.candidate_available, true, "Explicit Candidate availability");
check(model.results[0].candidate_changes.length, 1, "Candidate change projection");
check(JSON.stringify(character), sourceCharacter, "Review projection mutated Character");
check(JSON.stringify(rounds), sourceRounds, "Review projection mutated rounds");
check(JSON.stringify(suggestions), sourceSuggestions, "Review projection mutated suggestions");
check(buildReviewResults().status, "INVALID", "Missing Character fails closed");
check(buildReviewResults({ character, expected, rounds: [round({ reviewed: false })] }).status, "NOT_TESTED", "No tested result remains NOT_TESTED");
check(buildReviewResults({ character, expected, rounds: [round()], suggestions: { suggestions: [] } }).candidate_available, false, "No implicit Candidate");

const candidateBefore = JSON.stringify(character);
const candidate = buildCandidate(character, suggestions);
check(candidate.status, "CANDIDATE_PENDING_HUMAN_REVIEW", "Existing Candidate status reused");
check(candidate.candidate_character.identity.character_revision === character.identity.character_revision, false, "Candidate revision is separate");
check(JSON.stringify(character), candidateBefore, "Candidate generation mutated source Character");

const handoffValues = new Map();
const handoffStorage = { getItem: key => handoffValues.has(key) ? handoffValues.get(key) : null, setItem: (key, value) => handoffValues.set(key, value), removeItem: key => handoffValues.delete(key) };
storeHandoff(handoffStorage, "trainer", character);
let trainerHandoff = consumeHandoff(handoffStorage, "trainer", { character_id: character.identity.character_id, character_revision: character.identity.character_revision });
check(trainerHandoff.status, "ACCEPTED", "Trainer handoff accepts matching identity, revision, and content");
check(handoffValues.size, 0, "Accepted Trainer handoff is consumed once");
storeHandoff(handoffStorage, "trainer", character);
const tampered = JSON.parse(handoffValues.get("saku.desktop.pendingTrainerCharacter")); tampered.identity.display_name = "Tampered";
handoffValues.set("saku.desktop.pendingTrainerCharacter", JSON.stringify(tampered));
trainerHandoff = consumeHandoff(handoffStorage, "trainer", { character_id: character.identity.character_id, character_revision: character.identity.character_revision });
check(trainerHandoff.status, "REJECTED", "Trainer handoff rejects content mismatch");
check(handoffValues.size, 0, "Rejected Trainer handoff cannot be consumed later");
storeHandoff(handoffStorage, "trainer", character);
trainerHandoff = consumeHandoff(handoffStorage, "trainer", { character_id: character.identity.character_id, character_revision: character.identity.character_revision });
check(trainerHandoff.status, "ACCEPTED", "Fresh valid Trainer handoff works after rejection");

const ja = reviewCopy("ja-JP"); const en = reviewCopy("en-US");
check(ja.title, "結果を確認する", "JA Review title");
check(en.title, "Review Results", "EN Review title");
ok(`${en.boundaryTitle} ${en.boundary}`.includes("not approval"), "EN approval boundary");
ok(ja.unknown.includes("MATCH"), "JA unknown preservation");
ok(en.builder.includes("Builder"), "EN Builder handoff");
ok(!/[ぁ-んァ-ヶ一-龠]/.test(JSON.stringify(en)), "EN Review chrome has no Japanese residue");
for (const token of ["APPROVED", "CERTIFIED", "CANONICAL"]) ok(!REVIEW_STATES.includes(token), `Forbidden primary state ${token}`);

const desktopHtml = await read("desktop/index.html");
const desktopApp = await read("desktop/app.mjs");
const desktopI18n = await read("desktop/i18n.mjs");
const trainerHtml = await read("tools/saku-trainer.html");
const trainerUi = await read("tools/unified-v1/trainer-ux4-ui.mjs");
const trainerContract = await read("tools/v1/trainer-ux3.mjs");
const trainerUx4Contract = await read("tools/v1/trainer-ux4.mjs");
const trainerCss = await read("tools/unified-v1/trainer-ux4.css");
const profile = JSON.parse(await read("desktop/resources/profiles/public-oss.json"));
ok(!/id="review-results"/.test(desktopHtml) && !/id="test-with-ai"/.test(desktopHtml), "Single Trainer entry retained");
ok((desktopHtml.match(/href="\.\/tools\/saku-trainer\.html/g) || []).length === 1, "Home offers exactly one Trainer entry");
ok(trainerHtml.includes('trainer-ux4-ui.mjs'), "Actual Trainer entry loads Revision 4");
ok(trainerUi.includes("history-dialog") && trainerUi.includes("renderSummary") && trainerUi.includes("menu-result"), "Saved per-menu result, overall summary, and history are reachable");
ok(trainerUi.includes("current(session)") && trainerContract.includes("evaluation_snapshot"), "Results resolve selected exact lineage with immutable evaluation snapshot");
ok(trainerUi.includes("Review results") && !trainerUi.includes("Review approval"), "Review terminology remains distinct from approval");
ok(trainerUi.includes("consumeHandoff") && trainerUi.includes("CHARACTER_HANDOFF_"), "Character handoff fails closed");
ok(trainerContract.includes("CANDIDATE_EVALUATION_MISMATCH"), "Candidate trace rejects unrelated evaluation");
ok(trainerContract.includes("direct_tuning_targets: []"), "Generic human choices never infer tuning targets");
for(const phrase of ["02-4 このメニューの結果","03-1 SAKUを修正した方がよい点","03-2 このままでよい点","03-3 追加確認が必要な点","03-4 修正候補の詳細","03-5 次にすること","Character変更：0","Return to this menu","summary.result_ids","summary.evaluation_ids"])
  ok(trainerUi.includes(phrase), "UX4 result wording and exact summary reference: "+phrase);
ok(trainerContract.includes("TRAINER_HAS_NO_CHARACTER_WRITE_OPERATION") && trainerUx4Contract.includes("character_mutation: false"), "No-change status requires explicit no-write evidence and candidate non-mutation");
ok(trainerUi.includes("displayed_wording"), "Historical human wording is retained");
const frozenBuilderUi = await read("tools/v1/frozen-ia-ui.mjs");
ok(/consumeBuilderHandoff/.test(frozenBuilderUi) && /applyBuilderCandidates/.test(frozenBuilderUi) && /STALE \/ APPLY_BLOCKED/.test(frozenBuilderUi), "Frozen Builder does not enforce bound explicit apply");
ok(trainerCss.includes('@media(max-width:760px)') && trainerCss.includes('grid-template-columns:1fr'), "Review responsive single column");
ok(/:focus-visible/.test(trainerCss), "Visible focus missing");
ok(/overflow-wrap:\s*anywhere/.test(trainerCss), "Narrow overflow containment missing");
check(profile.internal_content_count, 0, "Public profile internal content");
for (const forbidden of ["fixed64-full", "erabazu5", "wit3", "commercial-preview", "license-unknown-content"]) ok(!profile.resources.some(item => item.id === forbidden && item.bundled), `Forbidden resource bundled: ${forbidden}`);

const builderSource = await read("tools/saku-builder.html");
ok(/builder-golden-ui\.mjs/.test(builderSource) && /frozen-ia-ui\.mjs/.test(builderSource), "Builder preserves Golden presentation with Frozen IA authoring");
check(sha256(await read("tools/unified-v1/derived-profile-engine.mjs")), "1f4ff549a3170d2b603fc15206b631dfb47e818ac5f01ef040bc34c266a9d225", "Trainer engine changed");
// Pin advanced 2026-09-20 with the reviewed Character Pack intake (Owner defect: sold packs refused by β.1;
// pack path, archive shape limits, Japanese format guidance, 0.1.0-beta.2), and again 2026-09-21 with the
// package-formats change (Owner: .witpkg / two-file envelope retired, .amupkg recognised and pointed at AMU
// Studio, bare JSON pointed at 個別インポート, packs pinned to the active Unified V1 schema). Any later
// unreviewed edit trips it again. Advanced once more the same day for PR-B (AMU saku-return intake:
// saku_return.rs cross-checks, import_saku_return writes nothing, active-schema pin), and for β.3
// (APP_VERSION 0.1.0-beta.3 only). Advanced 2026-09-23 for the shared base layer:
// `base_layer_state()` reads the bundled base layer through the asset resolver at
// startup and reports it in `get_runtime_state`.
// Advanced 2026-09-23 for the workspace-scoped list (Owner 「推奨で」,
// D-20260923-workspace-scoped-library): the workspace lock (exclusive open of
// `.saku-builder/lock`), `pick_workspace_folder` / `open_workspace` (choose =
// both), `read_workspace_state` / `write_workspace_state` /
// `write_workspace_migration_backup`, every revision kept on save, and a pack
// import that writes only with the lock. Covered by workspace:verify and five
// cargo tests.
//
// The pin is taken with APP_VERSION normalised away (2026-09-23). It had gone
// stale twice for that one line alone — at β.4, where it reached main unnoticed
// because the β.4 build never ran this gate, and again at β.5. Which version the
// host carries is not this gate's question: `docs:verify` ties APP_VERSION to the
// other six version sites and fails by name if any of them is left behind. Every
// other byte of main.rs is still pinned, so an unreviewed change to Package
// Import still trips this.
const hostSource = await read("src-tauri/src/main.rs");
const APP_VERSION_LINE = /const APP_VERSION: &str = "[^"]+";/;
ok(APP_VERSION_LINE.test(hostSource), "the host still declares APP_VERSION (the normalisation below must have something to remove)");
check(sha256(hostSource.replace(APP_VERSION_LINE, 'const APP_VERSION: &str = "<VERSION>";')), "99545217afb014d71cce485aa5898de8bef4c7e6927b4788fe528c029e6b14f0", "Package Import implementation changed outside the reviewed Unified-schema intake, Character Pack intake and durable Character store");
ok(/SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE/.test(await read("src-tauri/src/main.rs")), "Package Import host does not recognise the active Unified schema");
check(sha256(await read("desktop/resources/profiles/public-oss.json")), "6a3ae8a7faeaa719d24f0aff70d816fb8a27d99c03b47bbd4a31f2ad7a0984a4", "Public profile changed");

console.log(`TRAINER_REVIEW_RESULTS_VERIFY PASS ${count}/${count}`);
console.log("REVIEW_STATES MATCH DIFFERENT UNKNOWN NOT_TESTED INVALID PASS");
console.log("CANONICAL_MUTATION_FROM_REVIEW 0");
console.log("REVIEW_SCHEMA_REQUIRED NO");
console.log("PUBLIC_PROFILE_INTERNAL_CONTENT_COUNT 0");
