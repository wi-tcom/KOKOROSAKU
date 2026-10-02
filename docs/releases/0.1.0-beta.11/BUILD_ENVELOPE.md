# SAKU Builder 0.1.0-beta.11 Public Build Envelope (candidate, signed)

Machine-readable record: [BUILD_ENVELOPE.json](BUILD_ENVELOPE.json). Exact public inputs beside it:
`build-metadata.json` (code_signing = AZURE_ARTIFACT_SIGNING), `resource-profile.json` and `tauri.public.override.json` (as β.10.1), and `tauri.signing.override.template.json` (the signing override with host paths replaced by placeholders). Installer identity: [SHA256SUMS](SHA256SUMS).

| Artifact | Bytes | SHA-256 | Authenticode |
| --- | ---: | --- | --- |
| `SAKU Builder_0.1.0-beta.11_x64-setup.exe` | 2,295,296 | `b3aea22ae10dee7510d77d6f5d4ec20b105c93c621de4d958e54a45be15a4bdd` | Valid (wi-t.com Inc.) |
| installer-embedded `saku-builder-desktop.exe` | 4,325,152 | `dae3079647d3ef58e9c83be07b99046487f4bdbb3fdea172e303ccb8f783d8b4` | Valid (wi-t.com Inc.) |
| `release/saku-builder-desktop.exe` (post-bundle, rewritten by Tauri) | 4,309,504 | `d6df5f01d7256484a70d19f5e204f914ebb97961938b528d821b2d80b9196942` | not signed (see below) |
| bundled `saku-base-directives.v1.txt` (v1.1) | 4,414 | `f906ebfcf67d153f2196f4a43232325cd56a58b471626d3eabc959fa14b7204c` | — |
| bundled `samples/saku-pack-sample-1.1.0.zip` | 17,765 | `1e5a20855371f1f4e90a52f0142c8154fd787034f6e0babee1e9b9419b277c8c` | — |

## What is new since β.10.1

- Seat 8 in the 03 hand-over text is the logical person's seat; the last sentence keeps seat numbers out of answers to the user (-SAKU-builder #96, Owner 2026-10-02).
- Base Directives v1.1, shared with AMU Studio and MACHI: two lines name Seat 8 as a logical person's seat and refer an issue to a person (#96). No rule is loosened.
- kokoroamu-trust vendored from the licensed main 73e3f05 (#97); repository and public tooling only, not in the application.
- canonicalJson in its own module; the public tooling carries reference-material.mjs (#98).
- App icon and in-app mark v5 (芽), Wi-t_Site bf296df; `icon.ico` `2651c160…` (#99).
- BRAND-ASSET-NOTICE.md separates the logo (no generative image model) from the app icon, whose washi background comes from an AI-generated image; until β.10.1 the notice said no generative model for the whole artwork (#101, Owner 2026-10-02 「直してから公開」).

## Signing

As β.10.1: Azure Artifact Signing, account `witcomsigning`, profile `witcomPublicTrust`, signer `CN=wi-t.com Inc., O=wi-t.com Inc., L=Yokohama, S=Kanagawa-ken, C=JP`; signtool with `Azure.CodeSigning.Dlib` through Tauri's `signCommand`; SHA-256; RFC 3161 timestamp from `http://timestamp.acs.microsoft.com`.

- Checked `Valid`, signer wi-t.com Inc., timestamped: the installer; inside it `saku-builder-desktop.exe`, `uninstall.exe`, `nsDialogs.dll`, `nsis_tauri_utils.dll`, `NSISdl.dll`, `StartMenu.dll`, `System.dll`; and the installed `saku-builder-desktop.exe`.
- Not signed: `LangDLL.dll`, an NSIS plugin Tauri does not sign.
- The post-bundle executable is rewritten by Tauri after bundling and carries no signature. The installer-embedded one is the identity.
- A signature shows who made the file and that it has not changed since signing. It does not show that the contents are correct or safe.

## Build

- Source: `wi-tcom/-SAKU-builder` commit `4068fbd…` (see BUILD_ENVELOPE.json for the full commit and tree), branch `claude/saku-beta11-brand-notice-20261002`, off `main` `0d46b88` (#100). This build replaces the first β.11 build (`b45e6c2`, installer `efe2bad5…`), which was never published.
- Toolchain as β.2 – β.10.1; target label `tauri-exact-1.97.1-beta11-public-oss-4068fbd-001`; 10m 08s including signing. Source mutation by the build: 0 files.
- Host-path / user-name scan of both executables: **0 hits**. The v1.1 digest is burned in; the v1.0 digest is absent. No OSS sample file in the installer.

## Release state

Signed / **NOT_RELEASED** until the Owner publishes.
