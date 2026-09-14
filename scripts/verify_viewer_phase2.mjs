import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogFacets, compareCharacters, filterCatalog, packageSummary, parseViewerPayload, viewerCopy } from "../desktop/viewer.mjs";

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
const original = JSON.stringify(sample);
const importedContext = { status: "IMPORTED", code: "PACKAGE_IMPORTED", reason: "ok", manifest: { product: "SAKU", package_version: "1.2.0", minimum_app_version: "0.1.0", payload_hash: "a".repeat(64) } };
const parsed = parseViewerPayload(sample, importedContext);

check(parsed.records.length, 3, "Catalog payload count");
check(parsed.records[0].availability, "AVAILABLE", "Imported availability");
check(parsed.records[0].package_state, "IMPORTED", "Package state projection");
check(parsed.records[0].category, "UNKNOWN", "unprovided Category remains unknown");
check(parsed.records[0].axes.length, 15, "15 axes projection");
check(parsed.records[0].axes_summary, "15/15 axes configured", "15 axes summary");
ok(parsed.records[0].expertise !== "NOT_CONFIGURED", "Expertise summary missing");
check(parsed.records[0].expected_profile, "NOT_CONFIGURED", "unprovided Expected Profile remains unconfigured");
check(JSON.stringify(sample), original, "Viewer parsing mutated Character data");
check(JSON.stringify(parsed.records[0].source_character), JSON.stringify(sample.characters[0]), "Handoff copy differs from source");

check(filterCatalog(parsed.records, { query: "サンプル・コンパス" }).length, 1, "Name search");
check(filterCatalog(parsed.records, { query: "複数の観点" }).length, 1, "Role search");
check(filterCatalog(parsed.records, { query: "権限者判断" }).length, 1, "Non-goal search");
check(filterCatalog(parsed.records, { availability: "AVAILABLE" }).length, 3, "Availability filter");
check(filterCatalog(parsed.records, { availability: "UNAVAILABLE" }).length, 0, "Unavailable filter");
check(filterCatalog(parsed.records, { packageState: "IMPORTED" }).length, 3, "Package-state filter");
check(filterCatalog(parsed.records, { category: "UNKNOWN" }).length, 3, "Unknown Category filter");
check(filterCatalog(parsed.records, { query: "no-match" }).length, 0, "Empty result");
for (const sort of ["name", "role", "category", "revision"]) check(filterCatalog(parsed.records, { sort }).length, 3, `Sort ${sort}`);
const facets = catalogFacets(parsed.records);
ok(facets.categories.includes("UNKNOWN"), "Unknown Category facet");
check(facets.package_states.join(","), "IMPORTED", "Package-state facet");

const duplicate = structuredClone(parsed.records[0]); duplicate.id = "duplicate";
const sameRows = compareCharacters([parsed.records[0], duplicate]);
check(sameRows.length, 8, "Compare field count");
ok(sameRows.every(row => ["SAME", "NOT_AVAILABLE", "UNKNOWN"].includes(row.state)), "same values preserve explicit unavailable/unknown states");
const differentRows = compareCharacters([parsed.records[0], parsed.records[1]]);
ok(differentRows.some(row => row.state === "DIFFERENT"), "DIFFERENT classification");
const unknown = structuredClone(duplicate); unknown.role = "UNKNOWN";
check(compareCharacters([parsed.records[0], unknown]).find(row => row.field === "role").state, "UNKNOWN", "UNKNOWN classification");
const unavailable = structuredClone(duplicate); unavailable.availability = "LOCKED";
check(compareCharacters([parsed.records[0], unavailable]).find(row => row.field === "role").state, "NOT_AVAILABLE", "NOT_AVAILABLE classification");
check(compareCharacters([parsed.records[0]]).length, 0, "Compare requires two");

