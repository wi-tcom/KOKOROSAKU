// The tuning knowledge, as a plain module.
//
// It was imported with `with { type: "json" }`, which Node and headless Chrome
// both accept — and which the installed WebView2 did not, so the Desktop host
// failed to boot while every browser gate passed. The JSON file stays as the
// carried artefact with its provenance; this generates the module the app
// actually loads, so nothing depends on import attributes or on a MIME type.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(ROOT, "tools/unified-v1/tuning/tuning-knowledge-20.json");
const target = path.join(ROOT, "tools/unified-v1/tuning/tuning-knowledge-20.data.mjs");
const knowledge = JSON.parse(await readFile(source, "utf8"));
const body = `// GENERATED from tuning-knowledge-20.json by scripts/build_tuning_knowledge_module.mjs.
// Do not edit: verify_cognitive_tuning.mjs fails if this drifts from the JSON,
// and the JSON is checked against the authoritative packet.
export default ${JSON.stringify(knowledge, null, 2)};
`;
await writeFile(target, body);
console.log(`TUNING_KNOWLEDGE_MODULE ${path.relative(ROOT, target)} (${knowledge.items.length} items)`);
