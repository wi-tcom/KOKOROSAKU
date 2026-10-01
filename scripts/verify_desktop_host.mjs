import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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
// Owner 2026-09-24: the three OSS samples (sample-general-compass, sample-wit-guide,
// sample-erabazu-bridge) are retired from the installer. The source files stay as
// test material that the gates read; they are not shipped.
const SHIPPED_SAMPLE_PATHS = ["tools/unified-v1/sample-pack/sample-characters.json", "resources/sample-source-evidence.json"];
const shippedSamples = async root => (await Promise.all(SHIPPED_SAMPLE_PATHS.map(async rel => (await stat(path.resolve(ROOT, root, rel)).then(() => true, () => false) ? rel : null)))).filter(Boolean);
assert.deepEqual(await shippedSamples(".desktop-dist"), [], "the public installer must not carry the retired OSS samples");
// In their place, AMU Studio's sample pack (saku-pack-sample 1.1.0) is a bundle
// resource, and 01 offers it with a button that goes through the pack intake.
const samplePackWiring = (html, app, conf) => {
  const problems = [];
  if (!/id="viewer-import-file">[^<]*<\/button>\s*<button type="button" id="viewer-import-samples">/.test(html)) problems.push("01 has no sample button beside 個別インポート");
  if (!/\$\("viewer-import-samples"\)\.addEventListener\("click", importSamples\)/.test(app)) problems.push("the sample button is not wired");
  if (!/async function importSamples\(\) \{\s*try \{ handOffImport\(await invoke\("import_bundled_sample_pack"\)\)/.test(app)) problems.push("the sample button does not use the host's pack intake");
  if (!/button\.disabled = !\(nativeEnabled && samplesAvailable\)/.test(app)) problems.push("the sample button is not off when imports are off or the pack is missing");
  if (conf?.bundle?.resources?.["../desktop/resources/samples/saku-pack-sample-1.1.0.zip"] !== "samples/saku-pack-sample-1.1.0.zip") problems.push("the sample pack is not a bundle resource");
  return problems;
};
{
  const html = await read("desktop/index.html"), app = await read("desktop/app.mjs");
  assert.deepEqual(samplePackWiring(html, app, config), [], "the bundled sample pack is offered on 01 through the pack intake");
  for (const [label, broken] of [
    ["no listener", [html, app.replace('$("viewer-import-samples").addEventListener("click", importSamples)', ""), config]],
    ["always enabled", [html, app.replace("button.disabled = !(nativeEnabled && samplesAvailable)", "button.disabled = false"), config]],
    ["not bundled", [html, app, { ...config, bundle: { ...config.bundle, resources: {} } }]],
  ]) assert.ok(samplePackWiring(...broken).length > 0, `falsification: ${label} is caught`);
}
// The sample-mode Characters carry the 「サンプル」 badge (Owner 2026-09-24) on 01's
// cards and in the detail, decided by the signed pack id, not by the name's 「※」.
{
  const app = await read("desktop/app.mjs");
  const badgeProblems = source => {
    const problems = [];
    if (!/const isSampleRecord = record => record\?\.provenance\?\.pack_id === SAMPLE_PACK_ID;/.test(source) || !source.includes('const SAMPLE_PACK_ID = "saku-pack-sample";')) problems.push("the sample test is not the signed pack id");
    if (!source.includes("if (isSampleRecord(record)) badges.append(sampleBadge());")) problems.push("the card has no sample badge");
    if (!source.includes("const sampleLine = isSampleRecord(record)")) problems.push("the detail has no sample badge");
    if (/※/.test(source.match(/const isSampleRecord[^\n]*/)?.[0] || "")) problems.push("the sample test reads the name");
    return problems;
  };
  assert.deepEqual(badgeProblems(app), [], "the sample badge");
  assert.ok(badgeProblems(app.replace("if (isSampleRecord(record)) badges.append(sampleBadge());", "")).length > 0, "falsification: a card without the badge is caught");
  assert.ok(badgeProblems(app.replace("record?.provenance?.pack_id === SAMPLE_PACK_ID", 'String(record?.name).endsWith("※")')).length > 0, "falsification: a test on the name is caught");
}
{ // falsification: a dist that still carries them is caught
  const probe = await mkdtemp(path.join(tmpdir(), "saku-samples-"));
  await mkdir(path.join(probe, "tools/unified-v1/sample-pack"), { recursive: true });
  await writeFile(path.join(probe, "tools/unified-v1/sample-pack/sample-characters.json"), "{}");
  assert.deepEqual(await shippedSamples(probe), ["tools/unified-v1/sample-pack/sample-characters.json"], "falsification: a shipped sample must be caught");
  await rm(probe, { recursive: true, force: true });
}
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
// The host makes no network calls. Its only URL is the service-host prefix that
// open_service_link allows (Owner 2026-09-27, 04 services page); every other URL
// outside the test module still fails here.
{
  const hostCode = mainRs.slice(0, mainRs.indexOf("#[cfg(test)]") >= 0 ? mainRs.indexOf("#[cfg(test)]") : mainRs.length);
  const urls = hostCode.match(/https?:\/\/[^"\s)]*/g) || [];
  assert.deepEqual([...new Set(urls)].sort(), ["https://{host}"], "the host's only URL is the service-host prefix");
  assert.match(hostCode, /const SERVICE_HOSTS: \[&str; 5\] = \["wi-t\.com", "www\.wi-t\.com", "kokoroamu\.jp", "www\.kokoroamu\.jp", "support\.kokoroamu\.jp"\];/, "the host opens only these five hosts, the same as the page and AMU Studio");
  {
    const { SERVICE_LINK_HOSTS, isAllowedServiceUrl } = await import("../tools/unified-v1/service-links.mjs");
    assert.deepEqual([...SERVICE_LINK_HOSTS], ["wi-t.com", "www.wi-t.com", "kokoroamu.jp", "www.kokoroamu.jp", "support.kokoroamu.jp"], "the page opens the same five hosts");
    assert.ok(isAllowedServiceUrl("https://support.kokoroamu.jp/apply"));
    // Falsification: a look-alike or another subdomain is refused.
    for (const bad of ["https://other.kokoroamu.jp/", "https://support.kokoroamu.jp.evil.example/", "https://support.kokoroamu.jp:8443/"]) assert.ok(!isAllowedServiceUrl(bad), bad);
  }
  const withOther = hostCode + '\nconst X: &str = "https://example.com/";\n';
  assert.notDeepEqual([...new Set(withOther.match(/https?:\/\/[^"\s)]*/g))].sort(), ["https://{host}"], "falsification: any other URL is caught");
}

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
{
  // Owner 2026-10-02 「β.10 を署名して出し直す」: the build says how it is signed, from one value. The source keeps
  // UNSIGNED; only the signed build's SAKU_CODE_SIGNING changes the footer, the build metadata and the host's report.
  const { codeSigningMode, CODE_SIGNING_MODES } = await import("./prepare_desktop_assets.mjs");
  assert.deepEqual([...CODE_SIGNING_MODES], ["UNSIGNED", "AZURE_ARTIFACT_SIGNING"]);
  assert.equal(codeSigningMode({}), "UNSIGNED");
  assert.equal(codeSigningMode({ SAKU_CODE_SIGNING: "AZURE_ARTIFACT_SIGNING" }), "AZURE_ARTIFACT_SIGNING");
  assert.throws(() => codeSigningMode({ SAKU_CODE_SIGNING: "SIGNED" }), /SAKU_CODE_SIGNING_INVALID/);
  assert.equal((desktopIndex.match(/<span>CODE_SIGNING = UNSIGNED<\/span>/g) || []).length, 1, "the source footer stays UNSIGNED");
  const hostMain = await read("src-tauri/src/main.rs");
  assert.match(hostMain, /const CODE_SIGNING: &str = match option_env!\("SAKU_CODE_SIGNING"\) \{ Some\(mode\) => mode, None => "UNSIGNED" \};/);
  assert.match(hostMain, /code_signing: CODE_SIGNING,/);
  assert.doesNotMatch(hostMain, /code_signing: "UNSIGNED"/);
  const builtMeta = JSON.parse(await read(".desktop-dist/resources/build-metadata.json"));
  const builtHome = await read(".desktop-dist/index.html");
  assert.ok(builtHome.includes(`<span>CODE_SIGNING = ${builtMeta.code_signing}</span>`), "the built footer says what the build metadata says");
}
{
  // ライター&SNS review 15 (2026-09-30): messages with run-time values are whole-sentence templates, tr("…", {…}),
  // and every template has its English in desktop/i18n.mjs EN_FORMAT with the same {placeholders}; the English
  // carries no Japanese outside quoted screen names (「…」). The strings that showed Japanese in English are in EN.
  const i18nSource = await read("desktop/i18n.mjs");
  const pairsOf = block => [...block.matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*:\s*("(?:[^"\\]|\\.)*")/gm)].map(m => [JSON.parse(m[1]), JSON.parse(m[2])]);
  const formatBlock = i18nSource.slice(i18nSource.indexOf("const EN_FORMAT = new Map"), i18nSource.indexOf("}));", i18nSource.indexOf("const EN_FORMAT = new Map")));
  const formats = new Map(pairsOf(formatBlock));
  const templates = [...new Set([...desktopApp.matchAll(/\btr\("((?:[^"\\]|\\.)*)"/g)].map(m => JSON.parse(`"${m[1]}"`)))];
  assert.ok(templates.length >= 40, `the app uses its message templates (${templates.length})`);
  const holes = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");
  for (const template of templates) {
    assert.ok(formats.has(template), `no English for the template: ${template.slice(0, 40)}`);
    assert.equal(holes(formats.get(template)), holes(template), `the English keeps the placeholders: ${template.slice(0, 40)}`);
    assert.doesNotMatch(formats.get(template).replace(/「[^」]*」/g, ""), /[\u3040-\u30ff\u3400-\u9fff]/, `Japanese left in the English: ${template.slice(0, 40)}`);
  }
  for (const key of ["キャラクターを読み込む", "読み込み履歴", "職能CSVを読み込む", "席 8（論理上の人）", "項目"]) assert.ok(i18nSource.includes(`${JSON.stringify(key)}:`), `EN has: ${key}`);
  assert.doesNotMatch(desktopApp, /人間席8|AI席/, "seat 8 is named as in D-20260928-seat-roles");
  assert.match(i18nSource, /querySelectorAll\("\[aria-label\],\[title\],\[placeholder\]"\)/, "the walker translates placeholder too");
}
assert.match(desktopIndex, /rel="icon" href="\.\/icon\.svg"/);
assert.match(desktopIndex, /data-theme="light"/);
assert.match(desktopIndex, /class="boot-pending"/);
assert.match(desktopIndex, /`\.zip`/);
assert.match(desktopIndex, /href="\.\/tools\/saku-builder\.html\?desktop=app"/);
assert.match(desktopIndex, /data-desktop-locale="ja-JP"/);
assert.match(desktopIndex, /data-desktop-locale="en-US"/);
assert.match(desktopIndex, /src="\.\/i18n\.mjs"/);
for (const id of ["view-characters", "create-edit-character", "run-on-ai-platform", "open-services", "viewer-panel"]) assert.match(desktopIndex, new RegExp(`id="${id}"`));
// Owner 2026-09-27 (AMU DECISION 2026-09-27-11): 04 is the services page, and no Home control leads to the Trainer.
assert.match(desktopIndex, /id="open-services" href="\.\/tools\/saku-services\.html"/);
assert.doesNotMatch(desktopIndex, /saku-trainer\.html|platform-to-trainer|data-character-action="train"/);
// β.9 hands-on (2026-09-28): three sentences still pointed at the Trainer after it left — the status line on
// choosing a Character, the note on an inadmissible one, and the Home subtitle (試す・確認する). Visible Home and
// 01 text names no training except the AMU トレーニングセンター (ライター&SNS 2026-09-28, EN 依頼 AJ).
// β.9 (Owner 2026-09-28 「直してから公開」): LICENSING.md travels in the installer and the public tree. It named
// the retired CC0 samples as the bundled sample pack and was bound to β.3's installer; the confirmed text
// (ライター&SNS / 英語翻訳チーム 依頼 AP, Wi-t_Site f2e446f) names the sample pack 1.1.0 and binds each version
// through docs/releases/<version>/ instead.
{
  const licensing = await read("LICENSING.md");
  assert.equal(licensing, await read("tooling/builder/LICENSING.md"), "tooling/builder/LICENSING.md is the root file");
  assert.match(licensing, /\| Built-in Sample Pack \| INCLUDED \| The installer bundles sample pack 1\.1\.0 [^|\n]*LicenseRef-WIT-Sample-1\.0/);
  assert.match(licensing, /\| Sample3 \| NOT_INCLUDED \|/);
  assert.doesNotMatch(licensing, /0\.1\.0-beta\.\d|4b277ead|D-B3 authorizes the exact three/, "LICENSING.md is bound to one version or names the retired samples as bundled");
}
for (const [name, source] of [["desktop/index.html", desktopIndex], ["desktop/app.mjs", desktopApp]]) {
  const visible = source.split(/\r?\n/).filter(line => !/^\s*\/\//.test(line)).join(" ").replace(/AMU トレーニングセンター/g, "");
  assert.doesNotMatch(visible, /トレーニング[をにのでし]|トレーニングする|試す・確認する/, `${name} still points at the Trainer`);
}
assert.match(desktopApp, /次に、編集するか、AI プラットフォームで動かすかを選んでください。/);
assert.match(desktopApp, /この Character は採択済み Schema に合わないため、02 でも 03 でも開けません。一覧から削除できます。/);
assert.match(desktopIndex, /選ぶ・作る・AI で動かす・サポートサービス、の 4 つの入口から、目的に合わせて選べます。/);
{
  // The services page: the Owner-confirmed v2 texts (AMU DECISION 2026-09-27-14), no prices,
  // no 「認定」, no guarantee sentence on the screen, and every application without a URL
  // shown as 「準備中」 (Owner 2026-09-28 via 統括: 「SAKU診療所とAMUトレーニングセンター、
  // ERABAZU工房は準備中としてください。」; until then the buttons were hidden while all were unset).
  const { servicesMarkup, SERVICES_WORDING } = await import("../tools/unified-v1/services-ui.mjs");
  const { SERVICE_LINKS, serviceLinkState } = await import("../tools/unified-v1/service-links.mjs");
  const { INFORMATION_LINK_IDS } = await import("../tools/unified-v1/services-ui.mjs");
  const w = SERVICES_WORDING.ja;
  const pending = servicesMarkup("ja-JP", SERVICE_LINKS);
  // Owner 2026-09-27: the introduction page (support.kokoroamu.jp) is public; the five applications are not yet.
  assert.equal(SERVICE_LINKS.links[0].id, "service_intro");
  assert.equal(SERVICE_LINKS.links[0].url, "https://support.kokoroamu.jp/");
  const applications = SERVICE_LINKS.links.filter(link => !INFORMATION_LINK_IDS.includes(link.id));
  assert.equal(applications.length, 5, "five applications");
  assert.ok(applications.every(link => link.url === null), "no application URL is set yet");
  // Owner 2026-09-30: the 64-Character introduction page and the store, next to the services' introduction page, with
  // the same ids and order as AMU Studio. The store is one link to the whole store (☆Wi-t.comサイト構築: 200); the
  // introduction page went public on 2026-09-30 (rev 791).
  assert.deepEqual(SERVICE_LINKS.links.slice(0, 3).map(link => link.id), ["service_intro", "characters_intro", "store_packs"]);
  assert.equal(SERVICE_LINKS.links[1].url, "https://www.wi-t.com/saku-characters");
  assert.equal(SERVICE_LINKS.links[2].url, "https://www.wi-t.com/category/all-products");
  const pendingLinks = SERVICE_LINKS.links.filter(link => serviceLinkState(link).state === "PENDING");
  const readyLinks = SERVICE_LINKS.links.filter(link => serviceLinkState(link).state === "READY");
  assert.match(pending, /data-services-state="ALL_PENDING"/);
  assert.ok(pending.includes(w.allPending) && w.allPending === "受付の開始は kokoroamu.jp でお知らせします。");
  // Owner 2026-09-28: the services read as 準備中 in words too (ライター&SNS 3c02160, EN 依頼 AL c1a87fe) —
  // the intro says so, what a plan includes is 「含まれます」 / "included", and nothing reads as usable now.
  assert.ok(w.intro.endsWith("いまは準備中です。") && SERVICES_WORDING.en.intro.endsWith("and they are currently in preparation."), "the 04 intro says the services are in preparation");
  for (const [lang, text] of [["ja", JSON.stringify(SERVICES_WORDING.ja)], ["en", JSON.stringify(SERVICES_WORDING.en)]]) assert.doesNotMatch(text, /ご利用いただけます|利用できます|is also available|you can use/i, `04 (${lang}) reads as usable now`);
  assert.match(desktopIndex, /サポートサービスは準備中です。紹介ページでサービスの内容をご覧いただけます。/);
  assert.doesNotMatch(desktopIndex, /登録・ログインと、\.amupkg への署名の申し込みができます/);
  { const manual = await read("manual/saku-field-guide.html"); const p06 = manual.slice(manual.indexOf('id="P06"'), manual.indexOf('id="P07"'));
    assert.ok(p06.includes("いまは準備中です（登録・申し込みはできません）") && p06.includes("currently in preparation (registration and applications are not yet open)"), "manual P06 says the services are in preparation");
    assert.doesNotMatch(p06, /から行います|apply for a signature on an \.amupkg, from 04/, "manual P06 reads as usable now"); }
  assert.equal((pending.match(/data-service-state="PENDING" disabled/g) || []).length, pendingLinks.length, "every link without a URL shows as a button that cannot be pressed");
  for (const link of pendingLinks) assert.ok(pending.includes(`data-service-link="${link.id}" data-service-state="PENDING" disabled>${link.label_ja}<span class="service-pending">準備中</span></button>`), `${link.id} reads 準備中`);
  assert.equal((pending.match(/<button(?![^>]*disabled)/g) || []).length, readyLinks.length, "only links with a URL can be pressed");
  assert.deepEqual(readyLinks.map(link => link.id), ["service_intro", "characters_intro", "store_packs"]);
  // The characters section (ライター&SNS 2e20567, the same text as AMU Studio): right after the introduction page,
  // two buttons and no line under them, the packs are paid and the price is on the product pages only.
  { const section = w.sections[1];
    assert.equal(section.id, "characters"); assert.equal(section.title, "キャラクター紹介");
    assert.equal(section.lead, "SAKU Character Pack に収録しているキャラクターを、得意なことと、人に引き継ぐことと一緒に紹介しています。パックは有料です。価格は商品ページに記載しています。");
    assert.deepEqual(section.items.map(item => [item.link, item.lines.length]), [["characters_intro", 0], ["store_packs", 0]]);
    const en = SERVICES_WORDING.en.sections[1];
    assert.ok(en.id === "characters" && en.title === "Character introductions" && en.lead.endsWith("The packs are paid. Prices are shown on the product pages."), "EN characters section (英語翻訳チーム 2026-09-30)");
    assert.equal(SERVICES_WORDING.en.linkLabels.characters_intro, "See the Character introductions (in Japanese)");
    assert.equal(SERVICES_WORDING.en.linkLabels.store_packs, "See the packs in the store");
    assert.ok(pending.includes('data-service-link="characters_intro" data-service-url="https://www.wi-t.com/saku-characters">キャラクター紹介を見る<') && pending.includes('data-service-link="store_packs" data-service-url="https://www.wi-t.com/category/all-products">ストアでパックを見る<')); }
  assert.ok(pending.includes(w.hosts), "a button can be pressed, so the page says where the links open (ライター&SNS 2026-09-27)");
  // Falsification: with no URL at all, no button can be pressed and there is no hosts line.
  { const none = servicesMarkup("ja-JP", { ...SERVICE_LINKS, links: SERVICE_LINKS.links.map(link => ({ ...link, url: null })) }); assert.ok(!/<button(?![^>]*disabled)/.test(none) && !none.includes(w.hosts) && (none.match(/class="service-pending">準備中</g) || []).length === SERVICE_LINKS.links.length); }
  assert.match(pending, /data-service-link="service_intro" data-service-url="https:\/\/support\.kokoroamu\.jp\/"/);
  assert.ok(pending.includes("サービスの内容は、kokoroamu.jp の紹介ページでご覧いただけます。") && pending.includes(">紹介ページを見る<"), "the introduction line and button are the confirmed wording");
  for (const text of [w.intro, w.commonNote, ...w.sections.flatMap(section => section.items.flatMap(item => item.lines))]) assert.ok(pending.includes(text), `the page shows: ${text.slice(0, 20)}`);
  assert.ok(w.sections.find(section => section.id === "subscriptions").items[0].lines[0].startsWith("「診療」はソフトウェアの調査と修復のたとえ"), "the clinic text opens with the 診療 sentence");
  assert.equal(w.sections[0].id, "intro", "the introduction page comes first (Owner 2026-09-27)");
  assert.ok(pending.includes("フォルダーの場所には、Windows のユーザー名が含まれることがあります。"));
  assert.doesNotMatch(pending, /認定|保証|[0-9０-９][0-9０-９,，]*\s*円|¥|￥|\$[0-9]/, "no 認定, no guarantee sentence, no price");
  const ready = servicesMarkup("ja-JP", { ...SERVICE_LINKS, links: SERVICE_LINKS.links.map(link => link.id === "saku_clinic" ? { ...link, url: "https://kokoroamu.jp/clinic" } : link) });
  assert.ok(ready.includes(w.hosts) && !ready.includes(w.allPending));
  assert.equal((ready.match(/data-service-url="https:\/\/kokoroamu\.jp\/clinic"/g) || []).length, 1);
  assert.equal((ready.match(/data-service-state="PENDING" disabled/g) || []).length, pendingLinks.length - 1, "once an application URL is set, the other links without a URL show 準備中");
  // Falsification: a URL on another host stays 準備中.
  const foreign = servicesMarkup("ja-JP", { ...SERVICE_LINKS, links: SERVICE_LINKS.links.map(link => link.id === "saku_clinic" ? { ...link, url: "https://kokoroamu.jp.evil.example/clinic" } : link) });
  assert.ok(!foreign.includes("kokoroamu.jp.evil.example"), "a URL on another host is never offered");
  // English (依頼 Y/Z with the names the Owner chose on 2026-09-27): the same shape, no Japanese,
  // no placeholder, no 「診療」 disclaimer (the English name does not say Clinic), no prices.
  const e = SERVICES_WORDING.en;
  assert.ok(e && e.title === "SAKU Repair Desk and AMU Evaluation Center" && e.pending === "In preparation");
  assert.deepEqual(e.sections.map(section => [section.id, section.items.map(item => item.link)]), w.sections.map(section => [section.id, section.items.map(item => item.link)]), "EN has the same sections and links as JA");
  assert.deepEqual(Object.keys(e.linkLabels).sort(), SERVICE_LINKS.links.map(link => link.id).sort(), "EN labels every link");
  const enPages = [servicesMarkup("en-US", SERVICE_LINKS), servicesMarkup("en-US", { ...SERVICE_LINKS, links: SERVICE_LINKS.links.map(link => ({ ...link, url: "https://kokoroamu.jp/x" })) })];
  for (const page of enPages) {
    assert.doesNotMatch(page, /[ぁ-んァ-ヶ一-龠]/, "the English page holds no Japanese");
    const shown = page.replace(/<[^>]+>/g, " ");   // the text on screen, not ids such as saku_clinic
    assert.doesNotMatch(shown, /&lt;CLINIC&gt;|&lt;CENTER&gt;|Clinic|certif|guarantee|[$¥￥][0-9]/i, "no placeholder, no Clinic, no certify or guarantee, no price");
  }
  assert.ok(enPages[1].includes("Register for SAKU Repair Desk") && enPages[1].includes("Register for AMU Evaluation Center"));
  assert.ok(enPages[0].includes(e.allPending) && (enPages[0].match(/<button(?![^>]*disabled)/g) || []).length === readyLinks.length && (enPages[0].match(/<span class="service-pending">In preparation<\/span>/g) || []).length === pendingLinks.length, "EN: every link without a URL reads In preparation; only links with a URL can be pressed");
  assert.ok(enPages[0].includes(">View the overview page<") && enPages[0].includes("(in Japanese).") && enPages[0].includes(e.hosts), "EN: the overview page button, its note that the page is Japanese, and where the links open (AG1–AG3)");
  // Falsification: a Japanese label leaking into the English page is caught.
  assert.match(servicesMarkup("en-US", SERVICE_LINKS).replace(e.intro, w.intro), /[ぁ-んァ-ヶ一-龠]/);
}
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
// ライター&SNS 2026-09-27: a refused v1 or undeclared file names the way on (recreate it in 02,
// by 02's real label) and never SAKU Converter, which is not in this product.
assert.doesNotMatch(desktopApp, /SAKU Converter|Conversion Receipt|Unified V1 の (Trainer|Builder)/);
assert.ok(desktopIndex.includes("キャラクターを作る・編集する"), "02's label, which the recreate guidance names");
assert.equal((desktopApp.match(/で新しく作り直してください。/g) || []).length, 2, "the v1 note and the undeclared-schema refusal both say to recreate it in 02");
assert.match(desktopApp, /const V1_RECREATE_NOTE = "この Character は旧形式（SAKU-CHARACTER）で作られているため、この SAKU Builder では開けません。使う場合は、「02 キャラクターを作る・編集する」で新しく作り直してください。";/);
assert.match(desktopApp, /このファイルには Schema の宣言がないため、取り込めません。使う場合は、「02 キャラクターを作る・編集する」で新しく作り直してください。/);
assert.equal((desktopApp.match(/V1_RECREATE_NOTE/g) || []).length, 3, "the v1 note is used on the detail card and in the status line");
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
