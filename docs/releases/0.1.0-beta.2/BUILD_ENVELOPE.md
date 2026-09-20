# SAKU Builder 0.1.0-beta.2 Public Build Envelope (candidate)

Machine-readable record: [BUILD_ENVELOPE.json](BUILD_ENVELOPE.json). Exact public inputs beside it:
`build-metadata.json`, `resource-profile.json`, `tauri.public.override.json`. Installer identity: [SHA256SUMS](SHA256SUMS).

| Artifact | Bytes | SHA-256 | Authenticode |
| --- | ---: | --- | --- |
| `SAKU Builder_0.1.0-beta.2_x64-setup.exe` | 1,875,865 | `7d357f41a59d923f940acc2fd7f7d65a3aee5ee0840f06a8e8def9fd83fcb572` | NotSigned |
| installer-embedded `saku-builder-desktop.exe` | 4,040,704 | `106aa0503e2c5b736f328e9820b45c87a57eb36b783d86bf8f90201693873989` | NotSigned |
| `release/saku-builder-desktop.exe` (post-bundle) | 4,040,704 | `41b29dccfb1fd37e9ee1f01d5fd9c5795f43bbcf0fffbaa51e1bd986543b0d9b` | NotSigned |

- Source: `wi-tcom/-SAKU-builder` commit `20663d6078675df64f2fe4a9640ac3c1313bbaa7` (tree `8e1bd558bfe4be8e1bcb22cc92ec33dd201cb290`), branch `claude/saku-pack-import-fix-20260920`.
- Embedded vs post-bundle executable: 3 differing byte(s) at offsets 3812866–3812868 (Tauri bundle-type stamp).
- Host-path / user-name scan of both executables (UTF-8 and UTF-16LE): 0 hits.
- Toolchain and environment: identical to the -003 envelope (rustc/cargo 1.97.1, Tauri CLI 2.11.4, remap-path-prefix flags, CARGO_NET_OFFLINE, jobs 1, incremental 0); target label `tauri-exact-1.97.1-beta2-public-oss-20663d6-001`.
- Since β.1: PR #25 (external review-only Trainer intake), PR #26 (AI speed test paste mode), and the Character Pack import fix.
- Publication, GitHub Release, and the KOKOROSAKU README / RELEASE_ASSET_MANIFEST expected-sha update are the Owner's; this envelope is a candidate record.
