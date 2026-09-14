import { createI18n } from "./i18n.mjs";
import { HELP_FIELDS, helpButtonHTML, attachHelp } from "./help-registry.mjs";
import { clearHandoff, consumeHandoff, storeHandoff } from "./handoff-binding.mjs";
import * as ActiveSaku from "./active-saku.mjs";
import { validateUnifiedV1 } from "../v1/unified-authoring.mjs";
import {
  BUILT_IN_QUESTIONS,
  EVALUATION_PACK_ID,
  EXECUTION_MODES,
  QUESTION_LIBRARY_ID,
  QUESTION_SOURCES,
  TEST_SCOPES,
  addQuestion,
  addSummary,
  attemptForId,
  assessmentsForScope,
  beginLinkedRetest,
  beginQuestionAttempt,
  buildBuilderHandoff,
  buildEvaluationPack,
  buildExecutionPack,
  changeScope,
  clearResponseDraft,
  clearCurrentSession,
  confirmResponseDraft,
  contentDigest,
  createChangeCandidate,
  createGeneratedQuestionCandidate,
  createSession,
  createTrainerResult,
  createUserQuestion,
  deleteSavedSession,
  draftForAttempt,
  eligibleBuilderCandidates,
  evidenceForScope,
  finalizePacks,
  listSessions,
  loadSession,
  invalidateSessionBuilderHandoff,
  normalizeTrainerUx2Session,
  preflight,
  recordAssessment,
  resultForAttempt,
  saveResponseDraft,
  saveSession,
  selectCandidate,
  selectQuestions,
  storeBuilderHandoff,
  sourceQuestionResultForAttempt,
  trainerQuestionQueueState,
  tuningEvidenceState,
  validateFinalizedPacks,
} from "../v1/trainer-frozen-ia.mjs";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const viewNames = ["setup", "prompt", "answer", "evaluation", "round_summary", "results", "impact", "review", "export"];
const allViewNames = ["setup", "prompt", "answer", "evaluation", "round_summary", "training_summary", "results", "impact", "review", "export"];
const routeParams = new URLSearchParams(location.search);
const reviewRouteRequested = routeParams.get("desktop") === "review-results";
const requestedCharacterId = routeParams.get("character_id") || "";
const requestedCharacterRevision = routeParams.get("character_revision") || "";

const COPY = Object.freeze({
  ja: {
    skip: "メイン作業へ移動", loading: "Characterを読み込み中", home: "‹ ホーム", builder_back: "‹ Builder", language: "表示言語",
    about: "About / License", review_results: "結果を確認する", evidence_notebook: "Evidence", evidence_notebook_aria: "Evidenceノートへ移動",
    session: "検証Session", journey: "Character Verification → Evidence → Human Review → Controlled Revision", assessed: "確認済み", none_yet: "まだありません",
    not_assessed: "未評価", select_questions: "質問を選択してください", differences: "差分", finish_review: "Human Reviewへ",
    session_start: "Session start", source_and_scope: "Character・Scope・質問", prepare: "検証を始める準備", trainer_no_edit: "TrainerはCharacterを直接変更しません。",
    trainer_purpose: "EvidenceとHuman Reviewから、Builderで確認する変更候補だけを準備します。", character_source: "Character", platform: "使用する外部AI",
    question_language: "質問言語", test_scope: "Test Scope", execution_mode: "実行モード", saved_session: "保存済みSession", new_session: "新しいSession",
    resume_session: "Sessionを再開", clear_current_session: "現在のSession表示をクリア", delete_saved_session: "保存済みSessionを削除",
    paste_character: "またはCharacter JSONを貼り付け", load_paste: "貼り付けから読み込み", question_library: "質問ライブラリ",
    question_library_note: "Scope内の定義済み質問を選択します。追加した質問は、Expectedと人の確認基準が定義されるまでドラフトです。", add_question: "質問を追加", question_text: "質問文",
    question_placeholder: "検証したい質問", add_user_question: "自作質問ドラフトを保存", add_generated_candidate: "外部生成済み候補を保存",
    preflight_note: "すべての必須項目が揃うまで外部実行用Packは作りません。", build_pack: "Test Run Packを作る →", execution_pack: "Execution Pack",
    external_run: "外部AIで実行", copy_test_pack: "Test Run Packをコピー", pack_separation: "外部AIへはCharacter・Q ID・質問・回答手順だけを渡します。",
    test_run_pack: "TEST RUN PACK", evaluation_retained: "Expected・Rubric・T-itemはTrainer側のEvaluation Packに保持します。", next_selected_question: "次の選択質問",
    copy_full_pack: "⧉ Test Run Packをコピー", toggle_pack: "Pack表示を切替", expert_tools: "Expert / Secondary",
    question_only_warning: "質問だけの実行はCharacter検証になりません。", copy_question_only: "⧉ 質問だけをコピー", evaluation_pack: "Evaluation Pack（Trainer内のみ）",
    external_roundtrip: "外部AIとの往復", roundtrip_1: "Test Run Packをコピー", roundtrip_2: "新しい会話へ貼り付けて回答を取得", roundtrip_3: "回答原文をTrainerへ戻す",
    paste_response: "回答原文を貼り付ける →", original_evidence: "Original Evidence", preserve_response: "外部AIの回答原文を保存",
    evidence_rule: "原文は要約で置き換えません。", correction_rule: "訂正・再投稿は、元Evidenceを残した新しい連結レコードです。", response_original: "外部AIの回答原文",
    response_placeholder: "回答をそのまま貼り付けてください。", paste_clipboard: "⎘ クリップボードから貼り付け", clear_input: "入力欄をクリア",
    summary_optional: "要約（任意・Evidenceではありません）", human_assessment: "人によるExpected / Observed / Diff確認", assessment_state: "判定",
    observed: "Observed（原文から人が確認できた内容）", diff: "Diff（Expectedとの違い）", cannot_assess: "評価結果を作成できません。",
    answer_recovery: "回答原文・Observed・Diffを確認するか、NOT_ASSESSEDとして保持してください。", record_evidence: "EvidenceとHuman Reviewを記録 →",
    record_correction: "訂正版Evidenceとして追加", hold_not_assessed: "NOT_ASSESSEDとして保留", separate_evidence: "Evidenceと評価を分けて確認",
    not_assessed_rule: "回答が存在するだけではObservedを確定しません。", copy_assessment: "⧉ 評価をコピー", question_summary: "質問まとめへ →",
    question_result: "Question result", what_learned: "今回確認できたこと", next_test: "次の対象", copy_summary: "⧉ まとめをコピー", next_question: "次の選択質問 →",
    training_summary: "Training Summary", summary_boundary: "Evidence、評価、未評価を混同せずに整理します。", not_character: "これはCharacterでもCanonicalでもありません。",
    work_evidence: "Trainer Sessionの作業Evidenceです。", copy_training: "⧉ Summaryをコピー", review_candidates: "変更候補を確認 →", review_lead: "Expected、Observed、Diff、Evidenceを分けて確認します。",
    review_not_approval: "Reviewは承認ではありません。", review_boundary: "Canonical更新、Human Approval、revision有効化を行いません。", no_results: "確認できる結果はまだありません。",
    no_results_help: "質問を実行し、Evidenceを記録してください。", start_test: "検証を続ける", back_viewer: "Viewerへ戻る", test_history: "test履歴",
    technical_evidence: "技術的Evidence", continue_trainer: "Trainerを続ける", select_candidates: "変更候補を選択", candidate_not_change: "候補はまだCharacter変更ではありません。",
    candidate_selection_rule: "DIFFERENTと人が確認した項目だけを、Builderへ送る候補として選べます。", current_value: "現在値", proposed_change: "推奨変更",
    expected_effect: "期待効果", human_review_next: "Human Reviewへ →", human_review: "人による確認", human_review_lead: "Builderへ送る変更候補とEvidence、影響、副作用を確認します。",
    review_checklist: "確認チェック", check_evidence: "回答原文とEvidence参照を確認した。", check_assessment: "Expected / Observed / Diffを確認した。",
    check_unknown: "NOT_ASSESSEDと未解決事項を確認した。", check_candidate: "選択した変更候補の現在値と変更後を確認した。",
    check_boundary: "Reviewは承認・Canonical Adoptionではないと確認した。", builder_review_only: "これはBuilderへ送るためのHuman Reviewです。",
    no_apply_here: "TrainerではCharacterへ反映しません。", prepare_handoff: "Builder handoffを準備 →", handoff_title: "変更候補をBuilderへ送る",
    builder_apply_required: "Builderで人が明示的に反映するまでCharacterは変わりません。", stale_rule: "tested revisionとBuilder current revisionが異なる場合はSTALE / APPLY_BLOCKEDです。",
    copy_candidate: "⧉ 候補データをコピー", copy_human_summary: "⧉ 人が読むまとめをコピー", toggle_candidate: "Candidate詳細を表示", send_builder: "変更候補をBuilderへ送る",
    handoff_ready: "Builder handoff準備完了", not_applied: "Character updated: NO", evidence_note: "Original Responseと人の評価を分けて保持します。",
    no_evidence: "Evidenceはまだありません", no_evidence_help: "Test Run Packを実行し、回答原文を記録してください。", memory_boundary: "Trainer Sessionは作業Evidenceであり、AMU Memoryではありません。",
    back: "← 戻る", next: "次へ →", close: "閉じる",
    promote: "人が確認して有効化", built_in: "組み込み", user_created: "自作質問ドラフト", generated: "未確認の生成候補", selected: "選択中", unselected: "未選択",
    current: "現在", expected: "Expected", evidence: "Evidence", side_effect: "副作用", unresolved: "未解決", no_candidate: "DIFFERENTとして確認された変更候補はありません。",
    select_for_builder: "Builderへ送る候補として選択", status: "状態", character: "Character", revision: "revision", scope: "Scope", delete_confirm: "このTrainer Sessionだけを削除しますか？",
    step: "ステップ", results_count: "件の結果", candidates_count: "件の変更候補・人の選択が必要", handoff_rejected: "Trainer handoffを拒否しました",
    trainer_progress_aria: "Trainer検証の進行", question_progress_aria: "質問の進行", tuning_state_aria: "20項目のEvidence contribution状態",
    impact_comparison_aria: "現在値・提案値・効果の比較", evidence_pane_aria: "Trainer Evidence", progress_aria: "進行", ui_language_aria: "表示言語",
  },
  en: {
    skip: "Skip to main work", loading: "Loading Character", home: "‹ Home", builder_back: "‹ Builder", language: "Display language",
    about: "About / License", review_results: "Review Results", evidence_notebook: "Evidence", evidence_notebook_aria: "Go to the Evidence notebook",
    session: "Verification session", journey: "Character Verification → Evidence → Human Review → Controlled Revision", assessed: "Assessed", none_yet: "None yet",
    not_assessed: "Not assessed", select_questions: "Select questions", differences: "Differences", finish_review: "Human Review",
    session_start: "Session start", source_and_scope: "Character, scope, and questions", prepare: "Prepare Character verification", trainer_no_edit: "Trainer does not directly edit the Character.",
    trainer_purpose: "It prepares only Human-reviewed change candidates for Builder from preserved Evidence.", character_source: "Character", platform: "External AI",
    question_language: "Question language", test_scope: "Test Scope", execution_mode: "Execution mode", saved_session: "Saved Session", new_session: "New Session",
    resume_session: "Resume Session", clear_current_session: "Clear current Session view", delete_saved_session: "Delete saved Session",
    paste_character: "Or paste Character JSON", load_paste: "Load pasted Character", question_library: "Question library",
    question_library_note: "Select defined questions in scope. Added questions remain drafts until Expected behavior and a Human review rubric are defined.", add_question: "Add question", question_text: "Question",
    question_placeholder: "Question to verify", add_user_question: "Save user-created question draft", add_generated_candidate: "Save externally generated candidate",
    preflight_note: "No external execution pack is produced until every required item is complete.", build_pack: "Build Test Run Pack →", execution_pack: "Execution Pack",
    external_run: "Run with an external AI", copy_test_pack: "Copy the Test Run Pack", pack_separation: "The target receives only the Character, Q IDs, questions, and response protocol.",
    test_run_pack: "TEST RUN PACK", evaluation_retained: "Expected, rubric, and T-items remain in Trainer's Evaluation Pack.", next_selected_question: "Next selected question",
    copy_full_pack: "⧉ Copy Test Run Pack", toggle_pack: "Toggle Pack", expert_tools: "Expert / Secondary",
    question_only_warning: "Running a question without Character context is not Character verification.", copy_question_only: "⧉ Copy question only", evaluation_pack: "Evaluation Pack (Trainer only)",
    external_roundtrip: "External AI round trip", roundtrip_1: "Copy the Test Run Pack", roundtrip_2: "Paste it into a fresh conversation and obtain a response", roundtrip_3: "Return the original response to Trainer",
    paste_response: "Paste original response →", original_evidence: "Original Evidence", preserve_response: "Preserve the external AI response",
    evidence_rule: "A summary never replaces the original.", correction_rule: "A correction or repost is a new linked record; the original remains.", response_original: "Original external AI response",
    response_placeholder: "Paste the response exactly as received.", paste_clipboard: "⎘ Paste from clipboard", clear_input: "Clear input",
    summary_optional: "Summary (optional; not Evidence)", human_assessment: "Human Expected / Observed / Diff review", assessment_state: "Assessment state",
    observed: "Observed (what a human can establish from the original)", diff: "Diff (difference from Expected)", cannot_assess: "Cannot create an assessment.",
    answer_recovery: "Review the original response, Observed, and Diff, or retain NOT_ASSESSED.", record_evidence: "Record Evidence and Human Review →",
    record_correction: "Add linked correction Evidence", hold_not_assessed: "Hold as NOT_ASSESSED", separate_evidence: "Keep Evidence and assessment separate",
    not_assessed_rule: "A response existing does not establish Observed.", copy_assessment: "⧉ Copy assessment", question_summary: "Question summary →",
    question_result: "Question result", what_learned: "What was established", next_test: "Next target", copy_summary: "⧉ Copy summary", next_question: "Next selected question →",
    training_summary: "Training Summary", summary_boundary: "Evidence, assessment, and not-assessed states remain distinct.", not_character: "This is not a Character or Canonical.",
    work_evidence: "It is Trainer Session work evidence.", copy_training: "⧉ Copy Summary", review_candidates: "Review change candidates →", review_lead: "Review Expected, Observed, Diff, and Evidence separately.",
    review_not_approval: "Review is not approval.", review_boundary: "This does not update Canonical, grant Human Approval, or activate a revision.", no_results: "There are no results to review yet.",
    no_results_help: "Run a question and record Evidence.", start_test: "Continue verification", back_viewer: "Back to Viewer", test_history: "Test history",
    technical_evidence: "Technical Evidence", continue_trainer: "Continue Trainer", select_candidates: "Select change candidates", candidate_not_change: "A candidate is not yet a Character change.",
    candidate_selection_rule: "Only items a human marked DIFFERENT can be selected for Builder.", current_value: "Current value", proposed_change: "Proposed change",
    expected_effect: "Expected effect", human_review_next: "Human Review →", human_review: "Human Review", human_review_lead: "Review selected candidates, Evidence, effects, and side effects before Builder handoff.",
    review_checklist: "Review checklist", check_evidence: "I reviewed the original response and Evidence reference.", check_assessment: "I reviewed Expected / Observed / Diff.",
    check_unknown: "I reviewed NOT_ASSESSED and unresolved items.", check_candidate: "I reviewed current and proposed values for the selected changes.",
    check_boundary: "I understand Review is not approval or Canonical Adoption.", builder_review_only: "This Human Review only prepares a Builder handoff.",
    no_apply_here: "Trainer does not apply changes to the Character.", prepare_handoff: "Prepare Builder handoff →", handoff_title: "Send change candidates to Builder",
    builder_apply_required: "The Character does not change until a human explicitly applies the changes in Builder.", stale_rule: "If the tested and current revisions differ, the result is STALE / APPLY_BLOCKED.",
    copy_candidate: "⧉ Copy candidate data", copy_human_summary: "⧉ Copy human summary", toggle_candidate: "Toggle Candidate details", send_builder: "Send change candidates to Builder",
    handoff_ready: "Builder handoff ready", not_applied: "Character updated: NO", evidence_note: "Original Response and Human assessment are retained separately.",
    no_evidence: "No Evidence yet", no_evidence_help: "Run a Test Run Pack and record the original response.", memory_boundary: "A Trainer Session is work evidence; it is not AMU Memory.",
    back: "← Back", next: "Next →", close: "Close",
    promote: "Human-review and activate", built_in: "Built-in", user_created: "User-created question draft", generated: "Unverified generated candidate", selected: "Selected", unselected: "Not selected",
    current: "Current", expected: "Expected", evidence: "Evidence", side_effect: "Side effect", unresolved: "Unresolved", no_candidate: "No Human-confirmed DIFFERENT item can become a change candidate.",
    select_for_builder: "Select for Builder handoff", status: "Status", character: "Character", revision: "revision", scope: "Scope", delete_confirm: "Delete only this Trainer Session?",
    step: "Step", results_count: "result(s)", candidates_count: "change candidate(s) · Human selection required", handoff_rejected: "Trainer handoff rejected",
    trainer_progress_aria: "Trainer verification progress", question_progress_aria: "Question progress", tuning_state_aria: "20-item Evidence contribution state",
    impact_comparison_aria: "Current, proposed, and effect comparison", evidence_pane_aria: "Trainer Evidence", progress_aria: "Progress", ui_language_aria: "Display language",
  },
});

