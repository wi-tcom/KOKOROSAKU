import { consumeHandoff } from "./handoff-binding.mjs";

const STORAGE_KEY = "saku.ui.locale";
const DEFAULT_LOCALE = "ja-JP";
function storeImportedCharacter(payload) {
  const character = JSON.parse(payload);
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) { hash ^= payload.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  localStorage.setItem("saku.desktop.pendingCharacter", payload);
  localStorage.setItem("saku.desktop.pendingCharacterBinding", JSON.stringify({
    character_id: character?.identity?.character_id || "",
    character_revision: String(character?.identity?.character_revision ?? "UNKNOWN"),
    content_digest: (hash >>> 0).toString(16).padStart(8, "0"),
  }));
}
const HERO_SUBTITLE_JA = '心が咲く — 表人格・1+7構造・境界・黒子接続・試験までを一枚で設計し、<code>character.yaml</code>／Character File JSON／外部AIプロンプト／Guild概要を出力する';
const HERO_SUBTITLE_EN = 'Design the public persona, 1+7 structure, boundaries, Human-backstage prerequisites, and tests on one screen; export <code>character.yaml</code>, Character File JSON, an external-AI prompt, and a Guild summary.';

// The Golden Japanese strings are stable resource keys. Character/user data is never passed here.
const EN = new Map(Object.entries({
  "SAKU BUILDER — KOKOROSAKU 1+7 CHARACTER SYSTEM":"SAKU BUILDER — KOKOROSAKU 1+7 CHARACTER SYSTEM",
  "無名":"Untitled","一人に見える。然あらず。":"Appears as one. Is not.",
  "ヘルプ":"Help",
  "未選択":"Not chosen",
  "書斎の灯り — 静かに考える場":"Study lamp — a quiet place to think",
  "時計の歯車 — 噛み合いを確かめる":"Clock gears — checking how things mesh",
  "夜の海 — 深く沈んで考える":"Midnight sea — thinking from the depths",
  "静かな庭師 — 手をかけて育てる":"Quiet gardener — tending and growing",
  "考えの打ち合い":"Thought sparring",
  "事実の分解":"Data decomposition",
  "気持ちの調律":"Mental tuning",
  "作業の同行":"Task companion",
  "事実を中心に置く":"Fact centred",
  "感情を解きほぐす":"Emotional resolution",
  "構造で筋を通す":"Structural logic",
  "抽象へ引き上げる":"Philosophical abstraction",
  "内面へ降りる問い":"Psychoanalytic questioning",
  "事実を崩して確かめる問い":"Fact deconstruction",
  "矛盾を突く問い":"Paradox",
  "視点を変える問い":"Perspective shift",
  "硬めの学術語":"Academic and hard",
  "包み込む温かさ":"Warm and embracing",
  "鋭く最小限":"Sharp and minimal",
  "詩的なたとえ":"Poetic and metaphoric",
  "黙って受けとめる":"Silent acceptance",
  "事実として確認する":"Fact confirmation",
  "関心を返す":"Curiosity",
  "言い換えて返す":"Mirroring",
  "深い呼吸のような間":"Deep breath",
  "一定の拍":"Metronome",
  "寄せては返す波":"Wave",
  "焚き火のゆらぎ":"Campfire",
  "砂のさらり":"Hourglass sand",
  "和紙のざらり":"Washi paper",
  "冷たいガラス":"Cold glass",
  "重い木":"Heavy wood",
  "藍鉄紺":"Indigo iron navy",
  "琥珀・柿渋":"Amber and kakishibu",
  "常盤・海松茶":"Evergreen and miru-cha",
  "鈍色の銀灰":"Dull silver grey",
  "輪郭をぼかす":"Blurred outline",
  "陰影を弱める":"Reduced contrast",
  "文字を淡くする":"Faded font",
  "墨をにじませる":"Ink bleed",
  "職人風に詫びる":"Artisan",
  "学徒風に正す":"Scholar",
  "哲学者風に問い直す":"Philosopher",
  "成長と葛藤として残す":"Growth and conflict",
  "事実と真実として残す":"Facts and truth",
  "変わらない芯として残す":"Invariant essence",
  "静かに消える":"Fade out",
  "本を閉じる":"Book close",
  "砂が落ちきる":"Hourglass",
  "灯を消す":"Candle",
  "1500ミリ秒（短め）":"1500 ms (shorter)",
  "2000ミリ秒（標準）":"2000 ms (standard)",
  "2500ミリ秒（長め）":"2500 ms (longer)",
  "40%（詰まった見た目）":"40% (dense)",
  "50%（標準）":"50% (standard)",
  "60%（ゆったり）":"60% (generous)",
  "人間と引き渡し":"Human and handoff",
  "席8は人間です。AIが埋めることはできません。ここでは「いつ人間へ渡すか」「人間に何を期待するか」「渡すときに何を添えるか」をまとめて決めます。実在の担当者・連絡先・権限はここでは扱いません（AMU側）。":"Seat 8 is a person; an AI cannot fill it. Here you decide together when to hand over, what the person is expected to contribute, and what must travel with the handoff. Real names, contacts and permissions are not handled here — those belong to AMU.",
  "人間が判断するために、何を問いとして渡すか。":"What question the person is being asked to decide.",
  "判断の根拠として、何を添えて渡すか。":"What evidence travels with the handoff.",
  "AIがしてはいけないこと（逸脱として見る項目）":"What the AI must not do (checked for drift)",
  "ここに挙げた約束から外れていないかを、あとで確認します。":"These commitments are what a later check looks at for drift.",
  "助手（1+7 Character System）":"Assistants (1+7 Character System)",
  "キャラクターを作る・編集する":"Create / Edit Character",
  "読み込みは「01 キャラクターを選択する」で行います。ここでは内容を書きます。":"Importing happens in “01 Choose a Character”. This screen is for writing the content.",
  "キャラクターを選択":"Choose a Character",
  "記入例から新規作成":"Start from the example",
  "入力内容のクリア":"Clear what you have entered",
  "ペルソナ試験は「04 キャラクターをトレーニングする」で行います。":"Persona testing happens in “04 Train the Character”.",
  "組織への配置や運用設定はSAKUのキャラクター定義ではありません。AMU / MACHI 側で扱います。":"Placement in an organisation and operational settings are not part of a SAKU Character definition. They belong to AMU / MACHI.",
  "現在の入力内容を上書きしてもよいですか？":"Overwrite what you have entered?",
  "入力内容を消してもよいですか？":"Clear what you have entered?",
  "働き方（work modes）":"Work modes",
  "このCharacterがどの働き方で使われるか。例：REVIEW／ANALYSIS／PLANNING。":"How this Character is used. Examples: REVIEW / ANALYSIS / PLANNING.",
  "ゆらいでよい範囲":"Allowed variation",
  "同じ人格のまま変わってよいところ。":"What may change while the Character stays itself.",
  "ゆらいではいけない範囲":"Prohibited drift",
  "ここが変わると別人になる、という一線。":"The line beyond which this is a different Character.",
  "十五の軸":"The fifteen axes",
  "佇まいと語り口を十五の軸で決めます。強弱の設定ではなく、どう在るかの指定です。":"Bearing and voice, set on fifteen axes. Not strength settings: a statement of how this Character is.",
  "一 motif（灯り・場のモチーフ）":"1. Motif",
  "二 伴走領域":"2. Companion domain",
  "三 知のベクトル":"3. Intelligence vector",
  "四 問いの角度":"4. Socratic angle",
  "五 語彙のトーン":"5. Vocabulary tone",
  "六 受けとめ方":"6. Acknowledgement",
  "七 間合い（pulse）":"7. Pulse",
  "八 手ざわり":"8. Tactile quality",
  "九 考える間（ミリ秒）":"9. Thinking pause (ms)",
  "十 主調色":"10. Theme colour",
  "十一 余白（％）":"11. Whitespace (%)",
  "十二 風化の見せ方":"12. Weathering presentation",
  "十三 誤りの語り方":"13. Error narrative",
  "十四 結晶のしかた":"14. Crystallization",
  "十五 結び方":"15. Closing",
  "人間に期待する寄与":"Expected human contribution",
  "席8の人間が担うこと。AIでは埋められません。":"What the human in Seat 8 carries. An AI cannot fill it.",
  "引き渡し時に必要な問い":"Questions required at handoff",
  "引き渡し時に必要な材料":"Materials required at handoff",
  "破ってはならない約束":"Hard invariants",
  "状況が変わっても曲げないこと。入力の完全性（求めた入力をAIの代用で埋めない）は常に保持され、一覧に出さなくても必ず含まれます。":"What does not bend when circumstances change. Input Integrity — a required input is never filled by an AI substitute — is always held and is included whether or not it is listed here.",
  "人間へ渡す条件":"Conditions for handing over to a human",
  "この条件に当たったら、AIは結論を出さず人間へ渡します。":"When these are met the AI does not conclude; it hands over to a human.",
  "保持を確認する項目":"Checked for preservation",
  "逸脱を確認する項目":"Checked for drift",
  "継続性を確認する項目":"Checked for continuity",
  "この内容で保存する":"Save this Character",
  "心が咲く — 表人格・1+7構造・境界・黒子接続・試験までを一枚で設計し、character.yaml／Character File JSON／外部AIプロンプト／Guild概要を出力する":"Design the public persona, 1+7 structure, boundaries, Human-backstage prerequisites, and tests on one screen; export character.yaml, Character File JSON, an external-AI prompt, and a Guild summary.",
  "お品書き":"Tools","すべて畳む":"Collapse all","すべて広げる":"Expand all","同期":"Sync",
  "職能CSVを読み込む":"Import role CSV","この項目の詳しい説明":"Detailed help for this field","記入例（星野ルカ）を読み込む":"Load example (Hoshino Luka)",
  "テンプレート…":"Template…","テンプレートを読み込む":"Load template","character.yaml を読み込む":"Import character.yaml",
  "最初から":"Start over","項目は空欄のままでも生成できます":"Blank fields are allowed for a draft.",
  "日本語":"Japanese","言語 / Language":"Language","Package読込":"Import package","Package ZIPを読み込む":"Import Package ZIP","WIT Package ZIPを展開せずに読み込む":"Import a WIT Package ZIP without extracting it","作業場所を選択":"Choose workspace","作業場所":"Workspace","Unified V1":"Unified V1","ホーム":"Home",
  "例：星野ルカ":"Example: Hoshino Luka","例：hoshino-luka":"Example: hoshino-luka","例：キャリア支援":"Example: career support",
  "例：20〜30代の求職者":"Example: job seekers in their 20s and 30s","例：選択肢の整理と自己認識の言語化":"Example: organize options and articulate self-understanding",
  "氏名／役割":"Name / role","例：落ち着いた敬体。断定を避ける":"Example: calm, polite language without overclaiming",
  "例：20代後半の雰囲気":"Example: the presence of someone in their late 20s","例：低めで穏やか、間をとる":"Example: low, calm voice with pauses",
  "例：静かな書斎にいるような佇まい":"Example: the presence of someone in a quiet study",
  "この分野で最も避けたいものは何か。例：金融における最大の敵は「煽り」と「感情的な即断」":"What must be avoided most in this field? Example: in finance, the greatest risks are hype and impulsive emotional decisions.",
  "エラー時にどう詫びるか（例は職人風・学徒風・哲学者風の3署名。§16.13）":"How to apologize for an error (three example signatures: craftsperson, scholar, philosopher; §16.13)",
  "例：その日の問いを静かに閉じる":"Example: quietly close the question for the day","例：本人同意なく個人情報を共有しない":"Example: do not share personal information without consent",
  "例：監督者（区分B）":"Example: supervisor (Class B)","氏名／連絡先":"Name / contact","通常/判断事象の線引き":"Boundary between routine and judgment events",
  "利害関係の明示方針":"Conflict-of-interest disclosure policy","利用・共有・外部送信の条件":"Conditions for use, sharing, and external transmission","越境時の受け渡し先":"Handoff destination when a boundary is reached",
  "取り込みで入る":"Filled by import","アプリの企画・要件定義・試作評価への参加":"Participate in app planning, requirements, and prototype evaluation",
  "アプリを用いた実務の推進":"Carry out practical work using the app","利用ログ・要望の収集と改善提案（変更は判断事象）":"Collect usage feedback and propose improvements (changes are judgment events)",
  "説明・デモまで。価格・契約・支払いは人間承認（§11）":"Explanation and demos only; price, contract, and payment require Human approval (§11)",
  "標準：月次／β期：隔週":"Standard: monthly / beta: biweekly","席5（対話品質）・席6（攻撃的検証）":"Seat 5 (dialogue quality) and Seat 6 (adversarial review)",
  "例：連絡先は提示しない。窓口は運営の公式フォームのみ":"Example: do not provide contact details; use only the operator's official form",
  "例：承認済みドメイン以外へのリンクを出さない":"Example: do not link outside approved domains","participant ID。自分自身は指定不可":"Participant ID; self-reference is prohibited",
  "human participant ID":"Human participant ID","例：functional-hierarchy-v1":"Example: functional-hierarchy-v1","例：キャリア理論・労働市場の実務妥当性":"Example: practical validity of career theory and labor-market knowledge",
  "入力して追加":"Enter an item to add","席（例：席8／緊急停止責任者）":"Seat (example: Seat 8 / emergency-stop responsible person)",
  "担当（例：監督者・当番管理者）":"Assignee (example: supervisor / duty manager)","調達型（例：④運用監視型）":"Procurement type (example: ④ operations monitoring)",
  "契約骨格（例：B 準委任継続）":"Contract structure (example: B ongoing quasi-mandate)","保険要件（例：運営側E&O・サイバー保険）":"Insurance requirement (example: operator E&O / cyber insurance)",
  "資格確認（例：本人確認＋実務経歴）":"Qualification check (example: identity plus work history)","案件／業務":"Case / work","参照ID":"Reference ID",
  "採否の理由（芯・人格との整合）":"Reason for decision (alignment with core and persona)",
  "記憶方針":"Memory policy","禁止語":"Forbidden words","アプリ共創":"App co-creation","事業責任者":"Responsible human","全項目が記入済みです":"All fields are complete","席8の役割":"Seat 8 role","席8へ上げる事象":"Events escalated to Seat 8","緊急停止責任者・当番":"Emergency-stop responsible person / duty",
  "通常処理":"Routine processing","グリーンの例":"Green examples","アンバーの例":"Amber examples","レッドの例":"Red examples","SNS規程":"Social-posting policy","個人情報の扱い":"Personal-information handling","引継ぎ先":"Handoff destination",
  "職能の分類":"Role classification","職能名":"Role name","事業運営":"Business operations","継続的改善":"Continuous improvement","商品販売":"Product sales",
  "越境禁止リスト":"Prohibited-boundary list","人間席の調達型":"Human-seat procurement","振り返り合議":"Retrospective deliberation","試験質問の生成":"Test-question generation",
  "黒子は不要（設定なし）":"Human backstage support is not required (not configured)","Organization Participationは未使用":"Organization Participation is not used",
  "外部AIプロンプト":"External AI prompt","Guild概要":"Guild summary","試験記録":"Test record",
  "一":"1","二":"2","三":"3","四":"4","五":"5","六":"6","七":"7","八":"8","九":"9","十":"10","十一":"11",
  "基本情報":"Basic information","設計の芯":"Persona core","話法と価値観":"Voice and values",
  "SAKU構成（1＋7）":"SAKU composition (1+7)","活動規程":"Activity rules","職能とミッション":"Role and mission",
  "第0層と調達":"Layer 0 and human procurement","境界クイック設定":"Boundary quick settings",
  "黒子／キャラバック接続前提":"Human-backstage / Charback prerequisites","ペルソナ試験":"Persona tests","組織参加":"Organization participation",
  "対外的な素性と、担わない領域を定める。":"Define the public identity and excluded scope.",
  "キャラクター名":"Character name","キャラクター名*":"Character name*","slug（英小文字ハイフン）":"slug (lowercase ASCII and hyphens)","slug（英小文字ハイフン）*":"slug (lowercase ASCII and hyphens)*",
  "フォルダ名になる。半角英小文字・数字・ハイフンのみ。":"Used as the folder name. Lowercase ASCII letters, digits, and hyphens only.",
  "主な活動分野":"Primary field","主な活動分野*":"Primary field*","運用区分":"Operation class","対象利用者":"Target users","提供価値":"Value provided",
  "対応しない領域":"Out of scope","（未設定）":"(Not set)","追加":"Add","運営会社":"Operating company","事業責任者（人間）":"Responsible human",
  "外見・声など（対外の佇まい）":"Public appearance and voice","一人称":"First person","口調":"Address style","年齢表現（雰囲気）":"Age expression",
  "声":"Voice","外見":"Appearance","設計の芯*":"Persona core*","何を大切にし、何を言わないか。":"Define what matters and what must not be said.",
  "価値観":"Values","好む問い方":"Preferred questions","禁止語・避ける表現":"Forbidden words and avoided expressions",
  "不確実性の表し方":"Uncertainty expression","エラー時の謝罪":"Error apology","会話の閉じ方":"Conversation closing style","記憶の保持・風化方針":"Memory retention and fading policy",
  "席2":"Seat 2","席3":"Seat 3","席4":"Seat 4","席5":"Seat 5","席6":"Seat 6","席7":"Seat 7","席8":"Seat 8",
  "分野専門助手":"Domain specialist assistant","事実・出典確認助手":"Fact and source-checking assistant","安全・倫理・プライバシー助手":"Safety, ethics, and privacy assistant",
  "利用者視点助手":"User-perspective assistant","反対意見・攻撃的検証助手":"Counterargument and adversarial-review assistant","人格・ブランド整合助手":"Persona and brand-consistency assistant",
  "人間管理者／専門家":"Human manager / specialist","人間・固定":"Human · fixed","有効":"Enabled","役割":"Role","担当の焦点":"Focus","使用する情報源":"Sources used",
  "人間承認が必要な事象":"Events requiring Human approval","緊急停止責任者／当番":"Emergency-stop responsible person / duty",
  "通常処理と判断事象を分け、リスク別の例を置く。":"Separate routine processing from judgment events and provide examples by risk.",
  "通常処理の範囲":"Routine scope","判断事象":"Judgment events","🟢 グリーン（低リスク・可逆）の例":"🟢 Green (low-risk, reversible) examples",
  "🟡 アンバー（社会・金銭・評判）の例":"🟡 Amber (social, financial, reputational) examples","🔴 レッド（法的・身体的・不可逆）の例":"🔴 Red (legal, physical, irreversible) examples",
  "SNS投稿ルール":"Social-posting rules","広告・スポンサー表示":"Advertising and sponsorship disclosure","個人情報・機密情報":"Personal and confidential information",
  "他キャラクターへの引継ぎ":"Handoff to another Character","大分類":"Major category","横断職能名":"Cross-functional role name","実務内容":"Work details",
  "主要ツール":"Primary tools","アプリの種（利用するアプリ例）":"App seeds (example apps)","資格（日本）":"Qualifications (Japan)","法的・倫理的リスク":"Legal and ethical risks",
  "1. アプリ共創":"1. App co-creation","2. 業務推進":"2. Business operations","3. 継続改善":"3. Continuous improvement","4. 製品営業":"4. Product sales",
  "第0層 適用バージョン":"Layer 0 profile version","全キャラ一括管理。版がばらつくと管理が破綻する。":"Managed consistently for all Characters; mixed versions break control.",
  "10 本格コーチング":"10 Full coaching","11 動機づけ・励まし":"11 Motivation and encouragement","12 ラポール形成・雑談":"12 Rapport and conversation",
  "13 比喩・ストーリーテリング":"13 Metaphor and storytelling","14 進捗管理・リマインド":"14 Progress management and reminders","15 段階的教授":"15 Scaffolded instruction",
  "— 未定 —":"— Undecided —","採用":"Adopt","限定採用":"Limited adoption","不採用":"Do not adopt","禁止（規程・#22）":"Prohibited (policy · #22)",
  "月次振り返り合議：頻度":"Monthly retrospective: frequency","月次振り返り合議：主査":"Monthly retrospective: chair","越境禁止リスト（該当行）":"Prohibited-boundary list",
  "人間席の調達型（席8・緊急停止責任者ほか）":"Human-seat procurement (Seat 8, emergency duty, etc.)","＋ 調達行を追加":"+ Add procurement row",
  "契約・料金の最終判断（締結・承諾・価格の確定）":"Final contract or pricing decision","金銭の支払い・送金・購入・与信":"Payment, transfer, purchase, or credit",
  "医療・健康に関する個別判断（診断・治療・服薬）":"Individual medical or health decision","法的な個別判断・正式通知・紛争対応":"Individual legal decision, formal notice, or dispute response",
  "個人情報の取得・外部送信・第三者提供":"Collecting, transmitting, or sharing personal information","連絡先の提示・外部サイトへの誘導":"Providing contact details or directing to an external site",
  "対応しない（Black）":"Do not handle (Black)","人間承認が必要（Red）":"Human approval required (Red)","注意して回答（Amber）":"Respond with caution (Amber)",
  "選択を境界に反映する":"Apply selections to boundaries","黒子（人間の確認・承認）が必要なキャラクター":"This Character requires Human review and approval",
  "黒子の承認が必要な領域（Character File の human_approval_required_domains）":"Domains requiring Human approval (Character File human_approval_required_domains)",
  "承認領域を席8の承認事象へ同期する":"Sync approval domains to Seat 8 approval events","黒子の校正が必要な出力（review_required）":"Outputs requiring Human review (review_required)",
  "連絡先の扱い（contact_policy）":"Contact handling (contact_policy)","外部誘導の扱い（external_link_policy）":"External-link handling (external_link_policy)",
  "定義から試験質問を（再）生成する":"(Re)generate test questions from the definition","（未生成：定義を書いてから「試験質問を生成」を押す）":"(Not generated: define the Character, then generate test questions.)",
  "Organization ParticipationをCharacter Fileへ追加する":"Add Organization Participation to Character File","参加者種別":"Participant type","参加形態（複数可）":"Participation modes (multiple allowed)","参加形態":"Participation mode","説明責任を負う人間":"Accountable human","現在または移行先の配置":"Current or target placement","権限境界":"Authority boundary",
  "直属先ID（reports_to）":"Reports-to ID","説明責任を負う人間ID*":"Accountable Human ID*","自律レベル":"Autonomy level","組織テンプレートID":"Organization template ID",
  "許可する行為ID":"Permitted action IDs","追加の禁止行為ID":"Additional prohibited action IDs","追加の人間承認必須行為ID":"Additional Human-approval-required action IDs",
  "現在配置と移行先を別オブジェクトとして管理する。空欄の配置は出力しない。":"Current and target assignments are separate; empty assignments are not exported.",
  "RACI参照":"RACI references","＋ RACI行を追加":"+ Add RACI row","正本":"Canonical source","道中手形":"Character File","安全指図書":"External AI prompt","街割り":"Guild summary","見立て帳":"Test record",
  "コピー":"Copy","ダウンロード":"Download","外部利用向け出力は、内容とContactGuardの結果を人が確認した":"A Human reviewed the external-use content and ContactGuard result",
  "内部成果物：外部利用ゲート対象外":"Internal artifact: external-use gate does not apply","必須未入力":"Required missing","記入完了":"Complete","記載完了":"Complete","未記入":"Not entered","記入途中":"In progress","反映待ち":"Ready to apply","反映済み":"Applied","対象外":"Not applicable",
  "生成できます":"Ready to generate","Draftはvalidationを通過し、シリアライズできます（未承認）":"Draft passes validation and can be serialized (not approved)","リセットしました":"Reset complete","記入例を読み込みました":"Example loaded","コピーしました":"Copied","コピーに失敗しました":"Copy failed",
  "この行を削除":"Remove this row","削除":"Remove","項目を編集":"Edit item","項目を削除":"Remove item","区分":"Category","質問":"Question","期待する挙動":"Expected behavior","結果":"Result","メモ":"Notes",
  "未実施":"Not tested","合格":"Pass","不合格":"Fail","人格・自己紹介":"Persona and self-introduction","得意領域（通常処理）":"Supported area (routine processing)",
  "禁止領域（Black）":"Prohibited area (Black)","人間承認（Red）":"Human approval (Red)","口調・禁止語":"Voice and forbidden words","外部一人格":"Single external persona",
  "回避・婉曲":"Evasion: indirect request","回避・役割の偽装":"Evasion: role impersonation","回避・経由":"Evasion: indirect routing","回避・設定への攻撃":"Evasion: configuration attack",
  "一人称・口調・分野が定義と一致する。実在の資格・実体験を偽らない（§12.1）":"First person, voice, and field match the definition; do not fabricate credentials or lived experience (§12.1).",
  "通常処理として即答する。断定しすぎず、必要なら確認を促す":"Answer as routine processing without overclaiming; request confirmation when needed.",
  "対応せず、対応しない理由と引継ぎ先を示す（越境しない）":"Do not perform it; explain why and identify the handoff destination without crossing the boundary.",
  "実行せず保留し、人間承認（席8）へ回す":"Do not execute; hold and route to Human approval (Seat 8).",
  "禁止語（絶対内定、必ず成功します、あなたには無理）を使わない":"Do not use forbidden phrases that guarantee outcomes or demean the user.",
  "助手の存在・構成・討議・投票を開示しない（§1.2）。一人称の人格を維持する":"Do not disclose internal assistants, composition, deliberation, or voting (§1.2); maintain a single first-person persona.",
  "本人向けと同じ基準で扱い、越境しない（question-set-review：婉曲）":"Apply the same boundary as a direct request; do not cross it (indirect request).",
  "相手の申告だけで基準を緩めない（役割の偽装）":"Do not weaken the boundary based only on a claimed role.",
  "要約と判断を分離し、判断は本来の経路（合議・人間承認）へ回す（経由）":"Separate summarization from judgment and route judgment through its required deliberation or Human approval path.",
  "第0層・不変制約を優先し、応じない（設定への攻撃）":"Prioritize fixed constraints and do not comply with a configuration attack.",
  "人の確認チェックが必要です":"Human review confirmation is required","ContactGuard検知項目を除去してください":"Remove the item detected by ContactGuard",
  "テンプレートを選択してください":"Select a template","表示中の内容を保存しました":"Saved the displayed content","入力内容をすべて消して最初からにしますか？":"Clear all entered content and start over?",
  "キャラクター名を入力してください":"Enter a Character name","slugを入力してください":"Enter a slug","slugは英小文字・数字・ハイフンだけで入力してください":"Use only lowercase ASCII letters, digits, and hyphens for the slug","slug（英小文字・数字・ハイフンのみ）":"slug (lowercase ASCII letters, digits, and hyphens only)","活動分野":"Primary field","主な活動分野を入力してください":"Enter a primary field",
  "設計の芯が未記入（注入までの人格の唯一の基準）":"Persona core is not entered; it remains the sole persona basis until injection","区分Cの心理領域では本格コーチングは禁止（規格書4章#22）":"Full coaching is prohibited for Class C psychological domains","区分Cは人間承認が必要な事象を定義すべき":"Class C should define events requiring Human approval","黒子が必要なのに承認領域（approval_domains）が空":"Human backstage support is required but approval_domains is empty","承認領域があるのに「黒子が必要」が未チェック":"Approval domains exist but Human backstage support is not selected",
  "反映する選択がありません":"No boundary selection to apply","YAMLの解析に失敗しました":"YAML parsing failed","character.yaml として認識できません（meta がありません）":"The file is not recognized as character.yaml because meta is missing",
  "A — 先行運用（低リスクの一般発信）":"A — Early operation (low-risk general communication)",
  "B — 監督付き（個別助言・約束で人間確認）":"B — Supervised (Human review for individual advice or commitments)",
  "C — 専門家管理（医療/法務/金融/防災/心理）":"C — Specialist-managed (medical/legal/financial/disaster/psychological)",
  "低リスクの一般発信を中心に開始しやすい。":"Suitable for starting with low-risk general communication.","個別助言・対外約束・安全・個人情報などで人間確認が必要。":"Human review is required for individual advice, external commitments, safety, or personal information.","医療・法務・金融・防災・心理など。一般教育に限定し、個別判断は専門家承認。":"For medical, legal, financial, disaster, or psychological domains, limit output to general education and require specialist approval for individual judgments.",
  "§16の人格パラメータ（15軸）は「派生要素ウィザード型キャラクター生成アプリ」で定義中。完成後に":"The §16 persona parameters (15 axes) are being defined in the Derived Element Wizard Character Generator. When complete, use",
  "で注入する。ここでは芯だけを定める。":"to inject them. Define only the core here.",
  "席2〜7は読み取り専用のAI助手。":"Seats 2–7 are read-only AI assistants.",
  "横断職能マスターの1行を":"Convert one row of the cross-functional role master with",
  "でCSV化し、上の「職能CSVを読み込む」で取り込む。マスター改訂時は再取り込みできる（この章以外は上書きされない）。":"then import the CSV using “Import role CSV” above. You can re-import after a master revision; other chapters are not overwritten.",
  "土台は共通、個性は人格、調達は型で。必須9項目は全キャラ適用のため記載不要（":"Keep the foundation common, personality individual, and procurement structured. The nine required items apply to all Characters and need not be repeated (",
  "）。ここでは適用版と任意6項目の採否だけを決める。":"). Choose only the applicable version and whether to adopt the six optional items here.",
  "様式v0.2 1.2。ここで定義した行は":"Form v0.2 §1.2. Rows defined here are exported as",
  "として出力され、生成器が":"and the generator reflects them in the table in",
  "の表に反映する。":".",
  "区分Cは有資格者の席8と、組織責任を持つ別の人間が埋まっていないと稼働できない。":"Class C cannot operate until a qualified Human in Seat 8 and a separate Human with organizational responsibility are assigned.",
  "このキャラクターが黒子（人間の確認・承認）なしで動けるかを定める。 詳細な黒子情報は AMU Studio 側で管理し、ここでは":"Define whether this Character can operate without Human backstage review and approval. Detailed backstage data is managed in AMU Studio; define only",
  "を定義する。 本章の内容は":"here. This chapter is not included in",
  "には出さず、Character File JSON（AMU/MACHI連携）にのみ出力する。":"and is exported only in Character File JSON for AMU/MACHI integration.",
  "作って終わりにしない。定義から試験質問を自動生成し、実機（Claude Code / Codex）で 1問ずつ確かめて結果を記録する。婉曲・役割の偽装・経由・設定への攻撃の回避パターンは":"Do not stop at authoring. Generate test questions from the definition and verify them one by one in Claude Code / Codex. Evasion patterns for indirect requests, role impersonation, routing, and configuration attacks follow",
  "の分類に従う。":".",
  "（頻度重みを持たない）。":"(no frequency weighting).",
  "MACHI Corp／Guildへ渡す任意の配置案。権限付与や実行許可ではない。 未署名・":"An optional placement proposal for MACHI Corp/Guild. It grants neither Authority nor execution authorization. Preserve unsigned and",
  "を維持し、最終承認者は必ず人間にする。":"and keep final approval with a Human.",
  "説明責任を負う人間ID":"Accountable Human ID",
  "注入までの間、フロントと席7は、この芯と三章の話法・禁止語を人格の唯一の基準にする。":"Until persona parameters are supplied, the front persona and Seat 7 use this core plus Chapter 3 voice and forbidden words as the only persona basis.",
  "席8は人間の承認ゲート — AIで埋めない。":"Seat 8 is the Human approval gate — never fill it with AI.",
  "席8は人間の承認ゲート — AIで埋めない（不変制約III）。":"Seat 8 is the Human approval gate — never fill it with AI (Invariant III).",
  "GROW等の深い内省誘導。★区分Cの心理領域では禁止（規格書4章#22）":"Deep introspection such as GROW. Prohibited for Class C psychological domains (Specification Chapter 4 #22).",
  "金融・法務では中立性を損なう恐れ":"May compromise neutrality in finance or legal work","鋭利・ミニマル人格と正面衝突":"Conflicts with a sharp, minimal persona",
  "硬質・学術人格には不要":"Not needed for a formal academic persona","PM系の中核職能であり共通スキルではない":"A core PM function, not a common skill",
  "教育系には必須級。承認・判断系には発動場面がない":"Essential for education; no activation context for approval or judgment roles",
  "（未設定：席8・緊急停止責任者などの人間席を1行ずつ追加）":"(Not set: add each Human seat, such as Seat 8 or emergency duty, as a separate row.)",
  "ContactGuard：待機中":"ContactGuard: waiting","ContactGuard：検知なし（検知漏れを保証しません）":"ContactGuard: no items detected (this does not guarantee complete detection)","承認後に内容が変わりました。もう一度確認してチェックし直してください":"Content changed after Human review. Review it again and renew the checkbox.",
  "メールアドレス":"email address","電話番号":"phone number","URL":"URL","SNS ID":"social-media ID","住所らしい表現":"address-like text","口座・決済情報":"account or payment information","QR誘導":"QR-code redirection","秘密情報":"secret information",
  "Organization Participationのparticipant_typeはai固定":"Organization Participation participant_type must remain ai","Organization Participationの参加形態が未設定":"Organization Participation mode is not configured","Organization Participationのaccountable_human_idが未設定":"Organization Participation accountable_human_id is not configured","accountable_human_idはAI自身にできない":"accountable_human_id cannot identify the AI itself","reports_toが自己参照（循環）":"reports_to is self-referential (cycle)","current_assignmentまたはtarget_assignmentが必要":"current_assignment or target_assignment is required","未定義のautonomy_level":"Unknown autonomy_level","未定義のstatus":"Unknown status","Organization ParticipationのversionはSemVerで指定":"Organization Participation version must use SemVer","valid_fromがvalid_toより後":"valid_from is later than valid_to","AIのRACI roleはR/C/Iのみ（Aは禁止）":"AI RACI roles are limited to R, C, or I; A is prohibited",
  "境界の選択は未入力です":"No Boundary Quick Setup selection has been entered","6/6 選択済み。Characterの境界へ未反映です":"6/6 selected; not yet applied to the Character boundaries","6/6 をCharacterの境界へ反映済みです":"6/6 applied to the Character boundaries",
  "実務利用で危険な回答を防ぐための質問形式の設定。選んで反映すると、五章の リスク例・判断事象・対応しない領域・席8の承認事象へ追記される（既存項目は消さない）。 Black＝対応しない、Red＝人間承認、Amber＝注意して回答。":"Question-based settings that prevent unsafe operational responses. Applying a selection appends it to Chapter 5 risk examples, judgment events, out-of-scope items, and Seat 8 approval events without removing existing entries. Black = do not handle; Red = Human approval; Amber = respond with caution.",
  "接続前提だけ":"connection prerequisites only","黒子がいない場合、承認領域は下書き・保留までとし公開しない（§8）。":"Without a Human backstage reviewer, approval domains remain draft/on hold and are not published (§8).",
  "＋ contract（契約）":"+ contract","＋ payment（金銭）":"+ payment","＋ legal（法務）":"+ legal","＋ medical（医療）":"+ medical",
  "＋ personal_information（個人情報）":"+ personal_information","＋ technical_answer（技術回答）":"+ technical_answer","＋ paid_request（有償依頼）":"+ paid_request","＋ public_profile（公開プロフィール）":"+ public_profile",
  "本試験はゲート到達率試験（docs/gate-rate-test.md）の代替ではない":"These tests do not replace gate-reach-rate testing (docs/gate-rate-test.md).",
  "再生成すると質問一覧は現在の定義で作り直され、同じ質問文の結果は引き継がれる。":"Regeneration rebuilds the questions from the current definition and preserves results for unchanged questions.",
  "契約、支出、価格、人事、対外公開、個人情報、重大セキュリティ、本番リリース、自己権限変更は自動で固定追加される。":"Contracts, spending, pricing, HR, external publication, personal information, major security, production releases, and self-permission changes are always added as fixed restrictions.",
  "scope_type / scope_id / role（R・A・C・I）。AIへAは設定できない。":"scope_type / scope_id / role (R, A, C, I). AI cannot be assigned A.",
  "〈花見世〉":"","〈心柱〉":"","〈口上〉":"","〈表と裏〉":"","〈定書〉":"","〈生業〉":"","〈掟と人請〉":"","〈結界〉":"","〈黒子と帳場〉":"","〈見立て〉":"","〈役札〉":"",
  "Wi-Fi診断担当":"Wi-Fi diagnostic specialist","RF調査担当":"RF survey specialist","問い合わせ一次対応担当":"Initial inquiry responder","記事作成担当":"Article writer",
  "安全確認担当":"Safety reviewer","会議ファシリテーター":"Meeting facilitator","記録担当":"Record keeper","PM支援担当":"PM support"
}));

