// tools/oukagai-console.html の YAMLパーサ／シリアライザ／検査規則を Node で実行し、
// 決裁ログの往復（parse → dump）と、Python側 validate_decision_log.py との規則の一致を確かめる。
//
//   node scripts/verify_console.mjs                 # 往復YAMLを /tmp/console-rt/ に出す
//   node scripts/verify_console.mjs --rules <file>  # そのログのJS検査結果を1行1件で出す
//
// DOMは寛容なProxyでスタブ化する（画面描画コードは走るが副作用は捨てる）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const html = fs.readFileSync(path.join(ROOT, "tools", "oukagai-console.html"), "utf-8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("script抽出に失敗"); process.exit(2); }

const stub = () => new Proxy(function () {}, {
  get(_t, p) {
    if (p === "forEach") return Array.prototype.forEach.bind([]);
    if (p === "length") return 0;
    if (p === Symbol.toPrimitive) return () => "";
    return stub();
  },
  set() { return true; },
  apply() { return stub(); },
});
const documentStub = {
  getElementById: () => stub(), querySelector: () => stub(),
  querySelectorAll: () => [], createElement: () => stub(), body: stub(),
};
const api = new Function("document", "FileReader", "Blob", "URL",
  m[1] + "\n;return { parseYaml, dump, validate };")(documentStub, stub(), stub(), stub());

const fixDir = path.join(ROOT, "tests", "decision-logs");
const files = fs.readdirSync(fixDir).filter(f => f.endsWith(".yaml")).sort();

if (process.argv[2] === "--rules") {
  const log = api.parseYaml(fs.readFileSync(process.argv[3], "utf-8"));
  api.validate(log).forEach(e => console.log(e));
  process.exit(0);
}

const outDir = "/tmp/console-rt";
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let fail = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(fixDir, f), "utf-8");
  let log;
  try { log = api.parseYaml(src); }
  catch (e) { console.log(`✘ ${f}: パース失敗 ${e.message}`); fail++; continue; }
  if (!log || !log.case_id) { console.log(`✘ ${f}: case_id が取れない`); fail++; continue; }
  fs.writeFileSync(path.join(outDir, f), api.dump(log), "utf-8");
  console.log(`✔ ${f}: parse→dump 完了（case_id=${log.case_id}）`);
}
console.log(`\n往復出力: ${outDir}`);
process.exit(fail ? 1 : 0);
