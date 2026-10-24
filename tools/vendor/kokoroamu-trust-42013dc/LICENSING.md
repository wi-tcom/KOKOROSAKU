# Licensing — kokoroamu-trust

| GOV-RECORD-MIN field | Value |
| --- | --- |
| `gov_id` | `NOT_SPECIFIED` |
| `effective_date` | `NOT_SPECIFIED`（merge で発効） |
| `subject` | この repo のライセンスの範囲。`LICENSE`（MPL-2.0 の全文）、`LICENSES/CC0-1.0.md` |
| `supersedes` | `NO_FIRST_LAYER_REFERENCE`（これまでライセンスの記載は無かった） |
| `basis` | Owner の決定 2026-10-02（このセッションのチャットでの選択）: コードは「MPL-2.0」、trust の公開データ（public/trust/v1 の bundle・署名・失効の JSON）は「CC0-1.0」。依頼は SAKU Builder(4)（KOKOROSAKU の公開ツリーに検証の部品を入れるため） |
| `fail_closed` | 下の表に無いものには、ライセンスを与えない（NOT_SPECIFIED） |

この repo は、種類の違うものを含みます。1 つのライセンスとして扱わないでください。

| 対象 | ライセンス | 本文 |
| --- | --- | --- |
| コード: `public/lib/**`、`public/index.html`、`site/lib/**`、`site/index.html`、`bin/**`、`scripts/**`、`src/**`、`server.js`、`deploy/**`、`test/**`、`tests/**`、`package.json` | MPL-2.0 | [LICENSE](LICENSE) |
| 写した部品: `public/vendor/**`（KOKOROAMU-RUNTIME `examples/amupkg-verifier` と、その中の KOKOROAMU-STUDIO の部品の、commit の bytes のままの写し。出どころは各 `PROVENANCE.json`） | MPL-2.0 | [LICENSE](LICENSE)（配る写しのそばにも `public/vendor/LICENSE.txt`） |
| trust の公開データ: `public/trust/**`、`site/trust/**`（trust bundle・projection・それぞれの署名の JSON。中身は公開鍵・署名・失効の一覧） | CC0-1.0 | [LICENSES/CC0-1.0.md](LICENSES/CC0-1.0.md) |
| 文書: `docs/**`、`README.md`、`AGENTS.md` | NOT_SPECIFIED（ライセンスを与えない） | — |
| キャラクターの見本: `public/samples/**`、`site/samples/**` | NOT_SPECIFIED | — |
| 上の表に無いもの（`public/.well-known/**`、`public/status/**` ほか） | NOT_SPECIFIED | — |
| KOKOROAMU・KOKOROSAKU・SAKU・WI-T などの名前とマーク | ライセンスの対象外 | — |

- `public/vendor/**` の MPL-2.0 は、Owner の決定（2026-10-08、C-61。統括の伝達「推奨で進めて」）による。写しの bytes は出どころと照らすため変えないので、各ファイルに MPL の印は書かず、`public/vendor/NOTICE.txt` と `public/vendor/LICENSE.txt`（`LICENSE` と同じ bytes）をそばに置く。
- CC0-1.0 で配る trust のデータは、公開鍵・署名・失効の一覧だけです。秘密鍵・資格情報は、この repo に入れません（`docs/security/KEY_OPERATIONS.md`）。
- データを自由に写せることと、それを信頼することは別です。信頼の根拠は、利用者のアプリに焼き込んだルート公開鍵と、そのルートの署名の検証です（`public/lib/trust-config.mjs`）。
