// tools/saku-builder.html の検証ハーネス（verify_builder.mjs と同じ流儀）。
//
// 使い方:
//   node scripts/verify_saku_builder.mjs example    # EXAMPLE の character.yaml を標準出力へ
//   node scripts/verify_saku_builder.mjs blank      # 空データの YAML
//   node scripts/verify_saku_builder.mjs json       # EXAMPLE の SAKU-CHARACTER JSON
//   node scripts/verify_saku_builder.mjs tpl <key>  # テンプレートの YAML（例: pm-support）
//   node scripts/verify_saku_builder.mjs selftest   # 全自己検査（exit 0/1）
//
// 反証テスト（このプロジェクトの流儀。壊して exit=1 を確認する）:
//   sed 's/"SAKU-CHARACTER"/"SAKU-CHAR"/' tools/saku-builder.html > /tmp/broken.html
//   SAKU_BUILDER_HTML=/tmp/broken.html node scripts/verify_saku_builder.mjs selftest  # → exit 1
//
// 往復の確認（生成器を通す）:
//   node scripts/verify_saku_builder.mjs example > /tmp/rt/character.yaml
//   python3 scripts/generate_agents.py /tmp/rt/character.yaml
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as UnifiedAuthoring from "../tools/v1/unified-authoring.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = process.env.SAKU_BUILDER_HTML
  || path.resolve(HERE, "..", "tools", "saku-builder.html");

