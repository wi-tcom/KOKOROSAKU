import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareDesktopAssets } from "./prepare_desktop_assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFile(path.join(ROOT, relative), "utf8");
const json = async relative => JSON.parse(await read(relative));
const exists = async relative => stat(path.join(ROOT, relative)).then(() => true, () => false);
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}

const packageJson = await json("package.json");
assert.equal(packageJson.devDependencies["@tauri-apps/cli"], "2.11.4");
assert.equal(packageJson.engines.node, "24.19.0");
assert.equal(packageJson.engines.npm, "11.17.0");
assert.equal((await read(".node-version")).trim(), "24.19.0");

const rustToolchain = await read("rust-toolchain.toml");
assert.match(rustToolchain, /channel = "1\.97\.1"/);
const cargo = await read("src-tauri/Cargo.toml");
for (const pin of ["tauri = { version = \"=2.11.5\"", "tauri-build = { version = \"=2.6.3\"", "flate2 = \"=1.1.9\"", "rfd = \"=0.17.2\"", "serde_json = \"=1.0.151\"", "sha2 = \"=0.11.0\""]) assert.ok(cargo.includes(pin), `missing exact Cargo pin: ${pin}`);

const config = await json("src-tauri/tauri.conf.json");
assert.equal(config.build.frontendDist, "../.desktop-dist");
assert.equal(Object.hasOwn(config.build, "devUrl"), false);
assert.deepEqual(config.bundle.targets, ["nsis"]);
assert.deepEqual(config.bundle.icon, [
  "icons/32x32.png",
  "icons/64x64.png",
  "icons/128x128.png",
  "icons/128x128@2x.png",
  "icons/icon.ico",
  "icons/icon.icns",
  "icons/icon.png",
]);
assert.equal(config.bundle.windows.nsis.installMode, "currentUser");
assert.equal(config.bundle.windows.nsis.displayLanguageSelector, true);
assert.deepEqual(config.bundle.windows.webviewInstallMode, { type: "downloadBootstrapper", silent: true });
assert.equal(config.app.withGlobalTauri, true);
assert.equal(config.app.windows[0].theme, "Light");
assert.equal(config.app.windows[0].backgroundColor, "#E4E6DF");
assert.match(config.app.security.csp, /connect-src[^;]*'self'/, "bundled schema fetch remains available to the Builder Save validator");
const hooks = await read("src-tauri/windows/hooks.nsh");
assert.match(hooks, /MUI_FINISHPAGE_LINK_LOCATION "\$INSTDIR"/);
assert.match(hooks, /workspace.*preserved/i);

