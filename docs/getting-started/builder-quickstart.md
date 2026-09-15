# KOKOROSAKU Builder quickstart

English is the canonical document. [日本語訳](builder-quickstart.ja.md) is available. Documentation is licensed under [CC BY 4.0](../../LICENSE-DOCS.md).

This guide runs the static beta candidate locally on Windows. It does not install software, publish a Character, or grant any authority or permission.

## 1. Unpack and start the local server

Extract the downloaded ZIP. Open PowerShell, enter the extracted
`KOKOROSAKU-v0.1.0-beta.1` directory, and run:

```powershell
Set-Location .\KOKOROSAKU-v0.1.0-beta.1
python -m http.server 8080
```

Keep that PowerShell window open. If `python` is not found, install Python 3 or use a machine where Python 3 is already available.

Warning: do not start the server in a parent directory above `KOKOROSAKU-v0.1.0-beta.1`; doing so changes the URL prefix and may expose unrelated local files.

Do not open `index.html` directly with `file://`. The Builder loads JavaScript modules and the pinned Character schema through the local HTTP server.

## 2. Open the Builder

Open this exact address in a browser:

<http://localhost:8080/tooling/builder/index.html>

The page should show the five authoring chapters:

1. 基本情報 / Basic information
2. 目的と役割 / Purpose and role
3. 仕事と使いどころ / Work and use
4. 人格・価値観と話し方 / Personality, values, and speech
5. 守ることと人に任せる条件 / Boundaries and Human handoff

## 3. Try the included example

1. Select `記入例から新規作成` / `Start from the example`.
2. Open each chapter and review the visible values.
3. Change the Character name in the first chapter.
4. Confirm that Preview changes only after your edit.
5. Review Validation. A local Validation result is not Canonical Adoption, Authority, Approval, Release, or Production status.

The fixed 1+7 structure is read-only. Runtime configuration, AMU state, MACHI assignment, credentials, permissions, and real Human routing are not Character fields.

### Import the three public samples

The beta.1 installer does not bundle the three sample Characters. In the source
ZIP or repository, open `samples/oss-launch/unified-v1/`. In the Desktop app,
open **01 Choose a Character**, select **Individual import**, and choose each
one-Character JSON file separately. Do not use Package import for these files.

## 4. Save or export

- `この内容で保存する` / `Save this Character` stores a new Character revision in the browser-side working library.
- Preview `コピー` / `Copy` copies the selected representation.
- Preview `ダウンロード` / `Download` saves the selected representation as a file.

Saving and downloading are separate actions. Neither action publishes the Character or applies a Trainer recommendation automatically.

## 5. Open Trainer

After saving a Character, open:

<http://localhost:8080/tooling/builder/trainer.html>

Trainer follows three stages: Prepare, Check with AI, and Review results. It creates a self-contained text pack for manual copy/paste to an external AI. External AI responses and Human evaluations are stored as Trainer evidence; Trainer does not directly mutate the Character.

## Stop the server

Return to the PowerShell window and press `Ctrl+C`.
