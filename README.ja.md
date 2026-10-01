# KOKOROSAKU v0.1.0-beta.10.1

English canonical documentation: [README.md](README.md)

KOKOROSAKUは、SAKU Builderの公開sourceと評価用packageです。Builderの出力はCandidateのままで、Canonical Authorityや承認にはなりません。

## インストールして使う

将来の公式GitHub Releaseから `SAKU Builder_0.1.0-beta.10.1_x64-setup.exe` を取得します。インストーラーにはコード署名（署名者 wi-t.com Inc.）があります。署名があっても、評判が積み上がるまでWindows SmartScreenが警告を表示することがあります。実行前にSHA-256 `51e99c7eecd11f9b7134c7c2434142f4a487867a3c693e35fafb98a80feae9ca`（2,287,504 bytes）と一致することを確認してください。installerはgit treeとsource ZIPには含まれません。

## このリリースの変更点

- 中身は v0.1.0-beta.10 と同じです。インストーラーとアプリ本体に、コード署名（署名者 wi-t.com Inc.、Microsoft の時刻局のタイムスタンプ付き）を付けて出し直しました。署名が示すのは、作ったのが wi-t.com Inc. であることと、署名の後にファイルが変わっていないことまでです。
- アプリのビルドの情報の表示が「CODE_SIGNING = AZURE_ARTIFACT_SIGNING」に変わります。
- 公開済みの v0.1.0-beta.10（署名なし）は、そのまま残しています。

## インストールせず試す

source archiveのrootをローカルHTTPで配信し、`tooling/builder/index.html` を開きます。module画面の `file://` 直開きは非対応です。

## 開発者

repositoryをcloneし、Node 24.19.0で `npm ci`、`npm run desktop:prepare:public`、`npm run tauri:build` の順に実行します。exact toolchainは `docs/releases/0.1.0-beta.10.1/BUILD_ENVELOPE.json` を参照してください。

## ライセンスとブランド

repository-wideの一括許諾はありません。exact pathごとの分類は `public-path-license-map.json` が正です。

ブランド資産はwi-t.comの三重弧ファミリーに由来し、著作権が及ぶ範囲において `public-path-license-map.json` に示すexact pathをCC-BY-4.0で提供します。商標権およびブランド使用権は別扱いで、付与しません。

OSS supportはdocumentation-first／self-service／best effortで、保証応答時間や契約SLAはありません。
