# SAKU Builder 0.1.0-beta.10.1 Public Build Envelope (candidate, signed)

Machine-readable record: [BUILD_ENVELOPE.json](BUILD_ENVELOPE.json). Exact public inputs beside it:
`build-metadata.json` (code_signing = AZURE_ARTIFACT_SIGNING), `resource-profile.json` and `tauri.public.override.json` (as β.10), and `tauri.signing.override.template.json` (the signing override with host paths replaced by placeholders). Installer identity: [SHA256SUMS](SHA256SUMS).

| Artifact | Bytes | SHA-256 | Authenticode |
| --- | ---: | --- | --- |
| `SAKU Builder_0.1.0-beta.10.1_x64-setup.exe` | 2,287,504 | `51e99c7eecd11f9b7134c7c2434142f4a487867a3c693e35fafb98a80feae9ca` | Valid (wi-t.com Inc.) |
| installer-embedded `saku-builder-desktop.exe` | 4,319,520 | `c935327fb337175dfb126e4302ba0336ebc1d50c2c470ec271c27e3e099560f9` | Valid (wi-t.com Inc.) |
| `release/saku-builder-desktop.exe` (post-bundle, rewritten by Tauri) | 4,303,872 | `da1219bd62635500f1072f4fe45ca3fe73b3e6272f317102c08618b42b837eaa` | not signed (see below) |
| bundled `saku-base-directives.v1.txt` | 4,397 | `ab4745a3617e5b8e49125146a47ee99d1adde7ad8436c953431518ac23358654` | — |
| bundled `samples/saku-pack-sample-1.1.0.zip` | 17,765 | `1e5a20855371f1f4e90a52f0142c8154fd787034f6e0babee1e9b9419b277c8c` | — |

## Why this version

Owner 2026-10-02: 「β.10 を署名して出し直す」. The contents are β.10's (-SAKU-builder PR #93); this version adds the signature and nothing else a user sees except the footer below. The published β.10 (unsigned) is not changed.

## Signing

- Azure Artifact Signing, account `witcomsigning` (Japan East), certificate profile `witcomPublicTrust`. Signer `CN=wi-t.com Inc., O=wi-t.com Inc., L=Yokohama, S=Kanagawa-ken, C=JP`.
- signtool (Windows SDK 10.0.26100.0, x64) with `Azure.CodeSigning.Dlib`, through Tauri's `bundle.windows.signCommand`; SHA-256 digest; RFC 3161 timestamp from `http://timestamp.acs.microsoft.com` (the certificate lives 3 days, so the timestamp is what keeps the signature valid).
- Checked `Valid`, signer wi-t.com Inc., timestamped: the installer; inside it `saku-builder-desktop.exe`, `uninstall.exe`, `nsDialogs.dll`, `nsis_tauri_utils.dll`, `NSISdl.dll`, `StartMenu.dll`, `System.dll`; and the installed `saku-builder-desktop.exe`.
- Not signed: `LangDLL.dll`, an NSIS plugin Tauri does not sign; it is only extracted while installing.
- The post-bundle executable left in the build folder is rewritten by Tauri after bundling and carries no signature. The installer-embedded one is the identity.
- A signature shows who made the file and that it has not changed since signing. It does not show that the contents are correct or safe.

## What the build says about itself

One build-time value, `SAKU_CODE_SIGNING`, decides it. Unsigned builds stay `UNSIGNED`; this build is `AZURE_ARTIFACT_SIGNING` in the Home footer, `resources/build-metadata.json` and the host's `get_runtime_state.code_signing`.

## Build

- Source: `wi-tcom/-SAKU-builder` commit `9998371fc366ed0cec492bcbaf5a3b2a7d69adbd` (tree `2a2bbb9f8716e12f8e9a9fa9d9910402f6ab3c55`), branch `claude/saku-beta10-1-signed-20261002`, off `main` `a45780a` (β.10).
- Toolchain as β.2 – β.10; target label `tauri-exact-1.97.1-beta10-1-public-oss-9998371-001`; 13m 40s including signing. Source mutation by the build: 0 files.
- Host-path / user-name scan of both executables: **0 hits**. Generated NSIS: PASS. No OSS sample file in the installer.

## Release state

Signed / **NOT_RELEASED** until the Owner publishes.
