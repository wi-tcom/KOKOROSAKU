# Speed-test fixtures (AMU / ERABAZU parity)

- `erabazu-speed-test-probe-pack.default.json` — byte copy of the ERABAZU canon probe pack
  (`erabazu/speed-test-probe-pack/default`, schema `erabazu.candidate/speed-test-probe-pack/v1`) as vendored in
  `wi-tcom/KOKOROAMU-STUDIO` main `944151e4` at
  `apps/amu-ai-service/vendor/erabazu-speed-test-409b4a2/candidates/ai-platform-tsugite/speed-test-parts/parts/`
  (erabazu.works exact head `409b4a236fe88bd17963e747a792b53723d3f380`; sha256 `663e2bba394dc21e093f8b09e3767f21d6d5e5c160145dda050bfa1ddcfe2591`,
  matching the vendor `PROVENANCE.json`). Digest notation there is `sha256:`; the AMU/Builder core uses `sha-256:`; the hex is identical.
- `amu-vectors.944151e4.json` — inputs and outputs produced by the AMU core `core/diagnostics/speed-test.js` at
  `944151e4` (file sha256 `b54e17e0efd843c16eb6af9a40cf07f7c185b643cebfb044d3c18225d13555ca`). `scripts/verify_speed_test.mjs`
  replays every input through `tools/v1/speed-test.mjs` and requires identical output (paste runs: minus the Builder
  addition `answer.line_digests`). Includes the empty-answer = zero-lines diff rule (AMU PR #28).

Do not edit these files here. Regenerate from the AMU revision named above and update this note.