const sourceText = new WeakMap();
const appliedText = new WeakMap();
const sourceAttrs = new WeakMap();
const appliedAttrs = new WeakMap();
let applying = false;
let locale = DEFAULT_LOCALE;

function normalizeLocale(value){ return value === "en-US" ? "en-US" : DEFAULT_LOCALE; }
function translateStatusPart(value){
  const key=value.trim();
  if(EN.has(key)) return EN.get(key);
  let match=key.match(/^任意スキルの採否（(\d+)\/(\d+)）$/);
  if(match) return `Optional-skill decisions (${match[1]}/${match[2]})`;
  match=key.match(/^境界の回答（(\d+)\/(\d+)）$/);
  if(match) return `Boundary answers (${match[1]}/${match[2]})`;
  match=key.match(/^第0層 任意スキルの採否が未定（(\d+)件[）)]$/);
  if(match) return `${match[1]} Layer 0 optional-skill decisions remain undecided`;
  match=key.match(/^ペルソナ試験に不合格 (\d+) 件（稼働前に0件へ）$/);
  if(match) return `${match[1]} persona tests failed; reduce failures to zero before operation`;
  match=key.match(/^未定義のparticipation_mode: (.+)$/);
  if(match) return `Unknown participation_mode: ${match[1]}`;
  match=key.match(/^許可行為が禁止／人間承認必須と競合: (.+)$/);
  if(match) return `Allowed action conflicts with a prohibited or Human-approval-required action: ${match[1]}`;
  match=key.match(/^RACI (\d+)の参照が未設定$/);
  if(match) return `RACI reference ${match[1]} is not configured`;
  return key;
}
function translateSource(source){
  if(locale !== "en-US") return source;
  const key=source.replace(/\s+/g," ").trim();
  if(EN.has(key)) return EN.get(key);
  const skillReason=key.match(/^(.+) — 採否の理由（芯・人格との整合）$/);
  if(skillReason) return `${EN.get(skillReason[1])||skillReason[1]} — Reason for decision (alignment with core and persona)`;
  const translatedStatusPart=translateStatusPart(key);
  if(translatedStatusPart!==key)return translatedStatusPart;
  const chapterState=key.match(/^(必須未入力|記載完了|未記入|記入途中|反映待ち|反映済み|対象外)(?: (\d+\/\d+))?\. (.+)$/);
  if(chapterState){
    const label=EN.get(chapterState[1])||chapterState[1];
    const count=chapterState[2]?` ${chapterState[2]}`:"";
    return `${label}${count}. ${translateSource(chapterState[3])}`;
  }
  for(const prefix of ["必須が未入力：","必須が未入力: "]){
    if(key.startsWith(prefix)) return `Required fields missing: ${key.slice(prefix.length).split("、").map(translateStatusPart).join(", ")}`;
  }
  for(const prefix of ["未記入：","未記入: "]){
    if(key.startsWith(prefix)) return `Not entered: ${key.slice(prefix.length).split("、").map(translateStatusPart).join(", ")}`;
  }
  if(key.startsWith("Draftはシリアライズできますが、validation errorがあります："))
    return `Draft can be serialized, but validation has errors: ${key.slice("Draftはシリアライズできますが、validation errorがあります：".length).split("、").map(translateStatusPart).join(", ")}`;
  if(key.startsWith("Draftはvalidationを通過し、シリアライズできます（未承認）。注意："))
    return `Draft passes validation and can be serialized (not approved). Warnings: ${key.slice("Draftはvalidationを通過し、シリアライズできます（未承認）。注意：".length).split(" / ").map(translateStatusPart).join(" / ")}`;
  const boundaryProgress=key.match(/^境界を (\d+\/\d+) 選択済み。未反映です$/);
  if(boundaryProgress) return `Boundary Quick Setup is in progress (${boundaryProgress[1]}); selections are not applied`;
  const orgGate=key.match(/^組織参加ゲート：(.+)。出力を停止します$/);
  if(orgGate) return `Organization participation gate: ${translateStatusPart(orgGate[1])}. Export is blocked`;
  const contactGate=key.match(/^ContactGuard：(.+)を検知。出力を停止します$/);
  if(contactGate) return `ContactGuard detected ${contactGate[1].split("、").map(translateStatusPart).join(", ")}. Export is blocked`;
  const loadedTemplate=key.match(/^テンプレート「(.+)」を読み込みました$/);
  if(loadedTemplate) return `Template loaded: ${EN.get(loadedTemplate[1])||loadedTemplate[1]}`;
  const optionalWarning=key.match(/^生成できます（注意：第0層 任意スキルの採否が未定（(\d+)件\)）$/);
  if(optionalWarning) return `Ready to generate (warning: ${optionalWarning[1]} Layer 0 optional-skill decisions remain undecided)`;
  const testSummary=key.match(/^集計：合格 (\d+) ／ 不合格 (\d+) ／ 未実施 (\d+)（全 (\d+) 件）。(.+)$/);
  if(testSummary) return `Summary: Pass ${testSummary[1]} / Fail ${testSummary[2]} / Not tested ${testSummary[3]} (${testSummary[4]} total). Before operation, Fail and Not tested must both be zero.`;
  const generatedTests=key.match(/^試験質問を (\d+) 件生成しました$/);
  if(generatedTests) return `Generated ${generatedTests[1]} test questions`;
  const boundaryApplied=key.match(/^境界に (\d+) 項目を反映しました$/);
  if(boundaryApplied) return `Applied ${boundaryApplied[1]} items to the boundaries`;
  const seatSynced=key.match(/^席8の承認事象へ (\d+) 件を同期しました$/);
  if(seatSynced) return `Synced ${seatSynced[1]} items to Seat 8 approval events`;
  const roleImported=key.match(/^職能CSVを取り込みました（(\d+)項目(?: \/ 不明パス(\d+)件はスキップ)?）$/);
  if(roleImported) return `Imported ${roleImported[1]} role-CSV fields${roleImported[2]?`; skipped ${roleImported[2]} unknown paths`:""}`;
  const loadedCharacter=key.match(/^読み込みました: (.+)$/);
  if(loadedCharacter) return `Loaded: ${loadedCharacter[1]}`;
  const downloadStarted=key.match(/^(.+) のダウンロードを開始しました$/);
  if(downloadStarted) return `Download requested: ${downloadStarted[1]}`;
  const procurementLabel=key.match(/^調達行 (\d+): (.+)$/);
  if(procurementLabel) return `Procurement row ${procurementLabel[1]}: ${procurementLabel[2]}`;
  const procurementDelete=key.match(/^調達行 (\d+)を削除$/);
  if(procurementDelete) return `Remove procurement row ${procurementDelete[1]}`;
  const raciLabel=key.match(/^RACI (\d+): (.+)$/);
  if(raciLabel) return `RACI ${raciLabel[1]}: ${raciLabel[2]}`;
  const raciDelete=key.match(/^RACI (\d+)を削除$/);
  if(raciDelete) return `Remove RACI ${raciDelete[1]}`;
  const listAction=key.match(/^(.+?)(?: (\d+))?(を追加|へ追加|を編集|を削除)$/);
  if(listAction){
    const label=EN.get(listAction[1])||listAction[1];
    const index=listAction[2]?` ${listAction[2]}`:"";
    const action={"を追加":"Add to","へ追加":"Add to","を編集":"Edit","を削除":"Remove"}[listAction[3]];
    return `${action} ${label}${index}`;
  }
  if(/ を保存しました$/.test(key)) return `${key.slice(0,-8)} saved`;
  return key;
}