const sourceBytes = await readFile(path.join(ROOT, "desktop/resources/source/oss-sample-characters.json"));
const evidence = await json("desktop/resources/source/sample-source-evidence.json");
assert.equal(sourceBytes.length, evidence.bytes);
assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), evidence.sha256);
const sample = JSON.parse(sourceBytes.toString("utf8"));
assert.equal(sample._meta.data_license, "CC0-1.0");
assert.equal(sample._meta.publication_authorized, true);
assert.equal(evidence.publication_authorization, true);
assert.equal(evidence.publication_decision, "D-B3");
assert.deepEqual(sample.characters.map(character => character.identity.character_id), evidence.authorized_ids);

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const brandEvidence = await json("desktop/resources/source/brand-source-evidence.json");
assert.equal(brandEvidence.source_repository, "wi-tcom/site-content");
assert.equal(brandEvidence.source_revision, "a3c24a1");
assert.equal(brandEvidence.source_path, "brand/logo/saku");
assert.equal(brandEvidence.provenance, "Owner-directed vector artwork (hand-defined SVG, rasterized with Chrome; no generative image model)");
assert.equal(brandEvidence.license, "CC-BY-4.0");
assert.equal(brandEvidence.rights_holder, "株式会社wi-t.com");
assert.equal(brandEvidence.trademark_rights_granted, false);
assert.equal(brandEvidence.copyright_scope_ja, "著作権が及ぶ範囲において");
assert.equal(sha256(await readFile(path.join(ROOT, "desktop/icon.svg"))), brandEvidence.sources["saku.svg"].sha256);
assert.equal(sha256(await readFile(path.join(ROOT, "desktop/resources/source/saku-favicon.ico"))), brandEvidence.sources["saku-favicon.ico"].sha256);
const iconHashes = {
  "32x32.png": "e7257de4af581411e8368c3c05efb047ccfe7028b2abf7db795b22f2bc1a4127",
  "64x64.png": "a52f15156bf1d3f415e7cd4dfae3585651edf1e348b016ad50506bb4efe4201d",
  "128x128.png": "44931459cd57df174a5ad44db092d4f4fa47c6439fcc7ac17310d047f7ea5097",
  "128x128@2x.png": "9fdf782b698c4cdebcfa4dc02185dd5064ac58a19d9b3e176fd4fced6035462b",
  "icon.png": "ed5cc1d4fdbc8c8a4728fac52ff64c524764ef8df8c7d3e45dd2e169ae165def",
  "icon.ico": "fb8b522e90452f924956cec5ca56eb437c9b3e218739e55b091b252feb9e14e0",
  "icon.icns": "8bd5b82edefa1b9396adbb9646911ba0bf8287b98295daceb2f33bab2b535282",
};
// App icon (Owner adoption 2026-09-21): the six Windows targets are byte copies of the Wi-t_Site files at the
// recorded revision; the evidence block names the source and says where a generative model was used.
assert.equal(brandEvidence.app_icon.source_repository, "wi-tcom/Wi-t_Site");
assert.equal(brandEvidence.app_icon.source_revision, "512f0363078bb8a6529483a8b8a47923ca10ed08");
assert.equal(brandEvidence.app_icon.source_path, "site-content/brand/app-icon/saku-builder");
assert.match(brandEvidence.app_icon.provenance, /Gemini 生成画像由来/);
assert.equal(brandEvidence.app_icon.rights_statement_owner_confirmed, "背景（和紙地）のみ Gemini 生成由来。クレジット表記の義務なし・商用利用可・背景単体には著作権を主張しない。マークの幾何は当社の公式 SVG（人間創作）。商標は付与しない。ロゴ本体の「生成モデル不使用」証跡は不変。");
assert.equal(brandEvidence.app_icon.background_rights.copyright_claimed, false);
assert.match(brandEvidence.app_icon.license, /^CC-BY-4\.0 — マークおよびアイコン全体/);
assert.equal(brandEvidence.app_icon.trademark_rights_granted, false);
for (const [name, target] of Object.entries(brandEvidence.app_icon.tauri_targets)) {
  assert.equal(iconHashes[name], target.sha256, `app icon evidence ${name}`);
  if (name !== "icon.icns") assert.equal(brandEvidence.app_icon.sources[target.source_file].sha256, target.sha256, `app icon source ${name}`);
}
for (const [name, expected] of Object.entries(iconHashes)) {
  assert.equal(sha256(await readFile(path.join(ROOT, "src-tauri/icons", name))), expected, `brand icon hash ${name}`);
}

const publicProfile = await json("desktop/resources/profiles/public-oss.json");
assert.equal(publicProfile.internal_content_count, 0);
assert.equal(publicProfile.status, "OWNER_AUTHORIZED_D_B1_D_B3");
assert.deepEqual(
  publicProfile.resources.find(item => item.id === "saku-brand-artwork"),
  { id: "saku-brand-artwork", classification: "PUBLIC_BRAND_ASSET", license_state: "CC-BY-4.0", bundled: true, trademark_rights_granted: false },
);
const internalProfile = await json("desktop/resources/profiles/owner-review-internal.json");
for (const id of ["fixed64-full", "erabazu5", "wit3"]) {
  const resource = internalProfile.resources.find(item => item.id === id);
  assert.equal(resource.bundled, false);
  assert.equal(resource.license_state, "NOT_SPECIFIED");
}

