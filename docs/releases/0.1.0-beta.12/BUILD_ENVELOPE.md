# SAKU Builder 0.1.0-beta.12 Public Build Envelope (candidate, signed)

Machine-readable record: [BUILD_ENVELOPE.json](BUILD_ENVELOPE.json). The exact public inputs are beside it:

- `build-metadata.json` (code_signing = AZURE_ARTIFACT_SIGNING).
- `resource-profile.json`, the copy of `desktop/resources/profiles/public-oss.json` that bundles the sample pack 1.2.0.
- `tauri.public.override.json`, as β.11. It was not passed to this build; see Build.
- `tauri.signing.override.template.json`, the signing override with host paths replaced by placeholders.

Installer identity: [SHA256SUMS](SHA256SUMS).

| Artifact | Bytes | SHA-256 | Authenticode |
| --- | ---: | --- | --- |
| `SAKU Builder_0.1.0-beta.12_x64-setup.exe` | 2,363,544 | `1c328008673b01037f71894f290e4f19ba6a24e8a98b3bb25d5754587ea78d98` | Valid (wi-t.com Inc.) |
| installer-embedded `saku-builder-desktop.exe` | 4,416,288 | `ac8336fe93058ed93b27904bff67df4f21a359fff84122826f82f052f8cd2b46` | Valid (wi-t.com Inc.) |
| `release/saku-builder-desktop.exe` (post-bundle, rewritten by Tauri) | 4,400,640 | `2afe24beb98666ad88e60475a249b26d6a86ff6ff11166b000be79d65d24ded7` | not signed (see below) |
| bundled `saku-base-directives.v1.txt` (v1.1) | 4,414 | `f906ebfcf67d153f2196f4a43232325cd56a58b471626d3eabc959fa14b7204c` | — |
| bundled `samples/saku-pack-sample-1.2.0.zip` | 18,625 | `f30462275a35d53122518941457d64f1ec07ca748efe681caa46d3d0dc384126` | — |

## What is new since β.11

- ④ 出力 saves a Character as an Agent Skills folder (ZIP) (ADR-0026; -SAKU-builder #103, #104, #106). The exports carry no WI-T.COM signature.
- What may be exported follows the row's origin (Owner result 188):
  - self-made: every form;
  - an unedited pack Character: Agent Skills only;
  - an edited pack Character: the self-made ZIP and Agent Skills;
  - the sample and unknown origins: no form.
- The screens are rebuilt (#116):
  - a shared frame with the menu (準備と進め方, ①–⑤), the selected-Character line and a three-step bar for the 30 required fields;
  - ② 新規作成;
  - the 1+7 and comparison sections are chapters that fold.
- List badges shared with AMU Studio (Owner plan A), and the detail's 出どころ row (#116).
- A pack is accepted only after its signatures pass. A refusal folds its detail under 「くわしく」 (#116).
- Self-made Character ZIPs are read. The same id and the same origin ask before replacing (#116).
- The import history shows the newest three; the rest scroll.
- Leaving ② or closing the window with unsaved edits asks first: save / leave without saving / back.
- Save dialogs open in the Workspace folder, and the type row names the extension.
- The footer shows the running executable's own signature, checked by Windows at start.
- English state lines stay English (#106).
- The bundled sample pack is `saku-pack-sample` 1.2.0 (#115).
- Version 0.1.0-beta.12. The manual's last-checked day is 2026-10-15 (Windows 10.0.26300, WebView2 Runtime 155.0.4283.45).

## Signing

The same as β.11:

- Service: Azure Artifact Signing, account `witcomsigning`, profile `witcomPublicTrust`.
- Signer: `CN=wi-t.com Inc., O=wi-t.com Inc., L=Yokohama, S=Kanagawa-ken, C=JP`.
- Method: signtool with `Azure.CodeSigning.Dlib` through Tauri's `signCommand`, SHA-256, with an RFC 3161 timestamp from `http://timestamp.acs.microsoft.com`.

What was checked and what was not:

- Checked `Valid` (signer wi-t.com Inc.) by `scripts/desktop-signed-build.ps1`:
  - the installer;
  - inside it, `saku-builder-desktop.exe`, `nsDialogs.dll`, `nsis_tauri_utils.dll`, `NSISdl.dll`, `StartMenu.dll` and `System.dll`.
- The Owner checked the installer again with `Get-AuthenticodeSignature`.
- Checked `Valid` after an upgrade install (`/S`) by the 統括 (2026-10-15, NG 0): `uninstall.exe`, and the installed `saku-builder-desktop.exe`, which is the same bytes as the installer-embedded one.
  - The record is an internal keying record (NG 0).
  - The same check found that the version reads v0.1.0-beta.12, the footer reads 「WI-T.COM の署名あり（確かめ済み）」, and the list kept its 19 rows, badges and import history across the upgrade.
- Not signed: `LangDLL.dll`, an NSIS plugin Tauri does not sign.
- Not signed: the post-bundle executable, which Tauri rewrites after bundling. The installer-embedded one is the identity.
- A signature shows who made the file and that it has not changed since signing. It does not show that the contents are correct or safe.

## Build

- Source: `wi-tcom/-SAKU-builder` commit `04a57ca6c2e982ad81f83c80ecbc6d773cd63198`, tree `f08a978f7f8c3c94352005b64afa7ff6fe316221`, branch `claude/saku-beta12-version-20261015`.
  - It is built on `main` `e47473f`, the #116 merge, whose tree is identical to `76f61f7`, the build the 統括 and the Owner keyed.
  - This commit adds only the version strings, this folder's inputs and one English line.
- The Owner built and signed it on the Owner's PC on 2026-10-14T21:43:58Z, taking 8.3 min including signing.
  - The tool was `scripts/desktop-signed-build.ps1` (SHA-256 `807003e2…d22a`).
  - It works in a fresh clone of the commit (`npm ci`) with `CARGO_TARGET_DIR` outside the repository.
  - It lets `beforeBuildCommand` (`npm run desktop:prepare`, public-oss) prepare the frontend, so `tauri.public.override.json` was not passed.
- Toolchain: as β.2 – β.11 (rustc/cargo 1.97.1, Tauri CLI 2.11.4, Node 24.21.0). Path prefixes are remapped as β.11.
- Host-path and user-name scan of both executables: **0 hits** (`inspect_build_b12.mjs`).
- The v1.1 base-layer digest is burned in, and the v1.0 digest is absent.
- No OSS sample file is in the installer.

## Release state

Signed / **NOT_RELEASED** until the Owner publishes. The Owner's results 199, 200 and 204 set the order: the change to the AI product terms takes effect at 2026-10-15 18:00 JST, and the release follows it.
