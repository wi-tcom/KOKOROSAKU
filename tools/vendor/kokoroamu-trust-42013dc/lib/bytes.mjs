/* bytes.mjs — base64url とハッシュ。ブラウザと Node の両方で動く（依存なし）。 */

export function b64uEncode(bytes) {
  let bin = "";
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < a.length; i++) bin += String.fromCharCode(a[i]);
  const b64 = typeof btoa === "function"
    ? btoa(bin)
    : Buffer.from(a).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uDecode(str) {
  if (typeof str !== "string" || !/^[A-Za-z0-9_-]*$/.test(str))
    throw new Error("base64url として不正な文字が含まれている");
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (str.length % 4)) % 4);
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export async function sha256(bytes) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(d);
}

/** "sha256-<base64url>" 形式のダイジェスト表記 */
export async function digestLabel(bytes) {
  return "sha256-" + b64uEncode(await sha256(bytes));
}

export function toHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

/** 時間差を作らない比較（ダイジェスト照合用） */
export function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
