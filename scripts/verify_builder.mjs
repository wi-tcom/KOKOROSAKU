// tools/character-builder.html の toYaml/EXAMPLE/blank を Node で実行する検証ハーネス。
// HTMLツールの出力（character.yaml）が生成器を通るか、往復を機械で確かめるための常設網。
//
// 使い方:
//   node scripts/verify_builder.mjs example   # EXAMPLE(=星野ルカ)のYAMLを標準出力へ
//   node scripts/verify_builder.mjs blank      # 空データのYAML
//
// 往復の確認（例）:
//   node scripts/verify_builder.mjs example > /tmp/c.yaml
//   mkdir -p /tmp/rt && cp /tmp/c.yaml /tmp/rt/character.yaml
//   python3 scripts/generate_agents.py /tmp/rt/character.yaml
//   grep -A3 "人間席の調達型" /tmp/rt/dist/HUMAN-GATE.md
//
// DOMは寛容なProxyでスタブ化する（ツールのUI描画コードは走るが副作用は捨てる）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(HERE, "..", "tools", "character-builder.html");

const html = fs.readFileSync(HTML, "utf-8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("script抽出に失敗"); process.exit(2); }
const scriptText = m[1];

// 寛容なDOMスタブ：任意の get/set/call を飲み込む。querySelectorAll 等は空反復。
const stub = () => new Proxy(function () {}, {
  get(_t, prop) {
    if (prop === "forEach") return Array.prototype.forEach.bind([]);
    if (prop === "length") return 0;
    if (prop === Symbol.toPrimitive) return () => "";
    return stub();
  },
  set() { return true; },
  apply() { return stub(); },
});
const documentStub = {
  getElementById: () => stub(),
  querySelector: () => stub(),
  querySelectorAll: () => [],
  createElement: () => stub(),
  body: stub(),
};

const mode = process.argv[2] || "example";
const runner = new Function("document", scriptText + "\n;return { toYaml, EXAMPLE, blank };");
const api = runner(documentStub);
const data = mode === "blank" ? api.blank() : api.EXAMPLE();
process.stdout.write(api.toYaml(data));
