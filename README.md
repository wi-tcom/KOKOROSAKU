# KOKOROSAKU v0.1.0-beta.9

Japanese documentation: [README.ja.md](README.ja.md)

KOKOROSAKU is the public SAKU Builder source and evaluation package. Builder output remains a Candidate and does not become Canonical Authority or approval.

## Install and use

Download the Release asset `SAKU Builder_0.1.0-beta.9_x64-setup.exe` only from the future official GitHub Release. This beta is unsigned and Windows SmartScreen may display a warning. Before running it, verify:

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath '.\SAKU Builder_0.1.0-beta.9_x64-setup.exe').Hash.ToLower()
```

Expected SHA-256: `9a2fb5df01b814d4f694668f8465f7a68dbd295e66e99e47e3a3d127ab220009` (2,208,735 bytes). The installer is not stored in this git tree or source archive. See [RELEASE_ASSET_MANIFEST.json](RELEASE_ASSET_MANIFEST.json).

## What is new in v0.1.0-beta.9

- The samples were replaced. The three open-source sample Characters (CC0-1.0) are no longer distributed; instead, the installer bundles sample 1.1.0 (three sample-mode Characters, `LicenseRef-WIT-Sample-1.0`, not OSS). Choose them with "Load samples" in "01 Choose a Character".
- 04 is now "SAKU Repair Desk and AMU Evaluation Center". Both are in preparation, and registration and applications are not open yet. The Trainer, the AI speed test and importing external reviews have been removed from the screens (their contents are kept and are planned to become a separate tool; no date has been set).
- Your own Character can be exported as a ZIP for AMU Studio ("Download ZIP for AMU"; it carries no signature). In 03, reference material exported from AMU Studio can be attached to the text passed to the AI as a "reference material (data)" section (the material is not saved).
- The names of the 1+7 seats and the manual's explanations were aligned with the adopted Schema, and the help source name was changed to "Behavior stated in the directive".
- Bugs in beta.8 were fixed (for example, the help could not be found in the version you try without installing, the version field showed "BUILD UNSTAMPED", and confirmation dialogs showed "tauri.localhost" in the title).

## Try without installing

Serve the source archive root over local HTTP and open `tooling/builder/index.html`. Direct `file://` use is unsupported for module-based screens.

## Developers

Clone the repository, use Node 24.19.0, run `npm ci`, `npm run desktop:prepare:public`, and then `npm run tauri:build`. See `docs/releases/0.1.0-beta.9/BUILD_ENVELOPE.json` for the exact accepted beta toolchain and build boundary.

## Licensing and brand

This repository has no repository-wide license grant. Exact paths are classified in [public-path-license-map.json](public-path-license-map.json); see [LICENSE-POLICY.md](LICENSE-POLICY.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Brand assets are from the wi-t.com Triple-Arc family and, to the extent copyright subsists, are provided under CC-BY-4.0 at the exact paths listed in `public-path-license-map.json`; trademark and brand-use rights are separate and are not granted.

OSS support is documentation-first, self-service, and best effort, with no guaranteed response time or contractual SLA.
