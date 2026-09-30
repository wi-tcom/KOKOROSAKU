# KOKOROSAKU v0.1.0-beta.10

English canonical documentation: [README.md](README.md)

KOKOROSAKUは、SAKU Builderの公開sourceと評価用packageです。Builderの出力はCandidateのままで、Canonical Authorityや承認にはなりません。

## インストールして使う

将来の公式GitHub Releaseから `SAKU Builder_0.1.0-beta.10_x64-setup.exe` を取得します。このβ版は未署名のため、Windows SmartScreenが警告を表示することがあります。実行前にSHA-256 `e763023e4381f4d395983074962df3be0c3b785e0c41b54eee6bf3828974c48c`（2,215,425 bytes）と一致することを確認してください。installerはgit treeとsource ZIPには含まれません。

## このリリースの変更点

- 04 に「キャラクター紹介」の節を加えました。SAKU Character Pack のキャラクターの紹介ページと、ストアのパックの一覧へのボタンがあります（パックは有料。価格は商品ページに記載）。SAKU 診療所・AMU トレーニングセンターと、その申し込みは、引き続き準備中です。
- 英語表示で日本語のまま出ていた文を英語にし、同じものを違う語で呼んでいた所をそろえました。β.9 で外した Trainer の残りの表示もなくしました。
- 日本語の文を直しました（「席 8（論理上の人）」、「人への引き継ぎ」、効果の出典の一覧、保存確認のボタン名、04 の署名の節など）。

## インストールせず試す

source archiveのrootをローカルHTTPで配信し、`tooling/builder/index.html` を開きます。module画面の `file://` 直開きは非対応です。

## 開発者

repositoryをcloneし、Node 24.19.0で `npm ci`、`npm run desktop:prepare:public`、`npm run tauri:build` の順に実行します。exact toolchainは `docs/releases/0.1.0-beta.10/BUILD_ENVELOPE.json` を参照してください。

## ライセンスとブランド

repository-wideの一括許諾はありません。exact pathごとの分類は `public-path-license-map.json` が正です。

ブランド資産はwi-t.comの三重弧ファミリーに由来し、著作権が及ぶ範囲において `public-path-license-map.json` に示すexact pathをCC-BY-4.0で提供します。商標権およびブランド使用権は別扱いで、付与しません。

OSS supportはdocumentation-first／self-service／best effortで、保証応答時間や契約SLAはありません。
