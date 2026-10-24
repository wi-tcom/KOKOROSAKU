/* trust-index.mjs — 検証済みの trust から、重ね署名・パッチ・書き出しの層の検証器が引く索引を作る（CANDIDATE）
 *
 * ADR-0024（重ね署名）と ADR-0025（パッチ）の参照実装は、trust を次の形で読む:
 *   keys[key_id] = { publisher_id, purposes, status, public_key_hex }
 *   revocations  = { countersignature_ids, self_key_ids, countersigner_key_ids, patch_ids, patch_key_ids,
 *                    overlay_ids, overlay_key_ids }
 * ADR-0026（書き出しの層、Owner 2026-10-03 §13）も同じ索引から引く。
 * 公開している trust は publishers[].keys[]（SPKI・state）と、別ファイルの revocations である。
 * この 2 つの合わせ方を、ここで 1 か所に決める（ADR-0024 §7「trust の封筒との細かな合わせ方」）。
 *
 * 固定点（緩めない）:
 *   - 入力は verifyTrustBundle と verifyProjection("revocations", …) を通したものに限る。
 *     この関数は署名を確かめない。署名の無い bundle から索引を作ってはいけない。
 *   - bundle と revocations の generation が違えば作らない（新旧の組み合わせを拒否）。
 *   - 失効の一覧に載った鍵は、bundle の state が active でも revoked として返す。
 *   - 鍵の兼用・未知の鍵・失効は、ADR の code で「使えない」と返す。
 */

import { b64uDecode, toHex } from "./bytes.mjs";
import { checkKeyPurposes, classifyPurpose, TRUST_KEY_PURPOSES } from "./purposes.mjs";

/* revocations projection に足す一覧（ADR-0024 §5・ADR-0025 §5）。どれも無くてよい。 */
export const REVOCATION_LISTS = Object.freeze([
  "countersignature_ids", "self_key_ids", "countersigner_key_ids", "patch_ids", "patch_key_ids",
  "overlay_ids", "overlay_key_ids",   // ADR-0026: 層の ID（署名する bytes の SHA-256、hex64）と層の鍵
]);
const HEX64 = /^[0-9a-f]{64}$/;

/* 重ね署名の失効の理由（Owner 決定 2026-09-27-11 A4）。 */
export const COUNTERSIGNATURE_REVOCATION_REASONS = Object.freeze([
  "problem-found", "applicant-request", "key-compromise",
]);

/* 重ね署名とパッチの鍵を出す publisher（ADR-0024 §5・ADR-0025 §5）。 */
export const WI_T_PUBLISHER_ID = "wi-t.com";

export class TrustIndexError extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.name = "TrustIndexError"; this.code = code; }
}

const isIso = s => typeof s === "string" && !Number.isNaN(Date.parse(s));
/* 鍵の日付の欄。読めない値は比較が常に偽になり（NaN）、素通りになるので、あれば時刻として読めることを必須にする。 */
const KEY_DATE_FIELDS = ["not_before", "not_after", "retired_at", "compromised_at"];
const badKeyDate = key => KEY_DATE_FIELDS.find(f => key[f] !== undefined && key[f] !== null && !isIso(key[f]));

/**
 * revocations projection の追加の一覧の形を検査する。問題が無ければ null、あれば { code, msg }。
 * 項目は { id, revoked_at, reason }。id は一覧の中で一意。
 */
