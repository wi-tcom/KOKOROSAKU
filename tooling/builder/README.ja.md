# KOKOROSAKU 静的ベータ候補

> これは英語正本 [README.md](README.md) の日本語訳です。ドキュメントは [CC BY 4.0](LICENSE-DOCS.md) で提供されます。

repository rootをHTTPで配信し、`/tooling/builder/index.html` を開きます。HTMLをファイルシステムから直接開かないでください。JavaScript moduleと固定されたschemaはHTTP経由で読み込まれます。

- Builder: `index.html`
- Trainer: `trainer.html`
- 候補状態とlicense: `about.html`
- 手順: [Builderクイックスタート](../../docs/getting-started/builder-quickstart.ja.md)

## 3体のサンプルCharacterを個別に読み込む

3体のサンプルCharacterはbeta.1 installerには同梱されません。source ZIPまたは
repositoryの `samples/oss-launch/unified-v1/` にあります。Desktopで
**01 キャラクターを選択する**を開き、**個別インポート**から1体単位のJSONを
1本ずつ選択してください。これらの個別JSONにはPackageインポートを使用しません。

このdirectoryは `npm run public:tooling` で生成されます。Character Catalog、Occupation Pack、AMU runtime state、MACHI assignment、credential、permission、Human Apply実行は含みません。
