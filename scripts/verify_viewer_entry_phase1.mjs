import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageSummary, parseViewerPayload, viewerCopy } from "../desktop/viewer.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFile(path.join(ROOT, relative), "utf8");
let count = 0;
const check = (actual, expected, message) => { assert.equal(actual, expected, message); count += 1; };
const ok = (value, message) => { assert.ok(value, message); count += 1; };

const html = await read("desktop/index.html");
const app = await read("desktop/app.mjs");
const css = await read("desktop/desktop.css");
const i18n = await read("desktop/i18n.mjs");
const profile = JSON.parse(await read("desktop/resources/profiles/public-oss.json"));
const sample = JSON.parse(await read("desktop/resources/source/oss-sample-characters.json"));

for (const id of ["view-characters", "create-edit-character", "run-on-ai-platform", "train-character"]) ok(html.includes(`id="${id}"`), `missing home entry ${id}`);
ok(/saku-trainer\.html/.test(html), "Trainer route missing");
ok(/saku-builder\.html\?desktop=app/.test(html), "Builder route missing");
// Review Results is no longer its own Home entry: 「AIで試す」 and 「結果を確認する」
// were two doors into one Trainer. There is now one door, and Review Results
// lives inside the Trainer it opens. The deep route still has to work.
ok(/id="train-character" href="\.\/tools\/saku-trainer\.html"/.test(html), "single Trainer entry on Home");
for (const id of ["viewer-panel", "viewer-empty", "viewer-import-package", "viewer-results", "viewer-detail", "viewer-package-fields"]) ok(html.includes(`id="${id}"`), `missing Viewer control ${id}`);
ok(/表示できるCharacterがまだありません/.test(html), "empty state missing");
ok(/@media\(max-width:900px\).*\.entry-grid.*grid-template-columns:1fr/s.test(css), "one-column responsive rule missing");
ok(/focus-visible/.test(css), "keyboard focus style missing");

const frozen = structuredClone(sample);
const parsedUnknown = parseViewerPayload(frozen, { status: "UNKNOWN" });
check(parsedUnknown.records.length, 3, "Sample payload record count");
check(parsedUnknown.records[0].availability, "UNKNOWN", "Unverified data must not become available");
check(parsedUnknown.records[0].revision, "1.0.0-unified-v1-candidate", "revision projection");
check(parsedUnknown.records[0].one_plus_seven, "8/8 seats configured", "1+7 projection");
check(parsedUnknown.records[0].expected_profile, "NOT_CONFIGURED", "unprovided Expected Profile remains unconfigured");
check(JSON.stringify(frozen), JSON.stringify(sample), "Viewer projection mutated Character data");
check(parseViewerPayload("{broken").parse_status, "INVALID", "invalid payload must fail closed");
check(parseViewerPayload(sample, { status: "INVALID" }).records[0].availability, "UNAVAILABLE", "invalid package promoted to available");
check(parseViewerPayload(sample, { status: "IMPORTED" }).records[0].availability, "AVAILABLE", "validated import availability");

const summary = packageSummary({ status: "UNSUPPORTED", code: "PACKAGE_VERSION_UNSUPPORTED", reason: "unsupported", manifest: { product: "SAKU", package_version: "9", minimum_app_version: "99", payload_hash: "abc" } });
check(summary.status, "UNSUPPORTED", "package status projection");
check(summary.compatibility, "99", "package compatibility projection");
check(summary.payload_hash, "abc", "package hash projection");
check((app.match(/choose_and_import_package/g) || []).length, 1, "Viewer must reuse the one native package import command");
ok(/\$\("viewer-import-package"\)\.addEventListener\("click", choosePackage\)/.test(app), "Viewer import does not reuse choosePackage");
ok(!/location\.replace\("\.\/tools\/saku-builder\.html\?desktop=app"\)/.test(app), "Desktop home still auto-redirects");
ok(/localStorage\.getItem\("saku\.desktop\.pendingCharacter"\)/.test(app), "existing handoff data is not reused");
// The screen is no longer a read-only view of the last import: the Owner asked
// for a list they build up, so it now imports, deletes and creates. What must
// still hold is that nothing destroys work silently.
ok(/window\.confirm\([^)]*クリアー/.test(app), "clearing the list must be confirmed first");
ok(/Library\.setDeleted\(/.test(app) && !/entries\.splice|entries\.filter\(entry => !ids/.test(app), "deleting a Character must set a flag, not remove the row");
ok(/currentImportResult = result/.test(app), "current import validation result is not retained for Viewer entry");
ok((app.match(/dataset\.runtimeValue/g) || []).length >= 4, "Character/package runtime values are not protected from UI translation");
check(viewerCopy("ja-JP").test, "Trainerで試す", "JA Viewer copy");
check(viewerCopy("en-US").edit, "Create editable copy in Builder", "EN Viewer copy");
for (const label of ["View Characters", "Test with AI", "Review Results", "Create / Edit Character"]) ok(i18n.includes(label), `missing EN label ${label}`);
ok(/aria-live="polite"/.test(html), "status accessibility announcement missing");

check(profile.internal_content_count, 0, "public profile internal content");
for (const forbidden of ["fixed64-full", "erabazu5", "wit3", "commercial-preview", "license-unknown-content"]) ok(!profile.resources.some(item => item.id === forbidden && item.bundled), `forbidden resource bundled: ${forbidden}`);
const currentGolden = await read("tools/saku-builder.html");
ok(/builder-golden-ui\.mjs/.test(currentGolden) && /frozen-ia-ui\.mjs/.test(currentGolden), "Golden presentation and Frozen IA authoring layers coexist");

console.log(`VIEWER_ENTRY_PHASE1_VERIFY PASS ${count}/${count}`);
console.log("VIEWER_CHARACTER_DATA_MUTATION 0");
console.log("PUBLIC_PROFILE_INTERNAL_CONTENT_COUNT 0");
