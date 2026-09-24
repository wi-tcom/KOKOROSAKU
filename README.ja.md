# KOKOROSAKU v0.1.0-beta.8

English canonical documentation: [README.md](README.md)

KOKOROSAKUは、SAKU Builder／Trainerの公開sourceと評価用packageです。BuilderとTrainerの出力はCandidateのままで、Canonical Authorityや承認にはなりません。

## インストールして使う

将来の公式GitHub Releaseから `SAKU Builder_0.1.0-beta.8_x64-setup.exe` を取得します。このβ版は未署名のため、Windows SmartScreenが警告を表示することがあります。実行前にSHA-256 `db0f544dcab30d7dd4517bc0a77f6e98ec12579a65dad2932d0ce8def8a314c9`（2,169,969 bytes）と一致することを確認してください。installerはgit treeとsource ZIPには含まれません。

## このリリースの変更点

- 入力とヘルプを作り直しました。値が決まっている項目は一覧から選ぶ形になり、適合の参照（保持・逸脱・継続性）は行のチェックから自動で作られます。ヘルプは右側が「章 › 項目 › 選択肢」のツリーになり、選択肢ごとに**意味・効果・出典**が出ます（効果は傾向の説明であって断定ではありません）。マニュアルは同じ元データから作り直し、対応バージョンを表示します。
- 外部 AI へ渡す文を 3 層に組み直しました。すべての Character に共通の指示文（`saku.base-directives@1` v1.0、sha256 `ab4745a3…`）を先頭に置き、起動時と文を作る前に digest を照合します。合わないときは文を 1 つも作りません。読み込めたかを AI に申告してもらう照合も付きました（既定はオフ。申告であって検証ではありません）。
- AI スピードテストは、回答の最初と最後に AI が書いた開始時刻・終了時刻の差を計測値にします（手計測は参考として別に記録）。回答を貼り付けた時点で記録し、保存した記録と比べられます。
- キャラクター一覧・取り込み履歴・選択中のキャラクターを Workspace ごとに持つようにしました。アプリのデータを消しても、同じ Workspace を開けば戻ります。同じ Workspace を 2 つ目のウィンドウで開いたときは読み取り専用になります。
- 取り込みと保存を採択済み Schema で判定し、合わないものは理由を示して止めます。AMU Studio から戻ったファイル（`.saku-return.zip`）を編集の入口として読めます。サンプル Character 3 体（CC0-1.0）はインストーラーに同梱しています。

## インストールせず試す

source archiveのrootをローカルHTTPで配信し、`tooling/builder/index.html` を開きます。module画面の `file://` 直開きは非対応です。

## 開発者

repositoryをcloneし、Node 24.19.0で `npm ci`、`npm run desktop:prepare:public`、`npm run tauri:build` の順に実行します。exact toolchainは `docs/releases/0.1.0-beta.8/BUILD_ENVELOPE.json` を参照してください。

## ライセンスとブランド

repository-wideの一括許諾はありません。exact pathごとの分類は `public-path-license-map.json` が正です。

ブランド資産はwi-t.comの三重弧ファミリーに由来し、著作権が及ぶ範囲において `public-path-license-map.json` に示すexact pathをCC-BY-4.0で提供します。商標権およびブランド使用権は別扱いで、付与しません。

OSS supportはdocumentation-first／self-service／best effortで、保証応答時間や契約SLAはありません。
