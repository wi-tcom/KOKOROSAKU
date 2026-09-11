# Third-Party Notices

SAKU Builder / SAKU Trainer（vNext ツール群）は **サードパーティのランタイム依存を持ちません**。

- npm パッケージ依存なし（`package.json` / `node_modules` を持たない）。
- CDN / 外部スクリプト / 外部フォント / 外部 API の読み込みなし（HTML / `.mjs` は自己完結）。
- ブラウザ標準機能（ES modules, fetch, DOM）と、Node.js 標準モジュール（`node:fs` / `node:path` /
  `node:url`）のみを使用。これらはランタイム（ブラウザ / Node.js）自体のライセンスに従います。

したがって本リポジトリの配布物に **同梱される第三者コード・第三者ライセンスはありません**。

将来、依存を追加した場合は、そのコンポーネント名・バージョン・ライセンス・著作権表示をこのファイルへ
列挙し、UI の About / License 画面からも到達できるようにしてください（`ui.third_party`）。

参照する外部の**ライセンス定義文書**（同梱コードではない）:

- Mozilla Public License 2.0 — https://mozilla.org/MPL/2.0/ （本リポジトリのコードのライセンス）
- Creative Commons Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/ （ドキュメントのライセンス）
