/* verify-core.mjs — KOKOROAMU 署名検証の中核（ブラウザ / Node 共通・依存なし）
 *
 * 検証するもの:
 *   1. trust bundle（公開鍵・状態・失効）がルート鍵で署名されているか
 *   2. bundle が新しいか（generation の巻き戻し防止）／古すぎないか（fail-closed）
 *   2b. 分割配信（publishers.json / revocations.json）の世代が一致しているか
 *   3. 署名エンベロープの payload ダイジェストが payload と一致するか
 *   4. 署名が、束縛属性（publisher/key/purpose/版）ごと署名されているか
 *   5. 使われた鍵が bundle 上で有効か（active / retired / revoked と時刻）
 *
 * 設計上の固定点（緩めない）:
 *   - Package 内の公開鍵を自己信頼しない。鍵は必ず trust bundle から取る。
 *   - 署名は payload ダイジェストだけでなく束縛属性を含めて検証する
 *     （purpose を差し替えた再利用を防ぐ）。
 *   - 失効は「今後その鍵を信頼しない」ためのもの。すでに検証済みの
 *     Portable Character を遠隔削除する仕組みではない。
 *   - 判定不能はすべて「不合格」。曖昧なら通さない（fail-closed）。
 */

import { canonicalBytes, canonicalize } from "./canonical-json.mjs";
import { b64uDecode, digestLabel, timingSafeEqualStr } from "./bytes.mjs";
import { checkKeyPurposes, classifyPurpose, ENVELOPE_PURPOSES } from "./purposes.mjs";
import { checkRevocationLists } from "./trust-index.mjs";

export const ENVELOPE_SCHEMA = "KOKOROAMU-SIGNED";
export const BUNDLE_SCHEMA = "KOKOROAMU-TRUST-BUNDLE";
export const ENVELOPE_VERSION = "1.0";
export const BUNDLE_VERSION = "1.0";

/* 署名が覆う束縛属性。順序は正準化が決めるので、ここは「集合」の定義である。
   ここに無い項目は署名に守られない。増やすときは送り手・受け手を同時に直す。 */
export const SIGNED_ATTR_KEYS = [
  "alg", "created_at", "key_id", "payload_digest",
  "publisher_id", "purpose", "schema", "version",
];

const ALGS = {
  ES256: {
    importParams: { name: "ECDSA", namedCurve: "P-256" },
    verifyParams: { name: "ECDSA", hash: "SHA-256" },
  },
  Ed25519: {
    importParams: { name: "Ed25519" },
    verifyParams: { name: "Ed25519" },
  },
};

export class VerifyResult {
  constructor() {
    this.ok = false;
    this.errors = [];   // 不合格の理由（1件でもあれば ok=false）
    this.warnings = []; // 通すが記録すべきこと
    this.info = {};     // 表示用の事実
  }
  fail(code, msg) { this.errors.push({ code, msg }); this.ok = false; return this; }
  warn(code, msg) { this.warnings.push({ code, msg }); return this; }
}

function isIsoTime(s) {
  return typeof s === "string" && !Number.isNaN(Date.parse(s));
}
const t = s => Date.parse(s);

async function importKey(alg, spkiB64u) {
  const spec = ALGS[alg];
  if (!spec) throw new Error(`未対応のアルゴリズム: ${alg}`);
  return crypto.subtle.importKey(
    "spki", b64uDecode(spkiB64u), spec.importParams, false, ["verify"]);
}

/* ECDSA 署名が DER（ASN.1）形式かを見る。
   30 <len> 02 ... 02 ... で、全体長が宣言と一致すれば DER とみなす。
   生の r‖s は P-256 なら必ず64バイトなので、長さでもほぼ判別できる。 */
export function looksLikeDerSignature(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) return false;
  if (bytes[0] !== 0x30) return false;
  const len = bytes[1];
  if (len & 0x80) return false;                 // P-256 の署名で長形式は来ない
  if (len + 2 !== bytes.length) return false;
  return bytes[2] === 0x02;
}

