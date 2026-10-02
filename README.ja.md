# KOKOROSAKU v0.1.0-beta.11

English canonical documentation: [README.md](README.md)

KOKOROSAKUは、SAKU Builderの公開sourceと評価用packageです。Builderの出力はCandidateのままで、Canonical Authorityや承認にはなりません。

## インストールして使う

将来の公式GitHub Releaseから `SAKU Builder_0.1.0-beta.11_x64-setup.exe` を取得します。インストーラーにはコード署名（署名者 wi-t.com Inc.）があります。署名があっても、評判が積み上がるまでWindows SmartScreenが警告を表示することがあります。実行前にSHA-256 `b3aea22ae10dee7510d77d6f5d4ec20b105c93c621de4d958e54a45be15a4bdd`（2,295,296 bytes）と一致することを確認してください。installerはgit treeとsource ZIPには含まれません。

## このリリースの変更点

- **AI に渡す文の中の席 8 の言い方を、画面の席の名前（論理上の人）にそろえました。** 03 の「コピーする」で写す文の「席8は人間です」などを、「席8は論理上の人の席です。AIはこの席を埋めません。席8の判断は、実在の人が行います。」に改めました。あわせて、利用者への答えでは、席の番号や「席8の人間」という言い方を使わないよう、AI に伝えます。
- **すべての Character に共通の指示文（Base Directives）を v1.0 から v1.1 にしました。** 変えたのは 2 行だけで、席 8 を論理上の人の席と書き、判断が要るときは人に渡すと書きました。規則を緩める変更ではありません。AMU Studio・MACHI と同じ版で、03 の文の版の行が「v1.1」になります。
- **アプリのアイコンと、画面のマークを新しくしました**（芽のマーク）。
- インストーラーとアプリ本体には、前の版と同じく、コード署名（署名者 wi-t.com Inc.、Microsoft の時刻局のタイムスタンプ付き）があります。
- 画面の機能は変わりません。Character や Workspace のデータの形も変わらないので、前の版から上書きでインストールできます。
- 公開済みの v0.1.0-beta.10.1 は、そのまま残しています。

## インストールせず試す

source archiveのrootをローカルHTTPで配信し、`tooling/builder/index.html` を開きます。module画面の `file://` 直開きは非対応です。

## 開発者

repositoryをcloneし、Node 24.19.0で `npm ci`、`npm run desktop:prepare:public`、`npm run tauri:build` の順に実行します。exact toolchainは `docs/releases/0.1.0-beta.11/BUILD_ENVELOPE.json` を参照してください。

## ライセンスとブランド

repository-wideの一括許諾はありません。exact pathごとの分類は `public-path-license-map.json` が正です。

ブランド資産はwi-t.comの三重弧ファミリーに由来し、著作権が及ぶ範囲において `public-path-license-map.json` に示すexact pathをCC-BY-4.0で提供します。商標権およびブランド使用権は別扱いで、付与しません。

OSS supportはdocumentation-first／self-service／best effortで、保証応答時間や契約SLAはありません。