await prepareDesktopAssets("public-oss");
const publicMetadata = await json(".desktop-dist/resources/build-metadata.json");
assert.equal(publicMetadata.internal_content_count, 0);
assert.equal(publicMetadata.publication, false, "a public profile candidate is not itself a publication event");
assert.equal(await exists(".desktop-dist/tools/unified-v1/preview/catalog-preview-index.json"), false);
assert.equal(await exists(".desktop-dist/tools/unified-v1/sample-pack/sample-characters.json"), true);
assert.equal(await exists(".desktop-dist/third-party/THIRD_PARTY_LICENSE_MANIFEST.json"), true);
assert.equal(await exists(".desktop-dist/third-party/LICENSES"), true);
assert.equal(await exists(".desktop-dist/third-party/NOTICES"), true);
assert.equal(await exists(".desktop-dist/help/getting-started.html"), true);
assert.equal(await exists(".desktop-dist/help/manual.html"), true);
assert.equal(await exists(".desktop-dist/help/saku-field-guide.data.json"), true);
assert.equal(await exists(".desktop-dist/i18n.mjs"), true);
assert.equal(await exists(".desktop-dist/viewer.mjs"), true);
assert.equal(await exists(".desktop-dist/icon.svg"), true);
assert.equal(await exists(".desktop-dist/resources/brand-source-evidence.json"), true);
assert.equal(await exists(".desktop-dist/BRAND-ASSET-NOTICE.md"), true);
assert.equal(await exists(".desktop-dist/tools/saku-builder.html"), true);
assert.equal(await exists(".desktop-dist/tools/saku-builder-desktop-additions.css"), true);
assert.equal(await exists(".desktop-dist/tools/v1/builder-golden-ui.mjs"), true);
assert.equal(await exists(".desktop-dist/tools/v1/semantic-registry.mjs"), true);
assert.equal(await exists(".desktop-dist/tools/v1/adopted-schema-validator.mjs"), true);
assert.equal(await exists(".desktop-dist/tools/v1/frozen-ia-ui.mjs"), true);
assert.equal(await exists(".desktop-dist/tools/v1/trainer-frozen-ia.mjs"), true);
assert.equal(await exists(".desktop-dist/tools/v1/saku-unified-character.v1.schema.json"), true);
assert.match(await read(".desktop-dist/tools/saku-builder.html"), /saku-builder-desktop-additions\.css/);
assert.match(await read(".desktop-dist/tools/saku-builder.html"), /builder-golden-ui\.mjs/);
assert.doesNotMatch(await read(".desktop-dist/tools/saku-builder.html"), /fonts\.googleapis|fonts\.gstatic/);
assert.match(await read(".desktop-dist/tools/saku-builder-unified-v1.html"), /<html lang="ja" data-theme="light">/);
assert.match(await read(".desktop-dist/tools/saku-trainer.html"), /<html lang="ja" data-theme="light">/);
assert.match(await read(".desktop-dist/tools/unified-v1/review-results.mjs"), /MATCH.*DIFFERENT.*UNKNOWN.*NOT_TESTED.*INVALID/);
assert.match(await read(".desktop-dist/tools/unified-v1/trainer-ui.mjs"), /trainer-frozen-ia\.mjs/);
assert.equal((await read(".desktop-dist/tools/saku-builder-unified-v1.html")).match(/data-ui-locale=/g)?.length, 4);
for (const file of await files(path.join(ROOT, ".desktop-dist"))) {
  const bytes = await readFile(file);
  if (bytes.includes(0)) continue;
  const source = bytes.toString("utf8");
  assert.doesNotMatch(source, /C:\/Users|C:\\Users|OneDrive|(?:^|[^A-Za-z])file:/i, `public desktop leak: ${path.relative(ROOT, file)}`);
}

await prepareDesktopAssets("owner-review-internal");
const internalMetadata = await json(".desktop-dist/resources/build-metadata.json");
assert.equal(internalMetadata.resource_profile, "owner-review-internal");
assert.equal(await exists(".desktop-dist/tools/unified-v1/preview/catalog-preview-index.json"), true);