export function checkRevocationLists(doc) {
  if (!doc || typeof doc !== "object") return { code: "REVOCATIONS_SHAPE", msg: "revocations が無い" };
  if (!Array.isArray(doc.revocations))
    return { code: "REVOCATIONS_SHAPE", msg: "revocations.revocations が配列でない" };
  /* revocations.revocations の項目には、形と当て方の決まりが無い（索引にも当てない）。空でない一覧を「失効なし」と
     読み替えないよう、空の配列だけを受ける（統括 2026-10-09、商品企画開発部の確認 2）。SAKU の発行者の鍵の失効は、
     bundle の中のその鍵の state で配る。追加の一覧（REVOCATION_LISTS）は下で検査する。 */
  if (doc.revocations.length !== 0)
    return { code: "REVOCATIONS_FORMAT_UNSUPPORTED", msg: `revocations.revocations に ${doc.revocations.length} 件ある（形式と当て方の決まりが無いので使わない）` };
  for (const name of Object.keys(doc)) {
    if (/_ids$/.test(name) && !REVOCATION_LISTS.includes(name))
      return { code: "REVOCATIONS_LIST_UNKNOWN", msg: `知らない失効の一覧: ${name}` };
  }
  for (const name of REVOCATION_LISTS) {
    if (doc[name] === undefined) continue;
    if (!Array.isArray(doc[name]))
      return { code: "REVOCATIONS_SHAPE", msg: `${name} が配列でない` };
    const seen = new Set();
    for (const e of doc[name]) {
      if (!e || typeof e.id !== "string" || e.id === "")
        return { code: "REVOCATIONS_ENTRY", msg: `${name} に id の無い項目がある` };
      if (seen.has(e.id))
        return { code: "REVOCATIONS_DUPLICATE", msg: `${name} に ${e.id} が重複している` };
      seen.add(e.id);
      if (!isIso(e.revoked_at))
        return { code: "REVOCATIONS_ENTRY", msg: `${name} の ${e.id}: revoked_at が時刻でない` };
      if (typeof e.reason !== "string" || e.reason === "")
        return { code: "REVOCATIONS_ENTRY", msg: `${name} の ${e.id}: reason が無い` };
      if (name === "overlay_ids" && !HEX64.test(e.id))
        return { code: "REVOCATIONS_ENTRY", msg: `${name} の ${e.id}: 層の ID は SHA-256 の hex（小文字 64 桁）` };
      if (name === "countersignature_ids" && !COUNTERSIGNATURE_REVOCATION_REASONS.includes(e.reason))
        return { code: "REVOCATIONS_REASON", msg: `${name} の ${e.id}: 理由 ${e.reason} は A4 の 3 つに無い` };
    }
  }
  return null;
}

/** Ed25519 の SPKI（base64url）から生の公開鍵 32 byte（hex）を取り出す。Ed25519 でなければ null。 */
const ED25519_SPKI_PREFIX = "302a300506032b6570032100";
export function ed25519RawHexFromSpki(spkiB64u) {
  let der;
  try { der = b64uDecode(spkiB64u); } catch { return null; }
  const hex = toHex(der);
  if (der.length !== 44 || !hex.startsWith(ED25519_SPKI_PREFIX)) return null;
  return hex.slice(ED25519_SPKI_PREFIX.length);
}

/**
 * 検証済みの bundle と revocations から索引を作る。
 * @returns { generation, keys: {[key_id]: {...}}, revocations: {[list]: string[]} }
 */
export function buildTrustIndex(bundle, revocationsDoc) {
  if (!bundle || !Array.isArray(bundle.publishers))
    throw new TrustIndexError("INDEX_BUNDLE", "bundle が無い");
  if (!revocationsDoc || revocationsDoc.generation !== bundle.generation)
    throw new TrustIndexError("INDEX_GENERATION_MISMATCH",
      "bundle と revocations の generation が違う（新旧を混ぜた組み合わせ）");
  const shape = checkRevocationLists(revocationsDoc);
  if (shape) throw new TrustIndexError(shape.code, shape.msg);

  const revocations = {};
  for (const name of REVOCATION_LISTS)
    revocations[name] = Object.freeze((revocationsDoc[name] || []).map(e => e.id));
  const revokedKeys = new Set([...revocations.countersigner_key_ids, ...revocations.patch_key_ids, ...revocations.overlay_key_ids]);

  const keys = {};
  for (const p of bundle.publishers) {
    for (const k of p.keys || []) {
      if (Object.prototype.hasOwnProperty.call(keys, k.key_id))
        throw new TrustIndexError("INDEX_KEY_ID_DUPLICATE", `key_id ${k.key_id} が重複している`);
      const pe = checkKeyPurposes(k);
      if (pe) throw new TrustIndexError(pe.code, pe.msg);
      const bad = badKeyDate(k);
      if (bad) throw new TrustIndexError("KEY_TIME_INVALID", `鍵 ${k.key_id} の ${bad} が時刻でない`);
      keys[k.key_id] = Object.freeze({
        key_id: k.key_id,
        publisher_id: p.publisher_id,
        alg: k.alg,
        purposes: Object.freeze([...(k.purposes || [])]),
        status: revokedKeys.has(k.key_id) ? "revoked" : k.state,
        revoked_by_list: revokedKeys.has(k.key_id),
        not_before: k.not_before ?? null,
        not_after: k.not_after ?? null,
        retired_at: k.retired_at ?? null,
        compromised_at: k.compromised_at ?? null,
        public_key: k.public_key,
        public_key_hex: k.alg === "Ed25519" ? ed25519RawHexFromSpki(k.public_key) : null,
      });
    }
  }
  return Object.freeze({
    generation: bundle.generation,
    keys: Object.freeze(keys),
    revocations: Object.freeze(revocations),
  });
}

