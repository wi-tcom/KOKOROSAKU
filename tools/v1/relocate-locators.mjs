#!/usr/bin/env node
// locator 修復ツール（CLI） — Unified V1 Character の conformance_expectations / Seat 8 の
// locator を id 解決で書き直す。本文（requirement・statement・席・軸・名前）は一切変えない。
//
//   node tools/v1/relocate-locators.mjs <file-or-dir> [...]            … 差分表示のみ（dry-run、既定）
//   node tools/v1/relocate-locators.mjs --write <file-or-dir> [...]    … その場で書き換え（JSON、2 スペース、LF）＋ <name>.locator-repair.json
//   node tools/v1/relocate-locators.mjs --out <dir> <file-or-dir> ...  … 書き換え結果を <dir> に出す（元は触らない）
//   --no-bump   revision を上げない（既定は 1.0.0 → 1.1.0 のように上げる: 修復後は同じ Character の新 revision）
//
// 対象は Unified V1 の JSON（1 体／{characters:[…]}／配列）。character.yaml は読めるが出力は JSON のみ。
// 直せない locator（requirement_id がどの配列にも無い）が残るファイルは書かず、終了コード 1。
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const { repairLocators, diagnose } = await import(pathToFileURL(path.join(HERE, "../unified-v1/locator-repair.mjs")).href);
const { parseCharacterText } = await import(pathToFileURL(path.join(HERE, "../unified-v1/yaml-lite.mjs")).href);
const { admit } = await import(pathToFileURL(path.join(HERE, "../unified-v1/character-schema.mjs")).href);
// The same adopted schema the desktop's import gate uses (read from the repository, sha256-checked).
const { loadAdoptedSchemaFromRepository } = await import(pathToFileURL(path.join(HERE, "adopted-schema-node.mjs")).href);
const schema = loadAdoptedSchemaFromRepository();

const args = process.argv.slice(2);
const flags = { write: false, out: null, bump: true };
const targets = [];
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--write") flags.write = true;
  else if (a === "--out") { flags.out = args[++i]; flags.write = true; }
  else if (a === "--no-bump") flags.bump = false;
  else if (a === "--dry-run") flags.write = false;
  else targets.push(a);
}
if (!targets.length) { console.error("usage: relocate-locators.mjs [--write | --out <dir>] [--no-bump] <file-or-dir> ..."); process.exit(2); }

const files = [];
for (const t of targets) {
  if (!existsSync(t)) { console.error(`not found: ${t}`); process.exit(2); }
  if (statSync(t).isDirectory()) for (const name of readdirSync(t).sort()) { const p = path.join(t, name); if (statSync(p).isFile() && /\.(json|ya?ml)$/i.test(name)) files.push(p); }
  else files.push(t);
}

let exitCode = 0; const summary = [];
for (const file of files) {
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  let parsed;
  try { parsed = parseCharacterText(text, path.basename(file)).value; } catch (error) { console.log(`SKIP ${file}: 読めません（${error.message}）`); exitCode = 1; continue; }
  const list = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.characters) ? parsed.characters : [parsed];
  const results = [];
  for (const [k, character] of list.entries()) {
    const label = list.length > 1 ? `${file}#${k}` : file;
    const verdict = admit(character, { schema });
    const diag = diagnose(character);
    if (!diag.repairable) { console.log(`OK   ${label}: locator の不一致なし（${verdict.accepted ? "採用可" : verdict.code}）— 変更なし`); results.push({ label, action: "none" }); continue; }
    if (!verdict.accepted && verdict.code !== "CONFORMANCE_LOCATOR_MISMATCH") { console.log(`SKIP ${label}: locator 以外の理由で採用できません（${verdict.code}）— 修復対象外`); exitCode = 1; results.push({ label, action: "skip" }); continue; }
    const r = await repairLocators(character, { bumpRevision: flags.bump });
    console.log(`${r.remaining.length ? "FAIL" : "FIX "} ${label}: ${character.identity?.character_id} rev ${r.from_revision}${r.to_revision !== r.from_revision ? ` → ${r.to_revision}` : ""} — locator ${r.rewritten} 件を書き直し、残り不一致 ${r.remaining.length}`);
    for (const c of r.record.changes) console.log(`       ${c.group}[${c.index}] ${c.requirement_id}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
    console.log(`       digest ${r.record.digest_before?.slice(0, 16)}… → ${r.record.digest_after?.slice(0, 16)}…`);
    if (r.remaining.length) { for (const line of diag.lines.filter((_, i) => r.remaining[i])) console.log(`       残り: ${line}`); exitCode = 1; results.push({ label, action: "fail" }); continue; }
    results.push({ label, action: "fix", repaired: r.character, record: r.record, index: k });
  }
  if (!flags.write) continue;
  const fixes = results.filter(x => x.action === "fix");
  if (!fixes.length || results.some(x => x.action === "fail")) continue;
  let output;
  if (Array.isArray(parsed)) { output = parsed.slice(); for (const f of fixes) output[f.index] = f.repaired; }
  else if (parsed && Array.isArray(parsed.characters)) { output = { ...parsed, characters: parsed.characters.slice() }; for (const f of fixes) output.characters[f.index] = f.repaired; }
  else output = fixes[0].repaired;
  const dest = flags.out ? path.join(flags.out, path.basename(file).replace(/\.ya?ml$/i, ".json")) : file.replace(/\.ya?ml$/i, ".json");
  if (flags.out) mkdirSync(flags.out, { recursive: true });
  writeFileSync(dest, JSON.stringify(output, null, 2) + "\n");
  const sidecar = `${dest}.locator-repair.json`;
  writeFileSync(sidecar, JSON.stringify({ source_file: path.basename(file), output_file: path.basename(dest), repairs: fixes.map(f => f.record) }, null, 2) + "\n");
  console.log(`WROTE ${dest}${/\.ya?ml$/i.test(file) ? "（YAML 入力は JSON で出力）" : ""} / 記録 ${sidecar}`);
  summary.push(dest);
}
if (!flags.write) console.log("（dry-run: 何も書いていません。書き換えるには --write か --out <dir>）");
process.exit(exitCode);
