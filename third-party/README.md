# Third-Party License Evidence

This directory closes the license/notice evidence for the 225 linked or bundled components in the exact SAKU Builder 0.1.0-beta.1 Public Preview installer.

- `THIRD_PARTY_LICENSE_MANIFEST.json` maps every component to exact distributed license evidence and any upstream copyright/NOTICE evidence.
- `LICENSES/` contains byte-preserved upstream license evidence, deduplicated by SHA-256.
- `NOTICES/` contains byte-preserved upstream copyright or notice evidence.
- A component with `NO_SEPARATE_UPSTREAM_COPYRIGHT_FILE` preserves the package authors metadata but does not represent authors as copyright holders.
- Build-time-only, system-runtime, external-runtime, and not-distributed packages are not added to this distribution license set.

