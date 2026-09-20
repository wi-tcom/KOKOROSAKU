// SAKU Character Pack intake — the browser-side half.
//
// The host has already recomputed every digest the pack carries (SHA256SUMS,
// archive, files, catalog membership, signed manifest digests).  What the host
// cannot do is check the Ed25519 signatures, so that happens here with the
// publisher keys pinned below, through WebCrypto.  When WebCrypto has no
// Ed25519 (older WebView2), the result is DIGEST_ONLY and the screen says
// "署名は未検証" — it is never reported as verified.
//
// Trusted publisher keys: byte copies of
// wi-tcom/KOKOROAMU-characterpack main b56eace5
// release/publisher-keys/trusted-publishers-production.json.
// These are the development-generation keys the current packs are signed
// with; the store notes say a formal key will be announced with the formal
// release, at which point this table is re-pinned, not extended silently.
export const TRUSTED_PUBLISHERS = Object.freeze({
  "saku-character-publisher-ed25519.v1": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAi+/pgmkKqlXgPQuVdDavHYeoOZ/zwRxtnZTFoemwWiU=\n-----END PUBLIC KEY-----\n",
  "saku-pack-publisher-ed25519.v1": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA4xdWwiNGGd9CbXPUDhTjpQeJqy/eLmC9Dmdu7DBmijI=\n-----END PUBLIC KEY-----\n",
});
export const TRUSTED_PUBLISHERS_SOURCE = Object.freeze({
  repository: "wi-tcom/KOKOROAMU-characterpack",
  main_revision: "b56eace5e5925aba081eb44963c4ffe9e0a347c8",
  path: "release/publisher-keys/trusted-publishers-production.json",
  sha256: "6107f9fbb106cc61fbce9a9b65db292853367cb7aed76bd3670ba19ef3d5378b",
});
// The verifier whose rules this module replicates (Owner 2026-09-20: the same
// verifier as AMU Studio, exact-pinned).  Rule: digest = sha-256 over the
// canonical manifest without package.digest/signature; signature = Ed25519 over
// the UTF-8 bytes of the digest string; fingerprint = sha-256 of the SPKI DER.
export const VERIFIER_SOURCE = Object.freeze({
  repository: "wi-tcom/KOKOROAMU-characterpack",
  main_revision: "b56eace5e5925aba081eb44963c4ffe9e0a347c8",
  files: Object.freeze({
    "src/character-import/kokorosaku-archive.js": "28d4ae79d0f2e258169b635d3a27792109ba80ca456d35f0c54c5d434280de9c",
    "src/character-pack/conformance.js": "8fcd8c6e8635c59361ad2ef8795af915f4b2653b53a29d8796080b29da7c8667",
  }),
  amu_studio_equivalent: "KOKOROAMU-STUDIO adapters/character-package-unified-v1/verify.js (publicKeyFingerprint = sha256Hex(spki))",
});

export const SIGNATURE_STATES = Object.freeze(["PASS", "FAIL", "DIGEST_ONLY"]);

const DIGEST = /^sha-256:[0-9a-f]{64}$/;

