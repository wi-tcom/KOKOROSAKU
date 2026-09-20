# KOKOROSAKU v0.1.0-beta.2

Japanese documentation: [README.ja.md](README.ja.md)

KOKOROSAKU is the public SAKU Builder/Trainer source and evaluation package. Builder and Trainer output remains a Candidate and does not become Canonical Authority or approval.

## Install and use

Download the Release asset `SAKU Builder_0.1.0-beta.2_x64-setup.exe` only from the future official GitHub Release. This beta is unsigned and Windows SmartScreen may display a warning. Before running it, verify:

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath '.\SAKU Builder_0.1.0-beta.2_x64-setup.exe').Hash.ToLower()
```

Expected SHA-256: `7d357f41a59d923f940acc2fd7f7d65a3aee5ee0840f06a8e8def9fd83fcb572` (1,875,865 bytes). The installer is not stored in this git tree or source archive. See [RELEASE_ASSET_MANIFEST.json](RELEASE_ASSET_MANIFEST.json).

## What is new in v0.1.0-beta.2

- Package import accepts the sold SAKU Character Pack (`character-pack.json` ZIP). The host verifies every digest binding in the pack; the Ed25519 publisher signatures are verified with pinned publisher keys and shown as 「署名検証 PASS（発行者 fingerprint）」 or, where the runtime cannot verify, 「digest 一致・署名は未検証」. Operation class A/B/C is recorded beside each Character.
- Trainer: external review-only intake for AMU Trainer Review Candidates (nothing is applied automatically).
- Trainer: AI speed test in paste mode (manual measurement; times include the human copy and paste).

## Try without installing

Serve the source archive root over local HTTP and open `tooling/builder/index.html`. Direct `file://` use is unsupported for module-based screens.

## Developers

Clone the repository, use Node 24.19.0, run `npm ci`, `npm run desktop:prepare:public`, and then `npm run tauri:build`. See `docs/releases/0.1.0-beta.2/BUILD_ENVELOPE.json` for the exact accepted beta toolchain and build boundary.

## Licensing and brand

This repository has no repository-wide license grant. Exact paths are classified in [public-path-license-map.json](public-path-license-map.json); see [LICENSE-POLICY.md](LICENSE-POLICY.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Brand assets are from the wi-t.com Triple-Arc family and, to the extent copyright subsists, are provided under CC-BY-4.0 at the exact paths listed in `public-path-license-map.json`; trademark and brand-use rights are separate and are not granted.

OSS support is documentation-first, self-service, and best effort, with no guaranteed response time or contractual SLA.