let I18N = createI18n({}, { fallback: "en-US" });
let CHAR = null;
let SESSION = null;
let helpController = null;
let FIXTURES = {};
let currentView = "setup";
let handoffPayload = null;
let currentAttemptId = null;
let answerPhase = "DRAFT";
let sourceReviewMode = false;
let sourceReviewResultId = null;
let resultCursor = -1;
let meaningfulHistory = [];
let sessionReadOnly = false;

const localeCode = () => I18N.locale === "en-US" ? "en" : "ja";
const UX_COPY = Object.freeze({
  ja: Object.freeze({
    trying_character: "試すCharacter", history: "履歴・結果", session_details: "Sessionの進行詳細",
    other_settings: "その他の設定・保存済みSession", preflight_title: "開始前の確認", preflight_details: "確認項目の詳細",
    open_results: "結果の一覧を見る", build_pack: "AIに渡す内容を準備する", copy_test_pack: "AIに渡す内容をコピー",
    copy_full_pack: "⧉ AIに渡す内容をコピー", test_scope: "試す範囲", character_source: "試すCharacter",
    draft_status_empty: "外部AIの回答を貼り付けてください。貼り付けた内容はEvidenceになる前の下書きとして保存されます。",
    draft_status_saved: "回答を貼りました（下書き保存済み）。\nまだ結果は確定していません。\n次に『この回答を確認する』を選んでください。",
    draft_status_failed: "回答は画面に保持されていますが、下書きを保存できませんでした。内容を残したまま、もう一度お試しください。",
    confirm_answer: "この回答を確認する", answer_confirmed: "回答原文を記録しました。続けて、人として確認できた内容を入力してください。",
    human_check_title: "回答を人として確認する", human_check_intro: "回答原文を読み、期待どおりだった点と違いを確認します。技術的な判定名は補足として表示します。",
    required_explanation: "判定を保存するには、確認できた内容と理由・違いの両方が必要です。",
    observed_plain: "回答から確認できた内容（必須）", diff_plain: "その判定にした理由・期待との違い（必須）",
    save_result: "確認内容を保存して結果を見る", hold_plain: "根拠不足として未評価で保存する",
    source_review: "この質問と回答を見直す", return_result: "結果へ戻る", retest_question: "この質問を再テスト",
    next_question: "次の質問を試す", choose_question: "別の質問を選ぶ", history_prev: "前の結果", history_next: "次の結果",
    result_conclusion: "何が起きたか / 結論", result_good: "よかった点", result_attention: "要確認", result_reason: "理由",
    result_next: "次にできること", character_unchanged: "Characterはまだ変更されていません",
    no_candidate_result: "今回、Builderで確認する変更候補はありません。", record_details: "記録の詳細（Evidence）",
    expert_details: "Expert technical detail", selected_progress: "選んだ質問", preparing: "準備中", copying: "AIへ渡す内容を準備",
    awaiting_answer: "回答待ち", draft_saved_state: "回答確認中", human_check_state: "人による確認", result_state: "結果",
    legacy_session: "以前のSession記録です。曖昧な判定は未評価のまま、読み取り専用で保持しています。",
    generated_candidate_truth: "入力した質問を未確認候補として追加", question_only_warning: "質問だけをコピー（Characterの完全な検証文脈は含みません）",
    candidate_builder: "選んだ変更候補をBuilderで確認する", copy_success: "コピーしました。外部AIの新しい会話へ貼り付けてください。",
    missing_human_fields: "必須項目を入力してください。回答内容は保持されています。", no_next_question: "未完了の選択質問はありません。",
    add_generated_candidate: "入力した質問を未確認候補として追加", continue_trainer: "別の質問を選ぶ",
    copy_question_only: "⧉ 質問だけをコピー（完全なCharacter検証文脈は含みません）",
    answer_for_question: "回答する質問", answer_waiting: "回答を貼り付けてください。", answer_not_final: "貼り付けただけでは結果は確定しません。",
    assessment_state_plain: "この回答の結論", builder_handoff: "Builderへの引き継ぎ", change_candidates: "変更候補", change_candidates_if_any: "変更候補（対象がある場合のみ）",
    copy_pack_ready: "内容をコピーし、外部AIの新しい会話へ貼り付けてください。", current_question: "今回の質問", expert_evaluation: "判定用の詳細・Expert",
    expert_technical_detail: "Expert向け技術情報", human_check_help: "回答を読み、期待した内容と比べて人が判断してください。判断できない場合は未評価のまま残せます。",
    human_check_step: "人による確認", paste_response_title: "外部AIの回答を貼る", previous_responses: "この質問の以前の回答",
    required_when_assessed: "判定を記録する場合は必須です。", result_good_points: "よかった点", result_navigation: "この結果から移動",
    result_needs_review: "要確認", result_next_actions: "次にできること", review_source: "この質問と回答を見直す",
    save_human_check: "確認内容を保存して結果を見る", state_different: "違いがある", state_match: "期待どおり", state_not_assessed: "まだ判断しない", state_unknown: "判断できない",
    private_local: "非公開 · この端末内のみ", library_technical_details: "質問ライブラリの技術情報・Expert",
    preflight_ready: "準備完了", preflight_not_ready: "開始前の準備が必要です", preflight_choose_character: "試すCharacterを選ぶか、Character JSONを読み込んでください。", preflight_choose_requirements: "試す範囲と質問を確認し、少なくとも1つの質問を選んでください。必要なら下の確認項目の詳細を開けます。", preflight_ready_help: "試すCharacter・範囲・質問が揃いました。AIに渡す内容を準備できます。",
    content_ready: "この質問について、AIに渡す内容を準備しました。", training_summary_kicker: "確認結果の概要",
    character_updated: "Character更新", builder_review_status: "Builderでの確認", human_selection_status: "人による選択", status_no: "いいえ", status_required: "必要", status_done: "完了", status_not_assessed: "状態：未評価", state_invalid: "無効",
    label_expected: "期待した内容", label_observed: "回答から確認できたこと", label_diff: "期待との違い", label_candidate: "変更候補",
    definition_required: "未確定の質問ドラフトです。Expectedと人の確認基準が定義されるまで、検証には選べません。",
    user_question_draft_saved: "自作質問を未確定ドラフトとして保存しました。検証にはまだ選べません。",
    generated_question_draft_saved: "外部生成済みの質問候補を未確認ドラフトとして保存しました。検証にはまだ選べません。",
    select_candidate_first: "Builderへ送る変更候補を先に選んでください。",
    legacy_ambiguous: "以前の未評価記録（判断内容は推測しません）",
  }),
  en: Object.freeze({
    trying_character: "Character to test", history: "History / Results", session_details: "Session progress details",
    other_settings: "Other settings and saved Sessions", preflight_title: "Before you start", preflight_details: "Check details",
    open_results: "View result history", build_pack: "Prepare content for AI", copy_test_pack: "Copy content for AI",
    copy_full_pack: "⧉ Copy content for AI", test_scope: "Scope to test", character_source: "Character to test",
    draft_status_empty: "Paste the external AI response. It will be saved as a non-Evidence draft first.",
    draft_status_saved: "Answer pasted (draft saved).\nThe result is not final yet.\nNext, choose 'Review this answer'.",
    draft_status_failed: "The answer remains visible, but the draft could not be saved. Keep the text and try again.",
    confirm_answer: "Review this answer", answer_confirmed: "The original response was recorded. Next, enter what you can establish as a human reviewer.",
    human_check_title: "Check the answer as a human", human_check_intro: "Read the original response and record what matched expectations and what differed. Technical state names are secondary.",
    required_explanation: "Saving a judgement requires both what you observed and the reason or difference.",
    observed_plain: "What you could establish from the answer (required)", diff_plain: "Reason for the judgement / difference from expectation (required)",
    save_result: "Save this check and view the result", hold_plain: "Save as not assessed due to insufficient evidence",
    source_review: "Review this question and answer", return_result: "Return to result", retest_question: "Retest this question",
    next_question: "Try the next question", choose_question: "Choose another question", history_prev: "Previous result", history_next: "Next result",
    result_conclusion: "What happened / Conclusion", result_good: "Good points", result_attention: "Needs review", result_reason: "Reason",
    result_next: "What you can do next", character_unchanged: "The Character has not been changed.",
    no_candidate_result: "There are no change candidates to review in Builder this time.", record_details: "Record details (Evidence)",
    expert_details: "Expert technical detail", selected_progress: "Selected questions", preparing: "Preparing", copying: "Preparing AI content",
    awaiting_answer: "Waiting for answer", draft_saved_state: "Reviewing answer", human_check_state: "Human check", result_state: "Result",
    legacy_session: "This is a legacy Session. Ambiguous judgements remain not assessed and are preserved read-only.",
    generated_candidate_truth: "Add entered question as an unreviewed candidate", question_only_warning: "Copy question only (does not include the complete Character test context)",
    candidate_builder: "Review selected change candidates in Builder", copy_success: "Copied. Paste it into a fresh external-AI conversation.",
    missing_human_fields: "Complete the required fields. Your answer remains saved.", no_next_question: "There are no unfinished selected questions.",
    add_generated_candidate: "Add entered question as an unreviewed candidate", continue_trainer: "Choose another question",
    copy_question_only: "⧉ Copy question only (does not include the complete Character test context)",
    answer_for_question: "Question being answered", answer_waiting: "Paste the answer here.", answer_not_final: "Pasting alone does not finalize the result.",
    assessment_state_plain: "Conclusion for this answer", builder_handoff: "Builder handoff", change_candidates: "Change candidates", change_candidates_if_any: "Change candidates (only when eligible)",
    copy_pack_ready: "Copy the content and paste it into a fresh external-AI conversation.", current_question: "Current question", expert_evaluation: "Assessment details / Expert",
    expert_technical_detail: "Expert technical detail", human_check_help: "Read the answer and compare it with what was expected. If the evidence is insufficient, keep it not assessed.",
    human_check_step: "Human check", paste_response_title: "Paste the external AI answer", previous_responses: "Earlier responses for this question",
    required_when_assessed: "Required when recording a judgement.", result_good_points: "Good points", result_navigation: "Move from this result",
    result_needs_review: "Needs review", result_next_actions: "What you can do next", review_source: "Review this question and answer",
    save_human_check: "Save this check and view the result", state_different: "Different", state_match: "As expected", state_not_assessed: "Not assessed yet", state_unknown: "Cannot determine",
    private_local: "Private · Local only", library_technical_details: "Question-library technical details / Expert",
    preflight_ready: "Ready", preflight_not_ready: "Preparation required", preflight_choose_character: "Choose a Character to test or load Character JSON.", preflight_choose_requirements: "Confirm the scope and questions, then select at least one question. Open the check details below if needed.", preflight_ready_help: "The Character, scope, and questions are ready. You can prepare the content for AI.",
    content_ready: "The content for AI is ready for this question.", training_summary_kicker: "Review summary",
    character_updated: "Character updated", builder_review_status: "Builder review", human_selection_status: "Human selection", status_no: "No", status_required: "Required", status_done: "Done", status_not_assessed: "Status: Not assessed", state_invalid: "Invalid",
    label_expected: "Expected behavior", label_observed: "What the answer established", label_diff: "Difference from expectation", label_candidate: "Change candidate",
    definition_required: "Unfinalized question draft. It cannot be selected until Expected behavior and a Human review rubric are defined.",
    user_question_draft_saved: "Saved the user-created question as an unfinalized draft. It is not selectable yet.",
    generated_question_draft_saved: "Saved the externally generated question as an unverified draft. It is not selectable yet.",
    select_candidate_first: "Select at least one change candidate before Human Review.",
    legacy_ambiguous: "Legacy not-assessed record (no judgement is inferred)",
  }),
});
const tr = key => UX_COPY[localeCode()][key] || COPY[localeCode()][key] || UX_COPY.ja[key] || COPY.ja[key] || key;
const assessmentStateLabel = state => ({
  MATCH: tr("state_match"),
  DIFFERENT: tr("state_different"),
  UNKNOWN: tr("state_unknown"),
  NOT_ASSESSED: tr("state_not_assessed"),
  INVALID: tr("state_invalid"),
})[state] || state;
const assessmentStateToken = state => ["MATCH", "DIFFERENT", "UNKNOWN", "NOT_ASSESSED", "INVALID"].includes(state)
  ? state.toLowerCase()
  : "invalid";
