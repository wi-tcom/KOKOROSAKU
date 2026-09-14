# Licensing overview — SAKU Builder / SAKU Trainer

This repository and its release artifacts contain material under different
licenses. Code, documentation, Character data, trademarks, and third-party
components must not be treated as one license scope.

| Material | License | Evidence |
|---|---|---|
| Builder/Trainer and desktop-host code | MPL-2.0 | [LICENSE](LICENSE) |
| Public documentation | CC BY 4.0 | [LICENSE-DOCS.md](LICENSE-DOCS.md) |
| Third-party components | Per-component licenses | [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) |
| SAKU/KOKOROSAKU/KOKOROAMU/WI-T names and marks | Not licensed by the code/document licenses | [TRADEMARK.md](TRADEMARK.md) |

## SAKU Builder 0.1.0-beta.1 Public Preview scope

This section is bound to:

- source commit: `a67f485e822c5cc54bee2763b71f06f705416047`
- source tree: `18a86f3372f7543f14761ba078c5821ed3763960`
- public installer SHA-256:
  `06b7fee785f86447f8c5e0cebf1eb290ba20ccbaad32ee492880a73d21cac915`
- resource profile: `public-preview`
- distribution boundary: `PUBLIC_PREVIEW`

The public artifact contains the public Builder/Trainer/desktop-host code,
approved offline help, public manuals, and public license/notice documents.
Its resource profile has `internal_content_count = 0`.

### Explicitly not included

| Resource | Public Preview status | Reason |
|---|---|---|
| Built-in Sample Pack | NOT_INCLUDED | The exact public profile does not bundle it. |
| 64 Preview Index | NOT_INCLUDED | Character Catalog licensing/publication scope is separate. |
| commercial-preview | NOT_INCLUDED | License/publication authority is not specified. |
| Sample3 | NOT_INCLUDED | Publication authorization is absent for this artifact. |
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