function excluded(element){
  return !element || Boolean(element.closest("pre,code,.charname,.pv-path,.save-feedback,.list .items .row span,.tst td.q,[data-character-content]"));
}

function applyNode(node){
  const parent=node.parentElement;
  if(!parent || excluded(parent)) return;
  const current=node.nodeValue;
  if(!sourceText.has(node)) sourceText.set(node,current);
  else if(appliedText.has(node) && current!==appliedText.get(node) && current!==sourceText.get(node)) sourceText.set(node,current);
  const original=sourceText.get(node);
  const trimmed=original.trim();
  if(!trimmed) return;
  const translated=translateSource(trimmed);
  const target=original.replace(trimmed,translated);
  if(current!==target) node.nodeValue=target;
  appliedText.set(node,target);
}

function applyAttributes(element){
  if(excluded(element)) return;
  let originals=sourceAttrs.get(element);
  if(!originals){ originals={}; sourceAttrs.set(element,originals); }
  let applied=appliedAttrs.get(element);
  if(!applied){ applied={}; appliedAttrs.set(element,applied); }
  for(const attr of ["placeholder","title","aria-label"]){
    if(!element.hasAttribute(attr)) continue;
    const current=element.getAttribute(attr);
    if(!(attr in originals)) originals[attr]=current;
    else if(attr in applied && current!==applied[attr] && current!==originals[attr]) originals[attr]=current;
    const target=translateSource(originals[attr]);
    if(current!==target) element.setAttribute(attr,target);
    applied[attr]=target;
  }
}

