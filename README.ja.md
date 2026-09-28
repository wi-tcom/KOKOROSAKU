# KOKOROSAKU v0.1.0-beta.9

English canonical documentation: [README.md](README.md)

KOKOROSAKUは、SAKU Builderの公開sourceと評価用packageです。Builderの出力はCandidateのままで、Canonical Authorityや承認にはなりません。

## インストールして使う

将来の公式GitHub Releaseから `SAKU Builder_0.1.0-beta.9_x64-setup.exe` を取得します。このβ版は未署名のため、Windows SmartScreenが警告を表示することがあります。実行前にSHA-256 `d6474dd66f04834500a7ffa079e856f6c372e52d7459596f2f15ba1f4bb7b533`（2,208,616 bytes）と一致することを確認してください。installerはgit treeとsource ZIPには含まれません。

## このリリースの変更点

- サンプルを入れ替えました。OSS のサンプル Character 3 体（CC0-1.0）は配布をやめ、サンプル 1.1.0（3 体、`LicenseRef-WIT-Sample-1.0`、OSS ではありません）をインストーラーに同梱しました。「01 キャラクターを選択する」の「サンプルを読み込む」から選べます。
- 04 を「SAKU 診療所・AMU トレーニングセンター」の画面に替えました。どちらも準備中で、いまは登録・申し込みはできません。Trainer・AI スピードテスト・外部レビューの取り込みは画面から外しました（中身は残しており、別のツールにする予定です。時期は未定）。
- 自作の Character を、AMU Studio 用の ZIP で書き出せるようにしました（「AMU 用 ZIP をダウンロード」。署名は付きません）。03 では、AMU Studio が書き出した参考資料を、AI へ渡す文に「参考資料（データ）」の節として添えられます（資料は保存しません）。
- 1+7 の席の名前とマニュアルの説明を採択済み Schema に合わせ、ヘルプの出典名を「指示文に基づく動作」に改めました。
- β.8 の不具合を直しました（インストールせずに試す版でヘルプが見つからない、版の欄の「BUILD UNSTAMPED」、確認の窓の見出しの「tauri.localhost」など）。

## インストールせず試す

source archiveのrootをローカルHTTPで配信し、`tooling/builder/index.html` を開きます。module画面の `file://` 直開きは非対応です。

## 開発者

repositoryをcloneし、Node 24.19.0で `npm ci`、`npm run desktop:prepare:public`、`npm run tauri:build` の順に実行します。exact toolchainは `docs/releases/0.1.0-beta.9/BUILD_ENVELOPE.json` を参照してください。

## ライセンスとブランド

repository-wideの一括許諾はありません。exact pathごとの分類は `public-path-license-map.json` が正です。

ブランド資産はwi-t.comの三重弧ファミリーに由来し、著作権が及ぶ範囲において `public-path-license-map.json` に示すexact pathをCC-BY-4.0で提供します。商標権およびブランド使用権は別扱いで、付与しません。

OSS supportはdocumentation-first／self-service／best effortで、保証応答時間や契約SLAはありません。
