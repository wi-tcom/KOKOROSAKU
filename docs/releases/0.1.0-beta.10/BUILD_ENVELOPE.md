# SAKU Builder 0.1.0-beta.10 Public Build Envelope (candidate)

Machine-readable record: [BUILD_ENVELOPE.json](BUILD_ENVELOPE.json). Exact public inputs beside it:
`build-metadata.json`, `tauri.public.override.json` and `resource-profile.json` (unchanged from β.9). Installer identity: [SHA256SUMS](SHA256SUMS).

| Artifact | Bytes | SHA-256 | Authenticode |
| --- | ---: | --- | --- |
| `SAKU Builder_0.1.0-beta.10_x64-setup.exe` | 2,215,425 | `e763023e4381f4d395983074962df3be0c3b785e0c41b54eee6bf3828974c48c` | NotSigned |
| installer-embedded `saku-builder-desktop.exe` | 4,303,872 | `e0db6efc99aa6dc45e6b70eb9a5607dbac696378196a60e6f2c2b01f7ef70ce9` | NotSigned |
| `release/saku-builder-desktop.exe` (post-bundle) | 4,303,872 | `d0264725211b0754d1b2ad5245da9d1f1259e6a0ea92422e8c0499be14d0a38b` | NotSigned |
| bundled `saku-base-directives.v1.txt` | 4,397 | `ab4745a3617e5b8e49125146a47ee99d1adde7ad8436c953431518ac23358654` | — |
| bundled `samples/saku-pack-sample-1.1.0.zip` | 17,765 | `1e5a20855371f1f4e90a52f0142c8154fd787034f6e0babee1e9b9419b277c8c` | — |

- Source: `wi-tcom/-SAKU-builder` commit `e849c5a7ed84f76a451c457febfa35b3beddaf1a` (tree `7b20f5f607275a331092b6730e2bdcb6512442d2`), branch `claude/saku-beta10-20260930`, off `main` `baad88c` (after PR #93). Committed before the build, so the commit and tree named here are the ones the binary was made from.
- Toolchain and environment: identical to the β.2 – β.9 envelopes — rustc/cargo 1.97.1, Tauri CLI 2.11.4, Node 24.21.0, `CARGO_ENCODED_RUSTFLAGS` remap-path-prefix ×4 (U+001F separated), `CARGO_NET_OFFLINE=true`, jobs 1, incremental 0, `--locked`; target label `tauri-exact-1.97.1-beta10-public-oss-e849c5a-001`. Build time 7m 56s. Source mutation by the build: 0 files.
- Embedded vs post-bundle executable: 3 differing byte(s) at offsets 4003082–4003084 — the Tauri bundle-type stamp, `NSIS` against `UNKNOWN`, as in β.3 – β.9.
- Host-path / user-name scan of both executables (UTF-8 and UTF-16LE): **0 hits**. No OSS sample file in the installer.
- Generated NSIS: `verify_generated_nsis.mjs` PASS. The installer was digested again after being copied to `SAKU-verify\beta10\`; the installed executable equals the embedded one.
- Schema files and the shared base layer are unchanged since β.8.

## What this build carries that β.9 did not

-SAKU-builder PR #93; the list is in `contents_since_beta9` in the JSON. In short: 04 links to the 64-Character introduction page and the store, and the English of the screens (ライター&SNS's review of 20 findings, 英語翻訳チーム's English).

## Wording

`docs/collaboration/provisional-wording.json` has **no entries**.

## Release state

`UNSIGNED` / `CODE_SIGNING = NOT_EXECUTED` / **NOT_RELEASED**. Publication, GitHub Release, KOKOROSAKU tree and site updates are Owner decisions and have not been taken.
