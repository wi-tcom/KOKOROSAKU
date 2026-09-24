// catalog:facets:verify (統制卓 2026-09-23 ①–③): the tier and the regulated
// permission are read from the signed Catalog Release, never from a Character,
// and a doubtful reading falls to the safe side of each question.
//
//   1 facets are matched by subject and require a provenance class and ref
//   2 tier: VERIFIED only when tier and license id agree; anything else reads
//     as `sample`, which opens the fewest features
//   3 entitlement: missing, malformed or expired = no permission
//   4 03 never opens the regulated path (condition ② cannot be met by hand)
//   5 the real OSS sample catalog still reads (no tier facets yet → sample)
//   6 falsification: dropping the license check would let a mislabelled
//     Character claim a paid tier
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)})`); cases.push(label); };
const MODULE = "tools/unified-v1/catalog-facets.mjs";
const F = await import(pathToFileURL(path.join(ROOT, MODULE)).href);

const facet = (id, name, value, extra = {}) => ({ facet_id: `${id}.${name}`, subject_character_id: id, provenance_class: "CURATED", provenance_ref: `curated.${name}.2026-09-23`, value, ...extra });
const catalogOf = (...facets) => ({ catalog_id: "test", metadata_facets: facets });
const ID = "sample-general-compass";
const OTHER = "sample-wit-guide";

// ── 1. subject and provenance ───────────────────────────────────────────────
{
  const catalog = catalogOf(facet(ID, "tier", "commercial"), facet(OTHER, "tier", "sample"), facet(ID, "license_id", "LicenseRef-WIT-Commercial-1.1"));
  equal(F.tierOf(catalog, ID).tier, "commercial", "CF-SUBJECT a Character reads its own facets");
  equal(F.tierOf(catalog, OTHER).tier, "sample", "CF-SUBJECT another Character's facets do not leak across");
  const noProvenance = { catalog_id: "t", metadata_facets: [{ facet_id: `${ID}.tier`, subject_character_id: ID, value: "commercial" }, facet(ID, "license_id", "LicenseRef-WIT-Commercial-1.1")] };
  const read = F.tierOf(noProvenance, ID);
  check(read.state === "UNCONFIRMED" && read.tier === "sample" && read.problems.includes("no tier facet"), "CF-SUBJECT a facet without a provenance class or ref does not count (who decided must be traceable)");
}

// ── 2. tier ─────────────────────────────────────────────────────────────────
{
  const paid = catalogOf(facet(ID, "tier", "subscription"), facet(ID, "license_id", "LicenseRef-WIT-Commercial-1.1"));
  const sample = catalogOf(facet(ID, "tier", "sample"), facet(ID, "license_id", F.SAMPLE_LICENSE_ID));
  equal(F.tierOf(paid, ID).state, "VERIFIED", "CF-TIER tier and license id agreeing reads as VERIFIED");
  equal(F.tierOf(sample, ID).state, "VERIFIED", "CF-TIER the sample pair reads as VERIFIED");
  for (const [label, catalog] of [
    ["no facets at all", catalogOf()],
    ["tier without a license id", catalogOf(facet(ID, "tier", "commercial"))],
    ["a license id without a tier", catalogOf(facet(ID, "license_id", "LicenseRef-WIT-Commercial-1.1"))],
    ["a tier that does not exist", catalogOf(facet(ID, "tier", "enterprise"), facet(ID, "license_id", "x"))],
    ["a paid tier carrying the sample license", catalogOf(facet(ID, "tier", "commercial"), facet(ID, "license_id", F.SAMPLE_LICENSE_ID))],
    ["a sample tier carrying a paid license", catalogOf(facet(ID, "tier", "sample"), facet(ID, "license_id", "LicenseRef-WIT-Commercial-1.1"))],
  ]) {
    const read = F.tierOf(catalog, ID);
    assert.equal(read.state, "UNCONFIRMED", `CF-TIER ${label} is UNCONFIRMED`);
    assert.equal(read.tier, "sample", `CF-TIER ${label} falls back to sample`);
    assert.ok(read.problems.length, `CF-TIER ${label} says why`);
  }
  cases.push("CF-TIER six doubtful readings each fall back to sample and give a reason");
  const paidCaps = F.tierCapabilities("commercial"), sampleCaps = F.tierCapabilities("sample"), subCaps = F.tierCapabilities("subscription");
  check(sampleCaps.instanceOverlay && !sampleCaps.instanceDirectives && paidCaps.instanceDirectives, "CF-TIER a sample Character can hold an Instance but cannot add or suppress a directive (設計 §8: D is the boundary)");
  check(!paidCaps.multipleInstances && subCaps.multipleInstances && subCaps.trainerLink, "CF-TIER several Instances, saving/sharing and the Trainer link belong to the subscription tier");
  check(F.tierCapabilities(F.tierOf(catalogOf(), ID).tier).instanceDirectives === false, "CF-TIER an unreadable catalog opens no directive editing");
}

// ── 3. regulated permission ────────────────────────────────────────────────
{
  const now = new Date("2026-09-23T00:00:00Z");
  const granted = catalogOf(facet(ID, "regulated_domain", "medical, legal"), facet(ID, "regulated_scope", "draft-for-qualified-review"), facet(ID, "regulated_valid_until", "2027-03-31"));
  const read = F.regulatedEntitlement(granted, ID, { now });
  check(read.state === "GRANTED" && read.domains.join(",") === "medical,legal" && read.scope === "draft-for-qualified-review", "CF-REG three current facets grant the permission for the domains they name");
  for (const [label, catalog] of [
    ["nothing at all", catalogOf()],
    ["a domain without a scope", catalogOf(facet(ID, "regulated_domain", "tax"), facet(ID, "regulated_valid_until", "2027-03-31"))],
    ["a scope without a date", catalogOf(facet(ID, "regulated_domain", "tax"), facet(ID, "regulated_scope", "draft-for-qualified-review"))],
    ["a domain that does not exist", catalogOf(facet(ID, "regulated_domain", "astrology"), facet(ID, "regulated_scope", "s"), facet(ID, "regulated_valid_until", "2027-03-31"))],
    ["a malformed date", catalogOf(facet(ID, "regulated_domain", "tax"), facet(ID, "regulated_scope", "s"), facet(ID, "regulated_valid_until", "soon"))],
    ["a date that has passed", catalogOf(facet(ID, "regulated_domain", "tax"), facet(ID, "regulated_scope", "s"), facet(ID, "regulated_valid_until", "2026-09-22"))],
  ]) {
    const denied = F.regulatedEntitlement(catalog, ID, { now });
    assert.equal(denied.state, "NOT_GRANTED", `CF-REG ${label} grants nothing`);
    assert.equal(denied.domains.length, 0, `CF-REG ${label} names no domain`);
    assert.ok(denied.problems.length, `CF-REG ${label} says why`);
  }
  cases.push("CF-REG six doubtful readings each grant nothing and give a reason (unsure must not let a regulated draft through)");
  check(F.regulatedEntitlement(granted, ID, { now: new Date("2027-03-31T12:00:00Z") }).state === "GRANTED" && F.regulatedEntitlement(granted, ID, { now: new Date("2027-04-01T00:00:01Z") }).state === "NOT_GRANTED", "CF-REG the permission lasts through its last day and not beyond");
}

// ── 4. 03 never opens the regulated path ───────────────────────────────────
check(F.passthroughAllowed("03") === false && F.passthroughAllowed("amu") === true && F.passthroughAllowed("anything else") === false, "CF-PATH 03 never opens the regulated path (a hand-pasted prompt cannot record a qualified person's confirmation), and an unknown path is closed too");

// ── 5. the real OSS sample catalog ─────────────────────────────────────────
{
  const real = process.env.SAKU_CATALOG_FIXTURE || "C:/Users/Public/SAKU-verify/sample-pack/catalog-release.v1.json";
  if (!existsSync(real)) cases.push(`CF-REAL the OSS sample catalog is not present at ${real} — skipped`);
  else {
    const catalog = JSON.parse(readFileSync(real, "utf8"));
    const ids = [...new Set((catalog.metadata_facets || []).map(f => f.subject_character_id))];
    check(ids.length >= 3, "CF-REAL the OSS sample catalog carries facets for its Characters");
    for (const id of ids) {
      const read = F.tierOf(catalog, id);
      assert.equal(read.tier, "sample", `CF-REAL ${id}: without tier facets the OSS sample reads as sample`);
      assert.equal(F.regulatedEntitlement(catalog, id).state, "NOT_GRANTED", `CF-REAL ${id}: no regulated permission`);
      assert.ok(F.facetsFor(catalog, id).has("operation_class"), `CF-REAL ${id}: the operation class facet is still found by name`);
    }
    cases.push(`CF-REAL ${ids.length} Characters in the real catalog read as sample with no permission, and their operation class is still found`);
  }
}

// ── 6. falsification ───────────────────────────────────────────────────────
{
  const source = readFileSync(path.join(ROOT, MODULE), "utf8");
  const from = 'const licenseFitsTier = (tier, licenseId) => tier === "sample" ? licenseId === SAMPLE_LICENSE_ID : Boolean(licenseId) && licenseId !== SAMPLE_LICENSE_ID;';
  check(source.includes(from), "CF-FALSIFY the license rule is live");
  const mutated = path.join(ROOT, "tools/unified-v1/__cf_falsify.mjs");
  writeFileSync(mutated, source.replace(from, "const licenseFitsTier = () => true;"), "utf8");
  try {
    const M = await import(pathToFileURL(mutated).href);
    const mislabelled = catalogOf(facet(ID, "tier", "commercial"), facet(ID, "license_id", F.SAMPLE_LICENSE_ID));
    check(M.tierOf(mislabelled, ID).state === "VERIFIED" && F.tierOf(mislabelled, ID).state === "UNCONFIRMED", "CF-FALSIFY without the license check a sample-licensed Character would claim the commercial tier");
  } finally { rmSync(mutated, { force: true }); }
}

console.log(`CATALOG_FACETS PASS ${cases.length}/${cases.length}`);
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log("TIER unsure → sample (fewest features) / ENTITLEMENT unsure → no permission / 03 never opens the regulated path");