/** 一覧 list に id が載っているか。 */
export function isRevoked(index, list, id) {
  if (!REVOCATION_LISTS.includes(list)) throw new TrustIndexError("INDEX_LIST_UNKNOWN", list);
  return index.revocations[list].includes(id);
}

const refuse = code => ({ ok: false, code, key: null });

/**
 * 重ね署名の鍵を引く（ADR-0024 §3 の鍵の検査と同じ code）。
 * publisher 鍵（character-package／occupation-template など）やパッチの鍵は NOT_DEDICATED で拒否する。
 */
export function resolveCountersignerKey(index, keyId) {
  const key = index.keys[keyId];
  if (!key || key.publisher_id !== WI_T_PUBLISHER_ID) return refuse("COUNTERSIGNER_KEY_UNKNOWN");
  if (key.purposes.length !== 1 || key.purposes[0] !== "amupkg-countersignature")
    return refuse("COUNTERSIGNER_KEY_NOT_DEDICATED");
  if (key.status !== "active" || isRevoked(index, "countersigner_key_ids", keyId))
    return refuse("COUNTERSIGNER_KEY_REVOKED");
  if (key.alg !== "Ed25519" || !key.public_key_hex) return refuse("COUNTERSIGNER_KEY_ALG");
  return { ok: true, code: null, key };
}

/**
 * パッチの鍵を引く（ADR-0025 §4・§5）。purpose は saku-character-patch か amu-instance-patch。
 */
export function resolvePatchKey(index, keyId, purpose) {
  if (classifyPurpose(purpose) !== "patch") return refuse("PATCH_PURPOSE_UNKNOWN");
  const key = index.keys[keyId];
  if (!key || key.publisher_id !== WI_T_PUBLISHER_ID) return refuse("PATCH_KEY_UNKNOWN");
  if (key.purposes.some(p => TRUST_KEY_PURPOSES[p]?.key_class !== "patch"))
    return refuse("PATCH_KEY_NOT_DEDICATED");
  if (!key.purposes.includes(purpose)) return refuse("PATCH_PURPOSE_MISMATCH");
  if (key.status !== "active" || isRevoked(index, "patch_key_ids", keyId))
    return refuse("PATCH_KEY_REVOKED");
  if (key.alg !== "Ed25519" || !key.public_key_hex) return refuse("PATCH_KEY_ALG");
  return { ok: true, code: null, key };
}

/**
 * 書き出しの層の鍵を引く（ADR-0026 §13）。publisher は wi-t.com、用途は character-export-overlay だけ、
 * active で失効していない、Ed25519。層そのものの失効は isRevoked(index, "overlay_ids", overlayId) で見る。
 */
