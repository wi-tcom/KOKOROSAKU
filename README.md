# KOKOROSAKU v0.1.0-beta.10

Japanese documentation: [README.ja.md](README.ja.md)

KOKOROSAKU is the public SAKU Builder source and evaluation package. Builder output remains a Candidate and does not become Canonical Authority or approval.

## Install and use

Download the Release asset `SAKU Builder_0.1.0-beta.10_x64-setup.exe` only from the future official GitHub Release. This beta is unsigned and Windows SmartScreen may display a warning. Before running it, verify:

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath '.\SAKU Builder_0.1.0-beta.10_x64-setup.exe').Hash.ToLower()
```

Expected SHA-256: `e763023e4381f4d395983074962df3be0c3b785e0c41b54eee6bf3828974c48c` (2,215,425 bytes). The installer is not stored in this git tree or source archive. See [RELEASE_ASSET_MANIFEST.json](RELEASE_ASSET_MANIFEST.json).

## What is new in v0.1.0-beta.10

- "Character introductions" was added to 04, with buttons to the page that introduces the Characters in the SAKU Character Packs (in Japanese) and to the list of packs in the store (the packs are paid; prices are shown on the product pages). SAKU Repair Desk and AMU Evaluation Center, and applications for them, are still in preparation.
- Text that still appeared in Japanese on the English screens is now in English, and things that were called by different words are now called by one (for example sign-off, handoff to a person, and Seat 8 — Human (logical)). The remaining Trainer text, removed from the screens in beta.9, is gone too.
- Japanese text was corrected (「席 8（論理上の人）」, 「人への引き継ぎ」, the list of effect sources, the button names in the save confirmation, the signature section in 04, and more).

## Try without installing

Serve the source archive root over local HTTP and open `tooling/builder/index.html`. Direct `file://` use is unsupported for module-based screens.

## Developers

Clone the repository, use Node 24.19.0, run `npm ci`, `npm run desktop:prepare:public`, and then `npm run tauri:build`. See `docs/releases/0.1.0-beta.10/BUILD_ENVELOPE.json` for the exact accepted beta toolchain and build boundary.

## Licensing and brand

This repository has no repository-wide license grant. Exact paths are classified in [public-path-license-map.json](public-path-license-map.json); see [LICENSE-POLICY.md](LICENSE-POLICY.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Brand assets are from the wi-t.com Triple-Arc family and, to the extent copyright subsists, are provided under CC-BY-4.0 at the exact paths listed in `public-path-license-map.json`; trademark and brand-use rights are separate and are not granted.

OSS support is documentation-first, self-service, and best effort, with no guaranteed response time or contractual SLA.
