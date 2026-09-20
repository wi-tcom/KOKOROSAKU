# KOKOROSAKU v0.1.0-beta.2

English canonical documentation: [README.md](README.md)

KOKOROSAKUは、SAKU Builder／Trainerの公開sourceと評価用packageです。BuilderとTrainerの出力はCandidateのままで、Canonical Authorityや承認にはなりません。

## インストールして使う

将来の公式GitHub Releaseから `SAKU Builder_0.1.0-beta.2_x64-setup.exe` を取得します。このβ版は未署名のため、Windows SmartScreenが警告を表示することがあります。実行前にSHA-256 `7d357f41a59d923f940acc2fd7f7d65a3aee5ee0840f06a8e8def9fd83fcb572`（1,875,865 bytes）と一致することを確認してください。installerはgit treeとsource ZIPには含まれません。

## インストールせず試す

source archiveのrootをローカルHTTPで配信し、`tooling/builder/index.html` を開きます。module画面の `file://` 直開きは非対応です。

## 開発者

repositoryをcloneし、Node 24.19.0で `npm ci`、`npm run desktop:prepare:public`、`npm run tauri:build` の順に実行します。exact toolchainは `docs/releases/0.1.0-beta.2/BUILD_ENVELOPE.json` を参照してください。

## ライセンスとブランド

repository-wideの一括許諾はありません。exact pathごとの分類は `public-path-license-map.json` が正です。

ブランド資産はwi-t.comの三重弧ファミリーに由来し、著作権が及ぶ範囲において `public-path-license-map.json` に示すexact pathをCC-BY-4.0で提供します。商標権およびブランド使用権は別扱いで、付与しません。

OSS supportはdocumentation-first／self-service／best effortで、保証応答時間や契約SLAはありません。