async function verifyRaw(alg, spkiB64u, sigB64u, bytes) {
  const key = await importKey(alg, spkiB64u);
  const sig = b64uDecode(sigB64u);
  /* ★ Cloud KMS などの HSM は ECDSA 署名を DER で返す。
     WebCrypto が受け取るのは生の r‖s（64バイト）である。
     変換し忘れると「署名が一致しない」としか出ず、鍵の設定ミスと区別がつかない。
     ここで名指しにして、原因究明の時間を溶かさないようにする。 */
  if (alg === "ES256" && sig.length !== 64 && looksLikeDerSignature(sig)) {
    const e = new Error(
      "署名が DER（ASN.1）形式である。ES256 の署名は生の r‖s（64バイト）で入れること。"
      + "Cloud KMS の asymmetricSign は DER を返すため、署名側で derToRaw() による"
      + "変換が必要（bin/lib/kms.mjs）");
    e.code = "SIG_DER_FORMAT";
    throw e;
  }
  if (alg === "ES256" && sig.length !== 64) {
    const e = new Error(`ES256 の署名長が ${sig.length} バイト（64 でなければならない）`);
    e.code = "SIG_LENGTH";
    throw e;
  }
  return crypto.subtle.verify(ALGS[alg].verifyParams, key, sig, bytes);
}

/** 署名対象バイト列を組み立てる。送り手（Wix）も必ずこの関数と同じ集合を使う。 */
export function signedAttrs(sig, schema, version) {
  const a = {
    alg: sig.alg,
    created_at: sig.created_at,
    key_id: sig.key_id,
    payload_digest: sig.payload_digest,
    publisher_id: sig.publisher_id,
    purpose: sig.purpose,
    schema,
    version,
  };
  for (const k of SIGNED_ATTR_KEYS) {
    if (a[k] === undefined || a[k] === null || a[k] === "")
      throw new Error(`署名の束縛属性が欠けている: ${k}`);
  }
  return a;
}

/* ---------------------------------------------------------------- 鍵の状態 */

/**
 * 鍵が「その時刻の署名」に使えるかを判定する。
 * state:
 *   active   … 有効期間内なら可
 *   retired  … 引退。retired_at より前に作られた署名だけ可（新規署名は不可）
 *   revoked  … 失効。compromised_at 以降の署名を拒否。
 *               compromised_at が無い（＝いつ侵害されたか不明）なら全署名を拒否する。
 *               「不明なら安全側」を既定にする。
 */
export function evaluateKeyState(key, signedAtIso, res) {
  const at = t(signedAtIso);
  if (key.not_before && at < t(key.not_before))
    return res.fail("KEY_NOT_YET_VALID", `鍵 ${key.key_id} の発効前の署名`);
  if (key.not_after && at > t(key.not_after))
    return res.fail("KEY_EXPIRED", `鍵 ${key.key_id} の有効期限後の署名`);

  if (key.state === "active") return res;

  if (key.state === "retired") {
    if (key.retired_at && at >= t(key.retired_at))
      return res.fail("KEY_RETIRED",
        `鍵 ${key.key_id} は ${key.retired_at} に引退。以降の署名は受け付けない`);
    /* W-1（Owner 結果 173・QA7 I-1・C6）：引退前と名乗る署名の時刻は、署名した側の自己申告で、独立した証拠ではない。
       過去の証拠を確かめる仕組み（D6）が採択されるまでは受けない。警告は診断として残す */
    res.warn("KEY_RETIRED_OLD_SIG",
      `鍵 ${key.key_id} は引退済み。署名の時刻は引退前と名乗っている（自己申告）`);
    return res.fail("KEY_RETIRED_OLD_SIG",
      `鍵 ${key.key_id} は引退済み。引退前という署名の時刻を、独立した証拠で確かめられないので受けない`);
  }

  if (key.state === "revoked") {
    if (!key.compromised_at) {
      return res.fail("KEY_REVOKED",
        `鍵 ${key.key_id} は失効（侵害時刻が不明のため、この鍵の署名はすべて拒否）`
        + (key.revocation_reason ? `／理由: ${key.revocation_reason}` : ""));
    }
    if (at >= t(key.compromised_at))
      return res.fail("KEY_REVOKED",
        `鍵 ${key.key_id} は ${key.compromised_at} 以降が侵害。この署名は拒否`);
    /* W-1：危殆化した鍵の、侵害時刻より前と名乗る署名は、常に受けない（自己申告の時刻では救わない） */
    res.warn("KEY_REVOKED_OLD_SIG",
      `鍵 ${key.key_id} は失効済み。署名の時刻は侵害時刻より前と名乗っている（自己申告）`);
    return res.fail("KEY_REVOKED_OLD_SIG",
      `鍵 ${key.key_id} は失効済み。侵害時刻より前という署名の時刻を、独立した証拠で確かめられないので受けない`);
  }

  return res.fail("KEY_STATE_UNKNOWN", `鍵 ${key.key_id} の状態が不明: ${key.state}`);
}

