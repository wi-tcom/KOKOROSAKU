// SAKU vNext — i18n / Locale runtime
// -------------------------------------------------------------------------
// 表示言語（Label / Help / Validation message / role alias 等）を Canonical 値から分離する。
// - Canonical enum / character_id は翻訳しない（表示のみ翻訳）。
// - このモジュールは **IO を持たない**。Locale データ（プレーンな文字列 object）を注入で受け取り、
//   参照するだけ。ゆえに Locale Pack から実行コードを注入できない（値は常に string として扱う）。
// - Node（fs で JSON 読込）でもブラウザ（fetch で JSON 読込）でも、パース済み object を渡して使う。
// -------------------------------------------------------------------------

export const DEFAULT_LOCALE = "en-US";

// Locale Pack は data-only（JSON）。ここでは object を受け取り、値を string としてのみ返す。
export function createI18n(locales, opts = {}) {
  const fallback = opts.fallback || DEFAULT_LOCALE;
  const available = Object.keys(locales);
  let current = opts.initial && locales[opts.initial] ? opts.initial : fallback;

  function resolve(locale, key) {
    const pack = locales[locale];
    if (!pack) return undefined;
    // ドット区切りキーを辿る。到達値が string でなければ undefined（コードは実行しない）。
    let node = pack;
    for (const part of String(key).split(".")) {
      if (node && typeof node === "object" && part in node) node = node[part];
      else return undefined;
    }
    return typeof node === "string" ? node : (node && typeof node === "object" ? node : undefined);
  }

  return {
    get locale() { return current; },
    get available() { return available.slice(); },
    isKnown(locale) { return !!locales[locale]; },
    // 未知 locale は fallback へ安全に落ちる（例外を投げない）
    setLocale(locale) { current = locales[locale] ? locale : fallback; return current; },
    // t(key): current → fallback → key 自身、の順で string を返す。常に string。
    t(key, vars) {
      let v = resolve(current, key);
      if (typeof v !== "string") v = resolve(fallback, key);
      if (typeof v !== "string") return String(key);
      if (vars) for (const [k, val] of Object.entries(vars)) v = v.split("{" + k + "}").join(String(val));
      return v;
    },
    // help(fieldKey): { meaning, example, behavior, interaction, caution } を string で返す（無い項目は ""）。
    help(fieldKey) {
      const cur = resolve(current, "help." + fieldKey);
      const fb = resolve(fallback, "help." + fieldKey);
      const src = (cur && typeof cur === "object") ? cur : (fb && typeof fb === "object" ? fb : {});
      const fbo = (fb && typeof fb === "object") ? fb : {};
      const pick = (k) => typeof src[k] === "string" ? src[k] : (typeof fbo[k] === "string" ? fbo[k] : "");
      return { meaning: pick("meaning"), example: pick("example"), behavior: pick("behavior"),
               interaction: pick("interaction"), caution: pick("caution") };
    },
  };
}