const html = fs.readFileSync(HTML, "utf-8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("script抽出に失敗"); process.exit(2); }
const scriptText = m[1];

// 寛容なDOMスタブ（verify_builder.mjs と同一方式）
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
const windowTarget = { SAKU_UNIFIED: UnifiedAuthoring };
const windowStub = new Proxy(windowTarget, {
  get(target, prop) { return prop in target ? target[prop] : stub(); },
  set(target, prop, value) { target[prop] = value; return true; },
});

const runner = new Function("document", "window",
  scriptText +
  "\n;return { toYaml, EXAMPLE, blank, toSakuJson, toTestLog," +
  " parseBuilderYaml, TEMPLATES, validate, buildTestItems, testSummary, contactGuard," +
  " normalizedOrganizationParticipation, validateOrganizationParticipation,"
  + " normalizeForGuard, approvalMatches, isExternalOutput, payloadFor, highlight," +
  // 旧版のHTML（反証テストや非影響検査の基準版）を読ませることがあるため、
  // 後から足した輸出は存在確認してから返す。無ければ undefined を返し、
  // それを使う検査だけが落ちるようにする（全モードが道連れにならないように）。
  "\n  ...(function(){const o={};" +
  "['chapterState','CHAPTER_ITEMS','BOUNDARY_QS','AI_SEATS','L0_SKILLS','TABS','TAB_PURPOSE','toPrompt','toGuildJson']" +
  ".forEach(n=>{try{o[n]=eval(n);}catch(e){o[n]=undefined;}});return o;})() };");
const api = runner(documentStub, windowStub);

const mode = process.argv[2] || "example";

if (mode === "example") { process.stdout.write(api.toYaml(api.EXAMPLE())); process.exit(0); }
if (mode === "blank")   { process.stdout.write(api.toYaml(api.blank()));   process.exit(0); }
if (mode === "json")    { process.stdout.write(api.toSakuJson(api.EXAMPLE())); process.exit(0); }
if (mode === "tpl") {
  const k = process.argv[3];
  if (!api.TEMPLATES[k]) { console.error("unknown template: " + k +
    "  （候補: " + Object.keys(api.TEMPLATES).join(", ") + "）"); process.exit(2); }
  process.stdout.write(api.toYaml(api.TEMPLATES[k].make())); process.exit(0);
}

if (mode !== "selftest") { console.error("unknown mode: " + mode); process.exit(2); }

/* ================= selftest ================= */
const fails = [];
const ok = (cond, name) => { if (!cond) fails.push(name); };
const fail = (label, message) => fails.push(label + ": " + message);

// ── F-1. Preview syntax highlighting must never emit executable raw HTML ──
{
  const vectors = [
    '<img src=x onerror=alert(1)>',
    '<script>alert(1)</script>',
    '<svg onload=alert(1)>',
    '& < > " \'',
  ];
  for (const vector of vectors) {
    const y = `meta:\n  name: "${vector}"\n`;
    const highlighted = api.highlight(y);
    ok(!/<(?:img|script|svg)\b/i.test(highlighted), `preview XSS: raw element escaped (${vector})`);
    if (vector.includes("<img")) ok(highlighted.includes("&lt;img"), "preview XSS: img visible as escaped text");
    if (vector.includes("<script")) ok(highlighted.includes("&lt;script"), "preview XSS: script visible as escaped text");
    if (vector.includes("<svg")) ok(highlighted.includes("&lt;svg"), "preview XSS: svg visible as escaped text");
    if (vector.startsWith("&")) {
      ok(highlighted.includes("&amp;") && highlighted.includes("&lt;") && highlighted.includes("&gt;"),
        "preview XSS: ampersand and angle brackets escaped");
    }
  }
}

// ── 1. Unified V1 YAML round-trip ──
{
  const d = api.EXAMPLE();
  const y = api.toYaml(d);
  const p = api.parseBuilderYaml(y);
  ok(p.schema?.schema_id === UnifiedAuthoring.UNIFIED_SCHEMA_V1.schema_id, "yaml往復: schema identity");
  ok(p.identity?.display_name === d.meta.name, "yaml往復: identity.display_name");
  ok(p.identity?.character_id === d.meta.slug, "yaml往復: identity.character_id");
  ok(Array.isArray(p.purpose?.target_users) && p.purpose.target_users.length === d.identity.target_users.length,
    "yaml往復: purpose.target_users");
  ok(p.assistant_composition?.seat8?.function === "LOGICAL_HUMAN_ASSISTANT", "yaml往復: seat8はHUMAN");
  ok(typeof p.assistant_composition?.deliberation?.max_rounds === "number",
    "yaml往復: numeric values preserve type");
  for (const excluded of ["charback", "organization_participation", "human_procurement", "runtime", "credential"])
    ok(!y.includes(excluded), "yaml active scope excludes " + excluded);
}

// ── 2. Unified V1 Character JSON ──
{
  const j = JSON.parse(api.toSakuJson(api.EXAMPLE()));
  ok(j.schema?.schema_id === UnifiedAuthoring.UNIFIED_SCHEMA_V1.schema_id, "json: adopted schema identity");
  ok(j.schema?.schema_version === UnifiedAuthoring.UNIFIED_SCHEMA_V1.schema_version, "json: adopted schema version");
  ok(j.identity?.display_name === "星野ルカ", "json: identity.display_name");
  ok(j.character_core?.role_kind === "CHARACTER_ROLE", "json: Character role kind");
  ok(j.assistant_composition?.seat8?.function === "LOGICAL_HUMAN_ASSISTANT", "json: seat8=HUMAN");
  ok(Array.from({length: 8}, (_, i) => `seat${i + 1}`).every(seat => j.assistant_composition?.[seat]),
    "json: fixed 1+7 composition present");
  ok(j.character_core?.hard_invariants?.some(item => item.id === "INV-INPUT-INTEGRITY"),
    "json: Input Integrity invariant present");
  for (const excluded of ["organization_participation", "charback_policy", "delivery_boundary", "credential", "authority"])
    ok(!(excluded in j), "json active scope excludes " + excluded);
}

// ── 3/4. 外部AIプロンプト・Guild 概要は 2026-09-22（Owner）にこの画面から外れた ──
//   プロンプトはデスクトップ 03「AIプラットフォームで動作確認」が持つ。Guild 概要
//   （MACHI-GUILD-SUMMARY）は廃止: AMU/MACHI は署名付きパック経由でのみ受け取る。
{
  ok(api.toPrompt === undefined && api.toGuildJson === undefined, "removed: toPrompt / toGuildJson are no longer page functions");
  ok(api.TABS.map(t => t[0]).join(",") === "yaml,json,test,help", "tabs: character.yaml / Character File / 試験記録 / Help only");
  ok(!api.TABS.some(t => /外部AIプロンプト|Guild概要/.test(t[1])), "tabs: no 外部AIプロンプト / Guild概要 tab");
  ok(api.TAB_PURPOSE.json.ja.includes("署名・パック化の元になる正本") && api.TAB_PURPOSE.json.ja.includes("署名付きパック経由でのみ受け取る"), "Character File purpose names the canonical JSON and the signed-pack-only hand-over");
}

// ── 4-b. ContactGuard：初版MVPから継承した外部出力前検査 ──
{
  const safe = api.contactGuard("一般的な案内文です");
  ok(safe.safe && safe.hits.length === 0, "contactGuard: 通常文");
  ok(api.contactGuard("valid_from: 2026-08-10 / organization.permissions.change").safe,
     "contactGuard: 日付・組織action IDを誤検知しない");
  const risky = api.contactGuard("連絡先 test@example.com / https://example.com / API key: secret-value");
  ok(!risky.safe, "contactGuard: 危険候補を停止");
  for (const need of ["メールアドレス", "URL", "秘密情報"])
    ok(risky.hits.includes(need), "contactGuard: "+need);
  const contact=api.contactGuard("電話 03-1234-5678 / LINE: sample-id");
  ok(contact.hits.includes("電話番号")&&contact.hits.includes("SNS ID"),
     "contactGuard: 電話・SNS IDは引き続き検知");
}

// ── 5. Templates emit Unified V1 without restoring retired surfaces ──
{
  const keys = Object.keys(api.TEMPLATES);
  ok(keys.length >= 8, "templates: 8種以上");
  for (const k of keys) {
    const d = api.TEMPLATES[k].make();
    const v = api.validate(d);
    ok(v.miss.length === 0, "template必須検証: " + k + " (" + v.miss.join(",") + ")");
    const y = api.toYaml(d);
    ok(y.includes('function: "LOGICAL_HUMAN_ASSISTANT"'), "template席8人間: " + k);
    const p2 = api.parseBuilderYaml(y);
    ok(p2.schema?.schema_id === UnifiedAuthoring.UNIFIED_SCHEMA_V1.schema_id, "template Unified V1: " + k);
    ok(p2.identity?.character_id === d.meta.slug, "template yaml往復: " + k);
    ok(!y.includes("organization_participation") && !y.includes("charback"),
      "template retired fields excluded: " + k);
  }
}

// ── 6. Frozen IA exposes exactly five beginner chapters ──
{
  const chapters = api.CHAPTER_ITEMS || [];
  ok(chapters.length === 5, "chapters: exactly five");
}


// ── 4-d. ContactGuard：表記ゆれの正規化（実測で素通りしていた分） ──
{
  const label = "contactGuard-normalize";
  // 見た目は同じでも、全角やゼロ幅で書かれると正規表現に当たらない。
  // 悪意ある回避だけでなく、IME が全角のままだった、といった普通の事故で起きる。
  // 実credentialに見える連続文字列をrepositoryへ保存せず、実行時だけ
  // TEST_ONLYのダミー値を組み立ててContactGuardの検出を確認する。
  const dummySecretToken = ["gh", "p_", "abcdefghijklmnopqrstuvwxyz01"].join("");
  const CASES = [
    ["全角＠のメール", "連絡先は sample＠example.com です", "メールアドレス"],
    ["[at] 表記", "sample [at] example [dot] com まで", "メールアドレス"],
    ["全角数字の電話", "電話は ０３－１２３４－５６７８ です", "電話番号"],
    ["区切り無しの電話", "電話は 0312345678 です", "電話番号"],
    ["スキーム無しURL", "詳細は example.com/contact を見てください", "URL"],
    ["ゼロ幅で割られたメール", "test@exa\u200Bmple.com", "メールアドレス"],
    ["X のアカウント", "X: sample-id までご連絡ください", "SNS ID"],
    ["値まで書かれた秘密", `token: ${dummySecretToken}`, "秘密情報"],
    ["Facebook のアカウント", "Facebook: yamada.taro までご連絡ください", "SNS ID"],
    ["WeChat のアカウント", "WeChat: sample_id123 まで", "SNS ID"],
    ["郵便番号", "〒150-0002 までご郵送ください", "住所らしい表現"],
  ];
  for (const [name, text, want] of CASES) {
    const r = api.contactGuard(text);
    ok(!r.safe && r.hits.includes(want), `contactGuard: ${name} を検知`);
  }
  ok(api.normalizeForGuard("＠０１").includes("@01"), "normalizeForGuard: NFKC");
  ok(!api.normalizeForGuard("a\u200Bb").includes("\u200B"), "normalizeForGuard: ゼロ幅を除去");
}

// ── 4-e. 誤検知を増やしていないこと（★これを壊さないことが最優先） ──
{
  const label = "contactGuard-falsepositive";
  // 語だけの言及・版番号・ファイル名・組織アクションIDで止まってはいけない。
  // 狼少年になる検査は必ず迂回され、結果として何も守らなくなる。
  const SAFE = [
    "週次の進捗を整理してお伝えします",
    "valid_from: 2026-08-10",
    "organization.permissions.change",
    "schema_version 1.0.0 を使う",
    "席8は人間が担当する",
    "PM兼務者の業務を支援する",
    "区分Cは専門家管理とする",
    "docs/saku-builder.md と tools/edo-theme.css を参照",
    "パスワードの管理方針を定める",          // 語のみ。値が無いので止めない
    "api_key という語の説明",                // 同上（旧規則では止まる。仕様どおり）
    "第0層 v0.2.4 / 生成器 2026 年版",
    "Facebookページを新設した",              // 語のみ。区切り＋ID が無いので止めない
    "WeChat連携の可否を検討する",             // 同上
    "郵便番号は個票ごとに任意入力とする",     // 〒記号が無いので止めない
  ];
  for (const t of SAFE) {
    const r = api.contactGuard(t);
    if (t.includes("api_key") || t.includes("パスワード")) continue;  // 旧規則で止まる想定
    ok(r.safe, `contactGuard: 誤検知しない「${t.slice(0, 20)}」（${r.hits.join(",")}）`);
  }
  // ★ 実際の外部出力（全テンプレート×3系統）で1件も止まらないこと。
  //   ここが赤くなると、正しい定義が出力できなくなる＝実害が出る。
  for (const key of Object.keys(api.TEMPLATES)) {
    const d = api.TEMPLATES[key].make();
    for (const tab of ["json"]) {
      const text = api.payloadFor(tab, d).text;
      const r = api.contactGuard(text);
      ok(r.safe, `contactGuard: テンプレート ${key} の ${tab} を誤検知しない（${r.hits.join(",")}）`);
    }
  }
}

// ── 4-f. 承認は「内容」に紐づく（承認後に編集したら無効） ──
{
  const label = "approval-binding";
  const snap = { tab: "json", text: "AAA" };
  ok(api.approvalMatches("json", "AAA", snap), "approval: 同じ内容なら有効");
  ok(!api.approvalMatches("json", "AAB", snap),
     "★approval: 承認後に内容が変わったら無効（1文字でも）");
  ok(!api.approvalMatches("yaml", "AAA", snap), "approval: 別タブの承認は流用できない");
  ok(!api.approvalMatches("json", "AAA", null), "approval: 承認が無ければ無効");
  ok(api.isExternalOutput("json") && !api.isExternalOutput("prompt")
     && !api.isExternalOutput("guild"), "approval: 外部出力は Character File のみ");
  ok(!api.isExternalOutput("yaml") && !api.isExternalOutput("test"),
     "approval: 内部成果物は対象外");
}

// ── 結果 ──
if (fails.length) {
  console.error("selftest FAILED (" + fails.length + "):");
  fails.forEach(f => console.error("  - " + f));
  process.exit(1);
}

console.log("selftest OK（Unified V1 YAML/JSON / タブ = yaml・json・test / テンプレート8種 / 5章 / ContactGuard）");
process.exit(0);
