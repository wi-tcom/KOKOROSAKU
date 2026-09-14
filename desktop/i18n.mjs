const STORAGE_KEY = "saku.ui.locale";
const DEFAULT_LOCALE = "ja-JP";

// Static Desktop shell/help resources. Runtime paths and imported Character data are excluded.
const EN = new Map(Object.entries({
  "日本語":"Japanese","言語 / Language":"Language","はじめに":"Getting Started","ヘルプ":"Help","共通メニュー":"Global navigation",
  "今日は何をしますか？":"What would you like to do?","見る・試す・確認する・作る、の順に利用者の目的から選べます。":"Choose by your goal: view, test, review, or create.",
  "主な操作":"Primary actions","現在のSAKU":"Current SAKU","編集中 · 未保存の変更あり":"Editing · unsaved changes","保存済み":"Saved","最初から":"Start over","未保存の変更があります。最初からやり直しますか？":"There are unsaved changes. Start over anyway?","補助メニュー":"Support menu",
  "このキャラクターを選択する":"Choose this Character","新規追加":"Newly added",
  "AI動作の調整":"AI behaviour tuning","調整の詳細":"Tuning detail","気になる症状":"What you have noticed",
  "AI動作を調整する":"Adjust AI behaviour","← 戻る":"← Back",
  "気になる症状から選びます。ここでの推奨は、適用するまでCharacterを変更しません。":"Start from what you have noticed. Nothing here changes the Character until you apply it.",
  "AI動作の20項目の現在の状態":"Current state of the 20 AI-behaviour items",
  "AI動作の調整（20項目）":"AI behaviour tuning (20 items)",
  "この症状について詳しく":"More about this symptom",
  "キャラクターを選び「AI動作を調整する」から、気になる症状ごとに、現在の状態・推奨変更・期待効果・副作用・適する職種を確認できます。推奨は適用するまで Character を変更しません。":"Choose a Character, then Adjust AI behaviour. For each symptom you can see the current state, the recommended change, its effect, its side effects and which roles it suits. Nothing changes the Character until you apply it.",
  "選択されたキャラクター":"Selected Character","未選択":"Not selected","選択を解除":"Clear selection",
  "キャラクターを選択する":"Choose a Character","Packageを読み込んでキャラクターを選択します。":"Import a Package, then choose a Character.",
  "読み込み・新規作成を行い、一覧から作業するキャラクターを選びます。":"Import or create, then choose the Character to work on from the list.",
  "キャラクターを読み込む / 新規作成する":"Import or create a Character","Packageインポート":"Import Package","個別インポート":"Import file",
  "選択キャラクター削除":"Delete selected","一覧をクリア":"Clear list","新規作成":"Create new",
  "削除済み":"Deleted","表示しない":"Hide","含めて表示":"Include","削除済みのみ":"Deleted only","選択":"Select",
  "キャラクターを作る・編集する":"Create / edit Character","トレーニングする":"Train","削除する":"Delete","削除を取り消す":"Undo delete","閉じる":"Close",
  "キャラクターを見る":"View Characters","読み込まれたCharacterをread-onlyで確認します。":"View imported Characters in read-only mode.",
  "AIで試す":"Test with AI","TrainerでCharacterの傾向を観察します。":"Observe Character tendencies in Trainer.",
  "結果を確認する":"Review Results","Expected・Observed・Diff・SuggestionをEvidenceと一緒に確認します。":"Review Expected, Observed, Diff, and Suggestion together with their evidence.",
  "キャラクターを作る・編集する":"Create / Edit Character","Builderで作成、編集、validationを行います。":"Create, edit, and validate in Builder.",
  "準備とデータ":"Setup and data","Package / 新規作成":"Package / create new",
  "既存の検証経路でPackageを読み込みます。検証失敗は利用可能へ昇格しません。":"Import Packages through the existing validation path. Failed validation never becomes available.",
  "Packageを読み込む":"Import package","Characterを作る":"Create Character","ヘルプを見る":"View Help",
  "次にできること":"Next actions","Workspaceを選び直す":"Choose Workspace again","Packageを選び直す":"Choose Package again","Helpで確認する":"Check Help",
  "初回設定、操作、保存場所、アンインストール時の保持内容を確認できます。":"Review first-run setup, operation, data locations, and what uninstall preserves.",
  "← ホームへ戻る":"← Back to home","ホームへ戻る":"Back to home","キャラクター一覧":"Characters","Character詳細":"Character details",
  "Characterの内容とPackage検証状態を表示します。この画面からCharacter dataは変更しません。":"Shows Character content and Package validation state. This screen does not modify Character data.",
  "読み込まれたCharacterを確認できます。":"View imported Characters.",
  "表示できるCharacterがまだありません。":"There are no Characters to display yet.","Packageを読み込むか、Characterを作成してください。":"Import a Package or create a Character.",
  "Package / import状態":"Package / import status","Packageファイルをドロップして読み込む":"Drop a Package file to import it",
  "最初にWorkspaceを選択または作成してください。":"Select or create a Workspace first.",
  "この画面はbrowser previewです。Workspace選択とnative Package importはSAKUアプリで利用できます。":"This is a browser preview. Workspace selection and native Package import are available in the SAKU app.",
  "結果確認はPhase 1では準備中です。":"Review Results is coming soon in Phase 1.",
  "作成物とimport済みPackageの保存場所です。Install / Config / Logs / Cacheとは分離します。":"Stores authored work and imported Packages separately from Install / Config / Logs / Cache.",
  "Uninstallはアプリを対象とし、Workspaceとprojectsは保持します。同期フォルダや別checkoutをruntime inputとして使いません。":"Uninstall removes the app while preserving the Workspace and projects. Synchronized folders and other checkouts are not runtime inputs.",
  "Workspace、設定、ログ、cache":"Workspace, configuration, logs, and cache",
  "Characterを探す":"Find Characters","検索":"Search","名前・役割・カテゴリで検索":"Search by name, role, or category",
  "利用可能状態":"Availability","すべて":"All","利用可能":"Available","利用不可":"Unavailable","ロック中":"Locked","不明 / 未検証":"Unknown / unverified",
  "Package状態":"Package state","カテゴリ":"Category","並び順":"Sort","名前":"Name","役割":"Role",
  "Catalog表示":"Catalog view","0件を表示":"0 results","比較対象 0件":"0 selected for comparison",
  "選択したCharacterを比較":"Compare selected Characters","選択を解除":"Clear selection",
  "検索・絞り込み条件に一致するCharacterがありません。":"No Characters match the current search and filters.",
  "検索語または絞り込みを解除するとCatalogを再表示できます。":"Clear the search or filters to see the catalog again.",
  "検索と絞り込みを解除":"Clear search and filters","Character比較":"Character comparison","比較を閉じる":"Close comparison",
  "欠損値は推測せず、SAME / DIFFERENT / UNKNOWN / NOT_AVAILABLEを表示します。":"Missing values are not inferred; comparison shows SAME / DIFFERENT / UNKNOWN / NOT_AVAILABLE.",
  "Character could not be opened. Return to the Catalog and select it again.":"Character could not be opened. Return to the Catalog and select it again.",
  "マニュアル":"Manual","SAKU Builder フィールドガイドを開く":"Open the SAKU Builder Field Guide","Unified V1の5章と全編集項目":"Five Unified V1 chapters and every editable field",
  "最初の3ステップ":"The first three steps",
  "workspaceを選び、サンプル・package・新規作成のいずれかから、BuilderまたはTrainerを開きます。":"Choose a workspace, then open Builder or Trainer from a sample, package, or new Character.",
  "アプリの状態を確認しています。":"Checking the app status.",
  "初回設定":"First-run setup","workspace":"Workspace","未選択":"Not selected","選択または作成":"Select or create",
  "作成物とimport済みpackageを保存する場所です。アプリのinstall/config/log/cacheとは分離します。":"Stores authored work and imported packages, separate from app installation, configuration, logs, and cache.",
  "開始方法":"Start from","組み込みSample3、検証済みWIT package、または空のCharacterから開始します。":"Start with bundled Sample3, a validated WIT package, or an empty Character.",
  "Sample3を開く":"Open Sample3","Packageをimport":"Import package","新規作成":"Create new",
  "`.zip` / `.witpkg` / `.json` をここへドロップ":"Drop `.zip`, `.witpkg`, or `.json` here",
  "Builder / Trainer":"Builder / Trainer","Builderはauthoring、Trainerは観察Candidateです。CanonicalやAuthorityを変更しません。":"Builder authors content; Trainer produces observation Candidates. Neither changes Canonical data or Authority.",
  "Builderを開く":"Open Builder","Unified V1プロファイル":"Unified V1 profile","Trainerを開く":"Open Trainer",
  "保存場所":"Data locations","確認中":"Checking","Uninstallはアプリを対象とし、workspaceとprojectsは保持します。同期フォルダや別checkoutをruntime inputとして使いません。":"Uninstall removes the app while preserving workspaces and projects. Synchronized folders and other checkouts are not runtime inputs.",
  "初回設定と最短フロー":"First-run setup and shortest path","互換性・hash・失敗時の対応":"Compatibility, hashes, and failure handling",
  "workspace、設定、ログ、cache":"Workspace, configuration, logs, and cache","保持されるデータ":"Data that is preserved",
  "SAKU Builder ヘルプ":"SAKU Builder Help","ヘルプ項目":"Help topics",
  "Host、workspace、Packageの読み込み、Builder／Trainer、アンインストールの境界を確認できます。":"Review host, workspace, package import, Builder/Trainer, and uninstall boundaries.",
  "Packageの読み込み":"Package import","データの保存場所":"Data locations","アンインストール／再インストール":"Uninstall / reinstall",
  "workspaceから始める":"Start with a workspace","インストール先とは別のworkspaceを選び、Sample3・Package・新規Characterのいずれかを開きます。":"Choose a workspace separate from the installation directory, then open Sample3, a package, or a new Character.",
  "1. workspace":"1. Workspace","2. 開始方法":"2. Start from","3. Builder / Trainer":"3. Builder / Trainer","4. Download／保存／再度開く":"4. Download / save / reopen","用語":"Glossary","言語":"Language","困ったとき":"Troubleshooting",
  "最初にworkspaceを選択または作成してください。":"Select or create a workspace first.",
  "この画面はbrowser previewです。workspace選択とnative package importはdesktop appで利用できます。":"This is a browser preview. Workspace selection and native package import are available in the Desktop app.",
  "端末に互換WebView2がない場合、Installerはインターネット接続を使ってMicrosoft bootstrapperを取得します。取得または導入に失敗した場合は、WebView2 stageとerrorを表示してインストールを中止します。利用者のshell操作は不要です。":"If a compatible WebView2 is absent, the installer uses an internet connection to obtain the Microsoft bootstrapper. If download or installation fails, it shows the WebView2 stage and error and stops. No user shell operation is required.",
  "取得または導入に失敗した場合は、WebView2 stageとerrorを表示してインストールを中止します。利用者のshell操作は不要です。":"If download or installation fails, the installer shows the WebView2 stage and error and stops. No user shell operation is required."
}));