const qText = (question, field = "prompt", fixedLanguage = null) => {
  const language = fixedLanguage || $("question_language")?.value || localeCode();
  const value = question?.[field] || {};
  return value[language] || value[language === "ja" ? "en" : "ja"] || "";
};
const displayName = () => CHAR?.identity?.display_name || CHAR?.identity?.character_id || "Unknown Character";
const selectedQuestions = () => (SESSION?.selected_question_ids || []).map(id => SESSION.questions.find(item => item.id === id)).filter(Boolean);
const currentQuestion = () => SESSION?.questions.find(item => item.id === SESSION.current_question_id) || selectedQuestions()[0] || null;
const scopedEvidence = () => evidenceForScope(SESSION);
const scopedAssessments = () => assessmentsForScope(SESSION);
const evidenceFor = questionId => scopedEvidence().filter(item => item.question_id === questionId);
const latestEvidence = questionId => evidenceFor(questionId).at(-1) || null;
const latestAssessment = questionId => scopedAssessments().filter(item => item.question_id === questionId).at(-1) || null;
const activeAttempt = () => attemptForId(SESSION, currentAttemptId || SESSION?.active_attempt_id);
const activeDraft = () => draftForAttempt(SESSION, activeAttempt()?.attempt_id);
const activeResult = () => resultForAttempt(SESSION, activeAttempt()?.attempt_id);
const resultsHistory = () => (SESSION?.result_history || []).filter(item => item.test_scope === SESSION?.test_scope);

function adoptSession(value) {
  const normalized = normalizeTrainerUx2Session(value);
  if (!normalized.ok) return normalized;
  SESSION = normalized.session;
  sessionReadOnly = Boolean(normalized.read_only);
  currentAttemptId = SESSION.active_attempt_id || null;
  return normalized;
}

function eligibleCandidates() {
  return eligibleBuilderCandidates(SESSION);
}

function nextUnfinishedQuestion(afterQuestionId = currentQuestion()?.id) {
  const entries = trainerQuestionQueueState(SESSION).entries || [];
  if (!entries.length) return null;
  const start = Math.max(-1, entries.findIndex(item => item.question_id === afterQuestionId));
  for (let offset = 1; offset <= entries.length; offset += 1) {
    const entry = entries[(start + offset) % entries.length];
    if (!entry.completed && entry.question_id !== afterQuestionId) {
      return SESSION.questions.find(item => item.id === entry.question_id) || null;
    }
  }
  return null;
}

function unfinishedAttemptMatchesCurrentContext(attempt, questionId) {
  if (!attempt || attempt.question_id !== questionId || attempt.result_id) return false;
  const question = SESSION.questions.find(item => item.id === questionId);
  if (!question || question.revision !== attempt.question_revision) return false;
  const locale = $("question_language").value;
  const executionPack = buildExecutionPack(SESSION, { locale, questionId });
  const evaluationPack = buildEvaluationPack(SESSION);
  return attempt.source_character_id === SESSION.source_character.character_id
    && String(attempt.source_character_revision) === String(SESSION.source_character.character_revision)
    && attempt.source_character_digest === SESSION.source_character.character_digest
    && attempt.test_scope === SESSION.test_scope
    && attempt.execution_mode === SESSION.execution_mode
    && attempt.locale === locale
    && attempt.execution_pack_digest === executionPack.digest
    && attempt.evaluation_pack_digest === evaluationPack.digest;
}

async function initI18n() {
  const packs = {};
  for (const code of ["ja-JP", "en-US"]) {
    try { packs[code] = await (await fetch(`./unified-v1/locales/${code}.json`)).json(); } catch { /* built-in copy remains complete */ }
  }
  I18N = createI18n(packs, { fallback: "en-US", initial: "ja-JP" });
}