/* ---------------------------------------------------------- trust bundle */

const KEY_TIME_FIELDS = ["not_before", "not_after", "retired_at", "compromised_at"];

/**
 * bundle に載った鍵の形を検査する。問題が無ければ null、あれば { code, msg }（最初の 1 件）。
 * ルートの署名が正しくても、形の壊れた鍵を載せた bundle は受け取らない（発行の誤りは fail-closed）。
 *   - key_id は bundle 全体で一意（publisher をまたいでも重ねない。消費側は key_id で引く）
 *   - 時刻の欄は、あれば時刻として読めること（読めない時刻は比較が素通りになる）
 *   - purposes は purposes.mjs の規則に従う（未知・Studio 用・root 用・兼用を拒否）
 */
export function validateBundleKeys(bundle) {
  if (!Array.isArray(bundle.publishers))
    return { code: "BUNDLE_PUBLISHERS", msg: "publishers が配列でない" };
  const seen = new Set();
  for (const p of bundle.publishers) {
    if (!p || typeof p.publisher_id !== "string" || p.publisher_id === "" || !Array.isArray(p.keys))
      return { code: "BUNDLE_PUBLISHERS", msg: "publisher の形が不正" };
    for (const k of p.keys) {
      if (!k || typeof k.key_id !== "string" || k.key_id === "")
        return { code: "BUNDLE_KEY_ID", msg: `publisher ${p.publisher_id} に key_id の無い鍵がある` };
      if (seen.has(k.key_id))
        return { code: "BUNDLE_KEY_ID_DUPLICATE", msg: `key_id ${k.key_id} が bundle の中で重複している` };
      seen.add(k.key_id);
      for (const f of KEY_TIME_FIELDS) {
        if (k[f] !== undefined && !isIsoTime(k[f]))
          return { code: "KEY_TIME_INVALID", msg: `鍵 ${k.key_id} の ${f} が時刻でない: ${k[f]}` };
      }
      const pe = checkKeyPurposes(k);
      if (pe) return pe;
    }
  }
  return null;
}

/**
 * trust bundle を検証する。
 * @param bundle    bundle.json の中身
 * @param bundleSig bundle.sig.json の中身（署名エンベロープと同じ形）
 * @param opts.rootKeys        クライアントに焼き込んだルート鍵（[{key_id,alg,public_key,state}]）
 * @param opts.lastKnownGeneration 前回受理した generation（巻き戻し防止。無ければ null）
 * @param opts.lastKnownBundleDigest 前回受理した bundle の digest（"sha256-…"）。同じ generation で違えば拒否、null は不明で一致と扱わない。undefined なら比べない
 *                                 opts.lastKnownSerial は旧称として受け付ける
 * @param opts.now             判定時刻（既定: 現在）
 * @param opts.offline         真なら鮮度切れを警告に留める（利用者に表示する前提）
 */
