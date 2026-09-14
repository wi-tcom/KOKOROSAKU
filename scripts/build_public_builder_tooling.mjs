import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "tooling", "builder");
if (path.basename(TARGET) !== "builder" || path.dirname(TARGET) !== path.join(ROOT, "tooling")) {
  throw new Error("PUBLIC_TOOLING_TARGET_INVALID");
}

const manifest = JSON.parse(await readFile(path.join(ROOT, "desktop/resources/manifests/static-public.json"), "utf8"));
if (manifest.manifest !== "saku.delivery.asset-manifest@1" || manifest.target !== "static-public") {
  throw new Error("STATIC_ASSET_MANIFEST_IDENTITY_INVALID");
}
const sources = new Map(manifest.files);
if (sources.size !== manifest.files.length) throw new Error("STATIC_ASSET_SOURCE_DUPLICATE");
if (new Set(manifest.files.map(([, destination]) => destination)).size !== manifest.files.length) {
  throw new Error("STATIC_ASSET_DESTINATION_DUPLICATE");
}

function project(text, source) {
  let output = text;
  const replacements = [
    ["./saku-builder-desktop-additions.css", "./builder.css"],
    ["./unified-v1/active-saku.mjs", "./lib/active-character.mjs"],
    ["./v1/unified-authoring.mjs", "./lib/unified-authoring.mjs"],
    ["./v1/adopted-schema-validator.mjs", "./lib/adopted-schema-validator.mjs"],
    ["./v1/semantic-registry.mjs", "./lib/semantic-registry.mjs"],
    ["./unified-v1/character-library.mjs", "./lib/character-library.mjs"],
    ["./unified-v1/tuning/tuning-projection.mjs", "./lib/tuning-projection.mjs"],
    ["./v1/builder-golden-ui.mjs", "./lib/builder-ui.mjs"],
    ["./v1/frozen-ia-ui.mjs", "./lib/frozen-ia-ui.mjs"],
    ["./unified-v1/trainer-ux4.css", "./trainer.css"],
    ["./unified-v1/trainer-ux4-ui.mjs", "./lib/trainer-ui.mjs"],
    ["../unified-v1/unified-schema-v1.mjs", "./unified-schema.mjs"],
    ["../unified-schema-v1.mjs", "./unified-schema.mjs"],
    ["./unified-schema-v1.mjs", "./unified-schema.mjs"],
    ["../unified-v1/tuning/tuning-projection.mjs", "./tuning-projection.mjs"],
    ["../unified-v1/handoff-binding.mjs", "./handoff-binding.mjs"],
    ["../v1/trainer-ux4.mjs", "./trainer-ux4.mjs"],
    ["../v1/trainer-frozen-ia.mjs", "./trainer-contract.mjs"],
    ["../v1/builder-field-registry.mjs", "./builder-field-registry.mjs"],
    ["../v1/unified-authoring.mjs", "./unified-authoring.mjs"],
    ["../v1/trainer-ux3.mjs", "./trainer-ux3.mjs"],
    ["./trainer-frozen-ia.mjs", "./trainer-contract.mjs"],
    ["./active-saku.mjs", "./active-character.mjs"],
    ["./saku-builder.html", "./index.html"],
    ["../help/saku-field-guide.data.json", "./manual/saku-field-guide.data.json"],
    ["../manual/saku-field-guide.data.json", "./manual/saku-field-guide.data.json"],
    ["tools/saku-builder.html", "tooling/builder/index.html"],
    ["tools/unified-v1/tuning/tuning-projection.mjs#translate", "tooling/builder/lib/tuning-projection.mjs#translate"],
  ];
  for (const [from, to] of replacements) output = output.replaceAll(from, to);

  if (source === "tools/v1/adopted-schema-validator.mjs") {
    for (const name of ["saku-unified-character.v1.schema.json", "character-extension.v1.schema.json"]) {
      output = output.replaceAll(`"./${name}"`, `"../schemas/${name}"`)
        .replaceAll(`"../../tests/fixtures/canonical/${name}"`, `"../schemas/${name}"`);
    }
  }

  if (source === "tools/saku-builder.html") {
    output = output.replaceAll('href="../index.html?stay=1"', 'href="./index.html"');
    output = output.replace("</head>", '<link rel="icon" href="./favicon.ico">\n</head>');
    output = output.replace("</head>", '<meta name="saku-character-selection" content="disabled">\n</head>');
    output = output.replace(/\s*<a class="btn-sm unified-v1-link"[^>]*>Unified V1<\/a>/, "\n    <a class=\"btn-sm trainer-link\" id=\"openTrainer\" href=\"./trainer.html\">Trainer</a>");
    output = output.replace("</nav>", "<a class=\"btn-sm\" href=\"./about.html\">About</a></nav>");
  }
  if (source === "tools/saku-trainer.html") {
    output = output.replace("</head>", '<link rel="icon" href="./favicon.ico">\n</head>');
    output = output.replace("</head>", '<meta name="saku-build-revision" content="UNRELEASED_STATIC_CANDIDATE">\n</head>');
  }
  if (source === "TRADEMARK.md") {
    output = output.replaceAll("](SECURITY.md)", "](../../SECURITY.md)");
  }

  return output;
}