for (const view of ["gallery", "list", "table"]) ok(html.includes(`data-catalog-view="${view}"`), `Missing ${view} view`);
for (const id of ["catalog-search", "catalog-availability", "catalog-package-state", "catalog-category", "catalog-sort", "catalog-result-status", "compare-selection-status", "catalog-no-results", "compare-panel", "compare-output"]) ok(html.includes(`id="${id}"`), `Missing UI ${id}`);
ok(/aria-live="polite"/.test(html), "Catalog status announcement missing");
ok(/aria-label="Catalog表示"/.test(html), "View control accessible name missing");
ok(/focus-visible/.test(css), "Visible focus missing");
ok(/@media\(max-width:900px\).*\.catalog-results\.gallery.*grid-template-columns:1fr/s.test(css), "Narrow gallery not single column");
ok(/max-width:100%;overflow-x:auto/.test(css), "Table/compare overflow containment missing");

check((app.match(/choose_and_import_package/g) || []).length, 1, "Package Import command duplicated");
ok(/saku-trainer\.html\?desktop=viewer&character_id=/.test(app), "Trainer handoff route missing");
// 編集 goes to the Builder the home screen names (entry 04), which reads the
// Active SAKU on load. The guarantee is unchanged — the Builder receives an
// explicit bound copy — but it no longer travels as an identity round trip
// through the Unified V1 route, which is what made the subject vanish when the row
// key stopped being the character_id.
ok(/saku\.desktop\.pendingCharacter/.test(app) && /saku-builder\.html\?desktop=viewer-copy/.test(app), "Builder editable-copy handoff missing");
ok(!/saku-builder-unified-v1\.html/.test(app), "editable-copy handoff must not route to the legacy-schema Builder");
ok(/ActiveSaku\.setActive\(record\.source_character/.test(app), "the Builder route must set the subject before it navigates");
ok(/storeBoundCharacter\("saku\.desktop\.pendingCharacter", record\.source_character\)/.test(app) && /structuredClone\(characterOrPayload\)/.test(app), "Builder handoff does not use explicit bound copy");
ok(/Viewer data mutation: 0/.test(app), "Read-only status missing");
ok(/SAME \/ DIFFERENT \/ UNKNOWN \/ NOT_AVAILABLE/.test(html), "Compare state disclosure missing");
ok(/HANDOFF_SOURCE_NOT_FOUND/.test(app), "Handoff recovery text missing");

for (const phrase of ["Find Characters", "Search by name, role, or category", "Compare selected Characters", "Character comparison", "Clear search and filters"]) ok(i18n.includes(phrase), `Missing EN string ${phrase}`);
check(viewerCopy("ja-JP").compare, "選択したCharacterを比較", "JA compare copy");
check(viewerCopy("en-US").edit, "Create editable copy in Builder", "EN Builder safety copy");

check(packageSummary({ status: "INVALID" }).status, "INVALID", "Invalid state retained");
check(parseViewerPayload(sample, { status: "INVALID" }).records[0].availability, "UNAVAILABLE", "Invalid state fail-closed");
check(parseViewerPayload(sample, { status: "UNSUPPORTED" }).records[0].availability, "UNAVAILABLE", "Incompatible state fail-closed");
check(parseViewerPayload(sample, { status: "UNKNOWN" }).records[0].availability, "UNKNOWN", "Unknown state fail-closed");
check(parseViewerPayload(sample, { status: "LOCKED" }).records[0].availability, "LOCKED", "Locked state retained");
check(parseViewerPayload("{broken").parse_status, "INVALID", "Malformed payload fail-closed");

check(profile.internal_content_count, 0, "Public profile internal content");
for (const forbidden of ["fixed64-full", "erabazu5", "wit3", "commercial-preview", "license-unknown-content"]) ok(!profile.resources.some(item => item.id === forbidden && item.bundled), `Forbidden resource bundled: ${forbidden}`);
const builderSource = await read("tools/saku-builder.html");
ok(/builder-golden-ui\.mjs/.test(builderSource) && /frozen-ia-ui\.mjs/.test(builderSource), "Builder preserves Golden presentation with Frozen IA authoring");
check(JSON.stringify(sample), original, "Catalog/compare tests mutated Character data");

console.log(`VIEWER_PHASE2_VERIFY PASS ${count}/${count}`);
console.log("CATALOG_GALLERY_LIST_TABLE PASS");
console.log("COMPARE SAME_DIFFERENT_UNKNOWN_NOT_AVAILABLE PASS");
console.log("VIEWER_CHARACTER_DATA_MUTATION 0");
console.log("PUBLIC_PROFILE_INTERNAL_CONTENT_COUNT 0");