export async function verifyTrustBundle(bundle, bundleSig, opts = {}) {
  const res = new VerifyResult();
  res.ok = true;
  const now = opts.now ? t(opts.now) : Date.now();
  const roots = opts.rootKeys || [];

  if (!bundle || bundle.schema !== BUNDLE_SCHEMA)
    return res.fail("BUNDLE_SCHEMA", `schema が ${BUNDLE_SCHEMA} でない`);
  if (bundle.version !== BUNDLE_VERSION)
    return res.fail("BUNDLE_VERSION", `未対応の版: ${bundle.version}`);
  /* 世代番号。generation を正とし、serial は旧称として受け入れる。
     両方あって食い違う場合は拒否する（どちらが正か決められない＝判定不能）。 */
  const gen = bundle.generation !== undefined ? bundle.generation : bundle.serial;
  if (bundle.generation !== undefined && bundle.serial !== undefined
      && bundle.generation !== bundle.serial)
    return res.fail("BUNDLE_GENERATION_CONFLICT",
      `generation(${bundle.generation}) と serial(${bundle.serial}) が食い違う`);
  if (!Number.isSafeInteger(gen) || gen < 0)
    return res.fail("BUNDLE_GENERATION", "generation が非負整数でない");
  if (!isIsoTime(bundle.issued_at) || !isIsoTime(bundle.next_update))
    return res.fail("BUNDLE_TIME", "issued_at / next_update が時刻でない");

  /* --- ルート鍵による署名 --- */
  if (!roots.length)
    return res.fail("NO_ROOT", "ルート鍵が渡されていない（自己信頼はしない）");
  const sig = (bundleSig && bundleSig.signatures || [])[0];
  if (!sig) return res.fail("BUNDLE_UNSIGNED", "bundle の署名が無い");
  if (sig.purpose !== "trust-bundle")
    return res.fail("BUNDLE_PURPOSE", `purpose が trust-bundle でない: ${sig.purpose}`);

  const root = roots.find(k => k.key_id === sig.key_id);
  if (!root)
    return res.fail("ROOT_UNKNOWN",
      `bundle を署名した鍵 ${sig.key_id} は、焼き込まれたルート鍵に無い`);
  if (root.alg !== sig.alg)
    return res.fail("ROOT_ALG", `ルート鍵のアルゴリズム不一致: ${sig.alg}`);
  evaluateKeyState(root, sig.created_at, res);
  if (!res.ok) return res;

  const bundleBytes = canonicalBytes(bundle);
  const dl = await digestLabel(bundleBytes);
  if (!timingSafeEqualStr(dl, sig.payload_digest || ""))
    return res.fail("BUNDLE_DIGEST", "bundle のダイジェストが署名と一致しない");

  let attrs;
  try { attrs = signedAttrs(sig, BUNDLE_SCHEMA, BUNDLE_VERSION); }
  catch (e) { return res.fail("BUNDLE_ATTRS", e.message); }

  let okSig = false;
  try { okSig = await verifyRaw(sig.alg, root.public_key, sig.sig, canonicalBytes(attrs)); }
  catch (e) { return res.fail(e.code || "BUNDLE_SIG_ERROR", `bundle の署名: ${e.message}`); }
  if (!okSig) return res.fail("BUNDLE_SIG", "bundle の署名が検証できない");

  /* --- 載っている鍵の形 --- */
  const keyErr = validateBundleKeys(bundle);
  if (keyErr) return res.fail(keyErr.code, `bundle の鍵: ${keyErr.msg}`);

  /* --- 巻き戻し防止 --- */
  const last = opts.lastKnownGeneration !== undefined
    ? opts.lastKnownGeneration : opts.lastKnownSerial;
  /* W-2（Owner 結果 173・QA7 I-2）：受け入れた watermark の digest（"sha256-…" のラベル）。
     undefined は「比べない」（watermark を持たない呼び出し側）。null・形の違う値は「不明」で、一致とは扱わない */
  const lastDigest = opts.lastKnownBundleDigest;
  if (Number.isSafeInteger(last)) {
    if (gen < last)
      return res.fail("BUNDLE_ROLLBACK",
        `古い bundle を渡された（generation ${gen} < 既知 ${last}）。`
        + "巻き戻し攻撃の可能性がある");
    if (gen === last) {
      res.warn("BUNDLE_SAME_GENERATION", `既知と同じ generation ${gen}`);
      if (lastDigest !== undefined) {
        // 同じ世代・同じ digest は取り直しとして受ける。違う digest・不明（null・形の違う値）は、分岐か巻き戻しとして受けない
        const comparable = typeof lastDigest === "string" && lastDigest.startsWith("sha256-");
        if (!comparable || !timingSafeEqualStr(lastDigest, dl))
          return res.fail("BUNDLE_SAME_GENERATION",
            comparable
              ? `既知と同じ generation ${gen} なのに bundle の digest が違う（分岐か巻き戻しの可能性がある）`
              : `既知と同じ generation ${gen} だが、受け入れた digest が不明なので一致と扱わない`);
      }
    }
  } else if (lastDigest !== undefined && lastDigest !== null) {
    return res.fail("BUNDLE_WATERMARK_INVALID", "digest だけがあって generation が無い watermark は使わない");
  }

  /* --- 鮮度（fail-closed） --- */
  const stale = now > t(bundle.next_update);
  res.info.stale = stale;
  res.info.generation = gen;
  res.info.serial = gen;            // 旧称。表示側の互換のため残す
  res.info.bundle_digest = dl;
  res.info.issued_at = bundle.issued_at;
  res.info.next_update = bundle.next_update;
  res.info.age_hours = Math.floor((now - t(bundle.issued_at)) / 3600000);
  if (stale) {
    const msg = `trust bundle の鮮度切れ（next_update ${bundle.next_update} を経過）。`
      + "失効情報が最新でない可能性がある";
    if (opts.offline) res.warn("BUNDLE_STALE_OFFLINE", msg + "／オフライン検証として続行");
    else return res.fail("BUNDLE_STALE", msg);
  }
  return res;
}