function toast(message) {
  const element = $("toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2400);
}

function persistentStatus(id, message, state = "info") {
  const node = $(id);
  if (!node) return;
  node.dataset.state = state;
  node.textContent = message;
}

function setDraftStatus(kind) {
  const messages = {
    empty: tr("draft_status_empty"),
    saved: tr("draft_status_saved"),
    failed: tr("draft_status_failed"),
    confirmed: tr("answer_confirmed"),
  };
  persistentStatus("answer_draft_status", messages[kind] || messages.empty, kind === "failed" ? "error" : kind === "saved" || kind === "confirmed" ? "success" : "info");
}

async function copyText(value, button, message) {
  let success = false;
  try { await navigator.clipboard.writeText(String(value)); success = true; }
  catch {
    const helper = document.createElement("textarea");
    helper.value = String(value); helper.setAttribute("readonly", ""); helper.style.position = "fixed"; helper.style.opacity = "0";
    document.body.appendChild(helper); helper.select(); success = document.execCommand("copy"); helper.remove();
  }
  if (!success) { toast(localeCode() === "en" ? "Copy failed. Select the displayed text and copy it." : "コピーできませんでした。表示内容を選択してコピーしてください。"); return false; }
  if (button) {
    const original = button.textContent; button.classList.add("copied"); button.textContent = localeCode() === "en" ? "✓ Copied" : "✓ コピーしました";
    setTimeout(() => { button.classList.remove("copied"); button.textContent = original; }, 1600);
  }
  toast(message || (localeCode() === "en" ? "✓ Copied" : "✓ コピーしました"));
  return true;
}

function applyLocaleLabels() {
  document.documentElement.lang = localeCode();
  for (const node of document.querySelectorAll("[data-tr]")) node.textContent = tr(node.dataset.tr);
  for (const node of document.querySelectorAll("[data-tr-placeholder]")) node.placeholder = tr(node.dataset.trPlaceholder);
  for (const node of document.querySelectorAll("[data-tr-aria]")) node.setAttribute("aria-label", tr(node.dataset.trAria));
  for (const button of document.querySelectorAll(".saku-help-btn[data-help]")) {
    const key = button.dataset.help;
    button.setAttribute("aria-label", `${I18N.t("ui.help_for") || "Help"}: ${I18N.t(`label.${key}`) || key}`);
    button.setAttribute("title", I18N.t("ui.help") || "Help");
  }
  helpController?.close?.();
  renderScopeOptions();
  renderAll();
  renderCharacterIdentity();
}

function mountHelp() {
  document.querySelectorAll("[data-help-key]").forEach(heading => {
    const key = heading.dataset.helpKey;
    if (HELP_FIELDS.includes(key) && !heading.querySelector(".saku-help-btn")) heading.insertAdjacentHTML("afterbegin", `${helpButtonHTML(I18N, key)} `);
  });
  helpController = attachHelp(document.body, I18N);
}

function aboutBody() {
  const boundary = localeCode() === "en"
    ? "Trainer preserves Evidence and prepares Human-selected change candidates. It is not an editor, Authority, approval system, or Canonical mutation engine."
    : "TrainerはEvidenceを保持し、人が選択した変更候補を準備します。編集・Authority・承認・Canonical更新を行う機能ではありません。";
  return `<p>${esc(boundary)}</p><ul><li><b>Code:</b> MPL-2.0</li><li><b>Docs:</b> CC BY 4.0</li><li><b>Contract:</b> saku.trainer.frozen-ia@1</li></ul>`;
}

function persist() {
  if (!SESSION) return { ok: false, code: "NO_CURRENT_SESSION" };
  if (sessionReadOnly) {
    const code = "LEGACY_SESSION_READ_ONLY";
    toast(`${code} — ${tr("legacy_session")}`);
    return { ok: false, code };
  }
  const attemptedSessionId = SESSION.session_id;
  const saved = saveSession(localStorage, SESSION);
  if (saved.ok) SESSION = saved.session;
  else {
    const authoritative = loadSession(localStorage, attemptedSessionId);
    if (authoritative.ok) SESSION = authoritative.session;
    toast(`${saved.code} — ${localeCode() === "en" ? "The Session change was not stored; the latest saved state was restored." : "Session変更を保存できなかったため、最後に保存済みの状態へ戻しました。"}`);
  }
  renderSessionList();
  return saved;
}


function persistAnswerState(nextSession, retainedText, failureStatus = "failed") {
  const previous = SESSION;
  SESSION = nextSession;
  const saved = persist();
  if (!saved.ok) {
    // persist() restores the authoritative Session; the user's unsaved answer
    // remains in the textarea so a storage failure never destroys their work.
    if ($("answer_input")) $("answer_input").value = retainedText;
    if (failureStatus) setDraftStatus(failureStatus);
    if (!SESSION) SESSION = previous;
  }
  return saved;
}

function renderScopeOptions() {
  const scope = $("test_scope");
  if (!scope) return;
  const selected = SESSION?.test_scope || scope.value || "FULL_CHARACTER";
  scope.replaceChildren(...TEST_SCOPES.map(item => new Option(localeCode() === "en" ? item.en : item.ja, item.id, false, item.id === selected)));
  const mode = $("execution_mode");
  if (mode) for (const option of mode.options) {
    const item = EXECUTION_MODES.find(value => value.id === option.value);
    option.textContent = item ? `${item.id} — ${localeCode() === "en" ? item.en : item.ja}` : option.value;
  }
}

function renderSessionList() {
  const select = $("saved_session");
  if (!select) return;
  const selected = select.value;
  select.replaceChildren(new Option(tr("new_session"), ""));
  for (const item of listSessions(localStorage)) {
    select.add(new Option(`${item.character_id} / ${item.revision} / ${item.scope} / ${item.updated_at.slice(0, 16)}`, item.session_id));
  }
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
  else if (SESSION && [...select.options].some(option => option.value === SESSION.session_id)) select.value = SESSION.session_id;
}

function resetHandoffUi() {
  handoffPayload = null;
  document.querySelectorAll(".review_check").forEach(box => { box.checked = false; });
  if ($("candout")) $("candout").textContent = "";
  if ($("engine_candout")) {
    $("engine_candout").textContent = "";
    $("engine_candout").hidden = true;
  }
  if ($("btn_to_export")) $("btn_to_export").disabled = true;
}

function clearStoredBuilderLinksForCurrentSession(reason = "TRAINER_SESSION_CHANGED") {
  if (!SESSION?.session_id) return true;
  const invalidated = invalidateSessionBuilderHandoff(localStorage, SESSION, reason);
  if (!invalidated.ok) {
    toast(`${invalidated.code} — ${localeCode() === "en" ? "The current Trainer handoff could not be invalidated, so this change was blocked." : "現在のTrainer handoffを無効化できないため、この変更を停止しました。"}`);
    return false;
  }
  SESSION = invalidated.session;
  return true;
}

function invalidateExecutionConfiguration(reason = "TRAINER_EXECUTION_CONFIGURATION_CHANGED") {
  if (!SESSION) return false;
  if (!clearStoredBuilderLinksForCurrentSession(reason)) return false;
  SESSION.execution_pack = null;
  SESSION.evaluation_pack = null;
  SESSION.change_candidates = [];
  SESSION.human_review = { state: "NOT_STARTED", reviewed_candidate_ids: [] };
  SESSION.builder_handoff = { state: "NOT_SENT", handoff_id: null };
  SESSION.state = "DRAFT";
  resetHandoffUi();
  return true;
}

function rejectCharacter(errors = []) {
  const detail = errors.filter(Boolean).join("; ") || "UNKNOWN";
  $("who").textContent = localeCode() === "en"
    ? `Character rejected. Only the adopted Unified V1 Character is accepted. ${detail}`
    : `Characterを読み込めません。採択済みUnified V1 Characterだけを受け付けます。${detail}`;
  toast(localeCode() === "en" ? "Character rejected (Unified V1 required)." : "Characterを拒否しました（Unified V1必須）。");
  return false;
}

function renderCharacterIdentity() {
  if (!CHAR) return;
  const identity = CHAR.identity || {};
  const active = ActiveSaku.getActive();
  const isCurrent = active?.identity?.character_id === identity.character_id;
  const loadedLabel = localeCode() === "en" ? "Loaded" : "読み込み";
  const currentLabel = localeCode() === "en" ? "Current SAKU" : "現在のSAKU";
  const privateLabel = localeCode() === "en" ? "Private session" : "非公開Session";
  $("who").textContent = `${isCurrent ? currentLabel : loadedLabel}: ${displayName()} / ${identity.character_id || "?"} / ${identity.character_revision || "?"}`;
  $("header_ref").textContent = `${isCurrent ? `${currentLabel} · ` : ""}${identity.character_id || privateLabel} · ${identity.character_revision || "UNKNOWN"}`;
  $("header_name").textContent = displayName();
  $("progress_character").textContent = displayName();
  const picker = $("pick");
  if (picker && identity.character_id && ![...picker.options].some(option => option.value === identity.character_id)) {
    picker.add(new Option(`${currentLabel}: ${displayName()}`, identity.character_id));
  }
  if (picker && [...picker.options].some(option => option.value === identity.character_id)) picker.value = identity.character_id;
}

function loadChar(character, { resume = true, activeSource = "" } = {}) {
  const validation = validateUnifiedV1(character);
  if (!validation.ok) return rejectCharacter(validation.errors);
  if (!clearStoredBuilderLinksForCurrentSession("TRAINER_CHARACTER_REPLACED")) return false;
  resetHandoffUi();
  CHAR = clone(character);
  if (activeSource) ActiveSaku.setActive(CHAR, { source: activeSource });
  let loaded = resume ? loadSession(localStorage) : { ok: false };
  if (!loaded.ok || loaded.session.source_character.character_id !== (CHAR?.identity?.character_id || "")
    || loaded.session.source_character.character_revision !== String(CHAR?.identity?.character_revision || "")
    || loaded.session.source_character.character_digest !== contentDigest(CHAR)) {
    const created = createSession(CHAR, { platform: $("platform")?.value || "generic" });
    const saved = saveSession(localStorage, created);
    if (!saved.ok) {
      $("who").textContent = `${saved.code} — ${localeCode() === "en" ? "The Trainer Session could not be stored." : "Trainer Sessionを保存できませんでした。"}`;
      SESSION = null;
      renderAll();
      return false;
    }
    adoptSession(saved.session);
  } else adoptSession(loaded.session);
  $("test_scope").value = SESSION.test_scope;
  $("execution_mode").value = SESSION.execution_mode;
  $("platform").value = SESSION.runtime_test_context.platform || "generic";
  renderCharacterIdentity();
  renderAll();
  return true;
}

async function loadFixtures() {
  const select = $("pick");
  select.replaceChildren(new Option(localeCode() === "en" ? "No bundled Unified V1 Character" : "同梱Unified V1 Characterなし", ""));
  try {
    const sample = await (await fetch("./unified-v1/sample-pack/sample-characters.json")).json();
    for (const character of sample.characters || []) {
      if (!validateUnifiedV1(character).ok) continue;
      FIXTURES[character.identity.character_id] = character;
      if (select.options.length === 1 && !select.options[0].value) select.replaceChildren();
      select.add(new Option(`Sample: ${character.identity.display_name}`, character.identity.character_id));
    }
  } catch { /* Active SAKU or paste remains available */ }
  try {
    const fixtures = await (await fetch("./unified-v1/fixtures/characters.json")).json();
    for (const [id, character] of Object.entries(fixtures)) {
      if (id.startsWith("_") || !validateUnifiedV1(character).ok) continue;
      FIXTURES[id] = character;
      if (select.options.length === 1 && !select.options[0].value) select.replaceChildren();
      select.add(new Option(`${character.identity.display_name || id} (${id})`, id));
    }
  } catch { /* paste remains available */ }

  const handoff = consumeHandoff(localStorage, "trainer", { character_id: requestedCharacterId, character_revision: requestedCharacterRevision });
  if (requestedCharacterId && handoff.status === "EMPTY") { $("who").textContent = localeCode() === "en" ? `Character handoff is missing for ${requestedCharacterId}. Return to Viewer.` : `${requestedCharacterId} のCharacter handoffがありません。Viewerから選択し直してください。`; renderAll(); return; }
  if (handoff.status === "REJECTED") { $("who").textContent = `${tr("handoff_rejected")} (${handoff.reason}).`; renderAll(); return; }
  if (handoff.status === "ACCEPTED") {
    if (!loadChar(handoff.character, { activeSource: "trainer-handoff" })) return;
    if ([...select.options].some(option => option.value === handoff.character_id)) select.value = handoff.character_id;
    return;
  }
  const working = ActiveSaku.getWorkingCharacter();
  if (working?.identity?.character_id) { loadChar(working); if ([...select.options].some(option => option.value === working.identity.character_id)) select.value = working.identity.character_id; return; }
  if (reviewRouteRequested) { $("who").textContent = localeCode() === "en" ? "No Character is selected for Review." : "ReviewするCharacterが選択されていません。"; renderAll(); return; }
  const first = Object.keys(FIXTURES)[0];
  if (first) { select.value = first; loadChar(FIXTURES[first], { resume: false }); }
  else { $("who").textContent = localeCode() === "en" ? "Load an Active SAKU or paste Character JSON." : "Active SAKUを開くかCharacter JSONを貼り付けてください。"; renderAll(); }
}

function flowStateLabel(name = currentView) {
  return ({ setup: tr("preparing"), prompt: tr("copying"), answer: answerPhase === "SOURCE_REVIEW" ? tr("source_review") : activeDraft() ? tr("draft_saved_state") : tr("awaiting_answer"), evaluation: tr("human_check_state"), round_summary: tr("result_state"), results: tr("history"), impact: tr("candidate_builder"), review: tr("human_review"), export: tr("handoff_title") })[name] || name;
}

function updateQuestionOrientation() {
  const selected = selectedQuestions();
  const index = Math.max(0, selected.findIndex(item => item.id === currentQuestion()?.id));
  const current = selected.length ? index + 1 : 0;
  const label = `${tr("selected_progress")} ${current}/${selected.length}`;
  if ($("selected_question_progress")) $("selected_question_progress").textContent = label;
  if ($("mobile_progress")) $("mobile_progress").textContent = label;
  if ($("mobile_step")) $("mobile_step").textContent = `${label} · ${flowStateLabel()}`;
  if ($("current_flow_state")) $("current_flow_state").textContent = flowStateLabel();
}

function showView(name, { remember = true } = {}) {
  if (!allViewNames.includes(name)) return;
  if (remember && currentView !== name && allViewNames.includes(currentView)) meaningfulHistory.push(currentView);
  currentView = name;
  for (const view of allViewNames) $("view_" + view).hidden = view !== name;
  if ($("mobile_next")) { $("mobile_next").hidden = true; $("mobile_next").disabled = true; }
  updateQuestionOrientation();
  $("main-work").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
  renderAll();
}

function activateQuestion(questionId, { retestOf = null, reuseUnfinished = true } = {}) {
  if (!SESSION || !questionId) return false;
  if (sessionReadOnly) { toast(tr("legacy_session")); return false; }
  const existing = reuseUnfinished && !retestOf
    ? [...(SESSION.attempts || [])].reverse().find(item => unfinishedAttemptMatchesCurrentContext(item, questionId))
    : null;
  if (existing) {
    const next = clone(SESSION);
    next.current_question_id = questionId;
    next.active_attempt_id = existing.attempt_id;
    next.execution_pack = clone(existing.execution_pack_snapshot);
    next.evaluation_pack = clone(existing.evaluation_pack_snapshot);
    SESSION = next;
    currentAttemptId = existing.attempt_id;
  } else {
    const started = beginQuestionAttempt(SESSION, { questionId, retestOf, locale: $("question_language").value });
    if (!started.ok) { toast(started.code); renderPreflight(); return false; }
    SESSION = started.session;
    currentAttemptId = started.attempt.attempt_id;
  }
  if (!persist().ok) { currentAttemptId = SESSION?.active_attempt_id || null; renderAll(); return false; }
  return true;
}

function renderQuestions() {
  const host = $("question_list");
  if (!host || !SESSION) return;
  host.replaceChildren();
  for (const question of SESSION.questions) {
    const row = document.createElement("article"); row.className = `question-choice ${question.selectable ? "" : "pending"}`;
    const label = document.createElement("label");
    const box = document.createElement("input"); box.type = "checkbox"; box.value = question.id; box.checked = SESSION.selected_question_ids.includes(question.id); box.disabled = !question.selectable || sessionReadOnly;
    box.addEventListener("change", () => {
      const ids = box.checked
        ? [...SESSION.selected_question_ids.filter(id => id !== question.id), question.id]
        : SESSION.selected_question_ids.filter(id => id !== question.id);
      if (!clearStoredBuilderLinksForCurrentSession("TRAINER_QUESTION_SELECTION_CHANGED")) { renderAll(); return; }
      const result = selectQuestions(SESSION, ids); if (result.ok) {
        SESSION = result.session; resetHandoffUi(); persist(); renderAll();
      }
    });
    const body = document.createElement("span");
    const sourceName = question.source === QUESTION_SOURCES.BUILT_IN ? tr("built_in") : question.source === QUESTION_SOURCES.USER_CREATED ? tr("user_created") : tr("generated");
    body.innerHTML = `<strong>${esc(question.id)} · ${esc(question.category)}</strong><span>${esc(qText(question))}</span><small>${esc(sourceName)}</small>${question.selectable ? "" : `<small class="question-definition-required">${esc(tr("definition_required"))}</small>`}`;
    label.append(box, body); row.append(label);
    host.append(row);
  }
  $("question_library_status").textContent = `${tr("selected_progress")} ${SESSION.selected_question_ids.length}`;
}

function renderPreflight() {
  if (!SESSION) {
    $("preflight_status").textContent = tr("preflight_not_ready");
    $("preflight_status").className = "blocked";
    persistentStatus("preflight_recovery", tr("preflight_choose_character"), "error");
    $("btn_start").disabled = true;
    return;
  }
  if (sessionReadOnly) {
    $("preflight_status").textContent = localeCode() === "en" ? "LEGACY · READ ONLY" : "旧Session · 読み取り専用";
    $("preflight_status").className = "blocked";
    persistentStatus("preflight_recovery", tr("legacy_session"), "error");
    $("preflight_checks").innerHTML = `<li class="blocked"><span>!</span>${esc(tr("legacy_session"))}</li>`;
    $("btn_start").disabled = true;
    return;
  }
  const gate = preflight(SESSION, { locale: $("question_language").value, questionId: SESSION.current_question_id });
  $("preflight_status").textContent = gate.ok ? tr("preflight_ready") : tr("preflight_not_ready");
  $("preflight_status").className = gate.ok ? "pass" : "blocked";
  persistentStatus("preflight_recovery", gate.ok ? tr("preflight_ready_help") : tr("preflight_choose_requirements"), gate.ok ? "success" : "error");
  $("preflight_checks").innerHTML = gate.checks.map(item => `<li class="${item.pass ? "pass" : "blocked"}"><span>${item.pass ? "✓" : "×"}</span>${esc(item.id)}</li>`).join("");
  $("btn_start").disabled = !gate.ok;
}

function renderPrompt() {
  if (!SESSION) return;
  const attempt = activeAttempt();
  const question = attempt?.question_snapshot || currentQuestion();
  const pack = attempt?.execution_pack_snapshot || (validateFinalizedPacks(SESSION, question?.id).ok
    ? SESSION.execution_pack
    : buildExecutionPack(SESSION, { locale: $("question_language").value, questionId: question?.id }));
  $("promptout").textContent = pack.plain_text;
  $("evaluation_packout").textContent = JSON.stringify(attempt?.evaluation_pack_snapshot || SESSION.evaluation_pack || buildEvaluationPack(SESSION), null, 2);
  $("current_question").textContent = question ? (attempt?.rendered_prompt || qText(question, "prompt", attempt?.locale)) : "NOT_SELECTED";
  $("question_source").textContent = question ? (question.source === QUESTION_SOURCES.BUILT_IN ? tr("built_in") : question.source === QUESTION_SOURCES.USER_CREATED ? tr("user_created") : tr("generated")) : tr("preparing");
  $("question_focus").textContent = question ? `${question.category} · ${question.id}` : "NOT_SELECTED";
  $("prompt_meta").textContent = tr("content_ready");
  $("prompt_technical_meta").textContent = `${SESSION.execution_mode} · ${SESSION.test_scope} · ${pack.source_character_digest}`;
  const next = nextUnfinishedQuestion(question?.id);
  $("btn_regenerate").hidden = !next;
  $("btn_regenerate").disabled = !next;
  persistentStatus("copy_pack_status", localeCode() === "en" ? "Copy the complete content, then obtain an answer in a fresh external-AI conversation." : "完全な内容をコピーし、外部AIの新しい会話で回答を取得してください。", "info");
}

function renderAnswer() {
  const result = sourceReviewMode ? (SESSION?.result_history || []).find(item => item.result_id === sourceReviewResultId) : null;
  const attempt = result ? attemptForId(SESSION, result.attempt_id) : activeAttempt();
  const question = attempt?.question_snapshot || currentQuestion();
  if (!question || !attempt) return;
  currentAttemptId = attempt.attempt_id;
  $("answer_question_id").textContent = question.id;
  if ($("answer_question_text")) $("answer_question_text").textContent = attempt.rendered_prompt || qText(question, "prompt", attempt.locale);
  if ($("answer_attempt_label")) $("answer_attempt_label").textContent = `${localeCode() === "en" ? "Attempt" : "試行"} ${attempt.attempt_ordinal} · ${attempt.attempt_id}`;
  $("current_rubric").textContent = `${localeCode() === "en" ? "Expected" : "Expected"}: ${qText(question, "expected", attempt.locale)}\n${localeCode() === "en" ? "Human rubric" : "人のRubric"}: ${qText(question, "rubric", attempt.locale)}`;
  const evidence = evidenceFor(question.id);
  $("evidence_history").innerHTML = evidence.length
    ? evidence.map(item => `<article><strong>${esc(item.evidence_id)}</strong><small>${esc(item.correction_of ? `correction of ${item.correction_of}` : "original")}</small><pre>${esc(item.original_response)}</pre></article>`).join("")
    : `<p class="small-muted">${esc(tr("no_evidence"))}</p>`;
  const assessment = attempt.assessment_id ? SESSION.assessments.find(item => item.assessment_id === attempt.assessment_id) : null;
  const boundEvidence = attempt.evidence_id ? SESSION.evidence.find(item => item.evidence_id === attempt.evidence_id) : null;
  const draft = attempt.response_draft;
  if ($("answer_input").dataset.attemptId !== attempt.attempt_id || sourceReviewMode) {
    $("answer_input").dataset.questionId = question.id;
    $("answer_input").dataset.attemptId = attempt.attempt_id;
    $("answer_input").value = boundEvidence?.original_response ?? draft?.original_response ?? "";
    $("summary_input").value = SESSION.summaries.findLast(item => item.evidence_id === boundEvidence?.evidence_id)?.summary || "";
    $("assessment_state").value = assessment?.state || "NOT_ASSESSED";
    $("observed_input").value = assessment && assessment.observed !== "NOT_ASSESSED" ? assessment.observed : "";
    $("diff_input").value = assessment && assessment.diff !== "NOT_ASSESSED" ? assessment.diff : "";
  }
  answerPhase = sourceReviewMode ? "SOURCE_REVIEW" : draft ? "DRAFT_SAVED" : "DRAFT";
  $("answer_input").readOnly = sourceReviewMode || Boolean(boundEvidence);
  $("btn_paste").hidden = sourceReviewMode || Boolean(boundEvidence);
  $("btn_clear_answer").hidden = sourceReviewMode || Boolean(boundEvidence);
  $("btn_confirm_answer").hidden = sourceReviewMode || Boolean(boundEvidence);
  $("btn_confirm_answer").disabled = !draft || draft.state !== "DRAFT_SAVED_NOT_EVIDENCE";
  $("btn_return_result").hidden = !sourceReviewMode;
  $("btn_return_result").className = sourceReviewMode ? "primary" : "secondary";
  $("btn_add_correction").hidden = !attempt.result_id;
  $("btn_add_correction").textContent = tr("retest_question");
  if (sourceReviewMode) persistentStatus("answer_draft_status", localeCode() === "en" ? "Exact saved question, Original Response, and attempt. Evidence remains unchanged." : "保存済みの元質問・回答原文・試行を表示しています。Evidenceは変更されません。", "info");
  else if (boundEvidence) setDraftStatus("confirmed");
  else setDraftStatus(draft ? "saved" : "empty");
  updateQuestionOrientation();
}

function renderEvaluation() {
  const attempt = activeAttempt();
  const question = attempt?.question_snapshot || currentQuestion();
  const assessment = attempt?.assessment_id ? SESSION.assessments.find(item => item.assessment_id === attempt.assessment_id) : null;
  const completed = Boolean(attempt?.result_id);
  for (const id of ["assessment_state", "observed_input", "diff_input", "summary_input"]) $(id).disabled = completed;
  $("btn_evaluate").hidden = completed;
  $("btn_hold_unknown").hidden = completed;
  if (!assessment) { $("evaluation_cards").innerHTML = `<article class="observation-card unknown"><h4>${esc(localeCode() === "en" ? "Human check not saved" : "人による確認は未保存です")}</h4><p>${esc(tr("not_assessed_rule"))}</p></article>`; return; }
  const evidence = SESSION.evidence.find(item => item.evidence_id === assessment.evidence_reference);
  $("evaluation_cards").innerHTML = `<article class="observation-card ${assessmentStateToken(assessment.state)}">
    <div class="obs-top"><span class="kind-label"><b>${assessment.state === "DIFFERENT" ? "!" : assessment.state === "MATCH" ? "●" : "—"}</b>${esc(assessment.state)}</span><span class="kind-code">HUMAN REVIEW</span></div>
    <h4>${esc(question.id)} · ${esc(question.category)}</h4>
    <dl class="assessment-detail"><dt>Expected</dt><dd>${esc(qText(question, "expected", attempt?.locale))}</dd><dt>Observed</dt><dd>${esc(assessment.observed)}</dd><dt>Diff</dt><dd>${esc(assessment.diff)}</dd><dt>Evidence</dt><dd>${esc(evidence?.evidence_id || "NOT_AVAILABLE")}</dd></dl>
    <p class="small-muted">${esc(localeCode() === "en" ? "A response existing is not by itself an Observed result." : "回答が存在するだけではObservedを確定しません。")}</p></article>`;
}

function summaryBlock(title, items) {
  const values = items.length ? items : [localeCode() === "en" ? "None" : "該当なし"];
  return `<section class="summary-block"><h3>${esc(title)}</h3><ul>${values.map(item => `<li>${esc(item)}</li>`).join("")}</ul></section>`;
}

function renderRoundSummary() {
  const attempt = activeAttempt();
  const result = attempt ? resultForAttempt(SESSION, attempt.attempt_id) : null;
  const question = result?.question_snapshot || attempt?.question_snapshot || currentQuestion();
  const assessment = result?.assessment_snapshot || (attempt?.assessment_id ? SESSION.assessments.find(item => item.assessment_id === attempt.assessment_id) : null);
  if (!attempt || !result || !assessment) return;
  resultCursor = Math.max(0, resultsHistory().findIndex(item => item.result_id === result.result_id));
  const conclusion = ({
    MATCH: localeCode() === "en" ? "The response matched the expected behavior in the recorded Human check." : "人による確認では、回答は期待した動作と一致しました。",
    DIFFERENT: localeCode() === "en" ? "The response differed from the expected behavior and needs review." : "回答には期待した動作との違いがあり、確認が必要です。",
    UNKNOWN: localeCode() === "en" ? "The available response was not enough to determine the outcome." : "この回答だけでは結論を判断できませんでした。",
    NOT_ASSESSED: localeCode() === "en" ? "The response is preserved, but the result remains not assessed." : "回答は保存されていますが、結果は未評価です。",
    INVALID: localeCode() === "en" ? "The result is invalid and cannot be treated as an assessment." : "結果は無効で、評価として扱えません。",
  })[assessment.state] || assessment.state;
  $("result_conclusion").innerHTML = `<p><strong>${esc(conclusion)}</strong></p><p class="result-state-label">${esc(assessmentStateLabel(assessment.state))}</p>`;
  $("result_good_points").innerHTML = assessment.state === "MATCH"
    ? `<p>${esc(assessment.observed)}</p>`
    : `<p>${esc(localeCode() === "en" ? "The Original Response and Human observation were preserved without changing the Character." : "回答原文と人による確認内容を、Characterを変更せず保存しました。")}</p>`;
  $("result_needs_review").innerHTML = assessment.state === "MATCH"
    ? `<p>${esc(localeCode() === "en" ? "No recorded difference requires action. Retest if more evidence is needed." : "記録された差分はありません。追加Evidenceが必要なら再テストできます。")}</p>`
    : `<p>${esc(assessment.diff || assessment.not_assessed_reason || tr("not_assessed_rule"))}</p>`;
  $("result_reason").innerHTML = `<p>${esc(assessment.diff || assessment.not_assessed_reason || tr("not_assessed_rule"))}</p>`;
  const next = nextUnfinishedQuestion(question?.id);
  $("result_next_actions").innerHTML = `<p>${esc(next ? (localeCode() === "en" ? `Next unfinished question: ${qText(next)}` : `次の未完了質問：${qText(next)}`) : tr("no_next_question"))}</p>`;
  $("round_summary_grid").innerHTML = [
    summaryBlock("Expected", question ? [qText(question, "expected", attempt.locale)] : []),
    summaryBlock("Observed", assessment ? [assessment.observed] : []),
    summaryBlock("Diff", assessment ? [assessment.diff] : []),
    summaryBlock(tr("record_details"), assessment?.evidence_reference ? [`${assessment.evidence_reference} · ${attempt.attempt_id}`] : []),
  ].join("");
  $("next_recommendation").textContent = next ? `${next.id}: ${qText(next)}` : tr("no_next_question");
  $("btn_next_question").hidden = !next;
  $("btn_next_question").disabled = !next;
  $("btn_choose_question").className = next ? "secondary" : "primary";
  const candidates = eligibleCandidates().filter(item => item.ASSESSMENT_ID === assessment.assessment_id);
  const candidateHost = $("result_change_candidates");
  const oldAction = $("result_open_candidates"); if (oldAction) oldAction.remove();
  $("no_candidate_message").textContent = candidates.length
    ? (localeCode() === "en" ? `${candidates.length} Human-reviewed change candidate(s) are available.` : `${candidates.length}件の変更候補をBuilderで確認できます。`)
    : tr("no_candidate_result");
  if (candidates.length) {
    const action = document.createElement("button"); action.id = "result_open_candidates"; action.className = "secondary"; action.textContent = tr("candidate_builder");
    action.addEventListener("click", () => showView("impact")); candidateHost.append(action);
  }
  const history = resultsHistory();
  $("result_history_position").textContent = `${resultCursor + 1}/${history.length}`;
  $("btn_history_prev").disabled = resultCursor <= 0;
  $("btn_history_next").disabled = resultCursor < 0 || resultCursor >= history.length - 1;
  updateQuestionOrientation();
}

function renderProgress() {
  const host = $("round_list"); if (!host || !SESSION) return;
  const selected = selectedQuestions();
  const queue = trainerQuestionQueueState(SESSION);
  host.innerHTML = selected.map((question, index) => {
    const entry = queue.entries.find(item => item.question_id === question.id);
    const attempt = attemptForId(SESSION, entry?.attempt_id); const done = Boolean(entry?.completed); const active = question.id === currentQuestion()?.id;
    const state = done ? tr("result_state") : attempt?.evidence_id ? tr("human_check_state") : attempt?.response_draft ? tr("draft_saved_state") : attempt ? tr("awaiting_answer") : tr("preparing");
    return `<button class="round-item ${done ? "done" : ""} ${active ? "active" : ""}" data-question-id="${esc(question.id)}" data-attempt-id="${esc(attempt?.attempt_id || "")}" aria-current="${active ? "step" : "false"}"><span>${done ? "✓" : active ? "●" : "○"}</span><b>Q${index + 1} · ${esc(question.id)}</b><small>${esc(state)}</small></button>`;
  }).join("");
  host.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
    const existing = attemptForId(SESSION, button.dataset.attemptId);
    if (existing?.result_id) {
      currentAttemptId = existing.attempt_id; SESSION.current_question_id = existing.question_id; SESSION.active_attempt_id = existing.attempt_id;
      resultCursor = resultsHistory().findIndex(item => item.result_id === existing.result_id);
      showView("round_summary"); return;
    }
    if (!activateQuestion(button.dataset.questionId)) return;
    const attempt = activeAttempt();
    showView(attempt?.evidence_id ? "evaluation" : attempt?.response_draft ? "answer" : "prompt");
  }));
  const assessed = queue.entries.filter(item => item.completed);
  $("confirmed_areas").innerHTML = (assessed.length ? assessed.map(item => `${item.question_id} · ${resultForAttempt(SESSION, item.attempt_id)?.state || "NOT_ASSESSED"}`) : [tr("none_yet")]).map(item => `<li>${esc(item)}</li>`).join("");
  const completedIds = new Set(assessed.map(item => item.question_id));
  const pending = selected.filter(question => !completedIds.has(question.id));
  $("unknown_areas").innerHTML = (pending.length ? pending.map(item => item.id) : [tr("none_yet")]).map(item => `<li>${esc(item)}</li>`).join("");
  $("left_contradictions").textContent = String(scopedAssessments().filter(item => item.state === "DIFFERENT").length);
  $("btn_finish").disabled = !resultsHistory().length;
  $("notebook_round").textContent = currentQuestion()?.id || "Q 0";
  updateQuestionOrientation();
}