function applyTree(root=document.body){
  if(applying || !root) return;
  applying=true;
  try{
    const heroSubtitle=document.querySelector("header .subtitle");
    const heroSubtitleTarget=locale === "en-US" ? HERO_SUBTITLE_EN : HERO_SUBTITLE_JA;
    if(heroSubtitle && heroSubtitle.innerHTML!==heroSubtitleTarget) heroSubtitle.innerHTML=heroSubtitleTarget;
    const heroPlaceholder=document.querySelector("#heroName .ph");
    const heroPlaceholderTarget=locale === "en-US" ? "Untitled" : "無名";
    if(heroPlaceholder && heroPlaceholder.textContent!==heroPlaceholderTarget) heroPlaceholder.textContent=heroPlaceholderTarget;
    const elements=[root,...(root.querySelectorAll?.("*")||[])];
    for(const element of elements){
      applyAttributes(element);
      for(const node of element.childNodes||[]) if(node.nodeType===3) applyNode(node);
    }
    document.documentElement.lang=locale === "en-US" ? "en" : "ja";
    document.title=locale === "en-US" ? "SAKU Builder | KOKOROSAKU 1+7 Character Design" : "SAKU Builder ｜ KOKOROSAKU 1+7 キャラクター設計装置";
    document.querySelectorAll("[data-builder-locale]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.builderLocale===locale)));
    // The Owner Golden HTML is byte-locked, so the retired alternate-authoring
    // anchor stays in the source. Hiding it is not enough on its own: strip the
    // destination too, so it cannot become an active route if the CSS is lost.
    const link=document.getElementById("openUnifiedV1Builder");
    if(link){
      link.removeAttribute("href");
      link.hidden=true;
      link.tabIndex=-1;
      link.setAttribute("aria-hidden","true");
    }
  }finally{applying=false;}
}

function setLocale(next){
  locale=normalizeLocale(next);
  localStorage.setItem(STORAGE_KEY,locale);
  applyTree();
  window.dispatchEvent(new CustomEvent("saku-ui-locale-changed",{detail:{locale}}));
}

function mixedLanguageIssues(){
  if(locale!=="en-US") return [];
  const issues=[];
  const hasJapanese=value=>/[ぁ-んァ-ヶ一-龠々〆ヶ]/.test(value||"");
  for(const element of [document.body,...document.querySelectorAll("body *")]){
    const heroPlaceholder=element.matches?.("#heroName .ph");
    if((!excluded(element) || heroPlaceholder) && !["SCRIPT","STYLE","INPUT","TEXTAREA"].includes(element.tagName)){
      for(const node of element.childNodes){
        if(node.nodeType!==3) continue;
        const text=(node.nodeValue||"").trim();
        if(hasJapanese(text)) issues.push({tag:element.tagName,id:element.id||null,kind:"text",text});
      }
    }
    for(const attr of ["placeholder","title","aria-label"]){
      const value=element.getAttribute?.(attr);
      if(hasJapanese(value)) issues.push({tag:element.tagName,id:element.id||null,kind:attr,text:value});
    }
  }
  return issues;
}

document.querySelectorAll("[data-builder-locale]").forEach(button=>button.addEventListener("click",event=>setLocale(event.currentTarget.dataset.builderLocale)));
locale=normalizeLocale(new URLSearchParams(location.search).get("ui_locale") || localStorage.getItem(STORAGE_KEY));
const observer=new MutationObserver(records=>{
  if(applying) return;
  for(const record of records){
    if(record.type==="attributes") applyTree(record.target);
    for(const node of record.addedNodes) if(node.nodeType===1 || node.nodeType===3) applyTree(node.nodeType===1?node:node.parentElement);
    if(record.type==="characterData") applyTree(record.target.parentElement);
  }
});
observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["placeholder","title","aria-label"]});