await rm(TARGET, { recursive: true, force: true });
await mkdir(TARGET, { recursive: true });
for (const [source, destination] of sources) {
  const sourcePath = path.join(ROOT, source);
  const destinationPath = path.join(TARGET, destination);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  const bytes = await readFile(sourcePath);
  const exactBytes = source.startsWith("tests/fixtures/canonical/") || source === "LICENSING.md";
  const textLike = /\.(?:html|css|mjs|json|md)$/.test(source) || path.basename(source) === "LICENSE" || path.basename(source) === "NOTICE";
  await writeFile(destinationPath, textLike && !exactBytes ? project(bytes.toString("utf8"), source) : bytes);
}

const about = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KOKOROSAKU v0.1.0β (Pre-release)</title><link rel="icon" href="./favicon.ico"><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;line-height:1.7}code{overflow-wrap:anywhere}.actions{display:flex;gap:12px;flex-wrap:wrap}a{color:#28536b}</style></head>
<body><h1>KOKOROSAKU v0.1.0β (Pre-release)</h1><p>Pre-release static build for evaluation. / 評価用のプレリリース静的buildです。Release、Canonical Adoption、Authority、Approval、Productionを示しません。</p>
<dl><dt>Current schema state</dt><dd><code>Adopted by D-13</code></dd><dt>Active schema artifact</dt><dd><code>schemas/saku-unified-character.v1.schema.json</code></dd><dt>Canonical source revision</dt><dd><code>c442a1a04e876dc7d0a6941b500ce7b1ff94bf0c</code></dd><dt>Schema SHA-256</dt><dd><code>48a7241dac4653c94b0cb82971697deb804c23999548cb9c6b64563813bba817</code></dd></dl>
<p>Builder/Trainer code: MPL-2.0. Documentation: CC BY 4.0. Trademarks are not licensed. Character Catalog and Occupation Pack are not included in this candidate.</p>
<div class="actions"><a href="./index.html">Builder</a><a href="./trainer.html">Trainer</a><a href="./LICENSING.md">Licensing overview</a><a href="./BRAND-ASSET-NOTICE.md">Brand asset notice</a><a href="./LICENSE">Code license</a><a href="./LICENSE-DOCS.md">Documentation license</a><a href="./TRADEMARK.md">Trademark</a></div></body></html>\n`;
await writeFile(path.join(TARGET, "about.html"), about, "utf8");

const readme = `# KOKOROSAKU static beta candidate

[日本語訳](README.ja.md) · English canonical documentation · Documentation license: [CC BY 4.0](LICENSE-DOCS.md)

Serve the repository root over HTTP, then open \`/tooling/builder/index.html\`.
Do not open the HTML directly from the filesystem; JavaScript modules and the pinned schema are loaded through HTTP.

- Builder: \`index.html\`
- Trainer: \`trainer.html\`
- Candidate status and licenses: \`about.html\`
- Quickstart: [Builder quickstart](../../docs/getting-started/builder-quickstart.md)

This directory is generated by \`npm run public:tooling\`. It contains no Character Catalog, Occupation Pack, AMU runtime state, MACHI assignment, credential, permission, or Human Apply execution.
`;
await writeFile(path.join(TARGET, "README.md"), readme, "utf8");

const readmeJa = `# KOKOROSAKU 静的ベータ候補

> これは英語正本 [README.md](README.md) の日本語訳です。ドキュメントは [CC BY 4.0](LICENSE-DOCS.md) で提供されます。

repository rootをHTTPで配信し、\`/tooling/builder/index.html\` を開きます。HTMLをファイルシステムから直接開かないでください。JavaScript moduleと固定されたschemaはHTTP経由で読み込まれます。

- Builder: \`index.html\`
- Trainer: \`trainer.html\`
- 候補状態とlicense: \`about.html\`
- 手順: [Builderクイックスタート](../../docs/getting-started/builder-quickstart.ja.md)

このdirectoryは \`npm run public:tooling\` で生成されます。Character Catalog、Occupation Pack、AMU runtime state、MACHI assignment、credential、permission、Human Apply実行は含みません。
`;
await writeFile(path.join(TARGET, "README.ja.md"), readmeJa, "utf8");

function relativeReferences(source, extension) {
  const references = [];
  if ([".html", ".htm"].includes(extension)) {
    for (const match of source.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) references.push(match[1]);
  }
  if (extension === ".md") {
    for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const raw = match[1].trim();
      references.push(raw.startsWith("<") ? raw.slice(1, raw.indexOf(">")) : raw.split(/\s+/)[0]);
    }
  }
  return references;
}

