/* purposes.mjs — 署名の目的（purpose）の名前の一覧（ブラウザ / Node 共通・依存なし）
 *
 * 状態: CANDIDATE。ADR-0023 B1・ADR-0025 はまだ Proposed であり、
 *       ここで CANDIDATE とした名前は、それらの採択と Owner の merge で確定する。
 *       ADR-0024（重ね署名）は採択（GOV-ADR-2026-10-03-01、施行 2026-10-03）。amupkg-countersignature は ADOPTED。
 *       erabazu.release-manifest は ADOPTED（Owner 結果 132、2026-10-10）。
 *       ADR-0026（書き出しの層）は採択（GOV-ADR-2026-10-17-01、施行 2026-10-17）。character-export-overlay は ADOPTED。
 *       人が読む版は docs/security/PURPOSE_REGISTRY.md。両方を同時に直す。
 *
 * 固定点（緩めない）:
 *   - 名前は区分をまたいで重ならない（試験で確かめる）。
 *   - 1 本の鍵が持てる用途は、同じ区分の中だけ。重ね署名の鍵とパッチの鍵は、
 *     それぞれの区分の用途だけを持つ（兼用は拒否）。書き出しの層の鍵（overlay）も同じ。
 *   - AMU Studio の鍵の目的は、publisher の用途ではない。publisher の検証器は受け付けない。
 *   - root の目的は trust 自身の署名だけに使い、publisher 鍵には持たせない。
 *   - 一覧に無い名前は拒否する（未知は通さない）。
 */

/* publisher 系の鍵（trust bundle に載る鍵）の用途。key_class が同じものだけ 1 本の鍵に同居できる。 */
export const TRUST_KEY_PURPOSES = Object.freeze({
  "character-package": Object.freeze({ key_class: "publisher", status: "ADOPTED" }),
  "character-pack": Object.freeze({ key_class: "publisher", status: "ADOPTED" }),
  "occupation-template": Object.freeze({ key_class: "publisher", status: "CANDIDATE" }),
  // ERABAZU の公開の目録（erabazu.release-manifest、1.1 は 2026-10-04 採択）。名前は署名プロキシの context と同じ。
  // gen 10 で erabazu-publisher-p256.v1 に足した（Owner 2026-10-07: lib を先に出し、その後に gen 10）。
  // ADOPTED: 融合核を配布物で動かす、という Owner の決定（結果 132、2026-10-10、統括の伝達）。確かめの動きは変わらない（状態は記録）
  "erabazu.release-manifest": Object.freeze({ key_class: "publisher", status: "ADOPTED" }),
  "amupkg-countersignature": Object.freeze({ key_class: "countersignature", status: "ADOPTED" }),   // GOV-ADR-2026-10-03-01
  "saku-character-patch": Object.freeze({ key_class: "patch", status: "CANDIDATE" }),
  "amu-instance-patch": Object.freeze({ key_class: "patch", status: "CANDIDATE" }),
  // キャラクターの書き出しの層（ADR-0026、採択 GOV-ADR-2026-10-17-01）。専用の区分で、封筒の用途ではない。確かめの動きは変わらない（状態は記録）。
  // 鍵はまだ無い：手順を Owner に見せてから作り、trust bundle の新しい世代に載せる。署名は SAKU Builder β.13・AMU Studio β.6 の書き出しから（結果 270）
  "character-export-overlay": Object.freeze({ key_class: "overlay", status: "ADOPTED" }),
});

/* 固定したルート鍵だけが使う目的（trust bundle と projection の署名）。 */
export const ROOT_PURPOSES = Object.freeze([
  "trust-bundle", "trust-publishers", "trust-revocations",
  "seat8-platform",   // Seat8 の PLATFORM.json（root-usb-1 が直接署名、Owner 2026-10-02 R-1）
]);

/* AMU Studio の鍵（利用者の PC の鍵）の目的。Studio 用。publisher の用途ではない。
   一覧に載せるのは、名前が重ならないことを確かめ、publisher の検証器が拒否するため。 */
export const STUDIO_PURPOSES = Object.freeze([
  "amu.amupkg-manifest/1",
  "amu.memory-template-manifest/1",            // 名前と意味は採択済み（Owner 2026-09-30、ADR-0023 §5）
  "amu.memory-template-manifest/0-candidate",  // 廃止した仮の名前。再利用と publisher での受け付けを防ぐため残す
  "amu.studio-return-receipt/v1",               // Studio の返却の receipt（Owner 2026-10-03 R-1）。Runtime の trust snapshot で検証する
  "amu.runtime-package/v1",                     // ACCEPTED で返す Runtime Package（Owner 2026-10-03 R-2）。同上
]);

