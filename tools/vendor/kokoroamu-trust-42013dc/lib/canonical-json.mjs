/* canonical-json.mjs — 正準化JSON（RFC 8785 / JCS の制限サブセット）
 *
 * 署名の対象は「バイト列」であって「オブジェクト」ではない。
 * 送り手と受け手が同じバイト列を作れなければ、署名検証は意味を失う。
 * したがって正準化の規則は、実装の自由度を残さず1つに固定する。
 *
 * 規則（RFC 8785 に準拠）:
 *   - オブジェクトのキーは UTF-16 コード単位で昇順に並べる
 *   - 空白・改行を入れない
 *   - 文字列は JSON の最小エスケープ（RFC 8785 と同じ表）
 *   - 出力は UTF-8 バイト列
 *
 * 本実装が RFC 8785 から**意図的に狭めている**点:
 *   - 非整数の数値を禁止する（reject）
 *   - 安全整数の範囲外を禁止する（reject）
 *   - undefined / 関数 / Symbol / BigInt / 循環参照を禁止する
 *
 *   理由: JCS で最も実装差が出るのは浮動小数点の直列化（ES6 Number→String）である。
 *   ここを許すと、Wix バックエンド（Node）と検証サイト（ブラウザ）と CLI で
 *   1ビット違うバイト列が生まれうる。署名対象に小数を入れる必要が業務上ないため、
 *   「入れられない」ようにして曖昧さごと消す。必要になったら文字列で表現する。
 *
 *   この制限は送り手・受け手の**両方**で強制すること。片側だけで緩めない。
 */

export class CanonicalizeError extends Error {
  constructor(msg, path) {
    super(path ? `${msg}（位置: ${path}）` : msg);
    this.name = "CanonicalizeError";
    this.path = path || "";
  }
}

/* RFC 8785 3.2.2.2 の文字列直列化 */
const ESC = {
  0x08: "\\b", 0x09: "\\t", 0x0a: "\\n", 0x0c: "\\f", 0x0d: "\\r",
  0x22: '\\"', 0x5c: "\\\\",
};

function serializeString(s) {
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ESC[cp] !== undefined) out += ESC[cp];
    else if (cp < 0x20) out += "\\u" + cp.toString(16).padStart(4, "0");
    else out += ch;
  }
  return out + '"';
}

/* キーは UTF-16 コード単位の昇順。JS の既定の文字列比較がまさにそれ。 */
function sortKeys(keys) {
  return keys.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function walk(v, path, seen) {
  if (v === null) return "null";
  const t = typeof v;

  if (t === "boolean") return v ? "true" : "false";

  if (t === "number") {
    if (!Number.isFinite(v))
      throw new CanonicalizeError("NaN / Infinity は署名対象にできない", path);
    if (!Number.isInteger(v))
      throw new CanonicalizeError(
        "小数は署名対象にできない（正準化の実装差を避けるため。文字列で表現する）", path);
    if (!Number.isSafeInteger(v))
      throw new CanonicalizeError("安全整数の範囲外は署名対象にできない", path);
    return String(v);
  }

  if (t === "string") return serializeString(v);

  if (t === "bigint")
    throw new CanonicalizeError("BigInt は署名対象にできない（文字列で表現する）", path);
  if (t === "undefined" || t === "function" || t === "symbol")
    throw new CanonicalizeError(`${t} は署名対象にできない`, path);

  if (Array.isArray(v)) {
    if (seen.has(v)) throw new CanonicalizeError("循環参照", path);
    seen.add(v);
    const parts = v.map((x, i) => walk(x, `${path}[${i}]`, seen));
    seen.delete(v);
    return "[" + parts.join(",") + "]";
  }

  if (t === "object") {
    // toJSON は呼ばない。呼ぶと「見えている値」と「署名した値」がずれる。
    if (seen.has(v)) throw new CanonicalizeError("循環参照", path);
    seen.add(v);
    const parts = sortKeys(Object.keys(v)).map(k => {
      const child = v[k];
      if (child === undefined)
        throw new CanonicalizeError("undefined を値に持つキーがある", `${path}.${k}`);
      return serializeString(k) + ":" + walk(child, `${path}.${k}`, seen);
    });
    seen.delete(v);
    return "{" + parts.join(",") + "}";
  }

  throw new CanonicalizeError("直列化できない値", path);
}

/** 正準化した JSON 文字列を返す */
export function canonicalize(value) {
  return walk(value, "$", new Set());
}

/** 正準化した UTF-8 バイト列を返す（署名・検証はこれを使う） */
export function canonicalBytes(value) {
  return new TextEncoder().encode(canonicalize(value));
}