/** bundle から publisher/key を引く */
export function findKey(bundle, publisherId, keyId) {
  const p = (bundle.publishers || []).find(x => x.publisher_id === publisherId);
  if (!p) return { publisher: null, key: null };
  const k = (p.keys || []).find(x => x.key_id === keyId);
  return { publisher: p, key: k || null };
}

/* ------------------------------------------------------ 署名エンベロープ */

/**
 * 署名済みオブジェクトを検証する。
 * @param env  {schema, version, payload, signatures:[...]}
 * @param bundle 検証済みの trust bundle
 * @param opts.expectedPurpose 期待する用途（既定 "character-package"）
 * @param opts.requiredSignatures 必要な有効署名数（既定 1）
 * @param opts.now 判定時刻
 */
export async function verifySignedEnvelope(env, bundle, opts = {}) {
  const res = new VerifyResult();
  res.ok = true;
  const now = opts.now ? t(opts.now) : Date.now();
  const want = opts.expectedPurpose || "character-package";
  const need = opts.requiredSignatures || 1;

  /* この封筒で検証してよいのは publisher 区分の用途だけ。
     Studio の鍵の目的、重ね署名、パッチ、root の目的をここで「発行者の署名」として通さない。 */
  if (!ENVELOPE_PURPOSES.includes(want)) {
    const c = classifyPurpose(want);
    if (c === "studio")
      return res.fail("STUDIO_PURPOSE_NOT_PUBLISHER",
        `期待する用途 ${want} は AMU Studio の鍵の目的。publisher の検証器では受け付けない`);
    if (c === "unknown" || c === "consumer-role")
      return res.fail("PURPOSE_UNKNOWN", `期待する用途 ${want} は一覧に無い`);
    return res.fail("EXPECTED_PURPOSE_NOT_ENVELOPE",
      `期待する用途 ${want}（${c}）は、この封筒の発行者の署名としては検証しない`);
  }

  if (!env || env.schema !== ENVELOPE_SCHEMA)
    return res.fail("ENV_SCHEMA", `schema が ${ENVELOPE_SCHEMA} でない`);
  if (env.version !== ENVELOPE_VERSION)
    return res.fail("ENV_VERSION", `未対応の版: ${env.version}`);
  if (typeof env.payload !== "object" || env.payload === null)
    return res.fail("ENV_PAYLOAD", "payload がオブジェクトでない");
  if (!Array.isArray(env.signatures) || env.signatures.length === 0)
    return res.fail("ENV_UNSIGNED", "署名が無い");

  /* Package が自分で公開鍵を持ち込んでいたら、それは設計違反。無視ではなく拒否する。 */
  const smuggled = [];
  for (const s of env.signatures) if (s.public_key) smuggled.push(s.key_id || "?");
  if (Object.prototype.hasOwnProperty.call(env, "keys")
      || Object.prototype.hasOwnProperty.call(env, "trust")) smuggled.push("(envelope)");
  if (smuggled.length)
    return res.fail("SELF_TRUST",
      `Package 内に公開鍵が同梱されている（${smuggled.join(", ")}）。`
      + "鍵は trust bundle からのみ取る");

  /* 実行コードの禁止（Portable Character の境界。署名済みでも解除されない） */
  const codeHit = findExecutableCode(env.payload);
  if (codeHit)
    return res.fail("EXECUTABLE_CODE",
      `payload に実行コードとみなす値がある（${codeHit}）。`
      + "署名済みであっても実行コードは持ち込めない");

  /* payload ダイジェスト */
  let payloadBytes, want_digest;
  try {
    payloadBytes = canonicalBytes(env.payload);
    want_digest = await digestLabel(payloadBytes);
  } catch (e) {
    return res.fail("CANONICALIZE", `payload を正準化できない: ${e.message}`);
  }
  res.info.payload_digest = want_digest;
  res.info.payload_bytes = payloadBytes.length;

  let valid = 0;
  res.info.signatures = [];
  for (const [i, s] of env.signatures.entries()) {
    const sr = new VerifyResult(); sr.ok = true;
    const at = `signatures[${i}]`;

    if (s.purpose !== want)
      sr.fail(classifyPurpose(s.purpose) === "studio" ? "STUDIO_PURPOSE_NOT_PUBLISHER" : "PURPOSE",
        `${at}: purpose が ${want} でない（${s.purpose}）`);
    if (!isIsoTime(s.created_at))
      sr.fail("CREATED_AT", `${at}: created_at が時刻でない`);
    else if (t(s.created_at) > now + 5 * 60000)
      sr.fail("FUTURE_SIG", `${at}: 未来の署名時刻`);
    if (!ALGS[s.alg]) sr.fail("ALG", `${at}: 未対応のアルゴリズム ${s.alg}`);
    if (!timingSafeEqualStr(want_digest, s.payload_digest || ""))
      sr.fail("DIGEST", `${at}: payload_digest が payload と一致しない`);

    const { publisher, key } = findKey(bundle, s.publisher_id, s.key_id);
    if (!publisher) sr.fail("PUBLISHER_UNKNOWN", `${at}: 未知の publisher ${s.publisher_id}`);
    else if (!key) sr.fail("KEY_UNKNOWN", `${at}: 未知の鍵 ${s.key_id}`);
    else {
      if (key.alg !== s.alg) sr.fail("ALG_MISMATCH", `${at}: 鍵とアルゴリズムが不一致`);
      /* purposes の無い鍵を「どの用途でも可」とはしない（以前はここが素通りだった） */
      const pe = checkKeyPurposes(key);
      if (pe) sr.fail(pe.code, `${at}: ${pe.msg}`);
      else if (!key.purposes.includes(s.purpose))
        sr.fail("PURPOSE_NOT_ALLOWED",
          `${at}: 鍵 ${key.key_id} は用途 ${s.purpose} を許可されていない`);
      if (sr.ok) evaluateKeyState(key, s.created_at, sr);
      if (sr.ok) {
        let ok = false;
        try {
          ok = await verifyRaw(s.alg, key.public_key, s.sig,
            canonicalBytes(signedAttrs(s, ENVELOPE_SCHEMA, ENVELOPE_VERSION)));
        } catch (e) { sr.fail(e.code || "SIG_ERROR", `${at}: ${e.message}`); }
        if (!sr.errors.length && !ok) sr.fail("SIG", `${at}: 署名が一致しない`);
      }
    }

    if (sr.ok && !sr.errors.length) valid++;
    res.info.signatures.push({
      index: i, publisher_id: s.publisher_id, key_id: s.key_id, alg: s.alg,
      created_at: s.created_at, purpose: s.purpose,
      ok: sr.ok && !sr.errors.length,
      publisher_name: publisher ? publisher.name : null,
      key_state: key ? key.state : null,
      errors: sr.errors, warnings: sr.warnings,
    });
    sr.warnings.forEach(w => res.warn(w.code, w.msg));
    sr.errors.forEach(e => res.warn("SIG_REJECTED", e.msg));
  }

  res.info.valid_signatures = valid;
  if (valid < need)
    return res.fail("INSUFFICIENT_SIGNATURES",
      `有効な署名が ${valid} 件（${need} 件必要）`);
  return res;
}

