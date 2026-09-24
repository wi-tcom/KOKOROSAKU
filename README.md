# KOKOROSAKU v0.1.0-beta.8

Japanese documentation: [README.ja.md](README.ja.md)

KOKOROSAKU is the public SAKU Builder/Trainer source and evaluation package. Builder and Trainer output remains a Candidate and does not become Canonical Authority or approval.

## Install and use

Download the Release asset `SAKU Builder_0.1.0-beta.8_x64-setup.exe` only from the future official GitHub Release. This beta is unsigned and Windows SmartScreen may display a warning. Before running it, verify:

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath '.\SAKU Builder_0.1.0-beta.8_x64-setup.exe').Hash.ToLower()
```

Expected SHA-256: `db0f544dcab30d7dd4517bc0a77f6e98ec12579a65dad2932d0ce8def8a314c9` (2,169,969 bytes). The installer is not stored in this git tree or source archive. See [RELEASE_ASSET_MANIFEST.json](RELEASE_ASSET_MANIFEST.json).

## What is new in v0.1.0-beta.8

- Input and help were rebuilt. Fields with fixed values are now chosen from a list, and the conformance references (must-preserve, prohibited-drift, continuity) are built automatically from the check boxes on each line. Help is now a Chapter › Item › Option tree on the right, and every option shows its meaning, effect and source (an effect describes a tendency, not a certainty). The manual is rebuilt from the same data and shows the version it applies to.
- The text sent to an external AI is assembled in three layers. The Base Directives shared by every Character (`saku.base-directives@1` v1.0, sha256 `ab4745a3…`) come first, and their digest is checked at startup and before any text is built; when it does not match, no text is built at all. An echo-back check, in which the AI reports what it loaded, is also available (off by default; a report, not verification).
- The AI speed test uses the difference between the start time and the end time the AI writes at the beginning and the end of its answer; those two lines are labeled `開始時刻` and `終了時刻`, which stay in Japanese in every language because the app matches them exactly. Manual timing is recorded separately for reference. Pasting an answer records it, and saved records can be compared.
- The Character list, the import history and the Character currently selected are held per Workspace. Deleting the app data does not lose them: open the same Workspace and they come back. Opening the same Workspace in a second window makes that window read-only.
- Import and save are judged against the adopted Schema, and anything that does not match is stopped with the reason shown. A file returned from AMU Studio (`.saku-return.zip`) can be opened as a starting point for editing. Three sample Characters (CC0-1.0) are included in the installer.

## Try without installing

Serve the source archive root over local HTTP and open `tooling/builder/index.html`. Direct `file://` use is unsupported for module-based screens.

## Developers

Clone the repository, use Node 24.19.0, run `npm ci`, `npm run desktop:prepare:public`, and then `npm run tauri:build`. See `docs/releases/0.1.0-beta.8/BUILD_ENVELOPE.json` for the exact accepted beta toolchain and build boundary.

## Licensing and brand

This repository has no repository-wide license grant. Exact paths are classified in [public-path-license-map.json](public-path-license-map.json); see [LICENSE-POLICY.md](LICENSE-POLICY.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Brand assets are from the wi-t.com Triple-Arc family and, to the extent copyright subsists, are provided under CC-BY-4.0 at the exact paths listed in `public-path-license-map.json`; trademark and brand-use rights are separate and are not granted.

OSS support is documentation-first, self-service, and best effort, with no guaranteed response time or contractual SLA.