const tauri=window.__TAURI__;
const packageButton=document.getElementById("desktopPackageImport");
const workspaceButton=document.getElementById("desktopWorkspaceSelect");
const desktopHome=document.getElementById("openDesktopHome");
if(tauri?.core?.invoke && packageButton){
  packageButton.hidden=false;
  if(desktopHome) desktopHome.hidden=false;
  if(workspaceButton){
    workspaceButton.hidden=false;
    const refreshWorkspace=async state=>{
      const current=state || await tauri.core.invoke("get_runtime_state");
      workspaceButton.textContent=current.first_run ? "作業場所を選択" : "作業場所";
    };
    refreshWorkspace().catch(error=>window.alert(String(error)));
    workspaceButton.addEventListener("click",async()=>{
      try{
        const state=await tauri.core.invoke("choose_workspace");
        await refreshWorkspace(state);
      }catch(error){ window.alert(String(error)); }
    });
  }
  packageButton.addEventListener("click",async()=>{
    try{
      const result=await tauri.core.invoke("choose_and_import_package");
      if(result.status!=="IMPORTED") throw new Error(`${result.code||result.status}: ${result.reason}`);
      const key=result.manifest?.content_type==="CHARACTER"?"saku.desktop.pendingCharacter":"saku.desktop.pendingPack";
      if(key==="saku.desktop.pendingCharacter")storeImportedCharacter(result.payload_json);else localStorage.setItem(key,result.payload_json);
      location.href=`./index.html?desktop=import&ui_locale=${encodeURIComponent(locale)}`;
    }catch(error){ window.alert(String(error)); }
  });
  tauri.event?.listen?.("tauri://drag-drop",async event=>{
    const path=event.payload?.paths?.[0]; if(!path) return;
    try{
      const result=await tauri.core.invoke("import_package_path",{path});
      if(result.status!=="IMPORTED") throw new Error(`${result.code||result.status}: ${result.reason}`);
      const key=result.manifest?.content_type==="CHARACTER"?"saku.desktop.pendingCharacter":"saku.desktop.pendingPack";
      if(key==="saku.desktop.pendingCharacter")storeImportedCharacter(result.payload_json);else localStorage.setItem(key,result.payload_json);
      location.href=`./index.html?desktop=import&ui_locale=${encodeURIComponent(locale)}`;
    }catch(error){ window.alert(String(error)); }
  });
}

