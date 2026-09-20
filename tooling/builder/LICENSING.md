# Licensing overview — SAKU Builder / SAKU Trainer

This repository and its release artifacts contain material under different
licenses. Code, documentation, Character data, trademarks, and third-party
components must not be treated as one license scope.

| Material | License | Evidence |
|---|---|---|
| Builder/Trainer and desktop-host code | MPL-2.0 | [LICENSE](LICENSE) |
| Public documentation | CC BY 4.0 | [LICENSE-DOCS.md](LICENSE-DOCS.md) |
| SAKU logo/icon artwork, 著作権が及ぶ範囲において | CC BY 4.0 | [BRAND-ASSET-NOTICE.md](BRAND-ASSET-NOTICE.md) |
| Third-party components | Per-component licenses | [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) |
| SAKU/KOKOROSAKU/KOKOROAMU/WI-T names and marks | Not licensed by the code/document licenses | [TRADEMARK.md](TRADEMARK.md) |

## SAKU Builder 0.1.0-beta.2 Public Preview scope

This section is bound to:

- source commit: `2200704a8b4a7dfe521cda0e42e15cd202ef48cb`
- source tree: `f2773c3d7eb300c44b39d141352c81a5629f5d93`
- public installer SHA-256:
  `4b277ead963551ae7f27b60168d72b0a7dfdd2434af39cb256f26917a2eaac63`
- resource profile: `public-oss`
- distribution boundary: `PUBLIC_OSS_CANDIDATE`

The public artifact contains the public Builder/Trainer/desktop-host code,
approved offline help, public manuals, and public license/notice documents.
Its resource profile has `internal_content_count = 0`.

### Explicitly not included

| Resource | Public Preview status | Reason |
|---|---|---|
| Built-in Sample Pack | INCLUDED | D-B3 authorizes the exact three synthetic CC0-1.0 samples. |
| 64 Preview Index | NOT_INCLUDED | Character Catalog licensing/publication scope is separate. |
| commercial-preview | NOT_INCLUDED | License/publication authority is not specified. |
| Sample3 | INCLUDED | Owner publication authorization D-B3 is recorded for this artifact. |
| Full Commercial 64 Character Catalog | NOT_INCLUDED | License is `NOT_SPECIFIED`; separately managed. |
| Owner Packs (ERABAZU 5 / WI-T.COM 3) | NOT_INCLUDED | Separately managed; not part of this public artifact. |
| Commercial AMU | NOT_INCLUDED | Separate product and license scope. |

No absent or internal-only document is incorporated by reference.

## Additional boundaries

- Synthetic test fixtures in source are test inputs, not a Character Catalog product.
- Documentation examples do not grant rights in separately managed Character data.
- MPL-2.0 applies file-by-file to covered code and does not grant trademark rights.
- Character Catalog material remains `NOT_SPECIFIED` unless separate authoritative
  license evidence says otherwise.
- Public Preview is a distribution state, not Canonical Adoption, Authority,
  Approval, Release execution, or Production status.
