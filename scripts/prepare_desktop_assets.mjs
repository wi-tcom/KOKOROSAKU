import { cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, ".desktop-dist");
const PROFILES = new Set(["owner-review-internal", "public-oss"]);

function insideRoot(candidate) {
  const relative = path.relative(ROOT, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function copyOne(sourceRelative, destinationRelative = sourceRelative) {
  const source = path.resolve(ROOT, sourceRelative);
  const destination = path.resolve(DIST, destinationRelative);
  if (!insideRoot(source) || !destination.startsWith(`${DIST}${path.sep}`)) {
    throw new Error(`DESKTOP_RESOURCE_OUTSIDE_APPROVED_CHECKOUT: ${sourceRelative}`);
  }
  const sourceInfo = await stat(source);
  if (!sourceInfo.isFile()) throw new Error(`DESKTOP_RESOURCE_NOT_FILE: ${sourceRelative}`);
  const resolved = await realpath(source);
  if (!insideRoot(resolved)) throw new Error(`DESKTOP_RESOURCE_LINK_ESCAPE: ${sourceRelative}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { force: true });
}

async function copyDirectory(sourceRelative, destinationRelative) {
  const source = path.resolve(ROOT, sourceRelative);
  if (!insideRoot(source)) throw new Error(`DESKTOP_RESOURCE_OUTSIDE_APPROVED_CHECKOUT: ${sourceRelative}`);
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const childSource = path.join(sourceRelative, entry.name).replaceAll(path.sep, "/");
    const childDestination = path.join(destinationRelative, entry.name).replaceAll(path.sep, "/");
    if (entry.isDirectory()) await copyDirectory(childSource, childDestination);
    else if (entry.isFile()) await copyOne(childSource, childDestination);
    else throw new Error(`DESKTOP_RESOURCE_LINK_PROHIBITED: ${childSource}`);
  }
}

async function pinDesktopLightTheme(destinationRelative) {
  const destination = path.resolve(DIST, destinationRelative);
  if (!destination.startsWith(`${DIST}${path.sep}`)) {
    throw new Error(`DESKTOP_THEME_TARGET_OUTSIDE_DIST: ${destinationRelative}`);
  }
  const source = await readFile(destination, "utf8");
  const marker = '<html lang="ja">';
  if (!source.includes(marker) || source.includes('<html lang="ja" data-theme=')) {
    throw new Error(`DESKTOP_THEME_MARKER_INVALID: ${destinationRelative}`);
  }
  await writeFile(destination, source.replace(marker, '<html lang="ja" data-theme="light">'), "utf8");
}

export async function prepareDesktopAssets(profileId = "public-oss") {
  if (!PROFILES.has(profileId)) throw new Error(`UNKNOWN_DESKTOP_PROFILE: ${profileId}`);
  const profilePath = `desktop/resources/profiles/${profileId}.json`;
  const profile = JSON.parse(await readFile(path.join(ROOT, profilePath), "utf8"));
  if (profile.profile !== "saku.desktop.resource-profile@1" || profile.profile_id !== profileId) {
    throw new Error("RESOURCE_PROFILE_IDENTITY_INVALID");
  }
  if (profileId === "public-oss") {
    if (profile.internal_content_count !== 0) throw new Error("PUBLIC_PROFILE_INTERNAL_CONTENT_COUNT_NONZERO");
    const included = new Set(profile.resources.filter(resource => resource.bundled).map(resource => resource.id));
    for (const forbidden of profile.forbidden_resource_ids || []) {
      if (included.has(forbidden)) throw new Error(`PUBLIC_PROFILE_FORBIDDEN_RESOURCE: ${forbidden}`);
    }
  }

  if (path.basename(DIST) !== ".desktop-dist" || path.dirname(DIST) !== ROOT) {
    throw new Error("DESKTOP_DIST_PATH_INVALID");
  }
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const manifest = JSON.parse(await readFile(path.join(ROOT, "desktop/resources/manifests/native-public.json"), "utf8"));
  if (manifest.manifest !== "saku.delivery.asset-manifest@1" || manifest.target !== "native-public") {
    throw new Error("NATIVE_ASSET_MANIFEST_IDENTITY_INVALID");
  }
  const destinations = new Set();
  for (const [source, destination] of manifest.files) {
    if (destinations.has(destination)) throw new Error(`NATIVE_ASSET_DESTINATION_DUPLICATE: ${destination}`);
    destinations.add(destination);
    await copyOne(source, destination);
  }
  for (const [source, destination] of manifest.directories) await copyDirectory(source, destination);
  await copyOne(profilePath, "resources/resource-profile.json");
  await pinDesktopLightTheme("tools/saku-builder-unified-v1.html");
  await pinDesktopLightTheme("tools/saku-trainer.html");

  if (profileId === "owner-review-internal") {
    await copyOne("tools/unified-v1/preview/catalog-preview-index.json", "tools/unified-v1/preview/catalog-preview-index.json");
  }

  const metadata = {
    profile: "saku.desktop.build-metadata@1",
    resource_profile: profileId,
    internal_content_count: profile.internal_content_count,
    local_server: false,
    one_drive_runtime_dependency: false,
    approved_checkout_build_source_only: true,
    code_signing: "UNSIGNED",
    publication: false
  };
  await writeFile(path.join(DIST, "resources", "build-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return metadata;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const metadata = await prepareDesktopAssets(process.argv[2] || "public-oss");
  console.log(`DESKTOP_ASSETS_READY profile=${metadata.resource_profile} internal_content_count=${metadata.internal_content_count}`);
}
