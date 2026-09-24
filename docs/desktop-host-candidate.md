# SAKU Builder Tauri 2 thin desktop host — Implemented Candidate

STATUS: `IMPLEMENTED_CANDIDATE`
CANONICAL: `NO`
PUBLICATION: `NO`
CODE_SIGNING: `UNSIGNED`

## Boundary

The desktop host contains the existing Builder HTML, Trainer HTML, and shared ES modules as Tauri bundled assets. It does not introduce a localhost server, cloud backend, AMU/MACHI runtime, Canonical Authority, Credential, Approval, entitlement, or external service.

Build source is the approved `-SAKU-builder` checkout. `.desktop-dist/` and `src-tauri/target/` are generated inside that checkout and are not runtime dependencies after installation. Cloud-synchronized folders and other checkouts are neither build inputs nor runtime inputs.

## Data locations

- install directory: selected by the user in the native NSIS installer
- config: OS-standard per-user application config directory
- logs: OS-standard per-user application log directory
- cache: OS-standard per-user application cache directory
- workspace/projects/imports: directory selected or created by the user on first run

Uninstall removes application files. It does not remove the independently selected workspace or projects.

## Resource profiles

`owner-review-internal` is the default build profile. It may include the commercial preview index and declares Fixed64/ERABAZU5/WI-T3 as external-package slots with `NOT_SPECIFIED` license state. Full internal content is not copied into this repository.

`public-oss` is a fail-closed build profile. Its `internal_content_count` must be exactly zero and its forbidden internal IDs must be absent. Preparing this local profile is validation only; it does not authorize publication.

The OSS Sample3 source is pinned to GitHub revision `f3186855c8bed6100108346384b3a73b44f7ea5b`, blob `1be479e14eef13653c58029a8c03509cbc3c6acf`, and SHA-256 `e1bb49bc1165d60430e97d3435c9a63ed372bfefa57c2a58e8fe9880c2c1fd0c`. Its own metadata retains `publication_authorization=false`.

## WIT package candidate — retired (2026-09-21)

**Retired.** The two-file Builder package (`.witpkg`: `wit-package.json` + `payload.json`) never had a producer and is no longer read; the host imports the signed SAKU Character Pack (`character-pack.json` ZIP, Package 3.0.0 `saku-unified-v1`) only. A ZIP whose root `wit-package.json` declares `package_type: WIT_PACKAGE` with `kind: AMU_CHARACTER` is the **AMU Character File** (`.amupkg`, KOKOROAMU-STUDIO); the Builder names it and points the user to AMU Studio's 「この編集内容を SAKU へ戻す」 instead of reading it. A bare Character JSON/YAML on the package route is pointed at 個別インポート. The workspace record `imports/<dir>/wit-package.json` keeps its name so existing imports stay readable. The historical shape is kept below for the record only:


```json
{
  "package_type": "WIT_PACKAGE",
  "product": "example-product",
  "package_version": "1.0.0",
  "schema_version": "SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE@final-delta-recovery-closure-2026-09-04",
  "minimum_app_version": "0.1.0",
  "content_type": "CHARACTER_PACK",
  "distribution_channel": "OWNER_REVIEW",
  "license_state": "NOT_SPECIFIED",
  "payload_hash": "lowercase sha256 of the exact payload.json bytes"
}
```

The archive is selected in the GUI or dropped on Desktop home. The app reads it without manual extraction, rejects nested, duplicate, encrypted, unsupported-compression, extra, oversized, CRC-invalid, and path-like entries, and fails closed when either required root file is absent. The manifest is a Builder import contract candidate, not SAKU Canonical Schema adoption. Validation distinguishes `INVALID`, `UNSUPPORTED`, and `NOT_CONFIGURED`; its reason is shown in the GUI. Imported bytes are written only below the selected workspace. Legacy single-file JSON package envelopes remain readable for backward compatibility, but ZIP is the distribution model.

## Installer behavior

The Tauri native NSIS target uses `currentUser` install mode. Its standard Japanese/English language-selection dialog is enabled at startup. The native installer retains its directory selection page, visible installation details/progress, uninstaller, finish-page launch action, and an install-directory link. `installMode` and install directory are treated as separate settings.

WebView2 delivery is explicitly pinned to Tauri's `downloadBootstrapper` mode. When a compatible WebView2 runtime is absent, the installer requires an Internet connection, displays the WebView2 download/install stage, and aborts with a localized visible error if delivery fails. This is an installer-time dependency only; the installed application has no runtime remote-service dependency and requires no end-user shell command.

Getting Started is bundled offline and available from the application after launch. A minimal custom NSIS template adds one dedicated finish-page Getting Started action while preserving the standard Launch action, desktop shortcut choice, directory selection, install-location link, locale behavior, and uninstaller. Selecting Getting Started clears the standard Launch checkbox before opening the app so the application is not launched twice from the finish page.

No certificate, private key, root certificate, security-product exception, TLS bypass, or ExecutionPolicy bypass is included.