const mainRs = await read("src-tauri/src/main.rs");
assert.match(mainRs, /windows_subsystem = "windows"/);
for (const state of ["INVALID", "UNSUPPORTED", "NOT_CONFIGURED", "IMPORTED"]) assert.ok(mainRs.includes(`\"${state}\"`));
for (const field of ["package_type", "product", "package_version", "schema_version", "minimum_app_version", "content_type", "distribution_channel", "license_state", "payload_hash"]) assert.ok(mainRs.includes(field));
assert.match(mainRs, /workspace\s*\.join\("imports"\)/);
// 2026-09-21: the two-file Builder package reader (parse_zip_package) is retired; the host reads signed
// SAKU Character Packs only and names the AMU Character File instead of reading it.
assert.doesNotMatch(mainRs, /parse_zip_package/);
assert.match(mainRs, /parse_character_pack/);
assert.match(mainRs, /PACKAGE_FORMAT_AMU_CHARACTER_FILE/);
assert.match(mainRs, /wit-package\.json/);
assert.match(mainRs, /payload\.json/);
assert.match(mainRs, /PACKAGE_ARCHIVE_INVALID/);
assert.doesNotMatch(mainRs, /https?:\/\//);

const desktopApp = await read("desktop/app.mjs");
assert.match(desktopApp, /tauri:\/\/drag-drop/);
assert.match(desktopApp, /choose_and_import_package/);
assert.match(desktopApp, /saku\.desktop\.pendingPack/);
assert.match(desktopApp, /state\.first_run/);
assert.match(desktopApp, /viewer-import-package/);
assert.match(desktopApp, /choose_and_import_package/);
assert.doesNotMatch(desktopApp, /location\.replace\("\.\/tools\/saku-builder\.html\?desktop=app"\)/);
assert.match(desktopApp, /classList\.remove\("boot-pending"\)/);
const desktopIndex = await read("desktop/index.html");
assert.match(desktopIndex, /rel="icon" href="\.\/icon\.svg"/);
assert.match(desktopIndex, /data-theme="light"/);
assert.match(desktopIndex, /class="boot-pending"/);
assert.match(desktopIndex, /`\.zip`/);
assert.match(desktopIndex, /href="\.\/tools\/saku-builder\.html\?desktop=app"/);
assert.match(desktopIndex, /data-desktop-locale="ja-JP"/);
assert.match(desktopIndex, /data-desktop-locale="en-US"/);
assert.match(desktopIndex, /src="\.\/i18n\.mjs"/);
for (const id of ["view-characters", "create-edit-character", "run-on-ai-platform", "train-character", "viewer-panel"]) assert.match(desktopIndex, new RegExp(`id="${id}"`));
for (const id of ["catalog-search", "viewer-results", "compare-panel"]) assert.match(desktopIndex, new RegExp(`id="${id}"`));
const gettingStarted = await read("desktop/help/getting-started.html");
assert.match(gettingStarted, /rel="icon" href="\.\.\/icon\.svg"/);
assert.match(gettingStarted, /workspace/);
assert.match(gettingStarted, /Canonical/);
assert.match(gettingStarted, /data-desktop-locale="ja-JP"/);
const desktopHelp = await read("desktop/help/index.html");
assert.match(desktopHelp, /rel="icon" href="\.\.\/icon\.svg"/);
assert.match(desktopHelp, /WebView2/);
assert.match(desktopHelp, /インターネット接続/);
assert.match(desktopHelp, /インストールを中止/);
assert.match(desktopHelp, /data-desktop-locale="en-US"/);
assert.match(desktopHelp, /href="\.\/manual\.html#P01"/);
const fieldGuide = await json("manual/saku-field-guide.data.json");
assert.equal(fieldGuide.manual_profile, "saku.unified-v1.manual@1");
assert.equal(fieldGuide.legacy_taxonomy_active, false);
assert.equal(fieldGuide.chapters.length, 5);
assert.equal(fieldGuide.fields.length, fieldGuide.editable_denominator);
assert.equal(fieldGuide.runtime_configuration_fields, 0);
assert.match(await read(".desktop-dist/help/manual.html"), /SAKU Unified V1/);
assert.doesNotMatch(await read(".desktop-dist/help/manual.html"), /https?:\/\//);
assert.deepEqual(await json(".desktop-dist/help/saku-field-guide.data.json"), fieldGuide);

const goldenBuilder = await read("tools/saku-builder.html");
assert.equal((goldenBuilder.match(/data-builder-locale=/g) || []).length, 2);
assert.match(goldenBuilder, /id="openUnifiedV1Builder"/);
assert.match(goldenBuilder, /id="collapseAll"/);
assert.match(goldenBuilder, /id="expandAll"/);
assert.match(goldenBuilder, /id="desktopWorkspaceSelect"[^>]*hidden/);
assert.match(goldenBuilder, /id="openDesktopHome"[^>]*hidden/);
const goldenUi = await read("tools/v1/builder-golden-ui.mjs");
assert.match(goldenUi, /event\.currentTarget\.dataset\.builderLocale/);
assert.match(goldenUi, /link\.hidden=true/);
assert.match(goldenUi, /link\.tabIndex=-1/);
assert.match(goldenUi, /aria-hidden/);
assert.match(await read("tools/saku-builder-desktop-additions.css"), /\.unified-v1-link\s*\{\s*display:\s*none\s*!important;/);
assert.match(desktopApp, /UNIFIED_V1_CHARACTER/);
assert.match(desktopApp, /MANIFEST_SCHEMA_ID_MISSING/);
assert.match(desktopApp, /SAKU Converter/);
assert.match(desktopApp, /Conversion Receipt/);
const hostSource = await read("src-tauri/src/main.rs");
assert.match(hostSource, /SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE/);
assert.match(hostSource, /final-delta-recovery-closure-2026-09-04/);
assert.match(goldenUi, /saku\.ui\.locale/);
assert.match(goldenUi, /choose_workspace/);
assert.match(goldenUi, /\["placeholder","title","aria-label"\]/);
assert.doesNotMatch(goldenUi, /document\.body\.addEventListener\("click"/);

// Restore the shipping profile after the bounded internal-profile check.
await prepareDesktopAssets("public-oss");

console.log("DESKTOP_HOST_VERIFY PASS");
console.log("PUBLIC_PROFILE_INTERNAL_CONTENT_COUNT 0");
console.log("SAMPLE3 3/3 CC0 EXACT_SOURCE PASS");
console.log("BRAND_ASSET_REBIND PASS");