export function resolveOverlayKey(index, keyId) {
  const key = index.keys[keyId];
  if (!key || key.publisher_id !== WI_T_PUBLISHER_ID) return refuse("OVERLAY_KEY_UNKNOWN");
  if (key.purposes.length !== 1 || key.purposes[0] !== "character-export-overlay")
    return refuse("OVERLAY_KEY_NOT_DEDICATED");
  if (key.status !== "active" || isRevoked(index, "overlay_key_ids", keyId))
    return refuse("OVERLAY_KEY_REVOKED");
  if (key.alg !== "Ed25519" || !key.public_key_hex) return refuse("OVERLAY_KEY_ALG");
  return { ok: true, code: null, key };
}

/**
 * 発行者の鍵（publisher 区分: character-package／character-pack／occupation-template）を、
 * 署名の時刻で判定して引く。規則は verify-core.mjs の evaluateKeyState（C-REV-01）と同じ。
 * 各製品の検証器が有効期間と状態の判定を自前で書かずに済むよう、ここで 1 か所にする。
 *
 * @param opts.signedAt 署名した時刻（署名の対象に入っている値。無ければ null）
 * @param opts.now      判定の時刻（既定: 現在）
 * retired と revoked の鍵の署名は、すべて拒否する。署名の時刻があっても、それは署名した側の自己申告で独立した証拠ではない
 * （W-1、Owner 結果 173）。引退前・侵害時刻より前と名乗る署名は KEY_RETIRED_OLD_SIG／KEY_REVOKED_OLD_SIG（警告の欄にも同じ名前を残す）、
 * 時刻が無い・後の署名は KEY_RETIRED／KEY_REVOKED。active は now で期間を見る。
 */
export function resolvePublisherKey(index, keyId, purpose, opts = {}) {
  const c = classifyPurpose(purpose);
  if (c === "studio") return refuse("STUDIO_PURPOSE_NOT_PUBLISHER");
  if (c !== "publisher") return refuse("PURPOSE_NOT_PUBLISHER");
  const key = index.keys[keyId];
  if (!key) return refuse("PUBLISHER_KEY_UNKNOWN");
  const pe = checkKeyPurposes(key);
  if (pe) return refuse(pe.code);
  if (!key.purposes.includes(purpose)) return refuse("PURPOSE_NOT_ALLOWED");
  if (badKeyDate(key)) return refuse("KEY_DATE_INVALID");

  const now = opts.now ? Date.parse(opts.now) : Date.now();
  const known = opts.signedAt !== undefined && opts.signedAt !== null;
  if (known && !isIso(opts.signedAt)) return refuse("SIGNED_AT_INVALID");
  const at = known ? Date.parse(opts.signedAt) : now;
  if (known && at > now + 5 * 60000) return refuse("FUTURE_SIG");
  if (key.not_before && at < Date.parse(key.not_before)) return refuse("KEY_NOT_YET_VALID");
  if (key.not_after && at > Date.parse(key.not_after)) return refuse("KEY_EXPIRED");

  if (key.status === "active") return { ok: true, code: null, key, warning: null };
  if (key.status === "retired") {
    if (!known || !key.retired_at || at >= Date.parse(key.retired_at)) return refuse("KEY_RETIRED");
    // W-1（Owner 結果 173・QA7 I-1・C6）：引退前と名乗る時刻は自己申告。D6 の採択までは受けない。警告は診断として残す
    return { ok: false, code: "KEY_RETIRED_OLD_SIG", key: null, warning: "KEY_RETIRED_OLD_SIG" };
  }
  if (key.status === "revoked") {
    // 失効の一覧による失効は、侵害の時刻を持たないので全署名を拒否する
    if (key.revoked_by_list || !key.compromised_at || !known || at >= Date.parse(key.compromised_at))
      return refuse("KEY_REVOKED");
    // W-1：危殆化した鍵の、侵害時刻より前と名乗る署名は常に受けない
    return { ok: false, code: "KEY_REVOKED_OLD_SIG", key: null, warning: "KEY_REVOKED_OLD_SIG" };
  }
  return refuse("KEY_STATE_UNKNOWN");
}

/* 索引に載る鍵は bundle の検証（validateBundleKeys）を通っている前提だが、
   索引だけを受け取った側が確かめられるよう、同じ規則を公開しておく。 */
export { checkKeyPurposes };