function renderNotebook() {
  const evidence = scopedEvidence();
  const evidenceIds = new Set(evidence.map(item => item.evidence_id));
  if (!evidence.length) {
    $("notebook_body").className = "notebook-empty";
    $("notebook_body").innerHTML = `<strong>${esc(tr("no_evidence"))}</strong><p>${esc(tr("no_evidence_help"))}</p><small>Status: NOT_ASSESSED</small>`;
    return;
  }
  $("notebook_body").className = "";
  $("notebook_body").innerHTML = `<div class="evidence-counts"><h3>Evidence</h3><div><span>●</span><label>Original</label><b>${evidence.filter(item => !item.correction_of).length}</b></div><div><span>↳</span><label>Corrections</label><b>${evidence.filter(item => item.correction_of).length}</b></div><div><span>◇</span><label>Summaries ≠ Evidence</label><b>${SESSION.summaries.filter(item => evidenceIds.has(item.evidence_id)).length}</b></div></div>`;
}

function renderTrainingSummary() {
  if (!SESSION) return;
  const results = scopedAssessments();
  const byState = state => results.filter(item => item.state === state).map(item => `${item.question_id}: ${item.diff}`);
  $("training_summary_blocks").innerHTML = [
    summaryBlock("MATCH", byState("MATCH")), summaryBlock("DIFFERENT", byState("DIFFERENT")),
    summaryBlock("UNKNOWN", byState("UNKNOWN")), summaryBlock("NOT_ASSESSED", byState("NOT_ASSESSED")),
  ].join("");
  const states = ["MATCH", "DIFFERENT", "UNKNOWN", "NOT_ASSESSED", "INVALID"];
  $("quality_grid").innerHTML = states.map(state => `<div><span>${state}</span><strong>${results.filter(item => item.state === state).length}</strong></div>`).join("");
}

