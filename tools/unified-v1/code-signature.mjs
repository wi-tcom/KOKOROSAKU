// What the footer says about the app's own code signature (2026-10-14 keying F1; Owner 結果 190 対策 D; 統括 approval).
//
// The host reads the facts on the spot (src-tauri/src/code_signature.rs: WinVerifyTrust, then the leaf signer's CN and
// O); this decides the words, fail-closed:
//   WITCOM        Windows trusts the signature AND the signer's CN and O are both "wi-t.com Inc." (the same test as the
//                 signing script's Witcom check)
//   OTHER_SIGNER  Windows trusts it, but the signer is someone else: never shown as WI-T.COM's
//   NONE          there is no signature
//   UNVERIFIABLE  anything else — not trusted, not Windows, no answer in time, a missing or malformed reply
//   CHECKING      no answer yet (the page turns it into UNVERIFIABLE when the wait runs out)
// The build's SAKU_CODE_SIGNING is a record of how it was built, never the source of these words.

export const WITCOM_SIGNER = "wi-t.com Inc.";

/** facts: the host's reply ({ trust, signer_cn, signer_o }), null while it is still reading, undefined on no host. */
export function codeSignatureState(facts, { timedOut = false } = {}) {
  if (facts === null && !timedOut) return "CHECKING";
  if (!facts || typeof facts !== "object") return "UNVERIFIABLE";
  if (facts.trust === "TRUSTED") {
    return facts.signer_cn === WITCOM_SIGNER && facts.signer_o === WITCOM_SIGNER ? "WITCOM" : "OTHER_SIGNER";
  }
  if (facts.trust === "NO_SIGNATURE") return "NONE";
  return "UNVERIFIABLE";
}

const WORDS = Object.freeze({
  ja: {
    CHECKING: "署名：確かめています…",
    WITCOM: "署名：WI-T.COM の署名あり（確かめ済み）",
    OTHER_SIGNER: "署名：WI-T.COM の署名ではない（{signer}）",
    NONE: "署名：署名なし",
    UNVERIFIABLE: "署名：確かめられない",
  },
  en: {
    CHECKING: "Signature: checking…",
    WITCOM: "Signature: signed by WI-T.COM (checked)",
    OTHER_SIGNER: "Signature: not a WI-T.COM signature ({signer})",
    NONE: "Signature: not signed",
    UNVERIFIABLE: "Signature: could not be checked",
  },
});

/** { state, text } for the footer. */
export function codeSignatureView(facts, { locale = "ja-JP", timedOut = false } = {}) {
  const state = codeSignatureState(facts, { timedOut });
  const words = WORDS[locale === "en-US" ? "en" : "ja"];
  const signer = facts && typeof facts === "object" ? String(facts.signer_o || facts.signer_cn || "?") : "?";
  return { state, text: words[state].replace("{signer}", signer) };
}
