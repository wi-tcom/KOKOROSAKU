# SAKU Builder 0.1.0-beta.13 Public Build Envelope (candidate, signed)

Machine-readable record: [BUILD_ENVELOPE.json](BUILD_ENVELOPE.json). The exact public inputs are beside it:

- `build-metadata.json` (code_signing = AZURE_ARTIFACT_SIGNING).
- `resource-profile.json`, the copy of `desktop/resources/profiles/public-oss.json` that bundles the sample pack 1.2.0.
- `tauri.public.override.json`, as β.12. It was not passed to this build; see Build.
- `tauri.signing.override.template.json`, the signing override with host paths replaced by placeholders.

Installer identity: [SHA256SUMS](SHA256SUMS).

| Artifact | Bytes | SHA-256 | Authenticode |
| --- | ---: | --- | --- |
| `SAKU Builder_0.1.0-beta.13_x64-setup.exe` | 2,455,112 | `0d4262ca7fa7cb942c304f72637ed1db206728db0016b20c50bf97faf92045a7` | Valid (wi-t.com Inc.) |
| installer-embedded `saku-builder-desktop.exe` | 4,526,880 | `46f11ddc771fc9f32b281991d6546e852ac053178d1e325451e873ea3b7f508e` | Valid (wi-t.com Inc.) |
| `release/saku-builder-desktop.exe` (post-bundle, rewritten by Tauri) | 4,511,232 | `95aa46a32d0d13bbbddfb42df88c0b3884c9210eac58f3bfe5e455ff7583b8d6` | not signed (see below) |
| bundled `saku-base-directives.v1.txt` (v1.1) | 4,414 | `f906ebfcf67d153f2196f4a43232325cd56a58b471626d3eabc959fa14b7204c` | — |
| bundled `samples/saku-pack-sample-1.2.0.zip` | 18,625 | `f30462275a35d53122518941457d64f1ec07ca748efe681caa46d3d0dc384126` | — |

## What is new since β.12

- ④ 出力 saves a pack Character's standard skill, exactly as distributed, from the pack's companion attachment (ADR-0027), behind the name tag's WI-T.COM signature; the regenerated export carries no WI-T.COM signature.
- Four name tag badges (valid / absent / unverified / verification failed), apart from the Character badges; what a valid name tag signature shows is the legal team's sentence.
- Exports check the row's origin first: rows saved before β.13 with no origin record and a pack Character's id are not exported; a return from AMU Studio is exported only when its original pack can be pinned to one.
- A row with no origin record (a repaired file, a Workspace recovery, a hand-off from an older SAKU) can be confirmed as the person's own and exported; every export checks it again.
- ② keeps the original row's origin when it saves.
- ⑤ 「この内容でキャラクター編集を開く」 opens ② with the content; nothing changes until ② saves; examples per symptom and field, Tab puts the example in, and ② opens at that field.
- Right-click menus are the same on every page: none outside fields, only the editing items inside.
- Help, the manual and the Trainer open in the main screen's language.
- The Help cards look pressable; ①'s button reads 「サンプルを読み込む」; the .json/.yaml export notes say they read back with the individual import.
- The help: the name tag badges, the two ways to save in ④, a card for refused saves and exports, the confirmation step, and the Help's two new sections.
- kokoroamu-trust gen 11 is bundled for the name tag check (tools/vendor/kokoroamu-trust-42013dc).
- version 0.1.0-beta.13.

## Signing

The same as β.11 and β.12:

- Service: Azure Artifact Signing, account `witcomsigning`, profile `witcomPublicTrust`.
- Signer: `CN=wi-t.com Inc., O=wi-t.com Inc., L=Yokohama, S=Kanagawa-ken, C=JP`.
- Method: signtool with `Azure.CodeSigning.Dlib` through Tauri's `signCommand`, SHA-256, with an RFC 3161 timestamp from `http://timestamp.acs.microsoft.com`.

What was checked and what was not:

- Checked `Valid` (signer wi-t.com Inc.) by `scripts/desktop-signed-build.ps1`:
  - the installer;
  - inside it, `saku-builder-desktop.exe`, `nsDialogs.dll`, `nsis_tauri_utils.dll`, `NSISdl.dll`, `StartMenu.dll` and `System.dll`.
- The installer was checked again with `Get-AuthenticodeSignature`: Valid, wi-t.com Inc., with a timestamp.
- After installing: to be checked in the Owner's keying of this build (`uninstall.exe`, and the installed `saku-builder-desktop.exe`).
- Not signed: `LangDLL.dll`, an NSIS plugin Tauri does not sign.
- Not signed: the post-bundle executable, which Tauri rewrites after bundling (4,511,232 bytes against 4,526,880; the same 15,648-byte difference as β.12). The installer-embedded one is the identity.
- A signature shows who made the file and that it has not changed since signing. It does not show that the contents are correct or safe.

## Build

- Source: `wi-tcom/-SAKU-builder` commit `cc471f95841bd6dee2da0581bf9725ecb2c0e6d4`, tree `63a469435d3ec7cf862450c1541210117811d651`, `main`.
  - It is the merge of #130, which carried the β.13 stack #120–#132; its tree is the same as #130's head `7f4a2f2`, on which the full gates and the CI ran.
  - The version strings and this folder's inputs came with #132 (S-17).
- It was built and signed on the Owner's PC on 2026-10-24T06:08:17Z, taking 4.8 min including signing.
  - The tool was `scripts/desktop-signed-build.ps1` (SHA-256 `807003e2…d22a`, the same as β.12).
  - It works in a fresh clone of the commit (`npm ci`) with `CARGO_TARGET_DIR` outside the repository.
  - It lets `beforeBuildCommand` (`npm run desktop:prepare`, public-oss) prepare the frontend, so `tauri.public.override.json` was not passed.
- Toolchain: rustc/cargo 1.97.1, Tauri CLI 2.11.4, Node 24.22.1 (β.12: 24.21.0), npm 11.19.1. Path prefixes are remapped as β.11 and β.12.
- Host-path and user-name scan of both executables: **0 hits**.
- The v1.1 base-layer digest is burned in, and the v1.0 digest is absent.
- No OSS sample file is in the installer.

## Release state

Signed / **NOT_RELEASED** until the Owner publishes. The Owner's results 422, 424 and 426 set it: SAKU Builder β.13 and the character packs (1.2.0 and the standard attachments) are released on 2026-10-24 at 20:00 JST, after the Owner's keying.