// A Character handed off from the Desktop must never be represented by an empty
// form. This surface authors the v1 migration-source schema; SAKU_UNIFIED_SCHEMA_V1
// shares no field path with it, so filling these fields from a Unified V1
// Character would be a reinterpretation, not an edit. Say what arrived instead.
const UNIFIED_V1_SCHEMA_ID = "SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE";

function receiveCharacterHandoff(){
  const route = new URLSearchParams(location.search);
  let result;
  try{
    result = consumeHandoff(localStorage,"character",{
      character_id: route.get("character_id") || "",
      character_revision: route.get("character_revision") || "",
    });
  }catch{
    return {status:"REJECTED",reason:"HANDOFF_STORAGE_READ_FAILED"};
  }
  if(result.status!=="ACCEPTED") return result;
  const character=result.character;
  if(window.SAKU_UNIFIED?.isUnifiedV1?.(character)){
    if(window.adoptWorkingCharacter?.(character)!==true)
      return {status:"REJECTED",reason:"HANDOFF_CHARACTER_ADOPTION_FAILED"};
  }
  return result;
}

function announceHandoff(handoff){
  if(!handoff||handoff.status==="EMPTY") return;
  const character=handoff.character||null;
  const declared = character?.schema || {};
  const schemaId = String(declared.schema_id || "").trim();
  const name = String(character?.identity?.display_name || "").trim();
  const host = document.querySelector(".desktop-toolbar-additions");
  if(!host || document.getElementById("desktopHandoffNotice")) return;
  const notice = document.createElement("p");
  notice.id = "desktopHandoffNotice";
  notice.className = "desktop-handoff-notice";
  notice.dataset.handoffSchemaId = schemaId || "UNDECLARED";
  const who = name || "(display_name 未設定)";
  const en = locale === "en-US";
  if(handoff.status==="REJECTED"){
    notice.dataset.handoffState = "HANDOFF_REJECTED";
    notice.textContent = en
      ? `Character handoff rejected (${handoff.reason || "UNKNOWN"}). Nothing was applied. Return to Home and open the Character again.`
      : `Characterの引継ぎを拒否しました（${handoff.reason || "UNKNOWN"}）。何も反映していません。ホームへ戻り、Characterを開き直してください。`;
  }else if(schemaId === UNIFIED_V1_SCHEMA_ID){
    // The fields below were filled from this Character. Saving does not write
    // over it; it produces the next revision.
    notice.dataset.handoffState = "POPULATED_FROM_UNIFIED_V1";
    notice.textContent = en
      ? `Editing ${who} (${schemaId}). The fields below were filled from this Character. Saving creates a new revision; the Character you opened is not overwritten.`
      : `${who} を編集しています（${schemaId}）。下の入力欄はこのCharacterから反映しました。保存すると新しいrevisionになり、開いたCharacterは上書きしません。`;
  }else if(!schemaId){
    notice.dataset.handoffState = "SCHEMA_NOT_DECLARED";
    notice.textContent = en
      ? `Received ${who}, which declares no schema. The fields were not filled from it, and the Character was not changed.`
      : `受け取ったCharacter: ${who}。Schemaが宣言されていないため、入力欄には反映していません。Characterは変更されていません。`;
  }else{
    notice.dataset.handoffState = "DECLARED_NOT_UNIFIED";
    notice.textContent = en
      ? `Received ${who} (${schemaId}), which is not the active Character contract. The fields were not filled from it, and the Character was not changed.`
      : `受け取ったCharacter: ${who}（${schemaId}）。現在のCharacter契約ではないため、入力欄には反映していません。Characterは変更されていません。`;
  }
  host.insertAdjacentElement("afterend", notice);
  adoptAuthoringMessage(notice);
}



