# SAKU Builder 0.1.0-beta.1 Public Build Envelope

This envelope binds the public Windows installer to both Git-tracked source and
the non-Git public build inputs. Build identity is not inferred from the source
tree alone.

The normative machine-readable record is [BUILD_ENVELOPE.json](BUILD_ENVELOPE.json).
The exact public input bytes are included beside it as
`build-metadata.json`, `resource-profile.json`, and
`tauri.public.override.json`.

## Reproduction model

1. Check out source commit `b196cca183b246b97f24c8372da58d717c0bd45f`
   and verify tree `1fbccfbe7890b5e939b0401a71e785bc4574e7fd`.
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