function renderTuningState() {
  const host = $("tuning_state"); if (!host || !SESSION) return;
  const rows = tuningEvidenceState(SESSION);
  host.innerHTML = `<h3>${localeCode() === "en" ? "20-item Evidence contribution" : "20項目のEvidence contribution"}</h3><p class="small-muted">${localeCode() === "en" ? "One response is a contribution, not a completed measurement. T19 requires Catalog evidence." : "1回答はcontributionであり測定完了ではありません。T19にはCatalog Evidenceが必要です。"}</p><table class="tuning-state-table"><thead><tr><th>ID</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${rows.map(item => `<tr><td>${item.item_id}</td><td>${item.measurement_state}</td><td>${item.contribution_count}${item.catalog_evidence_required ? ` / Catalog ${item.catalog_evidence_present ? "YES" : "NO"}` : ""}</td></tr>`).join("")}</tbody></table>`;
}

function renderReviewResults() {
  if (!SESSION) return;
  const results = resultsHistory();
  const legacyResults = sessionReadOnly ? scopedAssessments().map(item => {
    const recordedState = ["MATCH", "DIFFERENT", "UNKNOWN", "INVALID"].includes(item.state) ? item.state : "NOT_ASSESSED";
    return {
      result_id: null,
      attempt_id: null,
      question_id: item.question_id,
      state: recordedState,
      assessment_snapshot: clone(item),
      legacy: true,
      legacy_ambiguous: recordedState === "NOT_ASSESSED",
    };
  }) : [];
  const visibleResults = results.length ? results : legacyResults;
  const evidence = scopedEvidence();
  const counts = Object.fromEntries(["MATCH", "DIFFERENT", "UNKNOWN", "NOT_ASSESSED", "INVALID"].map(state => [state, visibleResults.filter(item => item.state === state).length]));
  const recordedOverall = counts.INVALID ? "INVALID" : counts.DIFFERENT ? "DIFFERENT" : counts.UNKNOWN ? "UNKNOWN" : counts.NOT_ASSESSED ? "NOT_ASSESSED" : visibleResults.length ? "MATCH" : "NOT_ASSESSED";
  const overall = sessionReadOnly ? `LEGACY / ${recordedOverall}` : recordedOverall;
  $("review_results_status").innerHTML = `<span>${esc(tr("status"))}</span><strong>${esc(overall)}</strong><span>${visibleResults.length} ${esc(tr("results_count"))}</span>${sessionReadOnly ? `<p>${esc(tr("legacy_session"))}</p>` : ""}`;
  $("review_results_empty").hidden = visibleResults.length > 0;
  $("review_results_content").hidden = visibleResults.length === 0;
  renderTuningState();
  if (!visibleResults.length) return;
  $("review_character").innerHTML = `<div><dt>${esc(tr("character"))}</dt><dd>${esc(displayName())}</dd></div><div><dt>${esc(tr("revision"))}</dt><dd>${esc(SESSION.source_character.character_revision)}</dd></div><div><dt>${esc(tr("scope"))}</dt><dd>${esc(SESSION.test_scope)}</dd></div>`;
  $("review_state_summary").innerHTML = Object.entries(counts).map(([state, value]) => `<div><span>${state}</span><strong>${value}</strong></div>`).join("");
  $("review_history").innerHTML = visibleResults.map(result => {
    const assessment = result.assessment_snapshot || {};
    const question = result.question_snapshot || SESSION.questions.find(item => item.id === result.question_id);
    const attempt = result.attempt_id ? attemptForId(SESSION, result.attempt_id) : null;
    const evidenceRecord = evidence.find(item => item.evidence_id === (result.evidence_reference || assessment.evidence_reference));
    const candidate = SESSION.change_candidates.find(item => item.ASSESSMENT_ID === result.assessment_id);
    const legacyLabel = localeCode() === "en" ? "Legacy record" : "旧記録";
    const visibleState = result.legacy
      ? `${legacyLabel} · ${result.legacy_ambiguous ? tr("legacy_ambiguous") : assessmentStateLabel(result.state)}`
      : assessmentStateLabel(result.state);
    return `<article class="review-result-card ${assessmentStateToken(result.state)}" aria-label="${esc(result.question_id)} ${esc(visibleState)}"><div class="review-result-heading"><h3>${esc(result.question_id)} · ${esc(assessment.test_category || question?.category || "UNKNOWN")}</h3><span class="review-state">${esc(visibleState)}</span></div><div class="review-result-values"><div><span>${esc(tr("label_expected"))}</span><strong>${esc(qText(question, "expected", attempt?.locale))}</strong></div><div><span>${esc(tr("label_observed"))}</span><strong>${esc(assessment.observed || tr("state_not_assessed"))}</strong></div><div><span>${esc(tr("label_diff"))}</span><strong>${esc(assessment.diff || tr("state_not_assessed"))}</strong></div></div><p class="review-evidence"><b>${esc(tr("record_details"))}: </b>${esc(evidenceRecord?.evidence_id || "NOT_AVAILABLE")}</p><p class="review-suggestion"><b>${esc(tr("label_candidate"))}: </b>${esc(candidate?.RELATED_CANONICAL_PATH || "NOT_AVAILABLE")}</p>${result.result_id ? `<button class="secondary open-result" data-result-id="${esc(result.result_id)}">${esc(localeCode() === "en" ? "Open this result" : "この結果を開く")}</button>` : ""}</article>`;
  }).join("");
  $("review_history").querySelectorAll(".open-result").forEach(button => button.addEventListener("click", () => {
    const result = results.find(item => item.result_id === button.dataset.resultId); if (!result) return;
    currentAttemptId = result.attempt_id; SESSION.active_attempt_id = result.attempt_id; SESSION.current_question_id = result.question_id;
    resultCursor = results.findIndex(item => item.result_id === result.result_id); showView("round_summary");
  }));
  $("review_technical_output").textContent = JSON.stringify({ session_id: SESSION.session_id, source_character: { ...SESSION.source_character, snapshot: "PRESERVED_IN_SESSION" }, evidence, result_history: results, assessments: scopedAssessments(), tuning_evidence: tuningEvidenceState(SESSION), retest: SESSION.retest, legacy_read_only: sessionReadOnly }, null, 2);
  const candidates = eligibleCandidates();
  $("review_candidate_note").textContent = candidates.length ? `${candidates.length} ${tr("candidates_count")}` : tr("no_candidate_result");
  $("review_open_builder").hidden = !candidates.length;
  $("review_open_builder").disabled = !candidates.length;
  $("review_open_builder").textContent = tr("candidate_builder");
}

function renderImpact() {
  if (!SESSION) return;
  const candidates = eligibleCandidates();
  const host = $("candidate_selection"); host.replaceChildren();
  if (!candidates.length) host.innerHTML = `<p class="review-empty">${esc(tr("no_candidate_result"))}</p>`;
  for (const candidate of candidates) {
    const article = document.createElement("article"); article.className = "candidate-card";
    const label = document.createElement("label"); const box = document.createElement("input"); box.type = "checkbox"; box.checked = candidate.HUMAN_REVIEW_STATE === "SELECTED_BY_HUMAN";
    box.setAttribute("aria-label", `${tr("select_for_builder")}: ${candidate.RELATED_CANONICAL_PATH}`);
    box.addEventListener("change", () => {
      if (!clearStoredBuilderLinksForCurrentSession("TRAINER_CANDIDATE_SELECTION_CHANGED")) { renderImpact(); updateReviewGate(); return; }
      const result = selectCandidate(SESSION, candidate.CANDIDATE_ID, { humanSelected: box.checked });
      if (result.ok) { SESSION = result.session; resetHandoffUi(); persist(); renderImpact(); updateReviewGate(); }
    });
    const title = document.createElement("strong"); title.textContent = `${candidate.RELATED_CANONICAL_PATH} · ${candidate.CANDIDATE_ID}`; label.append(box, title);
    const grid = document.createElement("dl"); grid.className = "candidate-detail";
    for (const [term, value] of [[tr("current_value"), candidate.CURRENT_VALUE], [tr("proposed_change"), candidate.PROPOSED_CHANGE], [tr("evidence"), candidate.EVIDENCE_REFERENCE], [tr("expected_effect"), candidate.EXPECTED_EFFECT?.[localeCode()] || candidate.EXPECTED_EFFECT?.ja], [tr("side_effect"), candidate.SIDE_EFFECT?.[localeCode()] || candidate.SIDE_EFFECT?.ja], [tr("unresolved"), candidate.UNRESOLVED]]) grid.innerHTML += `<div><dt>${esc(term)}</dt><dd>${esc(typeof value === "string" ? value : JSON.stringify(value))}</dd></div>`;
    article.append(label, grid); host.append(article);
  }
  $("impact_rows").innerHTML = candidates.map(candidate => `<div class="impact-row"><span data-label="${esc(tr("current_value"))}">${esc(JSON.stringify(candidate.CURRENT_VALUE))}</span><span data-label="${esc(tr("proposed_change"))}">${esc(JSON.stringify(candidate.PROPOSED_CHANGE))}</span><span data-label="${esc(tr("expected_effect"))}">${esc(candidate.EXPECTED_EFFECT?.[localeCode()] || candidate.EXPECTED_EFFECT?.ja || "")}</span></div>`).join("");
  $("effect_grid").innerHTML = summaryBlock(localeCode() === "en" ? "Side effects" : "副作用", candidates.map(candidate => candidate.SIDE_EFFECT?.[localeCode()] || candidate.SIDE_EFFECT?.ja || "UNKNOWN"));
  const selectedCount = eligibleBuilderCandidates(SESSION, { selectedOnly: true }).length;
  $("btn_to_review").disabled = selectedCount === 0;
  $("btn_to_review").setAttribute("aria-disabled", String(selectedCount === 0));
}

function reviewReady() {
  return document.querySelectorAll(".review_check:checked").length === document.querySelectorAll(".review_check").length
    && eligibleCandidates().some(item => item.HUMAN_REVIEW_STATE === "SELECTED_BY_HUMAN");
}

function updateReviewGate() {
  const ready = reviewReady(); $("btn_to_export").disabled = !ready; if (currentView === "review") $("mobile_next").disabled = !ready;
}

function buildExport() {
  const prepared = SESSION?.builder_handoff?.state === "READY" ? SESSION.builder_handoff.payload : null;
  if (prepared?.handoff_id && prepared.handoff_id === SESSION.builder_handoff.handoff_id && prepared.content_digest) {
    handoffPayload = clone(prepared);
    $("candout").textContent = JSON.stringify(handoffPayload, null, 2);
    $("engine_candout").textContent = JSON.stringify({ candidates: handoffPayload.candidates, source: handoffPayload.source_character }, null, 2);
    return true;
  }
  const result = buildBuilderHandoff(SESSION, { humanReviewed: reviewReady() });
  if (!result.ok) { toast(result.code); return false; }
  SESSION = result.session; handoffPayload = result.payload;
  const saved = persist();
  if (!saved.ok) { handoffPayload = null; toast(saved.code); return false; }
  $("candout").textContent = JSON.stringify(handoffPayload, null, 2);
  $("engine_candout").textContent = JSON.stringify({ candidates: handoffPayload.candidates, source: handoffPayload.source_character }, null, 2);
  return true;
}