/* SAKU／AMU の固定鍵の表で使っている役割の名前と、trust の用途の対応。
   役割の名前そのものは trust の用途ではない（trust の検証器は受け付けない）。 */
export const CONSUMER_ROLE_NAMES = Object.freeze({
  "character-archive": "character-package",
  "pack-catalog": "character-pack",
});

/* KOKOROAMU-SIGNED 封筒（verifySignedEnvelope）で検証してよい用途 = publisher 区分だけ。
   重ね署名とパッチは、それぞれ ADR-0024／ADR-0025 の形で検証する。 */
export const ENVELOPE_PURPOSES = Object.freeze(
  Object.keys(TRUST_KEY_PURPOSES).filter(p => TRUST_KEY_PURPOSES[p].key_class === "publisher"));

/** 名前の区分を返す: publisher | countersignature | patch | overlay | root | studio | consumer-role | unknown */
export function classifyPurpose(name) {
  if (typeof name !== "string") return "unknown";
  if (Object.prototype.hasOwnProperty.call(TRUST_KEY_PURPOSES, name))
    return TRUST_KEY_PURPOSES[name].key_class;
  if (ROOT_PURPOSES.includes(name)) return "root";
  if (STUDIO_PURPOSES.includes(name)) return "studio";
  if (Object.prototype.hasOwnProperty.call(CONSUMER_ROLE_NAMES, name)) return "consumer-role";
  return "unknown";
}

/** 区分ごとの名前の一覧（重なりの検査と表示のため）。 */
export function allPurposeNames() {
  return [
    ...Object.keys(TRUST_KEY_PURPOSES),
    ...ROOT_PURPOSES,
    ...STUDIO_PURPOSES,
    ...Object.keys(CONSUMER_ROLE_NAMES),
  ];
}

/**
 * trust bundle の鍵 1 本の purposes を検査する。問題が無ければ null。
 * 問題があれば { code, msg }（最初の 1 件）。
 */
export function checkKeyPurposes(key) {
  const id = key && key.key_id;
  const purposes = key && key.purposes;
  if (!Array.isArray(purposes) || purposes.length === 0)
    return { code: "KEY_PURPOSES_MISSING", msg: `鍵 ${id} に purposes が無い（用途の無い鍵は使わない）` };
  if (purposes.some(p => typeof p !== "string" || p === ""))
    return { code: "KEY_PURPOSES_INVALID", msg: `鍵 ${id} の purposes に文字列でない値がある` };
  if (new Set(purposes).size !== purposes.length)
    return { code: "KEY_PURPOSES_INVALID", msg: `鍵 ${id} の purposes に重複がある` };

  const classes = new Set();
  for (const p of purposes) {
    const c = classifyPurpose(p);
    if (c === "studio")
      return { code: "STUDIO_PURPOSE_NOT_PUBLISHER",
        msg: `鍵 ${id} の用途 ${p} は AMU Studio の鍵の目的であり、publisher の用途ではない` };
    if (c === "root")
      return { code: "ROOT_PURPOSE_ON_PUBLISHER_KEY",
        msg: `鍵 ${id} の用途 ${p} はルート鍵だけが使う目的` };
    if (c === "consumer-role")
      return { code: "PURPOSE_UNKNOWN",
        msg: `鍵 ${id} の用途 ${p} は役割の名前。trust の用途は ${CONSUMER_ROLE_NAMES[p]}` };
    if (c === "unknown")
      return { code: "PURPOSE_UNKNOWN", msg: `鍵 ${id} の用途 ${p} は一覧に無い` };
    classes.add(c);
  }
  if (classes.size > 1) {
    if (classes.has("countersignature"))
      return { code: "COUNTERSIGNER_KEY_NOT_DEDICATED",
        msg: `鍵 ${id}: 重ね署名の鍵は amupkg-countersignature だけを持つ（兼用しない）` };
    if (classes.has("patch"))
      return { code: "PATCH_KEY_NOT_DEDICATED",
        msg: `鍵 ${id}: パッチの鍵は saku-character-patch／amu-instance-patch だけを持つ（兼用しない）` };
    if (classes.has("overlay"))
      return { code: "OVERLAY_KEY_NOT_DEDICATED",
        msg: `鍵 ${id}: 書き出しの層の鍵は character-export-overlay だけを持つ（兼用しない）` };
    return { code: "KEY_PURPOSES_INVALID", msg: `鍵 ${id} の用途の区分が混ざっている` };
  }
  return null;
}