const LONG_EN = new Map(Object.entries({
  "ダウンロードしたWIT Package ZIPは展開せず、そのままUIで選択するかホームへドロップします。ZIP直下の":"Keep the downloaded WIT Package ZIP intact and select it in the UI or drop it onto the home screen. Only ",
  "と":" and ",
  "だけを受け付け、manifest必須項目、minimum app version、content type、lowercase SHA-256を決定論的に検証します。手動展開、インストール先へのコピー、shell操作は不要です。":" at the ZIP root are accepted. Required manifest fields, minimum app version, content type, and lowercase SHA-256 are checked deterministically. Manual extraction, copying into the install directory, and shell operations are not required.",
  "は構造・hash不一致、":" means an invalid structure or hash; ","は未対応version/type、":" means an unsupported version or type; ",
  "はworkspace未選択を示します。理由をGUIに表示し、generic ERRORへまとめません。":" means no workspace is selected. The GUI shows the reason without collapsing distinct states into a generic error.",
  "ダウンロード先、Install、Config、Logs、Cache、Workspaceは別の場所です。workspaceは初回に利用者が選びます。Sampleはapp resourceとしてread-only、検証済みPackageのimport結果はworkspaceへ保存します。Builderの編集中内容はbrowser downloadでworkspaceへ自動保存されません。DownloadはOSへの保存要求を開始するだけなので、保存先と完了を利用者が確認してください。":"Downloads, installation, configuration, logs, cache, and workspace use separate locations. The user chooses the workspace on first run. Samples are read-only app resources, and validated Package imports are stored in the workspace. Content being edited in Builder is not automatically saved to the workspace by a browser download. Download only starts an OS save request; the user must verify the destination and completion.",
  "既存HTMLと共有ES moduleをTauri assetとして利用します。localhost、shell、手動PATH設定、cloud backendは使いません。":"Existing HTML and shared ES modules are used as Tauri assets. No localhost server, shell, manual PATH configuration, or cloud backend is used.",
  "キャラクターパッケージを読み込んでキャラクターを選択します。":"Import a Character package, or pick a Character you already have.",
  "キャラクターを作成・編集します。":"Create or edit a Character.",
  "AIプラットホームでキャラクターを動作":"Run the Character on an AI platform",
  "選択中のキャラクターを外部のAIに読み込ませて動かします。":"Load the selected Character into the AI you use, and run it there.",
  "キャラクターをトレーニングする":"Train the Character",
  "AIプロンプトの応答でキャラクターを調整します。":"Adjust the Character using the AI's responses.",
  "上の「キャラクターを読み込む / 新規作成する」から追加してください。":"Add one from “Import / create a Character” above.",
  "調整するキャラクターを選んでください。":"Choose the Character to adjust.",
  "選択中のキャラクターを、お使いのAIにそのまま読み込ませて動かします。ここでキャラクターは変わりません。":"Load the selected Character into the AI you use and run it there. Nothing here changes the Character.",
  "動かすキャラクターを選んでください。":"Choose the Character to run.",
  "1. 動かすキャラクターを確認する":"1. Confirm which Character you are running",
  "2. 渡し方を選ぶ":"2. Choose how to hand it over",
  "貼り付けやすい形を選びます。どれを選んでもキャラクターの中身は同じです。":"Pick whichever form pastes most easily. The Character is the same in all of them.",
  "渡し方":"Handover form",
  "貼り付ける文":"Text to paste",
  "— キャラクターの編集やトレーニングを選択してください。":" — choose whether to edit or train this Character.",
  "— 貼り付けてもCharacterは変更されません。":" — pasting it does not change the Character.",
  "「01 キャラクターを選択する」からキャラクターを選択してください。":"Choose a Character from “01 Choose a Character”.",
  "「01 キャラクターを選択する」からキャラクターを選んでください。":"Choose a Character from “01 Choose a Character”.",
  "向いている仕事":"Suitable work",
  "キャラクタープロンプト":"Character prompt",
  "3. 貼り付ける文をコピーする":"3. Copy the text to paste",
  "下の全文をコピーします。冒頭の指示と、キャラクター定義が入っています。":"Copy the whole box below. It contains the opening instruction and the Character definition.",
  "コピーする":"Copy",
  "4. AIの入力欄に貼る":"4. Paste it into the AI",
  "ChatGPT・Claude・Gemini など、お使いのAIの新しい会話を開き、最初のメッセージとして貼り付けます。ローカルLLMでも同じ手順です。連携設定やAPIの用意は要りません。":"Open a new conversation in the AI you use — ChatGPT, Claude, Gemini and others — and paste it as the first message. A local LLM works the same way. No integration or API setup is needed.",
  "5. 読み込ませる":"5. Let it load",
  "貼り付けた文には「この定義に従うこと」「足りない情報を勝手に作らないこと」が含まれています。そのまま送信してください。":"The pasted text already says to follow the definition and not to invent missing information. Send it as it is.",
  "6. 最初のあいさつを受け取る":"6. Receive the first greeting",
  "キャラクターとして短いあいさつが返れば、読み込めています。返らない場合は、貼り付けが途中で切れていないか確認してください。":"A short in-character greeting means it loaded. If none comes back, check whether the paste was cut short.",
  "7. そのまま話しかける":"7. Just talk to it",
  "あとは普通に質問や相談を続けます。会話の途中で人格がぶれたと感じたら、同じ文をもう一度貼り直せば読み直します。":"Carry on asking and discussing as usual. If the Character drifts mid-conversation, paste the same text again to reload it.",
  "8. 気になった応答をSAKU Trainerへ持ち帰る":"8. Bring responses that bothered you back to SAKU Trainer",
  "「思っていた反応と違う」と感じた応答をコピーしておき、04 キャラクターをトレーニングする に貼り付けます。Expected・Observed・Diff を見て、キャラクターを直すかどうかを決められます。":"Copy any response that was not what you expected and paste it into 04 Train the Character. Expected, Observed and Diff then let you decide whether to change the Character.",
  "04 キャラクターをトレーニングする へ":"Go to 04 Train the Character",
  "この方法でできないこと":"What this way does not give you",
  "一般のAIサービスに貼り付けて動かす方法です。次のことは保証されません。":"This runs the Character by pasting it into a general AI service. None of the following is guaranteed.",
  "独立したプロセスとして動き続けること":"That it keeps running as a process of its own",
  "会話をまたいで記憶が残ること":"That memory survives between conversations",
  "ツールや外部システムを操作できること":"That it can operate tools or outside systems",
  "人間の担当者（席8）が実際に紐づくこと":"That a real person is bound to Seat 8",
  "AMUの動作状態が引き継がれること":"That AMU runtime state carries over",
  "ここで扱うのはキャラクター定義そのものです。貼り付けても、SAKU側のキャラクターは変更されません。":"What is handled here is the Character definition itself. Pasting it does not change the Character in SAKU.",
  "通常のアンインストールはapplication filesのみを削除します。workspaceとprojectsは削除しません。再インストール後に同じworkspaceを再選択できます。":"An ordinary uninstall removes application files only. Workspaces and projects are not deleted, and the same workspace can be selected after reinstalling.",
  "アンインストーラーの「アプリケーションデータを削除する」をチェックすると破壊的です。キャラクター一覧（Character Library）・選択中のキャラクター・履歴・設定が保存されている %LOCALAPPDATA%\\com.wi-t.saku-builder と %APPDATA%\\com.wi-t.saku-builder を削除します。cacheと設定だけが消えるのではありません。":"Ticking “Delete application data” in the uninstaller is destructive. It deletes %LOCALAPPDATA%\\com.wi-t.saku-builder and %APPDATA%\\com.wi-t.saku-builder, which hold the Character Library list, the selected Character, history and settings. It is not limited to cache and settings.",
  "workspaceは別の場所です。取り込んだPackageは <workspace>\\imports\\ に、作成・編集したCharacterは <workspace>\\characters\\ に保存されており、どちらのアンインストール経路でも削除しません。一覧が空の状態で「キャラクターを選択する」を開くとworkspaceから復元し、復元件数を表示します。":"The workspace is a separate location. Imported packages are kept in <workspace>\\imports\\ and Characters you create or edit are kept in <workspace>\\characters\\; neither uninstall path deletes them. Opening “Choose a Character” with an empty list restores them from the workspace and reports how many were recovered.",
  "ホームで「選択または作成」を押します。workspaceはimport済みPackage・作成したCharacter・projectsの保存場所で、Install、Config、Logs、Cacheとは別です。アプリをアンインストールしてもworkspaceは保持されます。キャラクター一覧そのものはLocalAppData側にあり、アンインストーラーで「アプリケーションデータを削除する」をチェックすると消えますが、workspaceから復元できます。":"Press “Choose or create” on the home screen. The workspace stores imported packages, the Characters you create, and projects, separately from Install, Config, Logs and Cache. It is preserved when the app is uninstalled. The Character Library list itself lives under LocalAppData and is removed if you tick “Delete application data” in the uninstaller, but it can be restored from the workspace.",
  "端末に互換WebView2がない場合、Installerはインターネット接続を使ってMicrosoft bootstrapperを取得します。":"If a compatible WebView2 is absent, the installer uses an internet connection to obtain the Microsoft bootstrapper. ",
  "このCandidateは":"This Candidate is ","です。証明書、root certificate、private key、Norton例外は作成・要求しません。":". It neither creates nor requests certificates, root certificates, private keys, or Norton exceptions.",
  "Desktopホームで「選択または作成」を押します。作成物、読み込み済みpayload、projectsはworkspaceに保存され、アプリをアンインストールしても保持されます。":"On Desktop home, choose “Select or create.” Authored work, imported payloads, and projects are stored in the workspace and preserved when the app is uninstalled.",
  "workspaceを選び、記入例または新規Characterを開き、編集・validation・Candidate downloadまで進めます。":"Choose a workspace, open the example or a new Character, then proceed through editing, validation, and Candidate download.",
  "Desktopホームで「選択または作成」を押します。workspaceはimport済みPackageとprojectsの保存場所で、Install、Config、Logs、Cacheとは別です。アプリをアンインストールしてもworkspaceは保持されます。":"On Desktop home, choose “Select or create.” The workspace stores imported Packages and projects separately from installation, configuration, logs, and cache. Uninstalling the app preserves the workspace.",
  "はread-only sourceからBuilderへ読み込みます。":" loads into Builder from a read-only source. ",
  "はダウンロードしたZIPを展開せずに選択またはdrag & dropし、compatibilityとpayload SHA-256を検証してからworkspaceへ保存します。":" selects or drag-drops the downloaded ZIP without extraction, validates compatibility and payload SHA-256, then saves it to the workspace. ",
  "は空のCandidateから始めます。":" starts from an empty Candidate.",
  "Builderは編集・preview・validation・Candidate exportを担当します。Trainerは観察結果をCandidateとして返します。どちらもCanonical、Authority、Approvalを発行しません。":"Builder handles editing, preview, validation, and Candidate export. Trainer returns observations as Candidates. Neither issues Canonical data, Authority, or Approval.",
  "Builderの「ダウンロード」は表示中のCandidate fileについてOSへのdownload要求を開始します。workspaceへ自動保存したという意味ではありません。保存された":"Builder’s Download starts an OS download request for the displayed Candidate file. It does not mean the file was automatically saved to the workspace. A saved ",
  "は、次回「character.yaml を読み込む」から開き、続けて編集できます。download開始は保存完了・Canonical Adoption・Approvalを意味しません。":" can be reopened with “Import character.yaml” and edited further. Starting a download does not mean save completion, Canonical Adoption, or Approval.",
  "は編集・確認中の提案です。":" is a proposal under editing and review. ","は別Authorityが採択した正本です。":" is the authoritative version adopted by a separate Authority. ","は採択・承認を行う権限で、Builderは発行しません。":" is the power to adopt or approve; Builder does not issue it. ","は表人格1と助手席7の設計構成です。":" is the design composition of one public persona plus seven assistant seats. ","は利用者が選ぶPackage／project用の保存場所です。":" is the user-selected storage location for Packages and projects.",
  "日本語／EnglishはSAKU製品UIだけを切り替えます。Character名、入力文、import内容、生成データは翻訳しません。Windowsのfile pickerやdate controlはOSの表示言語になる場合があります。":"Japanese / English switches only SAKU product UI. Character names, user-entered text, imported content, and generated data are not translated. Windows file pickers and date controls may follow the OS display language.",
  "ホームのstatus codeとreasonを確認し、ヘルプのPackageの読み込みまたはデータの保存場所を参照してください。秘密情報やprivate conversationをsupport情報へ貼り付けないでください。":"Check the status code and reason on the home screen, then consult Package import or Data locations in Help. Do not include secrets or private conversations in support information."
}));

