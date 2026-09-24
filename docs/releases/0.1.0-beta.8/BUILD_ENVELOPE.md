# SAKU Builder 0.1.0-beta.8 Public Build Envelope (candidate)

Machine-readable record: [BUILD_ENVELOPE.json](BUILD_ENVELOPE.json). Exact public inputs beside it:
`build-metadata.json`, `resource-profile.json`, `tauri.public.override.json` (unchanged from β.7). Installer identity: [SHA256SUMS](SHA256SUMS).

| Artifact | Bytes | SHA-256 | Authenticode |
| --- | ---: | --- | --- |
| `SAKU Builder_0.1.0-beta.8_x64-setup.exe` | 2,169,165 | `66b8c28d537f8387f2df511ee61f709959d95ea4f9f98958ddf812c68411b0c6` | NotSigned |
| installer-embedded `saku-builder-desktop.exe` | 4,270,080 | `1119108e859c22618c277e037685ba9f8c1ac2a1c310283042cc35e227ff3812` | NotSigned |
| `release/saku-builder-desktop.exe` (post-bundle) | 4,270,080 | `6e44c2c9914c5772fa2ca615ab397ed222f6e92d76d14050c73a1c0024371ed1` | NotSigned |
| bundled `saku-base-directives.v1.txt` | 4,397 | `ab4745a3617e5b8e49125146a47ee99d1adde7ad8436c953431518ac23358654` | — |

- Source: `wi-tcom/-SAKU-builder` commit `16a79a719a10b55b47ddffde6568d74b77ee2c34` (tree `eb3895ceac8a256df13ddb4df0a371807f98abd5`), branch `claude/saku-beta8-20260924`, off `main` `6cc904f` after PR #78 merged. The version bump is committed before the build, so the commit and tree named here are the ones the binary was made from.
- Toolchain and environment: identical to the β.2 – β.7 envelopes — rustc/cargo 1.97.1, Tauri CLI 2.11.4, Node 24.21.0, `CARGO_ENCODED_RUSTFLAGS` remap-path-prefix ×4 (U+001F separated), `CARGO_NET_OFFLINE=true`, jobs 1, incremental 0, `--locked`; target label `tauri-exact-1.97.1-beta8-public-oss-16a79a7-001`. Build time 7m 45s. Source mutation by the build: 0 files.
- Embedded vs post-bundle executable: 3 differing byte(s) at offsets 3969594–3969596 — the Tauri bundle-type stamp, `NSIS` against `UNKNOWN`, as in β.3 – β.7.
- Host-path / user-name scan of both executables (UTF-8 and UTF-16LE): **0 hits**.
- Generated NSIS: `verify_generated_nsis.mjs` PASS. The installer was digested again after being copied to `SAKU-verify\beta8\`.

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
