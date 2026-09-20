# External review intake fixtures (shared with KOKOROAMU-STUDIO)

These files are byte-identical copies of the AMU Trainer v0.2 wire fixtures and are the shared
acceptance set for `saku.trainer.external-review-intake@1`.

- Source: `wi-tcom/KOKOROAMU-STUDIO` main `63add842113628de4650762fefcaf93c95c1bb83` (2026-09-19); re-verified
  byte-identical at main `004266e3a3ce5f6d578093bcc65df628ad9d6ac0` (the canon named by the Owner instruction)
  - `tests/core/fixtures/amu-trainer-return.sample.json` → `amu-trainer-return.sample.json`
    (sha256 `e10e343c19d08249274b71206884a513f693fb88b86e4c4b412e8c126d6a2c70`)
  - `tests/core/fixtures/negative/*.json` + `INDEX.json` → `negative/` (25 cases, each the positive
    sample with exactly one defect; `INDEX.json` maps file → AMU reference refusal code)
- Reference validator on the AMU side: `core/trainer/return-packet.js` at the same revision. The Builder
  intake refuses every negative for the same reason (codes are shared vocabulary).
- The positive packet is synthetic (`evidence/synthetic/*` refs, fixed UUIDs, `aimi-meguru` 1.0.0).
  It is test data, not a record of a real Trainer run.

Do not edit these files here. Re-copy from the AMU revision named above and update this note.