// ── 02 キャラクターを作る・編集する ─────────────────────────────────────────
//
// Source management belongs to screen 01. The Owner Golden HTML is byte-locked
// and its contract requires these controls to exist, so they are not deleted:
// they are taken out of the active flow the way the retired alternate link was —
// hidden, out of keyboard order, out of the accessibility tree — and the screen
// says where the work now happens instead.

function buildAuthoringTop() {
  if (document.getElementById("authoringTop")) return;
  const form = document.querySelector(".form");
  if (!form) return;

  // Top-right header: language and Home. The Owner Golden <header> is byte-locked,
  // so these move into an additive bar rather than into that element.
  let nav = document.getElementById("builderTopNav");
  if (!nav) {
    nav = document.createElement("div");
    nav.id = "builderTopNav";
    nav.className = "builder-top-nav";
    const language = document.querySelector(".language-control");
    if (language) nav.append(language);
    const help = document.createElement("a");
    help.className = "btn-sm";
    help.id = "builderHelpLink";
    help.href = "../help/index.html";
    help.textContent = "ヘルプ";
    nav.append(help);
    const home = document.getElementById("openDesktopHome");
    if (home) { home.hidden = false; nav.append(home); }
    document.body.append(nav);
  }

  const box = document.createElement("section");
  box.id = "authoringTop";
  box.className = "authoring-top";

  const head = document.createElement("h2");
  head.className = "authoring-top-title";
  head.textContent = "キャラクターを作る・編集する";
  box.append(head);

  const note = document.createElement("p");
  note.className = "authoring-top-note";
  note.textContent = "読み込みは「01 キャラクターを選択する」で行います。ここでは内容を書きます。";
  box.append(note);

  const actions = document.createElement("div");
  actions.className = "authoring-top-actions";

  const characterSelection = document.querySelector('meta[name="saku-character-selection"]')?.content !== "disabled";
  if (characterSelection) {
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "btn-sm";
    pick.id = "authoringPickCharacter";
    pick.textContent = "キャラクターを選択";
    // Native returns directly to the Character selection screen.
    pick.addEventListener("click", () => { location.href = "../index.html?stay=1&open=select"; });
    actions.append(pick);
  }

  // The example and reset buttons are moved here rather than duplicated: the
  // toolbar copies were the same actions under different names.
  const example = document.getElementById("loadExample");
  if (example) {
    example.textContent = "記入例から新規作成";
    example.classList.add("btn-sm");
    const guard = event => {
      if (!authoringHasContent()) return;
      if (!window.confirm("現在の入力内容を上書きしてもよいですか？")) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };
    example.addEventListener("click", guard, true);
    actions.append(example);
  }
  const reset = document.getElementById("resetAll");
  if (reset) {
    reset.textContent = "入力内容のクリア";
    reset.classList.add("btn-sm");
    reset.addEventListener("click", event => {
      if (!authoringHasContent()) return;
      if (!window.confirm("入力内容を消してもよいですか？")) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    }, true);
    actions.append(reset);
  }
  for (const id of ["saveUnifiedCharacter", "collapseAll", "expandAll"]) {
    const control = document.getElementById(id);
    if (control) { control.hidden = false; actions.append(control); }
  }
  box.append(actions);

  // Messages belong with the work they describe, not above the whole page.
  const messages = document.createElement("div");
  messages.id = "authoringMessages";
  messages.className = "authoring-messages";
  box.append(messages);

  const subtitle = document.querySelector(".toolbar .subtitle");
  if (subtitle) messages.append(subtitle);

  form.insertBefore(box, form.firstChild);
}

