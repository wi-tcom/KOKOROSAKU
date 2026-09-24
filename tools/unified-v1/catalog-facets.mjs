// Catalog Release facets a Character carries beyond its own definition
// (統制卓 2026-09-23 ①–③): which tier it is sold under, and whether it holds a
// signed permission to draft in a regulated domain.
//
// Two rules decide how a doubtful reading is treated, and they point in
// opposite directions on purpose:
//   tier        — unconfirmed falls back to `sample`, the tier that opens the
//                 fewest features. Being unsure must not unlock anything.
//   entitlement — unconfirmed means "no permission". Being unsure must not
//                 let a regulated draft through.
// Nothing here reads a Character: the operation class, the tier and the
// permission all live in the signed catalog, never in the Character file.

export const CATALOG_FACETS_PROFILE = "saku.catalog-facets@1";
export const TIERS = Object.freeze(["sample", "commercial", "subscription"]);
export const SAMPLE_LICENSE_ID = "LicenseRef-WIT-Sample-1.0";
export const REGULATED_DOMAINS = Object.freeze(["medical", "legal", "tax", "labor", "finance"]);
/** Which license ids belong to which tier. A commercial license id is set by the Owner; until then any non-sample id is accepted for the paid tiers. */
const licenseFitsTier = (tier, licenseId) => tier === "sample" ? licenseId === SAMPLE_LICENSE_ID : Boolean(licenseId) && licenseId !== SAMPLE_LICENSE_ID;

/** facet_id → the facet, for one Character. */
export function facetsFor(catalog, characterId) {
  const out = new Map();
  for (const facet of catalog?.metadata_facets || []) {
    if (String(facet?.subject_character_id || "") !== String(characterId)) continue;
    const name = String(facet.facet_id || "").slice(String(characterId).length + 1);
    if (name) out.set(name, facet);
  }
  return out;
}
const valueOf = (facets, name) => { const facet = facets.get(name); return facet && facet.provenance_class && facet.provenance_ref ? String(facet.value ?? "").trim() : ""; };

/**
 * The tier a Character is sold under. `state` is VERIFIED only when the tier
 * and the license id agree; anything else reads as `sample` and says why.
 */
export function tierOf(catalog, characterId) {
  const facets = facetsFor(catalog, characterId);
  const tier = valueOf(facets, "tier");
  const licenseId = valueOf(facets, "license_id");
  const problems = [];
  if (!tier) problems.push("no tier facet");
  else if (!TIERS.includes(tier)) problems.push(`unknown tier: ${tier}`);
  if (!licenseId) problems.push("no license_id facet");
  else if (tier && TIERS.includes(tier) && !licenseFitsTier(tier, licenseId)) problems.push(`license_id does not fit the tier: ${licenseId}`);
  const verified = problems.length === 0;
  return { state: verified ? "VERIFIED" : "UNCONFIRMED", tier: verified ? tier : "sample", declaredTier: tier || null, licenseId: licenseId || null, problems };
}

/** What the tier opens. A sample Character can hold an Instance but cannot change its directives (設計 §8). */
export function tierCapabilities(tier) {
  const paid = tier === "commercial" || tier === "subscription";
  return Object.freeze({
    instanceOverlay: true,
    instanceDirectives: paid,       // adding a directive or SUPPRESSing one
    multipleInstances: tier === "subscription",
    saveAndShare: tier === "subscription",
    trainerLink: tier === "subscription",
  });
}

/**
 * The signed permission to draft in a regulated domain. Three facets must all
 * be there and current; anything missing or expired is simply "no permission".
 */
export function regulatedEntitlement(catalog, characterId, { now = new Date() } = {}) {
  const facets = facetsFor(catalog, characterId);
  const domains = valueOf(facets, "regulated_domain").split(",").map(part => part.trim()).filter(Boolean);
  const scope = valueOf(facets, "regulated_scope");
  const validUntil = valueOf(facets, "regulated_valid_until");
  const problems = [];
  if (!domains.length) problems.push("no regulated_domain facet");
  else for (const domain of domains) if (!REGULATED_DOMAINS.includes(domain)) problems.push(`unknown regulated domain: ${domain}`);
  if (!scope) problems.push("no regulated_scope facet");
  if (!validUntil) problems.push("no regulated_valid_until facet");
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) problems.push(`regulated_valid_until is not a date: ${validUntil}`);
  else if (new Date(`${validUntil}T23:59:59Z`) < now) problems.push(`the permission expired on ${validUntil}`);
  const granted = problems.length === 0;
  return { state: granted ? "GRANTED" : "NOT_GRANTED", domains: granted ? domains : [], scope: granted ? scope : null, validUntil: validUntil || null, problems };
}

/**
 * 03 is hand-pasted: there is no record of a qualified person confirming at
 * the moment of use, so the second of the three conditions (設計 §9) can never
 * be met there. The permission therefore stays closed on this path, however
 * the catalog reads — and the screen says so rather than staying silent.
 */
export const PASSTHROUGH_PATHS = Object.freeze({ "03": false, amu: true });
export function passthroughAllowed(path) { return PASSTHROUGH_PATHS[path] === true; }