function pemToBytes(pem) {
  const body = String(pem).replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function base64UrlToBytes(text) {
  const padded = String(text).replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (String(text).length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Verify one Ed25519 signature over the UTF-8 bytes of the digest string —
 * the exact rule the publisher uses (`sign(null, Buffer.from(digest))`).
 */
/** sha-256 hex of the SPKI DER — the same fingerprint AMU Studio records for a publisher key. */
export async function publisherFingerprint(publisher_key_id, publishers = TRUSTED_PUBLISHERS) {
  const pem = publishers[publisher_key_id];
  if (!pem) return null;
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest("SHA-256", pemToBytes(pem));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyEd25519({ publisher_key_id, digest, signature, publishers = TRUSTED_PUBLISHERS }) {
  const pem = publishers[publisher_key_id];
  if (!pem) return { state: "UNKNOWN_KEY", detail: `publisher key ${publisher_key_id} is not pinned` };
  if (!DIGEST.test(String(digest || ""))) return { state: "FAIL", detail: "digest is not a sha-256 digest string" };
  if (!signature) return { state: "FAIL", detail: "signature is missing" };
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) return { state: "UNAVAILABLE", detail: "WebCrypto is not available" };
  let key;
  try {
    key = await subtle.importKey("spki", pemToBytes(pem), { name: "Ed25519" }, false, ["verify"]);
  } catch (error) {
    return { state: "UNAVAILABLE", detail: `Ed25519 is not available in this runtime: ${String(error?.message || error)}` };
  }
  try {
    const ok = await subtle.verify({ name: "Ed25519" }, key, base64UrlToBytes(signature), new TextEncoder().encode(digest));
    return ok ? { state: "PASS", detail: publisher_key_id } : { state: "FAIL", detail: `signature does not verify under ${publisher_key_id}` };
  } catch (error) {
    return { state: "FAIL", detail: `signature is malformed: ${String(error?.message || error)}` };
  }
}

/**
 * Signature assessment for a host `pack` summary.  PASS only when the pack
 * manifest and every Character manifest verify; any FAIL is FAIL; when the
 * runtime cannot verify at all, DIGEST_ONLY — never PASS.
 */
export async function assessPackSignatures(pack, { publishers = TRUSTED_PUBLISHERS } = {}) {
  if (!pack || typeof pack !== "object") return { signature_state: "FAIL", checked: 0, failed: [{ what: "pack", detail: "no pack summary" }], detail: "no pack summary" };
  const checks = [{ what: "character-pack.json", publisher_key_id: pack.pack_publisher_key_id, digest: pack.pack_manifest_digest, signature: pack.pack_signature }];
  for (const entry of pack.entries || []) checks.push({ what: entry.file || entry.slug, publisher_key_id: entry.publisher_key_id, digest: entry.package_digest, signature: entry.signature });
  const failed = [];
  let unavailable = null;
  let passed = 0;
  for (const check of checks) {
    const outcome = await verifyEd25519({ ...check, publishers });
    if (outcome.state === "PASS") passed += 1;
    else if (outcome.state === "UNAVAILABLE") unavailable = outcome.detail;
    else failed.push({ what: check.what, detail: outcome.detail, state: outcome.state });
  }
  if (failed.length) return { signature_state: "FAIL", checked: checks.length, passed, failed, detail: failed.map(item => `${item.what}: ${item.detail}`).join(" / ") };
  if (unavailable) return { signature_state: "DIGEST_ONLY", checked: checks.length, passed, failed: [], detail: unavailable, fingerprints: {} };
  const fingerprints = {};
  for (const keyId of new Set(checks.map(check => check.publisher_key_id))) fingerprints[keyId] = await publisherFingerprint(keyId, publishers);
  return { signature_state: "PASS", checked: checks.length, passed, failed: [], detail: `${checks.length} signatures verified under pinned publisher keys`, fingerprints };
}

/** The verification record stored with each Library batch from a pack. */
export function packVerification(result, signatures) {
  const pack = result.pack || {};
  return {
    status: result.status,
    code: result.code,
    product: pack.pack_id || result.manifest?.product || "",
    schema_id: pack.schema_id || result.manifest?.schema_id || "",
    schema_version: pack.schema_version || result.manifest?.schema_version || "",
    pack: {
      format: pack.format || "kokorosaku-character-pack",
      pack_id: pack.pack_id || "",
      pack_version: pack.pack_version || "",
      character_count: pack.character_count || 0,
      catalog_id: pack.catalog_id || "",
      catalog_release_version: pack.catalog_release_version || "",
      digest_state: pack.digest_state || "SHA256_BINDINGS_VERIFIED",
      signature_state: signatures.signature_state,
      signature_detail: signatures.detail,
      signatures_checked: signatures.checked,
      publisher_fingerprints: signatures.fingerprints || {},
      publisher_key_ids: [...new Set([pack.pack_publisher_key_id, ...(pack.entries || []).map(entry => entry.publisher_key_id)].filter(Boolean))],
      imported_path: result.imported_path || "",
    },
  };
}

/** Per-Character provenance, keyed by character_id (= slug in a pack). */
export function packEntryMeta(pack, signatures) {
  const meta = new Map();
  for (const entry of pack?.entries || []) {
    meta.set(entry.slug, {
      pack_id: pack.pack_id,
      pack_version: pack.pack_version,
      operation_class: entry.operation_class,
      character_digest: entry.character_digest,
      archive_digest: entry.archive_digest,
      publisher_key_id: entry.publisher_key_id,
      publisher_fingerprint: signatures.fingerprints?.[entry.publisher_key_id] || null,
      signature_state: signatures.signature_state,
      catalog_release_version: pack.catalog_release_version,
    });
  }
  return meta;
}

/** Human wording for the signature state.  DIGEST_ONLY never says "verified". */
// Two display states (Owner 2026-09-20): PASS with the publisher fingerprint,
// or "digest 一致・署名は未検証".  FAIL is never displayed as a state of an
// imported pack — a FAIL refuses the import.
export function signatureStateText(state, locale = "ja", fingerprint = null) {
  const short = fingerprint ? `: ${String(fingerprint).slice(0, 16)}…` : "";
  const ja = { PASS: `署名検証 PASS（発行者 fingerprint${short}）`, FAIL: "署名検証 FAIL", DIGEST_ONLY: "digest 一致・署名は未検証" };
  const en = { PASS: `signature verified (publisher fingerprint${short})`, FAIL: "signature FAILED", DIGEST_ONLY: "digests match · signature not verified" };
  return (locale === "en" ? en : ja)[state] || state;
}

export const OPERATION_CLASS_TEXT = Object.freeze({
  A: { ja: "運用区分 A", en: "Operation class A" },
  B: { ja: "運用区分 B", en: "Operation class B" },
  C: { ja: "運用区分 C（利用前に配布元の条件を確認）", en: "Operation class C (check the publisher's conditions before use)" },
});