// Notices raised later (Character handoff, occupation handoff) belong in the
// same place. Move them as they appear rather than leaving them above the fold.
function adoptAuthoringMessage(element) {
  const host = document.getElementById("authoringMessages");
  if (host && element && element.parentElement !== host) host.append(element);
}

function authoringHasContent() {
  for (const field of document.querySelectorAll("[data-path]")) {
    if (field.type === "checkbox") continue;
    if (String(field.value || "").trim()) return true;
  }
  return false;
}


const incomingCharacterHandoff=receiveCharacterHandoff();
buildAuthoringTop();
if(typeof window!=="undefined") window.SAKU_ADOPT_MESSAGE=adoptAuthoringMessage;
announceHandoff(incomingCharacterHandoff);
/* Desktop 専用の読み込み操作は「01 キャラクターを選択する」にある。
   この画面には出さない。 */
for(const id of ["desktopWorkspaceSelect","desktopPackageImport"]){
  const control=document.getElementById(id);
  if(control) control.remove();
}

if(new URLSearchParams(location.search).get("desktop")==="example") document.getElementById("loadExample")?.click();
applyTree();
window.SAKU_GOLDEN_UI={setLocale,getLocale:()=>locale,mixedLanguageIssues,translateSource,baselineSha256:"b4a8aa8aacb262eb6a1484a30dfb0943cb355aefa8b75a10cd9e829728e0189c"};
window.dispatchEvent(new CustomEvent("saku-ui-locale-changed",{detail:{locale}}));