const allowedOutsideBuilder = new Set([
  path.join(ROOT, "SECURITY.md"),
  path.join(ROOT, "docs", "getting-started", "builder-quickstart.md"),
  path.join(ROOT, "docs", "getting-started", "builder-quickstart.ja.md"),
]);
async function verifyRelativeReferences(file, source) {
  let count = 0;
  for (const reference of relativeReferences(source, path.extname(file).toLowerCase())) {
    if (!reference || reference.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith("//")) continue;
    const pathname = decodeURIComponent(reference.split(/[?#]/)[0]);
    const target = path.resolve(path.dirname(file), pathname);
    const insideBuilder = target === TARGET || target.startsWith(`${TARGET}${path.sep}`);
    if (!insideBuilder && !allowedOutsideBuilder.has(target)) throw new Error(`PUBLIC_RELATIVE_LINK_OUTSIDE_TREE ${path.relative(ROOT, file)} -> ${reference}`);
    try { await stat(target); }
    catch { throw new Error(`PUBLIC_RELATIVE_LINK_MISSING ${path.relative(ROOT, file)} -> ${reference}`); }
    count += 1;
  }
  return count;
}
let checkedRelativeLinks = 0;
for (const file of await (async function collect(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await collect(absolute));
    else if (entry.isFile()) found.push(absolute);
  }
  return found;
})(TARGET)) {
  const extension = path.extname(file).toLowerCase();
  if (![".html", ".htm", ".md"].includes(extension)) continue;
  const source = await readFile(file, "utf8");
  checkedRelativeLinks += await verifyRelativeReferences(file, source);
}

// Disposable document inputs prove the generator's guard rejects missing and
// out-of-package links without modifying any license or generated artifact.
await assert.rejects(verifyRelativeReferences(path.join(TARGET, "README.md"), "[missing](./__missing_link_fixture__.md)"), /PUBLIC_RELATIVE_LINK_MISSING/);
await assert.rejects(verifyRelativeReferences(path.join(TARGET, "README.md"), "[private](../../package.json)"), /PUBLIC_RELATIVE_LINK_OUTSIDE_TREE/);

console.log(`PUBLIC_TOOLING_READY ${path.relative(ROOT, TARGET).replaceAll(path.sep, "/")}`);
console.log(`PUBLIC_RELATIVE_LINKS PASS ${checkedRelativeLinks}/${checkedRelativeLinks}`);
console.log("PUBLIC_RELATIVE_LINK_REJECTION PASS 2/2");
