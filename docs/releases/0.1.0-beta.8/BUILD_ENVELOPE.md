# SAKU Builder 0.1.0-beta.8 Public Build Envelope (candidate, rebuilt)

Machine-readable record: [BUILD_ENVELOPE.json](BUILD_ENVELOPE.json). Exact public inputs beside it:
`build-metadata.json`, `resource-profile.json`, `tauri.public.override.json` (unchanged from β.7). Installer identity: [SHA256SUMS](SHA256SUMS).

| Artifact | Bytes | SHA-256 | Authenticode |
| --- | ---: | --- | --- |
| `SAKU Builder_0.1.0-beta.8_x64-setup.exe` | 2,169,969 | `db0f544dcab30d7dd4517bc0a77f6e98ec12579a65dad2932d0ce8def8a314c9` | NotSigned |
| installer-embedded `saku-builder-desktop.exe` | 4,271,104 | `02d5615caaf79bb81573fa2c35a00e00ad5516a6e185d445023a0261e37df2ee` | NotSigned |
| `release/saku-builder-desktop.exe` (post-bundle) | 4,271,104 | `98c5f4646666e2daaa37a4c10dfecea65dd21eb8148183dc890d78aae296dc0f` | NotSigned |
| bundled `saku-base-directives.v1.txt` | 4,397 | `ab4745a3617e5b8e49125146a47ee99d1adde7ad8436c953431518ac23358654` | — |

- Source: `wi-tcom/-SAKU-builder` commit `6e5112a0f9b849b2d5dc934c6f849f617f203cbc` (tree `9527b5c3aeb10cd8d88b23192d7b614e312ffa55`), branch `claude/saku-beta8-help-20260924`, off `main` `368ab8d` after PR #79 merged. The help change is committed before the build, so the commit and tree named here are the ones the binary was made from.
- Toolchain and environment: identical to the β.2 – β.7 envelopes — rustc/cargo 1.97.1, Tauri CLI 2.11.4, Node 24.21.0, `CARGO_ENCODED_RUSTFLAGS` remap-path-prefix ×4 (U+001F separated), `CARGO_NET_OFFLINE=true`, jobs 1, incremental 0, `--locked`; target label `tauri-exact-1.97.1-beta8-public-oss-6e5112a-001`. Build time 7m 43s. Source mutation by the build: 0 files.
- Embedded vs post-bundle executable: 3 differing byte(s) at offsets 3970514–3970516 — the Tauri bundle-type stamp, `NSIS` against `UNKNOWN`, as in β.3 – β.7.
- Host-path / user-name scan of both executables (UTF-8 and UTF-16LE): **0 hits**.
- Generated NSIS: `verify_generated_nsis.mjs` PASS. The installer was digested again after being copied to `SAKU-verify\beta8\`.

## Why β.8 was built again

Owner 2026-09-24: the help changes go into β.8 and it is rebuilt under the same version. **The first β.8 candidate (PR #79: installer `66b8c28d…`, 2,169,165 bytes; embedded `1119108e…`) was never published and is void.** This build adds:

- **Help ①** The manual badge shows the version, the day it was last checked on the installed window and the environment: `対応バージョン v0.1.0-beta.8 ／ 最終確認 2026-09-24（Windows 11 Home 10.0.26200・WebView2 Runtime 153.0.4234.48）` / `Applies to v0.1.0-beta.8 / Last checked 2026-09-24 (…)`.
- **Help ②** 「困ったとき」 opens with 「この版で分かっている問題」 (Known issues in this version): three issues, each as 症状 / いまどうなるか / どうすればよいか (Symptom / Impact / What to do).

The Japanese is the ライター&SNS approved text (`9be2c32`), the English the 英語翻訳チーム delivery (Q1–Q8).

## What this build carries that β.7 did not

β.7 (`b7787034…`) predates PR #78, the seven findings from its own hands-on and Chrome check.

- **F1** The help says the list lives in the Workspace's `.saku-builder` folder and comes back after an uninstall.
- **F2** The speed-test guide describes the clock readings, not manual-only statistics.
- **F3** A speed-test record shows its local time.
- **F4** Verdicts have Japanese and English names; the code stays in the title; the run count reads （N 回） / (n = N).
- **F5** An empty import state says so instead of UNKNOWN ×6.
- **F6** The Trainer names the refusal of an inadmissible Character.
- **F7** Speed-test notices follow the language.

The Japanese is the ライター&SNS approved text (Wi-t_Site `59b31dd`) and the English is the 英語翻訳チーム delivery (`922d0b9`).

## Wording

`docs/collaboration/provisional-wording.json` has **no entries**.

## The shared base layer

Unchanged since β.4: v1.0, 4,397 bytes, LF, digest burned in and checked at startup and before every hand-off. **A mismatch stops any text from being produced at all** — intended behaviour, not a fault.

## Release state

`UNSIGNED` / `CODE_SIGNING = NOT_EXECUTED` / **NOT_RELEASED**. Publication, GitHub Release, KOKOROSAKU tree and site updates are Owner decisions and have not been taken.
