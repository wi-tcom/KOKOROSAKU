// AI speed test (paste mode) gate — Owner GO 2026-09-20 acceptance conditions 1–6.
//
//  1 probe pack parity: text digests equal the AMU DEFAULT_PROBES pin and the
//    ERABAZU canon pack (sha256: notation) byte-copied from AMU vendor 409b4a2;
//  2 equivalence: AMU main 944151e4 vectors replay identically through the
//    Builder core (answerFacts / makeRun / aggregate / diffAnswers incl. empty
//    answer = zero lines / compareSessions);
//  3 mode !== 'paste' → SPEED_RUN_MODE_INVALID; no provider/model, stop before
//    start → no run;
//  4 keep_text off → stored bytes carry no answer text, line digests present,
//    digests are one-way;
//  5 only saku.trainer.speedTest.v1.* is written; frozen-ia and intake records
//    are byte-identical before/after;
//  6 browser: the manual-measurement sentence accompanies every time display,
//    no first-byte / 初動 column, 390 px no horizontal overflow, JA/EN.
// Each rule that refuses is also falsified in a temporary module copy.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFile(path.join(ROOT, relative), "utf8");
const sha256 = text => createHash("sha256").update(text, "utf8").digest("hex");
const cases = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)})`); cases.push(label); };
const same = (actual, expected, label) => { assert.equal(JSON.stringify(actual), JSON.stringify(expected), `${label}\n  got ${JSON.stringify(actual)}\n  exp ${JSON.stringify(expected)}`); cases.push(label); };

const CORE = "tools/v1/speed-test.mjs";
const STORE = "tools/v1/speed-test-store.mjs";
const Core = await import(pathToFileURL(path.join(ROOT, CORE)).href);
const Store = await import(pathToFileURL(path.join(ROOT, STORE)).href);
const Contract = await import(pathToFileURL(path.join(ROOT, "tools/v1/trainer-frozen-ia.mjs")).href);
const Intake = await import(pathToFileURL(path.join(ROOT, "tools/v1/external-review-intake.mjs")).href);

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
const snapshot = (store, prefix = "") => JSON.stringify([...store.values.entries()].filter(([key]) => key.startsWith(prefix)).sort());

// ── 1. probe pack parity ───────────────────────────────────────────────────
const erabazu = JSON.parse(await read("tests/fixtures/speed-test/erabazu-speed-test-probe-pack.default.json"));
equal(sha256(await read("tests/fixtures/speed-test/erabazu-speed-test-probe-pack.default.json")), "663e2bba394dc21e093f8b09e3767f21d6d5e5c160145dda050bfa1ddcfe2591", "ST-PACK ERABAZU canon pack bytes (AMU vendor 409b4a2 PROVENANCE)");
equal(erabazu.pack_id, Core.ERABAZU_PROBE_PACK_ID, "ST-PACK ERABAZU pack id pinned");
equal(erabazu.schema, "erabazu.candidate/speed-test-probe-pack/v1", "ST-PACK ERABAZU schema");
const vectors = JSON.parse(await read("tests/fixtures/speed-test/amu-vectors.944151e4.json"));
equal(vectors.source.main_revision, "944151e4", "ST-VEC vectors come from AMU main 944151e4");
equal(Core.DEFAULT_PROBES.length, 4, "ST-PACK four probes");
for (const probe of Core.DEFAULT_PROBES) {
  const hex = sha256(probe.text);
  equal(hex, Core.PROBE_DIGESTS[probe.id], `ST-PACK ${probe.id} text matches the Builder pin`);
  const canon = erabazu.probes.find(item => item.id === probe.id);
  equal(`sha256:${hex}`, canon?.digest, `ST-PACK ${probe.id} text matches the ERABAZU canon digest (sha256: notation)`);
  equal(probe.text, canon.text, `ST-PACK ${probe.id} text equals the ERABAZU canon text`);
  same(probe.expect, canon.expect, `ST-PACK ${probe.id} expect rule equals the ERABAZU canon`);
  const amu = vectors.pack.probes.find(item => item.id === probe.id);
  equal(`sha-256:${hex}`, amu?.digest, `ST-PACK ${probe.id} matches the AMU DEFAULT_PROBES digest (sha-256: notation)`);
}
const pack = await Core.buildProbePack();
same(pack, vectors.pack, "ST-PACK buildProbePack output equals the AMU pack");

// ── 2. equivalence with the AMU vectors ────────────────────────────────────
for (const vector of vectors.facts) same(Core.answerFacts(vector.text, vector.expect), vector.out, `ST-VEC answerFacts ${JSON.stringify(vector.text).slice(0, 24)}`);
for (const vector of vectors.paste_runs) {
  const out = await Core.makeRun({ ...vector.input });
  const { line_digests, ...answer } = out.answer;
  same({ ...out, answer }, vector.out, `ST-VEC makeRun paste ${vector.input.at} (minus Builder line_digests)`);
  check(Array.isArray(line_digests) && line_digests.every(digest => /^sha-256:[0-9a-f]{64}$/.test(digest)) && line_digests.length === out.answer.lines, `ST-VEC makeRun ${vector.input.at} carries one line digest per normalized line`);
}
for (const vector of vectors.aggregates) same(Core.aggregate(vector.runs, vector.options), vector.out, `ST-VEC aggregate ${vector.label}`);
for (const vector of vectors.diffs) same(Core.diffAnswers(vector.a, vector.b), vector.out, `ST-VEC diffAnswers ${JSON.stringify([vector.a, vector.b]).slice(0, 30)}`);
check(vectors.diffs.some(vector => vector.a === "" && vector.b === "" && vector.out.ops.length === 0), "ST-VEC empty answer = zero lines is among the vectors (N-1)");
for (const vector of vectors.compares) same(Core.compareSessions(vector.before, vector.after, vector.options), vector.out, `ST-VEC compareSessions ${vector.out.speed_change}`);
same(Core.DEFAULT_THRESHOLDS, { fastMs: 2000, slowMs: 8000, minRuns: 3 }, "ST-VEC thresholds equal the AMU defaults");
const ld = Core.diffLineDigests(await Core.lineDigests("a\nb\nc"), await Core.lineDigests("a\nx\nc\nd"));
check(ld.similarity === 0.571 && ld.added === 2 && ld.removed === 1 && ld.ops.every(op => !("text" in op) && /^sha-256:/.test(op.line_digest)), "ST-VEC line-digest diff reproduces the text diff shape without any line text");

// ── 3. refusals ────────────────────────────────────────────────────────────
const probe = pack.probes[0];
const base = { probe, provider_ref: "external/chat-ui", model_ref: "unknown", measurement: { total_ms: 4200 }, answerText: "了解", at: "2026-09-20T01:00:00.000Z" };
await assert.rejects(Core.makeRun({ ...base, mode: "automatic" }), error => error.code === "SPEED_RUN_MODE_INVALID"); cases.push("ST-MODE automatic refused");
await assert.rejects(Core.makeRun({ ...base, mode: "stream" }), error => error.code === "SPEED_RUN_MODE_INVALID"); cases.push("ST-MODE stream refused");
await assert.rejects(Core.makeRun({ ...base, provider_ref: "" }), error => error.code === "SPEED_RUN_INVALID"); cases.push("ST-RUN missing provider → no run");
await assert.rejects(Core.makeRun({ ...base, model_ref: "  " }), error => error.code === "SPEED_RUN_INVALID"); cases.push("ST-RUN missing model → no run");
await assert.rejects(Core.makeRun({ ...base, probe: { id: "echo-1" } }), error => error.code === "SPEED_RUN_INVALID"); cases.push("ST-RUN probe without digest → no run");
const store = storage();
const foreign = { ...(await Core.makeRun(base)), mode: "automatic" };
equal(Store.recordRun(store, foreign).code, "SPEED_RUN_MODE_INVALID", "ST-MODE store refuses a non-paste run");
equal(store.values.size, 0, "ST-MODE refused run writes nothing");
equal(Store.recordRun(store, { schema: "amu.ai-speed-test-run/1", mode: "paste" }).code, "SPEED_RUN_INVALID", "ST-RUN store refuses an incomplete run");

// ── 4. text not kept by default; line digests kept; one-way ────────────────
const frozenBefore = snapshot(store);
const run = await Core.makeRun({ ...base, answerText: "了解\n二行目" });
check(!("text" in run.answer), "ST-TEXT keep_text off → run has no answer.text");
const recorded = Store.recordRun(store, run, { sessionLabel: "gate" });
equal(recorded.code, "SPEED_RUN_RECORDED", "ST-STORE paste run recorded");
const storedText = store.getItem(Store.speedTestRunKey(recorded.record.run_id));
check(!storedText.includes('"text"') && !storedText.includes("了解") && !storedText.includes("二行目"), "ST-TEXT stored bytes contain neither the text key nor the answer content");
check(JSON.parse(storedText).run.answer.line_digests.length === 2, "ST-TEXT line_digests stored (2 lines)");
check(JSON.parse(storedText).run.answer.line_digests[0] === `sha-256:${sha256("了解")}`, "ST-TEXT line digest is sha-256 of the normalized line (one-way)");
const kept = await Core.makeRun({ ...base, at: "2026-09-20T01:01:00.000Z", answerText: "了解", keepText: true });
const keptRecord = Store.recordRun(store, kept, { sessionLabel: "gate" });
check(store.getItem(Store.speedTestRunKey(keptRecord.record.run_id)).includes('"text":"了解"'), "ST-TEXT explicit opt-in keeps the text");
const listed = Store.listRuns(store);
equal(listed.records.length, 2, "ST-STORE list returns both runs");
const groups = Store.groupRuns(listed.records, Core.DEFAULT_THRESHOLDS);
equal(groups.length, 1, "ST-STORE runs of one probe/provider/model/label form one group");
equal(groups[0].aggregate.speed, "NOT_ASSESSED", "ST-AGG two runs < minRuns → NOT_ASSESSED");
equal(groups[0].aggregate.stability, "DRIFTED", "ST-AGG two different answers → DRIFTED");
const diff = Store.diffAgainstPrevious(groups[0].records[1], groups[0].records[0]);
check(diff.available && diff.basis === "LINE_DIGESTS_ONLY" && diff.removed === 1 && diff.added === 0 && diff.ops.every(op => !("text" in op)), "ST-DIFF previous-run diff works from line digests without text");
equal(Store.diffAgainstPrevious(groups[0].records[0], null).available, false, "ST-DIFF first run has no previous");
same(Store.compareGroups(groups[0], groups[0]), { speed_change: "SIMILAR", ratio: 1, model_changed: false, answer_change: "VARIES_WITHIN_SESSION" }, "ST-CMP a group compared with itself is SIMILAR (median exists even below minRuns)");
const unreachableOnly = Store.groupRuns([{ session_label: "x", run: await Core.makeRun({ ...base, measurement: { reachable: false }, answerText: "" }) }], Core.DEFAULT_THRESHOLDS)[0];
same(Store.compareGroups(groups[0], unreachableOnly), { speed_change: "NOT_COMPARABLE", answer_change: "NOT_COMPARABLE" }, "ST-CMP no median on one side → NOT_COMPARABLE");
const third = Store.recordRun(store, await Core.makeRun({ ...base, at: "2026-09-20T01:02:00.000Z", measurement: { total_ms: 1500 }, answerText: "了解" }), { sessionLabel: "gate" });
const threeGroup = Store.groupRuns(Store.listRuns(store).records, Core.DEFAULT_THRESHOLDS)[0];
equal(threeGroup.aggregate.speed, "NORMAL", "ST-AGG three runs → speed assessed (median 4200 → NORMAL)");
equal(Store.groupRuns(Store.listRuns(store).records, { fastMs: 5000, slowMs: 9000, minRuns: 3 })[0].aggregate.speed, "FAST", "ST-AGG thresholds are honoured and echoed");
same(Store.groupRuns(Store.listRuns(store).records, { fastMs: 5000, slowMs: 9000, minRuns: 3 })[0].aggregate.thresholds, { fastMs: 5000, slowMs: 9000, minRuns: 3 }, "ST-AGG thresholds recorded per aggregate");
const exported = Store.exportRuns(store);
check(exported.records.length === 3 && exported.manual_measurement.includes("手動計測") && !JSON.stringify(exported.records[0]).includes('"text"'), "ST-EXPORT export carries the manual sentence and no unkept text");
equal(Store.deleteRun(store, third.record.run_id).code, "SPEED_RUN_DELETED", "ST-STORE explicit delete");
equal(Store.listRuns(store).records.length, 2, "ST-STORE deleted run is gone from the list");
const tampered = JSON.parse(store.getItem(Store.speedTestRunKey(recorded.record.run_id))); tampered.run.total_ms = 1; store.setItem(Store.speedTestRunKey(recorded.record.run_id), JSON.stringify(tampered));
check(Store.listRuns(store).problems.some(item => item.code === "STORAGE_RECORD_TAMPERED"), "ST-STORE tampered record is reported, not shown");

// storage failure paths
const failItem = storage(); failItem.setItem = key => { if (key.startsWith(Store.SPEED_TEST_KEYS.runPrefix)) throw new Error("QUOTA"); };
const itemFailure = Store.recordRun(failItem, run);
check(itemFailure.code === "STORAGE_WRITE_FAILED" && itemFailure.recorded === false && failItem.values.size === 0, "ST-STORE item write failure → not recorded, nothing left");
const failIndex = storage(); const realSet = failIndex.setItem; failIndex.setItem = (key, value) => { if (key === Store.SPEED_TEST_KEYS.index) throw new Error("QUOTA"); return realSet(key, value); };
const indexFailure = Store.recordRun(failIndex, run);
check(indexFailure.code === "STORAGE_WRITE_FAILED" && indexFailure.recorded === false && failIndex.values.size === 0, "ST-STORE index write failure rolls the item back");

// ── 5. namespace and neighbours untouched ──────────────────────────────────
check([...store.values.keys()].every(key => key.startsWith("saku.trainer.speedTest.v1.")), "ST-NS only saku.trainer.speedTest.v1.* written");
const frozenKeys = [...Object.values(Contract.TRAINER_HANDOFF_KEYS), Contract.TRAINER_BUILDER_CONTEXT_KEY, ...Object.values(Contract.SESSION_KEYS), Intake.EXTERNAL_REVIEW_KEYS.index];
check(frozenKeys.every(key => store.getItem(key) === null), "ST-NS no frozen-ia / intake key written");
// A storage that already holds an intake record and a Trainer transport stays byte-identical outside the speed-test namespace.
const shared = storage();
shared.setItem(Intake.EXTERNAL_REVIEW_KEYS.index, JSON.stringify({ schema_id: "saku.trainer.external-review-index@1", candidate_ids: [] }));
shared.setItem(Contract.TRAINER_HANDOFF_KEYS.payload, "{\"kept\":true}");
shared.setItem(Contract.SESSION_KEYS.index, "[]");
const outside = () => JSON.stringify([...shared.values.entries()].filter(([key]) => !key.startsWith(Store.SPEED_TEST_KEYS.runPrefix) && key !== Store.SPEED_TEST_KEYS.index).sort());
const before = outside();
Store.recordRun(shared, run, { sessionLabel: "shared" });
Store.recordRun(shared, kept, { sessionLabel: "shared" });
Store.deleteRun(shared, Store.listRuns(shared).records[0].run_id);
equal(outside(), before, "ST-NS intake / handoff / session keys byte-identical after record + delete");
check(Store.listRuns(shared).records.length === 1 && Intake.listExternalReviews(shared).records.length === 0 && Contract.consumeBuilderHandoff(storage(), {}).status === "EMPTY", "ST-NS neighbouring contracts unaffected");
const moduleText = await read(CORE);
const storeText = await read(STORE);
const uiText = await read("tools/unified-v1/speed-test-ui.mjs");
for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", "navigator.sendBeacon", "createChangeCandidate", "storeBuilderHandoff", "saveSession", "createSession", "storeExternalReview", "setActive", "updateDraft", "applyBuilderCandidates"]) {
  check(!moduleText.includes(forbidden) && !storeText.includes(forbidden) && !uiText.includes(forbidden), `ST-BOUNDARY no ${forbidden} in core / store / page`);
}
check(!/first_byte|初動/.test(uiText), "ST-UI page controller has no first-byte / 初動 column (N-4)");
check(uiText.includes("MANUAL_MEASUREMENT") && moduleText.includes("手動計測。コピー＆ペーストの時間を含む"), "ST-UI manual-measurement sentence is the one from the core");

// ── falsification ──────────────────────────────────────────────────────────
const falsifications = [
  ["ST-FALSIFY mode rule", CORE, 'if (mode !== PASTE_MODE) throw failure("SPEED_RUN_MODE_INVALID"', 'if (false) throw failure("SPEED_RUN_MODE_INVALID"', async mutated => { let code = "ACCEPTED"; try { await mutated.makeRun({ ...base, mode: "automatic" }); } catch (error) { code = error.code; } return code !== "SPEED_RUN_MODE_INVALID"; }],
  ["ST-FALSIFY provider/model rule", CORE, "if (!nonEmpty(provider_ref) || !nonEmpty(model_ref)) throw", "if (false) throw", async mutated => { try { await mutated.makeRun({ ...base, provider_ref: "" }); return true; } catch { return false; } }],
  ["ST-FALSIFY keep_text rule", CORE, "...(keepText ? { text } : {})", "text", async mutated => "text" in (await mutated.makeRun(base)).answer],
  ["ST-FALSIFY minRuns rule", CORE, "ok.length < minRuns || median === null", "median === null", async mutated => mutated.aggregate(vectors.aggregates.find(v => v.label === "below-minRuns").runs).speed !== "NOT_ASSESSED"],
  ["ST-FALSIFY empty-answer rule", CORE, 'return normalized ? normalized.split("\\n") : [];', 'return normalized.split("\\n");', async mutated => mutated.diffAnswers("", "").ops.length !== 0],
];
for (const [label, file, from, to, probeFn] of falsifications) {
  const text = await read(file);
  check(text.includes(from), `${label}: target rule present`);
  const mutatedPath = path.join(ROOT, path.dirname(file), `__st_falsify_${cases.length}.mjs`);
  await writeFile(mutatedPath, text.replace(from, to), "utf8");
  try { check(await probeFn(await import(pathToFileURL(mutatedPath).href)), `${label}: disabling the rule changes the behaviour (rule is live)`); }
  finally { await rm(mutatedPath, { force: true }); }
}

// ── 6. browser ─────────────────────────────────────────────────────────────
const packagedPages = ["/tooling/builder/speed-test.html"];
try { await readFile(path.join(ROOT, ".desktop-dist/tools/saku-speed-test.html")); packagedPages.push("/.desktop-dist/tools/saku-speed-test.html"); }
catch { cases.push("ST-PACKAGED .desktop-dist not prepared in this run — desktop copy not loaded"); }
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const harness = `<!doctype html><meta charset="utf-8"><pre id="report">RUNNING</pre><script type="module">
const checks=[],check=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async fn=>{for(let i=0;i<400;i++){if(fn())return;await wait(25);}throw new Error('TIMEOUT');};
let frame,doc,win;
const load=async()=>{if(frame)frame.remove();frame=document.createElement('iframe');frame.style.cssText='width:1280px;height:950px';frame.src='/tools/saku-speed-test.html';document.body.append(frame);await new Promise(resolve=>frame.onload=resolve);doc=frame.contentDocument;win=frame.contentWindow;await until(()=>doc.getElementById('st-probes'));};
const visible=el=>Boolean(el)&&el.offsetParent!==null&&el.getBoundingClientRect().height>0;
const set=(id,value)=>{const el=doc.getElementById(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
const manualEverywhere=()=>{const times=[...doc.querySelectorAll('[data-time]')];return times.length>0&&times.every(el=>{const card=el.closest('.st-probe, .st-group, #st-notice, #st-compare, .card');return card&&card.querySelector('[data-manual-measurement]');});};
try{
 localStorage.clear();await load();
 check(doc.querySelectorAll('.st-probe').length===4,'ST-UI four probe cards');
 check(visible(doc.querySelector('#st-boundary [data-manual-measurement]')),'ST-UI manual-measurement sentence visible at the top');
 check(!doc.body.innerText.includes('初動')&&!doc.body.innerText.includes('first_byte')&&!doc.body.innerText.toLowerCase().includes('first byte'),'ST-UI no first-byte / 初動 column (N-4)');
 check(manualEverywhere(),'ST-UI every time display sits in a card carrying the manual-measurement sentence (initial)');
 // stop before start → refused, nothing recorded
 check(doc.querySelector('[data-stop="echo-1"]').disabled,'ST-UI stop is disabled before start');
 // start without provider/model → measurement discarded
 doc.querySelector('[data-start="echo-1"]').click();await wait(150);
 check(doc.getElementById('st-probe-echo-1').dataset.running==='true','ST-UI stopwatch runs');
 doc.querySelector('[data-stop="echo-1"]').click();await until(()=>doc.getElementById('st-notice')?.dataset.code==='SPEED_RUN_INVALID');
 check(win.__saku_speed_test.getRuns().length===0,'ST-UI missing provider/model → no run recorded');
 set('st-provider','external/chat-ui');set('st-model','gate-model');set('st-session','gate');
 // a real paste run with text not kept
 doc.querySelector('[data-start="echo-1"]').click();await wait(350);
 doc.getElementById('st-answer-echo-1').value='了解';
 doc.querySelector('[data-stop="echo-1"]').click();await until(()=>doc.getElementById('st-notice')?.dataset.code==='SPEED_RUN_RECORDED');
 const runs=win.__saku_speed_test.getRuns();check(runs.length===1&&runs[0].run.mode==='paste'&&runs[0].run.reachable===true&&runs[0].run.total_ms>=300,'ST-UI paste run recorded with the stopwatch time');
 check(!('text' in runs[0].run.answer)&&runs[0].run.answer.line_digests.length===1&&runs[0].run.answer.conformance==='CONFORMS','ST-UI default keeps line digests, not text');
 check(!JSON.stringify(Object.entries(localStorage)).includes('"text":"了解"'),'ST-UI storage bytes hold no answer text by default');
 check(Object.keys(localStorage).every(key=>key.startsWith('saku.trainer.speedTest.v1.')),'ST-UI only the speed-test namespace was written');
 check(manualEverywhere(),'ST-UI every time display sits in a card carrying the manual-measurement sentence (with records)');
 check(doc.querySelector('#st-results .st-runs')&&doc.querySelectorAll('#st-results .st-runs tbody tr').length===1,'ST-UI run table shows the run');
 // no-answer run
 doc.querySelector('[data-start="count-1"]').click();await wait(120);doc.querySelector('[data-noanswer="count-1"]').click();await until(()=>win.__saku_speed_test.getRuns().length===2);
 check(win.__saku_speed_test.getRuns().some(r=>r.run.reachable===false&&r.run.total_ms===null),'ST-UI no-answer run recorded as unreachable');
 // keep text opt-in
 doc.getElementById('st-keep-text').checked=true;doc.getElementById('st-keep-text').dispatchEvent(new Event('change',{bubbles:true}));
 doc.querySelector('[data-start="echo-1"]').click();await wait(120);doc.getElementById('st-answer-echo-1').value='了解';doc.querySelector('[data-stop="echo-1"]').click();await until(()=>win.__saku_speed_test.getRuns().length===3);
 check(win.__saku_speed_test.getRuns().some(r=>r.run.answer.text==='了解'),'ST-UI explicit opt-in keeps the text for that run only');
 check(doc.querySelectorAll('#st-results .st-group').length===2,'ST-UI two groups (echo-1, count-1)');
 check(doc.querySelector('#st-results').innerText.includes('NOT_ASSESSED'),'ST-UI below minRuns shows NOT_ASSESSED, not a guess');
 // thresholds editable and echoed
 set('st-min','1');await wait(100);check(doc.querySelector('#st-results').innerText.includes('min 1'),'ST-UI thresholds edited in UI are echoed with the aggregate');
 // EN
 set('locale','en');await wait(120);check(doc.body.innerText.includes('Manual measurement. Times include the human copy & paste.'),'ST-UI EN sentence present');check(manualEverywhere(),'ST-UI manual sentence everywhere in EN');
 set('locale','ja');await wait(120);
 // controls: no automatic mode, no send
 const controls=[...doc.querySelectorAll('button, a.button-link')].map(el=>(el.id||el.dataset.copy||el.dataset.start||'')+'|'+el.textContent.trim());
 check(!controls.some(label=>/送信|send|automatic|自動|apply|適用/i.test(label)),'ST-UI no send / automatic / apply control ('+controls.length+' controls)');
 frame.style.width='390px';await wait(150);check(doc.documentElement.scrollWidth<=doc.documentElement.clientWidth+1,'ST-UI 390px no horizontal overflow');
 for(const packaged of ${JSON.stringify(packagedPages)}){const pframe=document.createElement('iframe');pframe.style.cssText='width:1280px;height:900px';pframe.src=packaged;document.body.append(pframe);await new Promise(resolve=>pframe.onload=resolve);const pdoc=pframe.contentDocument;await until(()=>pdoc.getElementById('st-probes'));check(pdoc.querySelectorAll('.st-probe').length===4&&pdoc.querySelector('#to-trainer').getAttribute('href').endsWith('trainer.html'),'ST-PACKAGED '+packaged+' boots with resolved imports');pframe.remove();}
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',passed:checks.length,checks});document.getElementById('report').dataset.status='PASS';
}catch(error){document.getElementById('report').textContent=JSON.stringify({status:'FAIL',passed:checks.length,error:String(error.stack||error),checks,body:doc?.body.innerText.slice(-2500)});document.getElementById('report').dataset.status='FAIL';}
</script>`;
const mime = { ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json" };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/__st__") { response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(harness); return; }
    const file = path.resolve(ROOT, decodeURIComponent(url.pathname).replace(/^\//, ""));
    if (!file.startsWith(ROOT + path.sep)) throw new Error("outside root");
    response.setHeader("Content-Type", `${mime[path.extname(file)] || "text/plain"};charset=utf-8`);
    response.end(await readFile(file));
  } catch { response.statusCode = 404; response.end("not found"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const profile = await mkdtemp(path.join(tmpdir(), "saku-st-browser-"));
const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let output = ""; let stderr = ""; let socket;
child.stderr.on("data", chunk => stderr += chunk);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let port = 0;
  for (let i = 0; i < 200 && !port; i++) { const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (match) port = Number(match[1]); else await pause(100); }
  if (!port) throw new Error(`CHROME_NOT_READY ${stderr.slice(-500)}`);
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/__st__`)}`, { method: "PUT" })).json();
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

console.log(`SPEED_TEST_PASTE_MODE PASS ${cases.length}/${cases.length}`);
for (const label of cases) console.log(`  PASS ${label}`);
console.log("PROBE_PACK_PARITY AMU 944151e4 + ERABAZU 409b4a2 / VECTORS AMU 944151e4 / TEXT_DEFAULT NOT_KEPT (line_digests kept) / MODE paste only / NETWORK NONE");
