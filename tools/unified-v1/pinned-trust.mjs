// The trust SAKU carries, pinned per release (Owner DECISION 2026-09-27-04 ③ and this session 2026-09-28: the trust
// bundle is bundled and pinned per release; SAKU β.13 S-4, 2026-10-22: the occupation templates and the name tag of the
// standard skills read the same pinned trust).
//
//   source     kokoroamu-trust main 42013dc (#56; gen 11 published on kokoroamu.jp 00041-des, AMU TRUST(1) 2026-10-22,
//              NOTICE_2026-10-22_trust_gen11_revendor_TRUST.md). gen 11 = gen 10 and one key more, the
//              name tag key wi-t-overlay-ed25519.v1 (publisher wi-t.com, Ed25519, purpose character-export-overlay only).
//   order      verifyTrustBundle (the root signature, offline, at `now`) → the pinned generation and digest →
//              verifyProjection (revocations of the same bundle) → buildTrustIndex. A bundle past its next_update, a
//              changed byte, another root or a revocations list from another bundle is refused; nothing is loosened.
//   licence    code MPL-2.0, trust data CC0-1.0 (kokoroamu-trust LICENSING.md, Owner 2026-10-02). Replaced per release.
import { verifyTrustBundle, verifyProjection } from "../vendor/kokoroamu-trust-42013dc/lib/verify-core.mjs";
import { buildTrustIndex } from "../vendor/kokoroamu-trust-42013dc/lib/trust-index.mjs";
import { ROOT_KEYS } from "../vendor/kokoroamu-trust-42013dc/lib/roots.mjs";

export const PINNED_TRUST = Object.freeze({
  source: "wi-tcom/kokoroamu-trust@42013dc7ec86e1da76570fc8689852f692fa89ed public/trust/v1",
  generation: 11,
  bundle_digest: "sha256-UTyxe3_76xKHWdU-9OlOrZRb35ffLPYNkpFXHm1RvFw",
  files: Object.freeze(["bundle.json", "bundle.sig.json", "revocations.json", "revocations.sig.json"]),
});

export class PinnedTrustRefused extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.code = code; }
}
const refuse = (code, message) => { throw new PinnedTrustRefused(code, message); };

/** read(name) → the text of one of PINNED_TRUST.files. Returns { index, info } or throws PinnedTrustRefused. */
export async function loadPinnedTrust(read, { now = new Date().toISOString() } = {}) {
  const json = async name => JSON.parse(await read(name));
  const [bundle, bundleSig, revocations, revocationsSig] = await Promise.all(PINNED_TRUST.files.map(json));
  const verdict = await verifyTrustBundle(bundle, bundleSig, { rootKeys: ROOT_KEYS, now, offline: true });
  if (!verdict.ok) refuse("TRUST_BUNDLE", verdict.errors.map(e => e.code).join(", "));
  if (verdict.info.generation !== PINNED_TRUST.generation || verdict.info.bundle_digest !== PINNED_TRUST.bundle_digest) refuse("TRUST_NOT_PINNED", `the bundle is generation ${verdict.info.generation} / ${verdict.info.bundle_digest}, not the pinned one`);
  const projection = await verifyProjection("revocations", revocations, revocationsSig, { rootKeys: ROOT_KEYS, expectGeneration: verdict.info.generation, expectBundleDigest: verdict.info.bundle_digest });
  if (!projection.ok) refuse("TRUST_REVOCATIONS", projection.errors.map(e => e.code).join(", "));
  return { index: buildTrustIndex(bundle, revocations), info: { ...verdict.info, warnings: verdict.warnings.map(w => w.code) } };
}

/**
 * The index the name tag of the standard skills is checked against (S-4; ADR-0027 §4.3 through character-export.mjs
 * verifyNameplate), or null. Fail-closed (C-57): a trust that cannot be read, is refused, or is past its next_update gives
 * no index — the offline reading above only warns on a stale bundle, which a name tag does not take — so every name tag
 * reads 未確認 and nothing is saved.
 */
export async function nameplateTrustIndex(read, { now = new Date().toISOString() } = {}) {
  try {
    const trust = await loadPinnedTrust(read, { now });
    return trust.info.stale === false ? trust.index : null;
  } catch { return null; }
}
