# KOKOROSAKU 静的ベータ候補

> これは英語正本 [README.md](README.md) の日本語訳です。ドキュメントは [CC BY 4.0](LICENSE-DOCS.md) で提供されます。

repository rootをHTTPで配信し、`/tooling/builder/index.html` を開きます。HTMLをファイルシステムから直接開かないでください。JavaScript moduleと固定されたschemaはHTTP経由で読み込まれます。

- Builder: `index.html`
- SAKU 診療所・AMU トレーニングセンター: `services.html`
- 候補状態とlicense: `about.html`
- 手順: [Builderクイックスタート](../../docs/getting-started/builder-quickstart.ja.md)

サンプル Character 3 体は、インストーラー版の「01 キャラクターを選択する」→「サンプルを読み込む」から読み込めます（ZIP 版にはありません）。実体は同梱の saku-pack-sample-1.1.0.zip で、公開リポジトリにも同じものがあります。権利条件は LicenseRef-WIT-Sample-1.0 で、OSS ではありません。

このdirectoryは `npm run public:tooling` で生成されます。Character Catalog、Occupation Pack、AMU runtime state、MACHI assignment、credential、permission、Human Apply実行は含みません。
