# KOKOROSAKU v0.1.0-beta.10.1

Japanese documentation: [README.ja.md](README.ja.md)

KOKOROSAKU is the public SAKU Builder source and evaluation package. Builder output remains a Candidate and does not become Canonical Authority or approval.

## Install and use

Download the Release asset `SAKU Builder_0.1.0-beta.10.1_x64-setup.exe` only from the future official GitHub Release. The installer carries a code signature (signer: wi-t.com Inc.). Even with a signature, Windows SmartScreen may display a warning until a reputation has built up. Before running it, verify:

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath '.\SAKU Builder_0.1.0-beta.10.1_x64-setup.exe').Hash.ToLower()
```

Expected SHA-256: `51e99c7eecd11f9b7134c7c2434142f4a487867a3c693e35fafb98a80feae9ca` (2,287,504 bytes). The installer is not stored in this git tree or source archive. See [RELEASE_ASSET_MANIFEST.json](RELEASE_ASSET_MANIFEST.json).

## What is new in v0.1.0-beta.10.1

- The contents are the same as v0.1.0-beta.10. The installer and the application have been code-signed (signer: wi-t.com Inc., with a timestamp from Microsoft's timestamping service) and published again. The signature shows only that the files were made by wi-t.com Inc. and that they have not changed since they were signed.
- The build information in the app now shows "CODE_SIGNING = AZURE_ARTIFACT_SIGNING".
- The published v0.1.0-beta.10 (unsigned) stays available as it is.

## Try without installing

Serve the source archive root over local HTTP and open `tooling/builder/index.html`. Direct `file://` use is unsupported for module-based screens.

## Developers

Clone the repository, use Node 24.19.0, run `npm ci`, `npm run desktop:prepare:public`, and then `npm run tauri:build`. See `docs/releases/0.1.0-beta.10.1/BUILD_ENVELOPE.json` for the exact accepted beta toolchain and build boundary.

## Licensing and brand

This repository has no repository-wide license grant. Exact paths are classified in [public-path-license-map.json](public-path-license-map.json); see [LICENSE-POLICY.md](LICENSE-POLICY.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Brand assets are from the wi-t.com Triple-Arc family and, to the extent copyright subsists, are provided under CC-BY-4.0 at the exact paths listed in `public-path-license-map.json`; trademark and brand-use rights are separate and are not granted.

OSS support is documentation-first, self-service, and best effort, with no guaranteed response time or contractual SLA.