/* 実行コードの持ち込み検出。
   完全な検出は不可能だが、「うっかり入った」を止めるための最低限の網。
   キー名と、明らかにコードである値の形を見る。 */
const CODE_KEYS = /^(script|scripts|code|eval|exec|command|cmd|shell|hook|hooks|on[A-Z_]|function|require|import)$/;
const CODE_VALUE = /^\s*(?:function\s*\(|\(\s*\)\s*=>|async\s+function|javascript:|data:text\/javascript|<script\b)/i;

function findExecutableCode(v, path = "$") {
  if (v === null) return null;
  if (typeof v === "string") return CODE_VALUE.test(v) ? path : null;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const r = findExecutableCode(v[i], `${path}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (typeof v === "object") {
    for (const k of Object.keys(v)) {
      if (CODE_KEYS.test(k)) return `${path}.${k}`;
      const r = findExecutableCode(v[k], `${path}.${k}`);
      if (r) return r;
    }
  }
  return null;
}

export { canonicalize, canonicalBytes };


/* ==================================================================
   分割配信（publishers.json / revocations.json）
   ==================================================================
   .jp では公開鍵と失効情報を別ファイルで配る。分けると運用は楽になるが、
   **「新しい publishers ＋ 古い revocations」を組み合わせる攻撃**が成立しうる。
   失効だけ古いものを掴ませれば、失効した鍵が生き返って見える。

   したがって分割ファイルは、それぞれが
     - 同じ generation を持つ
     - 由来する bundle のダイジェスト（bundle_digest）を持つ
     - 個別にルート鍵で署名されている
   ことを必須にし、取得側でbundle・publishers・revocationsの**3つとも一致すること**を確かめる。
   1つでも食い違えば、組み合わせが壊れているとみなして拒否する。
*/

export const PROJECTION_SCHEMAS = {
  publishers: "KOKOROAMU-TRUST-PUBLISHERS",
  revocations: "KOKOROAMU-TRUST-REVOCATIONS",
};

/**
 * 分割ファイル（projection）を検証する。
 * @param kind "publishers" | "revocations"
 * @param doc  ファイルの中身
 * @param sig  対応する .sig.json
 * @param opts.rootKeys  焼き込んだルート公開鍵
 * @param opts.expectGeneration     bundle の generation（一致必須）
 * @param opts.expectBundleDigest   bundle のダイジェスト（一致必須）
 */
export async function verifyProjection(kind, doc, sig, opts = {}) {
  const res = new VerifyResult();
  res.ok = true;
  const schema = PROJECTION_SCHEMAS[kind];
  if (!schema) return res.fail("PROJ_KIND", `未知の種別: ${kind}`);
  if (!doc || doc.schema !== schema)
    return res.fail("PROJ_SCHEMA", `schema が ${schema} でない`);

  const roots = opts.rootKeys || [];
  if (!roots.length) return res.fail("NO_ROOT", "ルート鍵が渡されていない");

  const s0 = (sig && sig.signatures || [])[0];
  if (!s0) return res.fail("PROJ_UNSIGNED", `${kind} の署名が無い`);
  if (s0.purpose !== `trust-${kind}`)
    return res.fail("PROJ_PURPOSE", `purpose が trust-${kind} でない: ${s0.purpose}`);

  const root = roots.find(k => k.key_id === s0.key_id);
  if (!root) return res.fail("ROOT_UNKNOWN", `未知のルート鍵 ${s0.key_id}`);
  if (root.alg !== s0.alg) return res.fail("ROOT_ALG", "ルート鍵のアルゴリズム不一致");
  evaluateKeyState(root, s0.created_at, res);
  if (!res.ok) return res;

  const bytes = canonicalBytes(doc);
  const dl = await digestLabel(bytes);
  if (!timingSafeEqualStr(dl, s0.payload_digest || ""))
    return res.fail("PROJ_DIGEST", `${kind} のダイジェストが署名と一致しない`);

  let ok = false;
  try {
    ok = await verifyRaw(s0.alg, root.public_key, s0.sig,
      canonicalBytes(signedAttrs(s0, schema, doc.version || BUNDLE_VERSION)));
  } catch (e) { return res.fail(e.code || "PROJ_SIG_ERROR", `${kind} の署名: ${e.message}`); }
  if (!ok) return res.fail("PROJ_SIG", `${kind} の署名が検証できない`);

  /* --- 組み合わせの一致（ここが分割配信の要） --- */
  if (opts.expectGeneration !== undefined && doc.generation !== opts.expectGeneration)
    return res.fail("PROJ_GENERATION_MISMATCH",
      `${kind} の generation ${doc.generation} が bundle の ${opts.expectGeneration} と違う。`
      + "新旧を混ぜた組み合わせの可能性がある");
  if (opts.expectBundleDigest && doc.bundle_digest
      && !timingSafeEqualStr(doc.bundle_digest, opts.expectBundleDigest))
    return res.fail("PROJ_BUNDLE_MISMATCH",
      `${kind} が別の bundle 由来である（bundle_digest 不一致）`);
  if (opts.expectBundleDigest && !doc.bundle_digest)
    return res.fail("PROJ_NO_BINDING",
      `${kind} に bundle_digest が無い。どの bundle 由来か決められない`);

  /* 失効の一覧（重ね署名・自分用の鍵・パッチ）の形。壊れた一覧は「失効なし」と読まない */
  if (kind === "revocations") {
    const shape = checkRevocationLists(doc);
    if (shape) return res.fail(shape.code, `revocations: ${shape.msg}`);
  }

  res.info.generation = doc.generation;
  res.info.kind = kind;
  return res;
}

/**
 * ルート鍵が直接署名した文書を検証する（projection 以外の文書。今は Seat8 の PLATFORM.json）。
 * 形は projection と同じ: 束縛属性（schema・version・purpose を含む）の正準化へのルートの署名。
 * purpose を必ず照合するので、trust の文書への署名をこの文書の署名として使い回せない（逆も同じ）。
 * @param body 署名の対象（署名の欄を除いた文書）
 * @param sig  { publisher_id, key_id, alg, purpose, created_at, payload_digest, sig }
 * @param opts { rootKeys, schema, version, purpose }
 */
export async function verifyRootSignature(body, sig, opts = {}) {
  const res = new VerifyResult();
  res.ok = true;
  const roots = opts.rootKeys || [];
  if (!roots.length) return res.fail("NO_ROOT", "ルート鍵が渡されていない");
  if (!opts.schema || !opts.version || !opts.purpose)
    return res.fail("ROOT_DOC_OPTS", "schema・version・purpose の指定が要る");
  if (!sig || typeof sig !== "object") return res.fail("ROOT_DOC_UNSIGNED", "ルートの署名が無い");
  if (sig.purpose !== opts.purpose)
    return res.fail("ROOT_DOC_PURPOSE", `purpose が ${opts.purpose} でない: ${sig.purpose}`);
  const root = roots.find(k => k.key_id === sig.key_id);
  if (!root) return res.fail("ROOT_UNKNOWN", `未知のルート鍵 ${sig.key_id}`);
  if (root.alg !== sig.alg) return res.fail("ROOT_ALG", "ルート鍵のアルゴリズム不一致");
  if (!isIsoTime(sig.created_at)) return res.fail("CREATED_AT", "created_at が時刻でない");
  evaluateKeyState(root, sig.created_at, res);
  if (!res.ok) return res;
  let dl;
  try { dl = await digestLabel(canonicalBytes(body)); }
  catch (e) { return res.fail("CANONICALIZE", `正準化できない: ${e.message}`); }
  if (!timingSafeEqualStr(dl, sig.payload_digest || ""))
    return res.fail("ROOT_DOC_DIGEST", "文書のダイジェストが署名と一致しない");
  let ok = false;
  try {
    ok = await verifyRaw(sig.alg, root.public_key, sig.sig,
      canonicalBytes(signedAttrs(sig, opts.schema, opts.version)));
  } catch (e) { return res.fail(e.code || "ROOT_DOC_SIG_ERROR", `署名: ${e.message}`); }
  if (!ok) return res.fail("ROOT_DOC_SIG", "ルートの署名が検証できない");
  res.info.payload_digest = dl;
  res.info.root_key_id = sig.key_id;
  return res;
}

/* ==================================================================
   鮮度の扱い（新規インポートと既存利用を分ける）
   ==================================================================
   期限切れの trust bundle を一律に「不合格」にすると、
   Portable Character の独立利用（オフラインでの既存キャラの起動）まで壊れる。
   一方、期限切れのまま新しいものを取り込めば、失効した鍵で署名された
   Package を招き入れてしまう。

   そこで用途で分ける:
     import（新規に取り込む）… 期限切れなら**拒否**
     use   （既に検証済みのものを使い続ける）… 続行してよい。ただし
                                               古さを必ず表示し、データは消さない
   「失効は遠隔削除ではない」という原則と一貫している。
*/
export function freshnessPolicy(bundleInfo, action = "import", now = Date.now()) {
  const stale = !!bundleInfo.stale;
  const ageH = bundleInfo.age_hours;
  if (!stale) return { allow: true, reason: "", display: "" };
  if (action === "use")
    return {
      allow: true,
      reason: "STALE_BUT_EXISTING",
      display: `信頼情報が古い状態です（${ageH} 時間前の版）。`
        + "失効の反映が遅れている可能性があります。既存のデータは保持されます。",
    };
  return {
    allow: false,
    reason: "STALE_IMPORT_DENIED",
    display: `信頼情報が期限切れのため、新しい取り込みを行いません`
      + `（${ageH} 時間前の版）。接続を確認して更新してください。`
      + "既存のデータは削除されません。",
  };
}
