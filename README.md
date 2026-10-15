# KOKOROSAKU v0.1.0-beta.12

Japanese documentation: [README.ja.md](README.ja.md)

KOKOROSAKU is the public SAKU Builder source and evaluation package. Builder output remains a Candidate and does not become Canonical Authority or approval.

## Install and use

Download the Release asset `SAKU Builder_0.1.0-beta.12_x64-setup.exe` only from the future official GitHub Release. The installer carries a code signature (signer: wi-t.com Inc.). Even with a signature, Windows SmartScreen may display a warning until a reputation has built up. Before running it, verify:

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath '.\SAKU Builder_0.1.0-beta.12_x64-setup.exe').Hash.ToLower()
```

Expected SHA-256: `1c328008673b01037f71894f290e4f19ba6a24e8a98b3bb25d5754587ea78d98` (2,363,544 bytes). The installer is not stored in this git tree or source archive. See [RELEASE_ASSET_MANIFEST.json](RELEASE_ASSET_MANIFEST.json).

## What is new in v0.1.0-beta.12

- **Characters can now be saved in the “skill” format (Agent Skills).** “Save as a skill” in ④ Export saves a skill folder as a ZIP, for AI tools that can load this format. The export does not carry a WI-T.COM signature. When you use a skill in environments other than ours, the check by Seat 8 — Human (logical), the seat where a person decides, is not enforced by our mechanisms. Where it is needed, a person should make the decision.
- **Which formats you can export depends on where the Character came from.**
  - A self-made Character: a self-made ZIP (.zip), a skill, or .json / .yaml.
  - A pack Character (not edited): a skill only. You can use it in your own environment under the pack's terms of use. It may not be passed to anyone outside the licensee of the pack (or, for a corporation, that corporation). Placing it in a public place such as a sharing site also counts as passing it on.
  - An edited pack Character: a self-made ZIP and a skill. The original pack's terms of use still apply. It cannot be exported as .json / .yaml.
  - Samples, and Characters whose origin is not known: nothing is exported in any format. Samples are for reading only and cannot be edited and saved either.
  - In ④, the buttons for formats that cannot be exported are disabled and the reason is shown. Before exporting, you look at what will be exported and at the result of the check for contact details that slipped in, and tick the box.
- **The screen layout has been reworked.**
  - A common band sits above Setup and steps and the ① to ⑤ screens: the menu bar (Setup and steps, ① Choose a Character, ② Edit the Character, ③ Run (prompt), ④ Export, ⑤ SAKU Repair Desk · AMU Evaluation Center) and the row for the Character you have selected.
  - Progress on the 30 items needed for saving is shown as bars in three groups (purpose and role, judgment and handoff to a person, personality axes).
  - “New” in ② lets you start from a blank Character.
  - In ②, “Assistants that support the inner life (1+7)” and “SAKU, AMU and MACHI definitions compared” are now chapters that can be collapsed.
- **The list badges now use the same words as AMU Studio.** The “Origin” row in the details shows the badge and its description.
- **Packs are imported only after their signature is checked.** A pack that does not pass the check is not kept in the Workspace. When an import is refused, only a short message is shown, and the detailed reason is collapsed under “Details”.
- **SAKU Builder can now also import self-made Character ZIPs (.saku-character.zip).** The rules are the same as in AMU Studio. When a Character with the same ID and the same origin already exists, you are asked whether to replace it.
- **Import history** shows the three newest entries; you can scroll to see the rest. Each row shows “Imported” or “Not imported”.
- **Leaving without saving is now caught.** When you move to another screen or close the window with unsaved work in ②, you can choose “Save and continue”, “Continue without saving” or “Back to editing”. You are not asked when a new Character has nothing written yet, or when you only opened a sample. On the screens with this band, the browser's right-click menu no longer appears outside input fields.
- **The file save window** (exports in ④ and downloads in ②) now always opens in the Workspace folder. The file type field shows the extension, as in “JSON (*.json)”.
- **The signature status of the application itself is shown at the bottom of the screen.** It is checked with Windows at startup; for a WI-T.COM signature, “Signature: signed by WI-T.COM (checked)” is shown.
- Fixed an issue where the status lines went back to Japanese on the English screens.
- The bundled sample pack is now saku-pack-sample 1.2.0.
- **We changed the Supplementary Terms for AI Products and Services regarding the use of the export feature.** The changed Supplementary Terms (Section 02, items 6 and 7, and Section 07, item 9) apply to export operations started in SAKU Builder β.12 on or after October 15, 2026, 18:00 (Japan time). They do not apply retroactively to operations started before then. For details, see the [Supplementary Terms for AI Products and Services](https://www.wi-t.com/en-ai-product-terms).
- As in the previous version, the installer and the application carry a code signature (signer: wi-t.com Inc., with a timestamp from Microsoft's timestamping service).
- In the public source, three of the npm check scripts, `export:verify`, `packs:release:verify` and `occupation:verify`, do not run. This is because the files they read (copies of references without a license statement, test data, and the internal tool that issues packs) are not included in the public source. This does not affect how the app works.
- You can install over the previous version (β.11). The list of Characters, the import history and the Workspace location stay as they are. The rows in the list get the β.12 badges. To export a Character from a pack you imported in β.11, import the pack again from “① Choose a Character” (the license information needed for export is recorded when a pack is imported in β.12).
- The published v0.1.0-beta.11 stays available as it is.

## Try without installing

Serve the source archive root over local HTTP and open `tooling/builder/index.html`. Direct `file://` use is unsupported for module-based screens.

## Developers

Clone the repository, use Node 24.19.0, run `npm ci`, `npm run desktop:prepare:public`, and then `npm run tauri:build`. See `docs/releases/0.1.0-beta.12/BUILD_ENVELOPE.json` for the exact accepted beta toolchain and build boundary.

## Licensing and brand

This repository has no repository-wide license grant. Exact paths are classified in [public-path-license-map.json](public-path-license-map.json); see [LICENSE-POLICY.md](LICENSE-POLICY.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Brand assets are from the wi-t.com Triple-Arc family and, to the extent copyright subsists, are provided under CC-BY-4.0 at the exact paths listed in `public-path-license-map.json`; trademark and brand-use rights are separate and are not granted.

OSS support is documentation-first, self-service, and best effort, with no guaranteed response time or contractual SLA.
