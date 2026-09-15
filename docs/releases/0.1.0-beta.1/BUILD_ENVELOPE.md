# SAKU Builder 0.1.0-beta.1 Public Build Envelope

This envelope binds the public Windows installer to both Git-tracked source and
the non-Git public build inputs. Build identity is not inferred from the source
tree alone.

The normative machine-readable record is [BUILD_ENVELOPE.json](BUILD_ENVELOPE.json).
The exact public input bytes are included beside it as
`build-metadata.json`, `resource-profile.json`, and
`tauri.public.override.json`.

The application has two measured post-bundle identities. The NSIS
installer-embedded executable is `0ed118b3ae127307ad46f89f83a1646eb08bfc3db190e9180ee79fef7d57c4f2`
(`embedded_sha256`), while the executable left in `release/` after bundling is
`cf9949c737ab83f7b12ba225874c6e12a2896df1738e17b598caf9469fdf75fd`
(`post_bundle_release_sha256`). They differ only at the three-byte Tauri
bundle-type stamp (`__TAURI_BUNDLE_TYPE_VAR_NSS` versus `UNK`) at offsets
3,701,970–3,701,972.

Build `-003` (source `2200704a`, installer SHA-256 `4b277ead963551ae7f27b60168d72b0a7dfdd2434af39cb256f26917a2eaac63`, 1,812,494 bytes) supersedes
`-002` (installer `3cf5973dc7d795c2…`). Node/npm on the build host were 24.21.0/11.19.0; the
pinned rustc/cargo 1.97.1 toolchain produced the executable bytes.

## Reproduction model

1. Check out source commit `2200704a8b4a7dfe521cda0e42e15cd202ef48cb`
   and verify tree `f2773c3d7eb300c44b39d141352c81a5629f5d93`.
2. Stage only the source-tree resources selected by the included
   `public-oss` profile. Include only the D-B3-authorized Sample3; do not stage
   the 64 Preview Index, commercial-preview, Owner Review resources, or other
   internal content.
3. Place the included `build-metadata.json` and `resource-profile.json`
   at `.desktop-dist/resources/`.
4. Stamp `.desktop-dist/index.html` with the exact source commit in
   `meta[name="saku-build-revision"]`; the visible build label is the first 12
   hexadecimal characters.
5. Apply the included Tauri override so the already prepared public resource
   projection is not replaced by the default internal preparation command.
6. Set the documented path-remap arguments using the current build host's
   `BUILD_USER_HOME` and `CARGO_REGISTRY_SRC` values.
7. Run the recorded command from `<REPOSITORY_ROOT>` with the exact
   pinned tools and target triple.

Host-specific absolute paths are parameters and are intentionally not embedded
in this public envelope. The resolved values are transformed by the remap rules,
so the public binary contains no build-host absolute paths.