function renderAll() {
  if (SESSION) {
    // Keep visible setup controls aligned with the restored authoritative
    // Session after any failed storage write.
    $("test_scope").value = SESSION.test_scope;
    $("execution_mode").value = SESSION.execution_mode;
    $("platform").value = SESSION.runtime_test_context?.platform || "generic";
  }
  renderSessionList();
  renderQuestions();
  renderPreflight();
  renderProgress();
  renderNotebook();
  renderPrompt();
  renderAnswer();
  renderEvaluation();
  renderRoundSummary();
  renderTrainingSummary();
  if (currentView === "results") renderReviewResults();
  if (currentView === "impact") renderImpact();
  for (const id of ["test_scope", "execution_mode", "platform", "question_language", "custom_question_text", "btn_add_user_question", "btn_add_generated_question"]) {
    if ($(id)) $(id).disabled = sessionReadOnly;
  }
  updateReviewGate();
}

function setHumanCheckError(message = "", missingFields = []) {
  const node = $("human_check_error");
  node.hidden = !message;
  node.textContent = message;
  const missing = new Set(missingFields);
  for (const [id, field, requirementId] of [["assessment_state", "assessment_state", ""], ["observed_input", "observed", "observed_requirement"], ["diff_input", "diff", "diff_requirement"]]) {
    const control = $(id);
    const invalid = missing.has(field);
    control.setAttribute("aria-invalid", String(invalid));
    const describedBy = [requirementId, message ? "human_check_error" : ""].filter(Boolean).join(" ");
    if (describedBy) control.setAttribute("aria-describedby", describedBy);
    else control.removeAttribute("aria-describedby");
  }
}

function saveAnswerDraft() {
  const attempt = activeAttempt();
  const raw = $("answer_input").value;
  if (!attempt || sessionReadOnly || attempt.evidence_id) return false;
  if (!raw.trim()) {
    if (attempt.response_draft) {
      const cleared = clearResponseDraft(SESSION, { questionId: attempt.question_id, attemptId: attempt.attempt_id });
      if (!cleared.ok) { setDraftStatus("failed"); toast(cleared.code); return false; }
      if (!persistAnswerState(cleared.session, raw, "failed").ok) return false;
    }
    answerPhase = "DRAFT";
    $("btn_confirm_answer").disabled = true;
    setDraftStatus("empty");
    return false;
  }
  const savedDraft = saveResponseDraft(SESSION, {
    questionId: attempt.question_id,
    attemptId: attempt.attempt_id,
    originalResponse: raw,
  });
  if (!savedDraft.ok) {
    setDraftStatus("failed");
    toast(savedDraft.code);
    return false;
  }
  if (!persistAnswerState(savedDraft.session, raw, "failed").ok) return false;
  currentAttemptId = attempt.attempt_id;
  answerPhase = "DRAFT_SAVED";
  $("btn_confirm_answer").disabled = false;
  setDraftStatus("saved");
  return true;
}

function confirmCurrentAnswer() {
  let attempt = activeAttempt();
  const raw = $("answer_input").value;
  if (!attempt || sessionReadOnly) return false;
  if (!attempt.response_draft || attempt.response_draft.original_response !== raw) {
    if (!saveAnswerDraft()) return false;
    attempt = activeAttempt();
  }
  const confirmed = confirmResponseDraft(SESSION, { questionId: attempt.question_id, attemptId: attempt.attempt_id });
  if (!confirmed.ok) {
    $("answer_error").hidden = false;
    setDraftStatus("failed");
    toast(confirmed.code);
    return false;
  }
  if (!persistAnswerState(confirmed.session, raw, "failed").ok) return false;
  currentAttemptId = attempt.attempt_id;
  answerPhase = "EVIDENCE_CONFIRMED";
  sourceReviewMode = false;
  $("answer_error").hidden = true;
  setDraftStatus("confirmed");
  toast(tr("answer_confirmed"));
  showView("evaluation");
  return true;
}

function recordCurrent({ hold = false } = {}) {
  const attempt = activeAttempt();
  if (attempt?.result_id) {
    toast(localeCode() === "en" ? "This result is immutable. Start a linked retest to record a new attempt." : "この結果は変更できません。新しい記録には連結した再テストを開始してください。");
    showView("round_summary");
    return false;
  }
  const question = attempt?.question_snapshot;
  const evidence = attempt?.evidence_id ? SESSION.evidence.find(item => item.evidence_id === attempt.evidence_id && item.attempt_id === attempt.attempt_id) : null;
  if (!question || !attempt || !evidence || sessionReadOnly) {
    setHumanCheckError(localeCode() === "en" ? "Confirm the saved answer before completing the Human check." : "人による確認の前に、保存した回答原文を確認してください。", ["evidence"]);
    return false;
  }
  const state = hold ? "NOT_ASSESSED" : $("assessment_state").value;
  const observed = hold ? "" : $("observed_input").value.trim();
  const diff = hold ? "" : $("diff_input").value.trim();
  const missing = [];
  if (!hold && state === "NOT_ASSESSED") missing.push("assessment_state");
  if (!hold && !observed) missing.push("observed");
  if (!hold && !diff) missing.push("diff");
  if (missing.length) {
    const message = state === "NOT_ASSESSED"
      ? (localeCode() === "en" ? "Choose a conclusion, or use the separate 'Save as not assessed' action." : "結論を選ぶか、別の「未評価で保存」を選んでください。")
      : tr("missing_human_fields");
    setHumanCheckError(message, missing);
    return false;
  }
  setHumanCheckError();
  if (!clearStoredBuilderLinksForCurrentSession("TRAINER_ASSESSMENT_CHANGED")) return false;
  const assessment = recordAssessment(SESSION, {
    questionId: question.id,
    evidenceId: evidence.evidence_id,
    attemptId: attempt.attempt_id,
    observed,
    state,
    diff,
    humanReviewed: true,
    strictHumanCheck: true,
    notAssessedReason: hold
      ? (localeCode() === "en" ? "The human reviewer chose to keep this attempt not assessed because the available evidence was insufficient." : "利用可能なEvidenceが不十分なため、人がこの試行を未評価のまま保持しました。")
      : "",
  });
  if (!assessment.ok) {
    setHumanCheckError(`${tr("missing_human_fields")} (${(assessment.missing_fields || [assessment.code]).join(", ")})`, assessment.missing_fields || []);
    return false;
  }
  SESSION = assessment.session;
  const summary = $("summary_input").value.trim();
  if (summary) {
    const addedSummary = addSummary(SESSION, { evidenceId: evidence.evidence_id, summary });
    if (!addedSummary.ok) { toast(addedSummary.code); return false; }
    SESSION = addedSummary.session;
  }
  const recorded = createTrainerResult(SESSION, { attemptId: attempt.attempt_id, assessmentId: assessment.assessment.assessment_id });
  if (!recorded.ok) {
    setHumanCheckError(`${localeCode() === "en" ? "The result could not be saved." : "結果を保存できませんでした。"} (${recorded.code})`);
    return false;
  }
  SESSION = recorded.session;
  if (assessment.assessment.state === "DIFFERENT" && question.related_path) {
    const candidate = createChangeCandidate(SESSION, {
      assessmentId: assessment.assessment.assessment_id,
      proposedChange: question.proposal?.[attempt.locale] || question.proposal?.ja,
      whyChange: assessment.assessment.diff,
    });
    if (candidate.ok) SESSION = candidate.session;
  }
  resetHandoffUi();
  if (!persist().ok) {
    setHumanCheckError(localeCode() === "en" ? "The result remains unsaved. Retry without leaving this screen." : "結果を保存できませんでした。この画面のまま再試行してください。");
    return false;
  }
  currentAttemptId = attempt.attempt_id;
  resultCursor = resultsHistory().findIndex(item => item.attempt_id === attempt.attempt_id);
  $("answer_error").hidden = true;
  showView("round_summary");
  return true;
}

function goToNextSelected() {
  const next = nextUnfinishedQuestion(currentQuestion()?.id);
  if (!next) { showView("results"); return; }
  if (!activateQuestion(next.id)) return;
  $("answer_input").dataset.attemptId = "";
  showView("prompt");
}

function openResultAt(index) {
  const history = resultsHistory();
  const result = history[index];
  if (!result) return false;
  currentAttemptId = result.attempt_id;
  SESSION.active_attempt_id = result.attempt_id;
  SESSION.current_question_id = result.question_id;
  resultCursor = index;
  sourceReviewMode = false;
  sourceReviewResultId = null;
  showView("round_summary");
  return true;
}

function startLinkedRetest(sourceAttempt = activeAttempt()) {
  if (!sourceAttempt?.result_id) {
    toast(localeCode() === "en" ? "A saved result is required before starting a linked retest." : "連結した再テストには保存済みの結果が必要です。");
    return false;
  }
  const retest = beginLinkedRetest(SESSION, { sourceAttemptId: sourceAttempt.attempt_id, locale: $("question_language").value });
  if (!retest.ok) { toast(retest.code); return false; }
  SESSION = retest.session;
  currentAttemptId = retest.attempt.attempt_id;
  sourceReviewMode = false;
  sourceReviewResultId = null;
  $("answer_input").dataset.attemptId = "";
  if (!persist().ok) {
    currentAttemptId = SESSION?.active_attempt_id || null;
    return false;
  }
  showView("prompt");
  return true;
}

$("pick").addEventListener("change", event => { if (FIXTURES[event.target.value]) loadChar(FIXTURES[event.target.value], { resume: false }); });
$("btn_load").addEventListener("click", () => { try { if (loadChar(JSON.parse($("paste").value), { resume: false })) toast(localeCode() === "en" ? "Character loaded without mutation." : "Characterを変更せず読み込みました。"); } catch (error) { $("who").textContent = localeCode() === "en" ? `JSON parse error: ${error.message}` : `JSONを読み込めません：${error.message}`; } });
$("test_scope").addEventListener("change", event => { if (!SESSION) return; if (!clearStoredBuilderLinksForCurrentSession("TRAINER_TEST_SCOPE_CHANGED")) { renderAll(); return; } const result = changeScope(SESSION, event.target.value); if (result.ok) { SESSION = result.session; resetHandoffUi(); persist(); renderAll(); } });
$("execution_mode").addEventListener("change", event => { if (!SESSION) return; const nextMode = event.target.value; if (!invalidateExecutionConfiguration("TRAINER_EXECUTION_MODE_CHANGED")) { event.target.value = SESSION.execution_mode; return; } SESSION.execution_mode = nextMode; SESSION.runtime_test_context.conversation_intent = nextMode === "FRESH_ONE_BY_ONE" ? "FRESH_CONVERSATION" : "FRESH_CONVERSATION_PER_CATEGORY_BATCH"; persist(); renderAll(); });
$("platform").addEventListener("change", event => { if (!SESSION) return; const nextPlatform = event.target.value; if (!invalidateExecutionConfiguration("TRAINER_RUNTIME_PLATFORM_CHANGED")) { event.target.value = SESSION.runtime_test_context.platform; return; } SESSION.runtime_test_context.platform = nextPlatform; persist(); renderAll(); });
$("question_language").addEventListener("change", () => { if (SESSION && invalidateExecutionConfiguration("TRAINER_QUESTION_LANGUAGE_CHANGED")) persist(); renderAll(); });
$("btn_add_user_question").addEventListener("click", () => {
  if (!SESSION) return; const made = createUserQuestion({ text: $("custom_question_text").value, locale: $("question_language").value, scope: SESSION.test_scope });
  if (!made.ok) return toast(made.code); const result = addQuestion(SESSION, made.question); if (!result.ok) return toast(result.code); SESSION = result.session; if (persist().ok) { $("custom_question_text").value = ""; toast(tr("user_question_draft_saved")); } renderAll();
});
$("btn_add_generated_question").addEventListener("click", () => {
  if (!SESSION) return; const made = createGeneratedQuestionCandidate({ text: $("custom_question_text").value, locale: $("question_language").value, scope: SESSION.test_scope });
  if (!made.ok) return toast(made.code); const result = addQuestion(SESSION, made.question); if (!result.ok) return toast(result.code); SESSION = result.session; if (persist().ok) { $("custom_question_text").value = ""; toast(tr("generated_question_draft_saved")); } renderAll();
});
$("btn_resume_session").addEventListener("click", () => {
  const id = $("saved_session").value;
  const loaded = loadSession(localStorage, id);
  if (!loaded.ok) return toast(loaded.code);
  if (!validateUnifiedV1(loaded.session?.source_character?.snapshot).ok) return rejectCharacter(loaded.session?.source_character?.structural_validation?.errors);
  if (SESSION?.session_id !== loaded.session.session_id && !clearStoredBuilderLinksForCurrentSession("TRAINER_SAVED_SESSION_SWITCHED")) return;
  const adopted = adoptSession(loaded.session);
  if (!adopted.ok) return toast(adopted.code);
  resetHandoffUi();
  CHAR = clone(SESSION.source_character.snapshot);
  $("test_scope").value = SESSION.test_scope;
  $("execution_mode").value = SESSION.execution_mode;
  $("platform").value = SESSION.runtime_test_context?.platform || "generic";
  meaningfulHistory = [];
  sourceReviewMode = false;
  renderCharacterIdentity();
  renderAll();
  toast(sessionReadOnly ? tr("legacy_session") : (localeCode() === "en" ? "Session restored." : "Sessionを復元しました。"));
});
$("btn_clear_session").addEventListener("click", () => {
  const cleared = clearCurrentSession(localStorage); if (!cleared.ok) return toast(cleared.code);
  if (CHAR) {
    SESSION = createSession(CHAR, { platform: $("platform").value });
    sessionReadOnly = false;
    currentAttemptId = null;
    if (!persist().ok) { renderAll(); return; }
  }
  meaningfulHistory = [];
  sourceReviewMode = false;
  resetHandoffUi(); showView("setup", { remember: false }); toast(localeCode() === "en" ? "Current Session view cleared. Saved Sessions remain." : "現在のSession表示をクリアしました。保存済みSessionは残っています。");
});
$("btn_delete_session").addEventListener("click", () => {
  const id = $("saved_session").value || SESSION?.session_id; if (!id || !window.confirm(tr("delete_confirm"))) return;
  const deleted = deleteSavedSession(localStorage, id); if (!deleted.ok) return toast(deleted.code);
  if (SESSION?.session_id === id) {
    SESSION = CHAR ? createSession(CHAR, { platform: $("platform").value }) : null;
    sessionReadOnly = false;
    currentAttemptId = null;
    if (SESSION && !persist().ok) { renderAll(); return; }
  }
  meaningfulHistory = [];
  sourceReviewMode = false;
  resetHandoffUi(); showView("setup", { remember: false });
});