const sources = new WeakMap();
const attributeSources = new WeakMap();
let applying = false;
let locale = DEFAULT_LOCALE;
const normalize = value => value === "en-US" ? "en-US" : DEFAULT_LOCALE;
const translate = source => locale === "en-US" ? (EN.get(source) || LONG_EN.get(source) || source) : source;
const excluded = element => !element || Boolean(element.closest("code,pre,dd[id],input,textarea,[data-runtime-value]"));

function applyTree(root = document.body) {
  if (applying) return;
  applying = true;
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (excluded(node.parentElement)) continue;
      if (!sources.has(node)) sources.set(node, node.nodeValue);
      const original = sources.get(node);
      const trimmed = original.trim();
      if (trimmed) node.nodeValue = original.replace(trimmed, translate(trimmed));
    }
    const elements = root.nodeType === 1 ? [root, ...root.querySelectorAll("[aria-label],[title]")] : [];
    for (const element of elements) {
      if (!attributeSources.has(element)) attributeSources.set(element, {});
      const original = attributeSources.get(element);
      for (const attribute of ["aria-label", "title"]) {
        if (!element.hasAttribute(attribute)) continue;
        if (!Object.hasOwn(original, attribute)) original[attribute] = element.getAttribute(attribute);
        element.setAttribute(attribute, translate(original[attribute]));
      }
    }
    document.documentElement.lang = locale === "en-US" ? "en" : "ja";
    const titles = {
      "SAKU Builder — ホーム": "SAKU Builder — Home",
      "SAKU Builder ヘルプ": "SAKU Builder Help",
      "はじめに — SAKU Builder": "Getting Started — SAKU Builder"
    };
    if (!document.documentElement.dataset.sourceTitle) document.documentElement.dataset.sourceTitle = document.title;
    document.title = locale === "en-US" ? (titles[document.documentElement.dataset.sourceTitle] || document.documentElement.dataset.sourceTitle) : document.documentElement.dataset.sourceTitle;
    document.querySelectorAll("[data-desktop-locale]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.desktopLocale === locale)));
  } finally { applying = false; }
}

function setLocale(next) {
  locale = normalize(next);
  localStorage.setItem(STORAGE_KEY, locale);
  applyTree();
  window.dispatchEvent(new CustomEvent("saku-ui-locale-changed", { detail: { locale } }));
}

document.querySelectorAll("[data-desktop-locale]").forEach(button => button.addEventListener("click", event => setLocale(event.currentTarget.dataset.desktopLocale)));
locale = normalize(new URLSearchParams(location.search).get("ui_locale") || localStorage.getItem(STORAGE_KEY));
new MutationObserver(records => {
  if (applying) return;
  for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1 || node.nodeType === 3) applyTree(node.nodeType === 1 ? node : node.parentElement);
}).observe(document.body, { subtree: true, childList: true, characterData: true });
applyTree();
window.SAKU_DESKTOP_I18N = { setLocale, getLocale: () => locale };
