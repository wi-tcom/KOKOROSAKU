# KOKOROSAKU Builder クイックスタート

> これは英語正本 [builder-quickstart.md](builder-quickstart.md) の日本語訳です。ドキュメントは [CC BY 4.0](../../LICENSE-DOCS.md) で提供されます。

この手順では、Windows上で静的なベータ候補をローカル実行します。ソフトウェアのインストール、Characterの公開、Authorityやpermissionの付与は行いません。

## 1. ZIPを展開してローカルサーバーを起動する

ダウンロードしたZIPを展開します。PowerShellを開き、展開された `KOKOROSAKU-v0.1.0-beta.1` ディレクトリへ移動して、次を実行します。

```powershell
Set-Location .\KOKOROSAKU-v0.1.0-beta.1
python -m http.server 8080
```

PowerShellウィンドウは開いたままにしてください。`python` が見つからない場合はPython 3をインストールするか、Python 3を利用できる環境を使用してください。

警告: `KOKOROSAKU-v0.1.0-beta.1` より上の親ディレクトリでサーバーを起動しないでください。URLのprefixが変わり、無関係なローカルファイルが公開範囲に入る可能性があります。

`index.html` を `file://` で直接開かないでください。BuilderはJavaScript moduleと固定されたCharacter schemaをローカルHTTPサーバーから読み込みます。

## 2. Builderを開く

ブラウザで次のexact addressを開きます。

<http://localhost:8080/tooling/builder/index.html>

画面には、次の5つの作成章が表示されます。

1. 基本情報
2. 目的と役割
3. 仕事と使いどころ
4. 人格・価値観と話し方
5. 守ることと人に任せる条件

## 3. 記入例を試す

1. `記入例から新規作成` を選択します。
2. 各章を開き、表示内容を確認します。
3. 最初の章でCharacter名を変更します。
4. 明示的に編集した後だけPreviewが変わることを確認します。
5. Validationを確認します。ローカルのValidation結果はCanonical Adoption、Authority、Approval、Release、Productionの状態を意味しません。

固定1+7構造は読み取り専用です。runtime設定、AMU state、MACHI assignment、credential、permission、実際のHuman routingはCharacter fieldではありません。

## 4. 保存またはexportする

- `この内容で保存する` は、browser内の作業libraryへ新しいCharacter revisionを保存します。
- Previewの `コピー` は、選択中の表現をclipboardへコピーします。
- Previewの `ダウンロード` は、選択中の表現をfileとして保存します。

保存とダウンロードは別操作です。どちらもCharacterを公開せず、Trainerの推奨を自動適用しません。

## 5. Trainerを開く

Characterを保存した後、次を開きます。

<http://localhost:8080/tooling/builder/trainer.html>

Trainerは `準備する`、`AIで確認する`、`結果を確認する` の3段階です。外部AIへ手動でcopy/pasteする自己完結text packを作成します。外部AIの回答とHuman evaluationはTrainer evidenceとして保存され、TrainerがCharacterを直接変更することはありません。

## サーバーを停止する

PowerShellウィンドウへ戻り、`Ctrl+C` を押します。