$("btn_start").addEventListener("click", () => {
  const question = currentQuestion() || selectedQuestions()[0];
  if (!question || !activateQuestion(question.id)) { toast("PREFLIGHT_BLOCKED"); renderPreflight(); return; }
  showView("prompt");
});
$("btn_regenerate").addEventListener("click", () => goToNextSelected());
$("btn_prompt").addEventListener("click", () => { $("promptout").hidden = !$("promptout").hidden; });
$("btn_copy_prompt").addEventListener("click", async () => {
  const attempt = activeAttempt();
  const binding = validateFinalizedPacks(SESSION, attempt?.question_id);
  if (!attempt || !binding.ok) return toast("PREFLIGHT_REQUIRED / " + (binding.mismatches || []).join(","));
  const copied = await copyText(attempt.execution_pack_snapshot.plain_text, $("btn_copy_prompt"), tr("copy_success"));
  if (copied) persistentStatus("copy_pack_status", localeCode() === "en" ? "Copied. Obtain an answer in a fresh external-AI conversation, then return here." : "コピーしました。外部AIの新しい会話で回答を取得し、この画面へ戻ってください。", "success");
});
$("btn_copy_question").addEventListener("click", () => { const attempt = activeAttempt(); copyText(qText(attempt?.question_snapshot || currentQuestion(), "prompt", attempt?.locale), $("btn_copy_question"), localeCode() === "en" ? "Question-only copy is secondary and not a complete test." : "質問だけのコピーは補助用で、完全な検証ではありません。"); });
$("btn_to_answer").addEventListener("click", () => activeAttempt() ? showView("answer") : toast("QUESTION_ATTEMPT_REQUIRED"));
$("answer_input").addEventListener("input", () => saveAnswerDraft());
$("btn_paste").addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      $("answer_input").value = text;
      $("answer_input").dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
  } catch { /* normal paste remains available */ }
  $("answer_input").focus();
  persistentStatus("answer_draft_status", localeCode() === "en" ? "Clipboard access was unavailable. Paste with Ctrl+V; your text will be saved immediately as a draft." : "クリップボードを読み取れませんでした。Ctrl+Vで貼り付けると、回答はすぐ下書き保存されます。", "info");
});
$("btn_clear_answer").addEventListener("click", () => { $("answer_input").value = ""; saveAnswerDraft(); $("answer_input").focus(); });
$("btn_confirm_answer").addEventListener("click", confirmCurrentAnswer);
$("btn_evaluate").addEventListener("click", () => recordCurrent());
$("btn_add_correction").addEventListener("click", () => startLinkedRetest());
$("btn_hold_unknown").addEventListener("click", () => recordCurrent({ hold: true }));
$("btn_copy_evaluation").addEventListener("click", () => { const attempt = activeAttempt(); const assessment = attempt?.assessment_id ? SESSION.assessments.find(item => item.assessment_id === attempt.assessment_id) : null; copyText(JSON.stringify(assessment, null, 2), $("btn_copy_evaluation")); });
$("btn_to_round_summary").addEventListener("click", () => activeResult() ? showView("round_summary") : toast("RESULT_REQUIRED"));
$("btn_copy_round").addEventListener("click", () => copyText(JSON.stringify(activeResult(), null, 2), $("btn_copy_round")));
$("btn_next_round").addEventListener("click", goToNextSelected);
$("btn_finish_round").addEventListener("click", () => showView("results"));
$("btn_finish").addEventListener("click", () => showView("results"));
$("btn_copy_training").addEventListener("click", () => copyText(JSON.stringify({ session_id: SESSION?.session_id, test_scope: SESSION?.test_scope, evidence: scopedEvidence(), assessments: scopedAssessments(), canonical_mutation: false }, null, 2), $("btn_copy_training")));
for (const id of ["btn_review_results", "btn_review_round", "btn_review_training"]) $(id).addEventListener("click", () => showView("results"));
$("review_start_test").addEventListener("click", () => showView("setup"));
$("review_continue_test").addEventListener("click", () => showView("setup"));
$("review_open_builder").addEventListener("click", () => eligibleCandidates().length ? showView("impact") : toast(tr("no_candidate_result")));
$("btn_to_impact").addEventListener("click", () => eligibleCandidates().length ? showView("impact") : toast(tr("no_candidate_result")));
$("btn_review_source").addEventListener("click", () => {
  const result = activeResult();
  const source = result ? sourceQuestionResultForAttempt(SESSION, result.attempt_id) : { ok: false, code: "RESULT_REQUIRED" };
  if (!source.ok || !source.result) return toast(source.code || "RESULT_REQUIRED");
  sourceReviewMode = true;
  sourceReviewResultId = result.result_id;
  currentAttemptId = result.attempt_id;
  answerPhase = "SOURCE_REVIEW";
  showView("answer");
});
$("btn_return_result").addEventListener("click", () => {
  sourceReviewMode = false;
  sourceReviewResultId = null;
  showView("round_summary");
});
$("btn_retest_question").addEventListener("click", () => startLinkedRetest());
$("btn_next_question").addEventListener("click", goToNextSelected);
$("btn_choose_question").addEventListener("click", () => showView("setup"));
$("btn_history_prev").addEventListener("click", () => openResultAt(resultCursor - 1));
$("btn_history_next").addEventListener("click", () => openResultAt(resultCursor + 1));
$("btn_to_review").addEventListener("click", () => {
  if (!eligibleBuilderCandidates(SESSION, { selectedOnly: true }).length) return toast(tr("select_candidate_first"));
  showView("review");
});
document.querySelectorAll(".review_check").forEach(box => box.addEventListener("change", updateReviewGate));
$("btn_to_export").addEventListener("click", () => { if (buildExport()) showView("export"); });
$("btn_copy_candidate").addEventListener("click", () => copyText(JSON.stringify(handoffPayload, null, 2), $("btn_copy_candidate")));
$("btn_copy_human").addEventListener("click", () => copyText(`${displayName()} / ${SESSION?.source_character.character_revision}\n${(handoffPayload?.candidates || []).map(item => `${item.RELATED_CANONICAL_PATH}: ${JSON.stringify(item.CURRENT_VALUE)} -> ${JSON.stringify(item.PROPOSED_CHANGE)}\nEvidence: ${item.EVIDENCE_REFERENCE}\nEffect: ${item.EXPECTED_EFFECT?.[localeCode()] || item.EXPECTED_EFFECT?.ja}\nSide effect: ${item.SIDE_EFFECT?.[localeCode()] || item.SIDE_EFFECT?.ja}`).join("\n\n")}\n\nCharacter updated: NO`, $("btn_copy_human")));
$("btn_canddl").addEventListener("click", () => { $("engine_candout").hidden = !$("engine_candout").hidden; });
$("btn_send_builder").addEventListener("click", () => {
  // Reuse the exact READY envelope already persisted on entry to this screen.
  // Rebuilding here would create a second handoff_id and conflict with the
  // authoritative saved Session before Builder ever receives the first one.
  if (!buildExport()) return;
  SESSION.builder_handoff.state = "SENT_TO_BUILDER";
  const sessionSaved = persist();
  if (!sessionSaved.ok) { toast(sessionSaved.code); return; }
  const source = handoffPayload.source_character;
  try {
    const characterTransport = storeHandoff(localStorage, "character", SESSION.source_character.snapshot);
    if (characterTransport.binding.character_id !== source.character_id
      || String(characterTransport.binding.character_revision) !== String(source.character_revision)) {
      throw new Error("BUILDER_CHARACTER_HANDOFF_BINDING_MISMATCH");
    }
  } catch (error) {
    try { clearHandoff(localStorage, "character"); } catch { /* report the primary failure below */ }
    const invalidated = invalidateSessionBuilderHandoff(localStorage, SESSION, "BUILDER_CHARACTER_TRANSPORT_WRITE_FAILED");
    if (invalidated.ok) SESSION = invalidated.session;
    toast(invalidated.ok ? String(error?.message || error) : `BUILDER_CHARACTER_TRANSPORT_AND_INVALIDATION_FAILED / ${String(error?.message || error)} / ${invalidated.code}`);
    return;
  }
  const stored = storeBuilderHandoff(localStorage, handoffPayload);
  if (!stored.ok) {
    try { clearHandoff(localStorage, "character"); } catch { /* Candidate invalidation remains authoritative */ }
    const invalidated = invalidateSessionBuilderHandoff(localStorage, SESSION, "BUILDER_HANDOFF_TRANSPORT_WRITE_FAILED");
    if (invalidated.ok) SESSION = invalidated.session;
    toast(invalidated.ok ? stored.code : `BUILDER_HANDOFF_TRANSPORT_AND_INVALIDATION_FAILED / ${stored.code} / ${invalidated.code}`);
    return;
  }
  location.href = `./saku-builder.html?desktop=trainer-change-candidates&character_id=${encodeURIComponent(source.character_id)}&character_revision=${encodeURIComponent(source.character_revision)}&character_digest=${encodeURIComponent(source.character_digest)}&session_id=${encodeURIComponent(SESSION.session_id)}&handoff_id=${encodeURIComponent(handoffPayload.handoff_id)}`;
});
$("btn_observe").addEventListener("click", () => $("observation_notebook").scrollIntoView({ behavior: "smooth" }));

function goBack() {
  const target = meaningfulHistory.pop();
  if (target && allViewNames.includes(target)) showView(target, { remember: false });
}
function goNext() {
  if (currentView === "setup") $("btn_start").click();
  else if (currentView === "prompt") showView("answer");
  else if (currentView === "answer" && !$("btn_confirm_answer").disabled) confirmCurrentAnswer();
  else if (currentView === "evaluation") recordCurrent();
  else if (currentView === "round_summary") goToNextSelected();
  else if (currentView === "results") showView("setup");
  else if (currentView === "impact") showView("review");
  else if (currentView === "review" && reviewReady()) $("btn_to_export").click();
}
$("mobile_back").addEventListener("click", goBack); $("mobile_next").addEventListener("click", goNext);

const aboutModal = $("about_modal");
$("btn_about").addEventListener("click", () => { $("about_body").innerHTML = aboutBody(); aboutModal.classList.add("open"); $("about_close").focus(); });
$("about_close").addEventListener("click", () => aboutModal.classList.remove("open"));
aboutModal.addEventListener("click", event => { if (event.target === aboutModal) aboutModal.classList.remove("open"); });
document.addEventListener("keydown", event => { if (event.key === "Escape") aboutModal.classList.remove("open"); });
$("locale").addEventListener("change", event => { I18N.setLocale(event.target.value); applyLocaleLabels(); });

(async () => {
  await initI18n(); $("locale").value = I18N.locale; applyLocaleLabels(); mountHelp(); await loadFixtures(); renderScopeOptions(); renderSessionList(); showView(reviewRouteRequested ? "results" : "setup");
})();

window.__saku_trainer = {
  get char() { return CHAR; },
  get session() { return SESSION; },
  get executionPack() { return SESSION?.execution_pack; },
  get evaluationPack() { return SESSION?.evaluation_pack; },
  get exportEnvelope() { return handoffPayload; },
  preflight: () => SESSION ? preflight(SESSION, { locale: $("question_language").value, questionId: SESSION.current_question_id }) : { ok: false },
  setSession: value => {
    const validation = validateUnifiedV1(value?.source_character?.snapshot);
    if (!validation.ok) return rejectCharacter(validation.errors);
    if (SESSION?.session_id !== value?.session_id && !clearStoredBuilderLinksForCurrentSession("TRAINER_SESSION_REPLACED")) return false;
    resetHandoffUi();
    const adopted = adoptSession(value);
    if (!adopted.ok) return false;
    CHAR = clone(SESSION.source_character.snapshot);
    renderAll();
    return true;
  },
  setLocale: locale => { I18N.setLocale(locale); $("locale").value = I18N.locale; applyLocaleLabels(); },
  get locale() { return I18N.locale; },
  copy: () => COPY[localeCode()],
  saveAnswerDraft,
  confirmCurrentAnswer,
  openResultAt,
};
