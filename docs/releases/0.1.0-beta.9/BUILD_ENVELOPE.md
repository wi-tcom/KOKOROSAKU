# SAKU Builder 0.1.0-beta.9 Public Build Envelope (candidate)

Machine-readable record: [BUILD_ENVELOPE.json](BUILD_ENVELOPE.json). Exact public inputs beside it:
`build-metadata.json`, `tauri.public.override.json` (unchanged from β.8) and `resource-profile.json` (corrected, see below). Installer identity: [SHA256SUMS](SHA256SUMS).

| Artifact | Bytes | SHA-256 | Authenticode |
| --- | ---: | --- | --- |
| `SAKU Builder_0.1.0-beta.9_x64-setup.exe` | 2,208,616 | `d6474dd66f04834500a7ffa079e856f6c372e52d7459596f2f15ba1f4bb7b533` | NotSigned |
| installer-embedded `saku-builder-desktop.exe` | 4,297,216 | `0a91ec621711abc84d2a9bb787e21400df8e652a53229968b4ef832d06f83721` | NotSigned |
| `release/saku-builder-desktop.exe` (post-bundle) | 4,297,216 | `270acfaecb9223c9005fc646c4b765309cdf695ef8d27d135f89f7a86a044352` | NotSigned |
| bundled `saku-base-directives.v1.txt` | 4,397 | `ab4745a3617e5b8e49125146a47ee99d1adde7ad8436c953431518ac23358654` | — |
| bundled `samples/saku-pack-sample-1.1.0.zip` | 17,765 | `1e5a20855371f1f4e90a52f0142c8154fd787034f6e0babee1e9b9419b277c8c` | — |

- Source: `wi-tcom/-SAKU-builder` commit `db47704d7893c70e61ddab0bd6ade31e857e74cc` (tree `fc58b6e2ce6f364af53772508f40f4c2a93aab85`), branch `claude/saku-beta9-licensing-20260928`, off `main` `5138e35` (after PR #91). Committed before the build, so the commit and tree named here are the ones the binary was made from.
- Toolchain and environment: identical to the β.2 – β.8 envelopes — rustc/cargo 1.97.1, Tauri CLI 2.11.4, Node 24.21.0, `CARGO_ENCODED_RUSTFLAGS` remap-path-prefix ×4 (U+001F separated), `CARGO_NET_OFFLINE=true`, jobs 1, incremental 0, `--locked`; target label `tauri-exact-1.97.1-beta9-public-oss-db47704-001`. Build time 7m 11s. Source mutation by the build: 0 files.
- Embedded vs post-bundle executable: 3 differing byte(s) at offsets 3996610–3996612 — the Tauri bundle-type stamp, `NSIS` against `UNKNOWN`, as in β.3 – β.8.
- Host-path / user-name scan of both executables (UTF-8 and UTF-16LE): **0 hits**. No OSS sample file in the installer.
- Generated NSIS: `verify_generated_nsis.mjs` PASS. The installer was digested again after being copied to `SAKU-verify\beta9\`; the installed executable equals the embedded one.
- Schema files unchanged since β.8: `saku-unified-character.v1.schema.json` `48a7241d…bba817`, `character-extension.v1.schema.json` `20690217…170b1b`.

## The three earlier β.9 candidates are void

Neither was published; the version number is unchanged.

- **`87195c6`** (installer `b234b550…`, 2,208,698 bytes; embedded `1db88853…`): on its installed window, three sentences still pointed at the Trainer, which left the screens on 2026-09-27 — the Home status line after choosing a Character, the Home subtitle, and the note on a Character that does not match the adopted Schema. Rewritten in `b4acb61` (ライター&SNS; English 依頼 AJ).
- **`b4acb61`** (installer `a7456fbb…`, 2,208,878 bytes; embedded `ffb03f21…`): after it, the Owner asked on 2026-09-28 (via 統括) that 「SAKU診療所とAMUトレーニングセンター、ERABAZU工房は準備中としてください。」 While every application URL was unset, 04 hid the application buttons and the word 準備中 appeared nowhere; the Home card 04 and manual P06 read as if registration were open. Fixed in `6223843`: every application shows as a button that cannot be pressed, marked 準備中 / In preparation; the 04 intro, the Home card and P06 say the services are in preparation; what a plan includes reads 「含まれます」 / "included" (ライター&SNS 3c02160; English 依頼 AL c1a87fe).
- **`6223843`** (installer `9a2fb5df…`, 2,208,735 bytes; embedded `43b11c17…`): its `LICENSING.md`, which travels in the installer and the public tree, still said the installer bundles the three CC0-1.0 samples (D-B3) and was bound to β.3's commit and installer SHA-256. The Owner chose 「直してから公開」 (2026-09-28). Fixed in `db47704` with the text of 依頼 AP (Wi-t_Site f2e446f, sha256 `20e2ff04…`): the Built-in Sample Pack row names sample pack 1.1.0 under LicenseRef-WIT-Sample-1.0, Sample3 is NOT_INCLUDED, and the scope section points to `docs/releases/<version>/` instead of one version.

## The resource profile

`public-oss.json` still named the three OSS samples as bundled after they left the installer (D-20260924-oss-samples-retired) and did not name the sample pack 1.1.0 that replaced them. In this build `oss-sample3` is `bundled: false` and `saku-pack-sample-1.1.0` (LicenseRef-WIT-Sample-1.0, 3 Characters) is listed. The pack itself is unchanged.

## What this build carries that β.8 did not

-SAKU-builder PRs #81–#90 and the two fixes above; the list is in `contents_since_beta8` in the JSON.

## Wording

`docs/collaboration/provisional-wording.json` has **no entries**.

## Release state

`UNSIGNED` / `CODE_SIGNING = NOT_EXECUTED` / **NOT_RELEASED**. Publication, GitHub Release, KOKOROSAKU tree and site updates are Owner decisions and have not been taken.
