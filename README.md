# KOKOROSAKU v0.1.0-beta.11

Japanese documentation: [README.ja.md](README.ja.md)

KOKOROSAKU is the public SAKU Builder source and evaluation package. Builder output remains a Candidate and does not become Canonical Authority or approval.

## Install and use

Download the Release asset `SAKU Builder_0.1.0-beta.11_x64-setup.exe` only from the future official GitHub Release. The installer carries a code signature (signer: wi-t.com Inc.). Even with a signature, Windows SmartScreen may display a warning until a reputation has built up. Before running it, verify:

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath '.\SAKU Builder_0.1.0-beta.11_x64-setup.exe').Hash.ToLower()
```

Expected SHA-256: `b3aea22ae10dee7510d77d6f5d4ec20b105c93c621de4d958e54a45be15a4bdd` (2,295,296 bytes). The installer is not stored in this git tree or source archive. See [RELEASE_ASSET_MANIFEST.json](RELEASE_ASSET_MANIFEST.json).

## What is new in v0.1.0-beta.11

- **The wording for Seat 8 in the text passed to the AI now matches the seat name on the screens (Human (logical)).** In the text copied with "Copy" in 03, wording such as "Seat 8 is a human" has been changed to "Seat 8 — Human (logical) is the seat of a logical person. No AI fills this seat. Seat 8's judgments are made by a real person." The AI is also told not to use seat numbers or expressions such as "the human in Seat 8" in its answers to the user.
- **The Base Directives shared by every Character have been updated from v1.0 to v1.1.** Only two lines changed: they now describe Seat 8 as a logical person's seat and say that matters needing judgment are referred to a person. This does not loosen any rule. It is the same version as in AMU Studio and MACHI, and the version line in the text from 03 now shows "v1.1".
- **New app icon and on-screen mark** (the sprout mark).
- As in the previous version, the installer and the application carry a code signature (signer: wi-t.com Inc., with a timestamp from Microsoft's timestamping service).
- The features on the screens are unchanged. The data formats of Characters and the Workspace are also unchanged, so you can install over the previous version.
- The published v0.1.0-beta.10.1 stays available as it is.

## Try without installing

Serve the source archive root over local HTTP and open `tooling/builder/index.html`. Direct `file://` use is unsupported for module-based screens.

## Developers

Clone the repository, use Node 24.19.0, run `npm ci`, `npm run desktop:prepare:public`, and then `npm run tauri:build`. See `docs/releases/0.1.0-beta.11/BUILD_ENVELOPE.json` for the exact accepted beta toolchain and build boundary.

## Licensing and brand

This repository has no repository-wide license grant. Exact paths are classified in [public-path-license-map.json](public-path-license-map.json); see [LICENSE-POLICY.md](LICENSE-POLICY.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Brand assets are from the wi-t.com Triple-Arc family and, to the extent copyright subsists, are provided under CC-BY-4.0 at the exact paths listed in `public-path-license-map.json`; trademark and brand-use rights are separate and are not granted.

OSS support is documentation-first, self-service, and best effort, with no guaranteed response time or contractual SLA.
