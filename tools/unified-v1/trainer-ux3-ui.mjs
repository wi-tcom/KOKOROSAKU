import { CHOICES, CHOICE_VERSION, newId, current, openStore, groupFor, preparationSession, selectionToUtf8, utf8Range, legacyReference } from '../v1/trainer-ux3.mjs';
import { TEST_SCOPES, EXECUTION_MODES, listSessions, loadSession, createUserQuestion } from '../v1/trainer-frozen-ia.mjs';
import { validateUnifiedV1 } from '../v1/unified-authoring.mjs';
import * as ActiveSaku from './active-saku.mjs';
import * as Library from './character-library.mjs';
import { consumeHandoff } from './handoff-binding.mjs';

const $ = id => document.getElementById(id);
const esc = x => String(x ?? '').replace(/[&<>"']/g, x => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[x]));
let language = 'ja', store, session = null, characters = new Map(), sessions = [], selectedSession = '', legacy = [];
let stage = 1, openSection = 1, historyResult = null, lastError = '', status = '', failedOperation = null;
let responseDraft = '', evaluationDraft = emptyEvaluation(), correctionMode = false, reevaluating = false, busy = false, draftTimer;
const t = (ja, en) => language === 'en' ? en : ja;
const loc = x => x?.[(stage!==1 && lineage().execution?.preparation.language) || session?.preparation.language || language] || x?.ja || '';
const button = (id, ja, en, kind = '', disabled = false) => `<button id="${id}" class="${kind}" ${disabled ? 'disabled' : ''}>${esc(t(ja,en))}</button>`;
const pair = x => x?.[language === 'en' ? 1 : 0] || '';
function emptyEvaluation() { return { choices: { conclusion: '', confirmed: [], reasons: [] }, confirmed_note: '', reason_note: '' }; }
function lineage() {
  if (!session) return {};
  if (!historyResult) return current(session);
  const result = session.results[historyResult];
  return result ? { result, evaluation: session.evaluations[result.evaluation_id], binding: session.bindings[result.binding_id], original: session.originals[result.original_id],
    question: session.questions[result.question_attempt_id], execution: session.executions[result.execution_id], status:'SAVED' } : {};
}
function draftsFromSession() {
  const c = lineage();
  correctionMode = Boolean(c.original && Object.hasOwn(session?.drafts.responses || {}, c.execution?.id));
  reevaluating = Boolean(c.evaluation && Object.hasOwn(session?.drafts.evaluations || {}, c.binding?.id));
  responseDraft = session?.drafts.responses[c.execution?.id] ?? '';
  evaluationDraft = structuredClone(session?.drafts.evaluations[c.binding?.id] || emptyEvaluation());
}
function options(items, value) { return items.map(([id, label]) => `<option value="${esc(id)}" ${id === value ? 'selected' : ''}>${esc(label)}</option>`).join(''); }
function title(n) { return [null,t('01 準備する','01 Prepare'),t('02 AIで確認する','02 Check with AI'),t('03 結果を確認する','03 Review results')][n]; }
function errorMessage(error) {
  const code = String(error?.message || error);
  const messages = {
    CONCLUSION_REQUIRED: ['人の結論を1つ選んでください。','Choose one conclusion.'],
    CONFIRMED_REQUIRED: ['回答から確認できた内容を選んでください。','Select what you could confirm from the response.'],
    C_NONE_EXCLUSIVE: ['「確認できた項目はない」と他の確認項目は同時に選べません。選択を見直してください。','“None” cannot be combined with another confirmed item. Review your selections.'],
    REASON_REQUIRED: ['結論にした理由・期待との違いを選んでください。','Select a reason or difference.'],
    MATCH_REQUIRES_CONFIRMED_AND_R01_ONLY: ['「期待どおり」には確認項目を1つ以上選び、理由は「期待した内容に合っている」だけを選んでください。','For “As expected”, select at least one confirmed item and only “Matches the expected content” as the reason.'],
    DIFFERENCE_REQUIRES_R02_R06: ['違いがある場合は、足りない内容・過剰な内容・事実・役割・引き継ぎの理由を1つ以上選んでください。「期待した内容に合っている」とは併用できません。','For differences, select at least one reason about missing/excess content, facts, role, or handoff. Do not combine this with “Matches the expected content”.'],
    NOT_ASSESSED_REQUIRES_R07: ['「まだ判断しない」には「判断に必要な情報・確認がまだそろっていない」を選んでください。','For “Not ready to judge”, select “More information or checking is needed to judge”.'],
    PARTIAL_RANGE_OUT_OF_BOUNDS: ['保存した回答の中から、評価する連続した範囲を選択してください。','Select a non-empty continuous range in the saved response.'],
    PARTIAL_RANGE_UTF8_BOUNDARY: ['文字の途中を区切れません。回答から範囲を選び直してください。','A range cannot split a character. Select the range again.'],
    MAPPING_UNRESOLVED: ['この質問に使う回答の範囲を先に指定してください。','Specify the response mapping for this question first.'],
    RESPONSE_REQUIRED: ['外部AIから得た回答を入力してください。','Enter the response obtained from your external AI.'],
    PREPARATION_INCOMPLETE: ['Characterと確認方法、評価の期待・見るポイントが定義された質問を選んでください。','Choose a Character, test settings, and questions with defined expectations and review guidance.'],
    SESSION_STORAGE_CONFLICT: ['保存内容が別の画面で変更されています。入力を保ったまま再試行できます。古い回答や評価を上書きすることはできません。','Another screen changed the saved Session. Your input is retained; retry to check the current state. Existing evidence cannot be overwritten.'],
    STALE_EXPECTED_HEAD: ['参照していた回答・範囲・評価が更新されています。入力は残しています。履歴で現在の記録を確認してください。','The referenced response, mapping, or evaluation changed. Your input is retained. Check the current saved records in history.'],
  };
  return code.split(',').map(c => messages[c] ? pair(messages[c]) : `${t('保存できませんでした。入力を保ったまま、端末の空き容量や保存状態を確認して再試行してください。','Could not save. Your input is retained. Check local storage and free space, then retry.')} (${c})`).join(' ');
}
async function run(type, payload, { reuseFailure = true } = {}) {
  const same = failedOperation?.type === type && JSON.stringify(failedOperation.payload) === JSON.stringify(payload);
  const op = reuseFailure && same ? failedOperation : { intent:newId('intent'), type, payload:structuredClone(payload) };
  failedOperation = op;
  const result = await store.run(session.session_id, op);
  session = result.session; failedOperation = null; status = t('保存済み','Saved'); lastError = ''; return result;
}
async function guard(action) {
  if (busy) return; busy = true;
  let rerender = true; const previousStage = stage;
  try { rerender = (await action()) !== false; } catch (e) { lastError = errorMessage(e); status = t('未保存・入力を保持しています','Not saved · input retained'); }
  finally {
    busy = false;
    if (rerender) {
      render();
      if (lastError) {
        const notice = $('evaluation-error') || $('global-error');
        notice.tabIndex = -1; notice.scrollIntoView({ block:'center' }); notice.focus({ preventScroll:true });
      } else if (stage !== previousStage) window.scrollTo(0,0);
    }
  }
}
function captureDrafts() {
  if ($('answer-input') && !historyResult && !($('answer-input').readOnly)) responseDraft = $('answer-input').value;
  if ($('evaluation-form') && !historyResult && (!lineage().evaluation || reevaluating)) {
    evaluationDraft = { choices: { conclusion: document.querySelector('input[name="conclusion"]:checked')?.value || '',
      confirmed:[...document.querySelectorAll('input[name="confirmed"]:checked')].map(x=>x.value), reasons:[...document.querySelectorAll('input[name="reasons"]:checked')].map(x=>x.value) },
      confirmed_note:$('confirmed-note').value, reason_note:$('reason-note').value };
  }
}
async function saveDrafts() {
  clearTimeout(draftTimer); draftTimer = null; captureDrafts();
  const c = lineage(); if (!session || !c.execution || historyResult) return;
  const payload = { execution_id:c.execution.id, question_attempt_id:c.question.id, expected_original:session.response_heads[c.execution.id] || null };
  if (!c.original || correctionMode) payload.response = responseDraft;
  if (c.binding && c.binding.kind !== 'MAPPING_UNRESOLVED' && (!c.evaluation || reevaluating)) {
    payload.binding_id = c.binding.id; payload.evaluation = structuredClone(evaluationDraft);
  }
  if (payload.response !== undefined || payload.evaluation !== undefined) await run('draft',payload);
}
function scheduleDraft() {
  captureDrafts(); status = t('入力中・保存待ち','Editing · save pending'); $('save-state').textContent = status;
  clearTimeout(draftTimer); draftTimer = setTimeout(async()=>{
    draftTimer = null;
    if (busy) { scheduleDraft(); return; }
    busy = true; try { await saveDrafts(); $('save-state').textContent = status; }
    catch (e) { lastError = errorMessage(e); $('global-error').hidden=false; $('global-error').textContent=lastError; }
    finally { busy=false; }
  },350);
}
async function navigate(n, { history = null } = {}) {
  await saveDrafts(); await run('view',{ stage:n, history_result:history }); stage=n; historyResult=history; draftsFromSession(); openSection=n===2 ? (lineage().original ? 3:1):1;
}
async function refreshList() { sessions = await store.list(); legacy = listSessions(localStorage); }
function render() {
  const c = lineage(), p = session?.preparation;
  const name = session?.source.snapshot.identity.display_name || t('未選択','Not selected');
  $('trainer-root').innerHTML = `<header><div class="brand">SAKU <strong>TRAINER</strong><small id="build-display" class="small"> ${document.querySelector('meta[name="saku-build-revision"]')?.content ? 'BUILD '+esc(document.querySelector('meta[name="saku-build-revision"]').content.slice(0,12)) : ''}</small></div><div class="header-actions"><a id="to-desktop-trainer" class="button-link" href="../index.html?stay=1">${t('ホーム','Home')}</a>${button('history','履歴・結果','History / Results')}
    <label>${t('表示言語','Interface language')}<select id="locale">${options([['ja','日本語'],['en','English']],language)}</select></label></div></header>
    <div class="orientation"><ol class="stages">${[1,2,3].map(n=>`<li ${stage===n?'aria-current="step"':''}>${title(n)}</li>`).join('')}</ol>
    <div class="context"><span id="current-character">${esc(name)} ${session ? `/ revision ${esc(session.source.character_revision)}` : ''}</span><span id="question-orientation">${t('質問','Question')} ${esc(c.question?.snapshot.id || '—')} / ${t('選択','Selected')} ${p?.question_ids.length || 0}</span><span id="save-state" role="status">${esc(status || t('未開始','Not started'))}</span></div></div>
    <div class="layout"><div id="global-error" class="error" role="alert" ${!lastError?'hidden':''}>${esc(lastError)}</div>
    ${stage===1?renderPreparation():stage===2?renderAI(c):renderResults(c)}
    </div><dialog id="delete-dialog"><h2>${t('Sessionを削除しますか','Delete this Session?')}</h2><p id="delete-description"></p><p>${t('削除したSessionは元に戻せません。Character自体は削除されません。','Deleting a Session cannot be undone. The Character itself will not be deleted.')}</p><div class="actions">${button('cancel-delete','キャンセル','Cancel')}${button('confirm-delete','このSessionを削除','Delete this Session','danger')}</div></dialog>
    <dialog id="history-dialog"><h2>${t('保存された結果の履歴','Saved result history')}</h2><div id="history-list"></div>${button('close-history','閉じる','Close')}</dialog>`;
  document.documentElement.lang=language;
  bind();
}
function renderPreparation() {
  const p = session?.preparation || { scope:'FULL_CHARACTER', mode:'FRESH_ONE_BY_ONE', language:'ja', platform:'generic', question_ids:[] };
  const questions = session ? preparationSession(session).questions : [];
  return `<section id="stage-01"><h1>${title(1)}</h1><p class="intro">${t('Characterと確認方法を選び、質問を決めます。<br>開始すると外部AIで確認する画面へ進みます。ここでは外部AIは実行しません。','Choose a Character, test settings, and questions.<br>Starting opens the external-AI workflow; it does not run an AI here.')}</p>
    <section class="card"><h2>${t('01-1 確認方法を設定する','01-1 Set up the test')}</h2><p class="intro">${t('試すCharacterと、外部AI・言語・範囲・実行モードを選びます。<br>設定は次に開始する試行へ適用され、保存済みの回答や結果はそのまま残ります。','Choose the Character, external AI, language, scope, and execution mode.<br>Changes apply to the next attempt and preserve saved responses and results.')}</p>
    <div id="preparation-settings" class="setup-grid"><label><span>${t('試すCharacter','Character to test')}</span><select id="pick">${options([['',t('Characterを選択','Choose a Character')],...[...characters].map(([id,x])=>[id,x.identity.display_name])],session?.source.character_id || '')}</select></label>
    <label><span>${t('使用する外部AI','External AI to use')}</span><select id="platform">${options([['chatgpt','ChatGPT'],['claude','Claude'],['gemini','Gemini'],['local','Local LLM'],['generic',t('その他・わからない','Other / Not sure')]],p.platform)}</select></label>
    <label><span>${t('質問言語','Question language')}</span><select id="question-language">${options([['ja','日本語'],['en','English']],p.language)}</select></label>
    <label><span>${t('試す範囲','Test scope')}</span><select id="test-scope">${options(TEST_SCOPES.map(x=>[x.id,x[language]]),p.scope)}</select></label>
    <label><span>${t('実行モード','Execution mode')}</span><select id="execution-mode">${options(EXECUTION_MODES.map(x=>[x.id,x[language]]),p.mode)}</select></label></div>
    <p class="small">${t('外部AIはあなたが指定する情報です。実際の提供元やモデルの確認を示しません。「Character全体」も全面的な適合の証明ではありません。','The external AI is user-declared information, not verified provider or model identity. “Full Character” does not prove complete conformance.')}</p></section>
    <details id="session-management" class="step" open><summary>${t('01-2 セッション管理','01-2 Session management')}</summary><p class="intro">${t('保存済みSessionを選んで「開始」を押すと再開できます。<br>「表示をクリア」は保存して表示だけを外します。削除は確認後に対象Sessionだけを消します。','Select a saved Session, then press Start to resume it.<br>Clear view saves and detaches the workspace. Delete removes only the confirmed Session.')}</p>
    <label><span>${t('Sessionを選択','Select a Session')}</span><select id="saved-session">${options([['',t('Sessionを選択','Select a Session')],...sessions.map(s=>[s.session_id,`${s.source.snapshot.identity.display_name} / ${s.session_id}`])],selectedSession)}</select></label><div class="actions">${button('resume-session','開始','Start','',!selectedSession)}${button('clear-session','表示をクリア','Clear view','',!session)}${button('delete-session','削除','Delete','danger',!selectedSession)}</div>
    ${legacy.length?`<details><summary>${t('以前のSessionを参照（読み取り専用）','Previous Sessions (read-only)')}</summary>${legacy.map(x=>`<button data-legacy="${esc(x.session_id)}">${esc(x.character_id)} / ${esc(x.session_id)}</button>`).join('')}<pre id="legacy-reference"></pre></details>`:''}</details>
    <section class="card"><h2 id="question-library-title">${t('01-3 質問を選択する','01-3 Choose questions')}</h2><p class="intro">${t('今回確認したい質問にチェックを入れます。<br>選んだ順序と質問の内容は開始時に記録され、後の結果にも残ります。','Check the questions you want to try.<br>The selected order and question content are fixed when an attempt starts and retained with its results.')}</p>
    <div id="question-list">${questions.map(q=>`<label class="question"><input name="question" type="checkbox" value="${esc(q.id)}" ${p.question_ids.includes(q.id)?'checked':''}><span><strong>${esc(q.id)}</strong> ${esc(loc(q.prompt))}</span></label>`).join('')}</div>
    <details><summary>${t('自分で質問を追加（任意）','Add your own question (optional)')}</summary><p class="small">${t('人が書いた質問・期待・見るポイントを登録します。','Enter your question, expected content, and review guidance.')}</p><label>${t('質問文','Question')}<textarea id="custom-question"></textarea></label><label>${t('期待される内容','Expected content')}<textarea id="custom-expected"></textarea></label><label>${t('見るポイント','What to look for')}<textarea id="custom-rubric"></textarea></label>${button('add-question','質問を追加','Add question','',!session)}</details></section>
    <section class="card"><h2>${t('01-4 トレーニングを開始する','01-4 Start the training')}</h2><p class="intro">${t('設定と質問を確認して、AIで確認する画面へ進みます。<br>条件が同じなら試行を再開し、条件が変わった場合は新しい試行を開始します。','Check your settings and questions, then continue to Check with AI.<br>Unchanged conditions resume the selected attempt; changed conditions start a new attempt.')}</p>${button('start','AIで確認する','Check with AI','primary',!session||!p.question_ids.length)}</section></section>`;
}
function renderAI(c) {
  if (!c.execution) return `<h1>${title(2)}</h1><p>${t('準備から試行を開始してください。','Start an attempt from Prepare.')}</p>${button('back-prepare','準備を見直す','Review preparation')}`;
  const original = c.original, mapped = c.binding && c.binding.kind!=='MAPPING_UNRESOLVED';
  return `<section id="stage-02"><h1>${title(2)}</h1><p class="intro">${t('プロンプトを外部AIへ渡し、返ってきた回答を貼り付けて評価します。<br>3つの手順は同じ画面にあり、戻って見直せます。','Give the prompt to your external AI, paste its response, and evaluate it.<br>All three steps are on this screen and can be reopened.')}</p>
    <div class="actions">${button('back-prepare','01 準備するへ戻る','Back to 01 Prepare')}${historyResult?button('back-current','現在の試行へ戻る','Return to current attempt'):''}</div>
    <div class="card"><label><span>${t('今回の質問','Current question')}</span><select id="attempt-question" ${historyResult?'disabled':''}>${options(c.execution.question_attempt_ids.map(id=>[id,`${session.questions[id].snapshot.id} · ${session.binding_heads[id] ? t('回答範囲指定済み','Response mapped'):t('回答範囲未指定','Response not mapped')}`]),c.question.id)}</select></label><p id="current-question">${esc(loc(c.question.snapshot.prompt))}</p></div>
    <details class="step" id="ai-step-1" ${openSection===1?'open':''}><summary>${t('02-1 AIにプロンプトを渡す','02-1 Give the prompt to AI')}</summary><p class="intro">${t('Characterの定義を含む完全なプロンプトをコピーし、選んだ外部AIへ貼り付けます。<br>回答を得たら、この画面へ戻ってください。コピーしても外部AIの実行は確認されません。','Copy the complete Character-aware prompt and paste it into the external AI you selected.<br>Return here with its response. Copying does not verify AI execution.')}</p>
    ${button('copy-prompt','プロンプトをコピー','Copy prompt','primary')}<div id="copy-status" role="status"></div><details id="manual-copy"><summary>${t('プロンプトを表示・手動でコピー','Show prompt / copy manually')}</summary><textarea id="prompt-text" class="prompt" readonly>${esc(c.execution.pack.plain_text)}</textarea></details></details>
    <details class="step" id="ai-step-2" ${openSection===2?'open':''}><summary>${t('02-2 AIの回答を貼り付ける','02-2 Paste the AI response')}</summary><p class="intro">${t('AIから返ってきた回答をそのまま入力します。JSONは必要ありません。<br>保存すると、この入力内容が回答原文として残り、評価へ進めます。','Paste the AI response exactly as received. JSON is not required.<br>Saving preserves the content you submit as the Original Response and opens evaluation.')}</p>
    <label><span>${t('外部AIの回答','AI response')}</span><textarea id="answer-input" class="original" ${original&&!correctionMode?'readonly':''}>${esc(original&&!correctionMode?original.text:responseDraft)}</textarea></label>
    <p id="answer-feedback" class="status" role="status">${original&&!correctionMode?t('回答原文を保存済みです。訂正する場合は新しい回答原文として保存されます。','Original Response saved. A correction is saved as a new Original Response.'):responseDraft?t('回答を入力しました。次に「回答を保存して評価へ」を押してください。','Response entered. Next, press “Save response and evaluate”.'):t('回答を入力すると保存前の状態がここに表示されます。','Enter a response to see its draft status here.')}</p>
    <div class="actions">${original&&!correctionMode?button('correct-response','回答を訂正する','Correct response','',!!historyResult):button('save-response','回答を保存して評価へ','Save response and evaluate','primary',!responseDraft.trim())}</div>
    ${correctionMode?`<p class="small">${t('新しい回答原文を保存すると、この実行の全質問の回答範囲は未指定になります。以前の評価・結果は履歴に残ります。','Saving a correction resets response mapping for all questions in this execution. Earlier evaluations and results remain in history.')}</p>`:''}</details>
    <details class="step" id="ai-step-3" ${openSection===3?'open':''}><summary>${t('02-3 回答を評価する','02-3 Evaluate the response')}</summary><p class="intro">${t('この質問に使う回答の範囲を明示し、期待と見るポイントを確認して選択します。<br>「結果を見る」で人の評価とその結果を一緒に保存します。','Explicitly map the response to this question, then compare it with the expected content and guidance.<br>View results saves your evaluation and its result together.')}</p>
    ${!original?`<p class="status">${t('先に回答を保存してください。','Save the response first.')}</p>`:`<div class="card"><h3>${t('この質問に使う回答の範囲','Response scope for this question')}</h3><p>${t('回答原文の全体か、一続きの範囲を選びます。わからない場合、この質問は評価せずに残せます。','Choose the whole response or one continuous range. If the mapping is unclear, leave this question unevaluated.')}</p>
    <label><span>${t('保存した回答原文（範囲を選択できます）','Saved Original Response (select a range here)')}</span><textarea id="original-mapping" readonly>${esc(original.text)}</textarea></label>
    <div class="actions">${button('bind-whole','回答全体をこの質問に使う','Use the whole response for this question','',!!historyResult)}${button('bind-partial','選択した範囲をこの質問に使う','Use the selected range for this question','',!!historyResult)}${button('bind-unresolved','対応がわからないまま残す','Leave mapping unresolved','',!!historyResult)}</div>
    <div id="mapping-status" class="status">${!c.binding?t('回答の範囲は未指定です。自動では推測しません。','Response scope is not specified. It is not inferred automatically.'):c.binding.kind==='WHOLE'?t('この質問には回答全体を使います。','This question uses the whole response.'):c.binding.kind==='PARTIAL'?`${t('指定範囲','Selected range')} [${c.binding.range.start}, ${c.binding.range.end}) UTF-8 bytes`:t('対応は未解決です。この質問には評価・結果を保存できません。','Mapping is unresolved. No evaluation or result can be saved for this question.')}</div>
    ${c.binding?.kind==='PARTIAL'?`<pre class="saved-original">${esc(utf8Range(original.text,c.binding.range.start,c.binding.range.end))}</pre>`:''}</div>
    <h3>${t('期待される内容','Expected content')}</h3><p id="expected-content">${esc(loc(c.question.snapshot.expected))}</p><h3>${t('見るポイント','What to look for')}</h3><p id="review-guidance">${esc(loc(c.question.snapshot.rubric))}</p>
    ${mapped ? c.evaluation&&!reevaluating ? `${evaluationSummary(c.evaluation)}<div class="actions">${button('reevaluate','同じ回答を再評価する','Re-evaluate this response','',!!historyResult)}${button('view-saved-result','保存した結果を見る','View saved result','primary')}</div>` : evaluationForm() : ''}`}</details></section>`;
}
function evaluationForm() {
  return `<div id="evaluation-form">${['conclusion','confirmed','reasons'].map(type=>`<fieldset class="choices"><legend>${type==='conclusion'?t('人の結論〈必須・1つ選択〉','Your conclusion (required · choose one)'):type==='confirmed'?t('回答から確認できた内容〈必須・複数選択可〉','What you could confirm from the response (required · choose one or more)'):t('その結論にした理由・期待との違い〈必須・複数選択可〉','Reasons for your conclusion / differences (required · choose one or more)')}</legend>${Object.entries(CHOICES[type]).map(([id,word])=>`<label><input type="${type==='conclusion'?'radio':'checkbox'}" name="${type}" value="${id}" ${type==='conclusion'?evaluationDraft.choices.conclusion===id?'checked':'':evaluationDraft.choices[type].includes(id)?'checked':''}><span>${esc(pair(word))}</span></label>`).join('')}</fieldset>`).join('')}
    <div class="notes"><label><span>${t('確認箇所の補足〈任意〉','Notes on confirmed content (optional)')}</span><textarea id="confirmed-note">${esc(evaluationDraft.confirmed_note)}</textarea></label><label><span>${t('理由の補足〈任意〉','Notes on reasons (optional)')}</span><textarea id="reason-note">${esc(evaluationDraft.reason_note)}</textarea></label></div>
    <p class="small">${t('これは人による選択です。機械による事実検証や、20項目の測定完了を意味しません。','These are human selections, not machine-verified facts or completed measurements of the 20 tuning items.')}</p>
    ${lastError?`<p id="evaluation-error" class="error" role="alert">${esc(lastError)}</p>`:''}
    ${button('evaluate','結果を見る','View results','primary')}</div>`;
}
function evaluationSummary(ev) {
  const wording = ev.displayed_wording;
  return `<div class="card" id="saved-evaluation"><p class="result-conclusion">${esc(wording.conclusion[ev.choices.conclusion])}</p><h3>${t('回答から確認できた内容','What you could confirm')}</h3><ul>${Object.values(wording.confirmed).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h3>${t('その結論にした理由・期待との違い','Reasons / differences')}</h3><ul>${Object.values(wording.reasons).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
    ${ev.confirmed_note?`<p>${esc(ev.confirmed_note)}</p>`:''}${ev.reason_note?`<p>${esc(ev.reason_note)}</p>`:''}<p class="small">${t('評価時に表示された言葉で保存しています。表示言語を変えても、この評価は書き換わりません。','Saved in the wording shown at evaluation time. Switching the interface language does not rewrite this judgement.')}</p></div>`;
}
function renderResults(c) {
  return `<section id="stage-03"><h1>${title(3)}</h1><p class="intro">${t('保存した回答と、あなたが選んだ評価を確認します。<br>この結果を残したまま、質問の見直しや次の確認へ進めます。','Review the saved response and your evaluation.<br>Keep this result while revisiting the question or continuing your checks.')}</p>
    ${historyResult?`<p class="status">${t('履歴を参照中です。現在の試行は変更していません。','Viewing history. The current attempt has not changed.')}</p>`:''}
    ${!c.result?`<p class="status">${t('選択中の試行には保存済みの結果がありません。回答の範囲と人の評価を確認してください。','The selected attempt has no saved result. Check the response mapping and human evaluation.')}</p>`:`<section class="card"><h2>${t('03-1 結論','03-1 Conclusion')}</h2><p class="result-context">${esc(c.result.context.character.snapshot.identity.display_name)} / revision ${esc(c.result.context.character.character_revision)} · ${esc(c.question.snapshot.id)}</p><p>${esc(loc(c.result.context.question.prompt))}</p><p class="result-conclusion">${esc(c.evaluation.displayed_wording.conclusion[c.evaluation.choices.conclusion])}</p>
    <p id="character-mutation-state" class="status">${c.result.character_mutation?.state==='NO_CHANGE_FROM_THIS_VERIFICATION'&&c.result.character_mutation?.evidence==='TRAINER_HAS_NO_CHARACTER_WRITE_OPERATION'?t('この検証からの変更：なし','Changes from this verification: none'):t('反映状態を確認できません','Application status could not be verified')}</p></section>
    <section class="card"><h2>${t('03-2 確認できた点と注意が必要な点','03-2 Confirmed points and points to review')}</h2>${evaluationSummary(c.evaluation)}<h3>${t('保存した回答原文','Saved Original Response')}</h3><pre class="saved-original">${esc(c.original.text)}</pre><p>${t('この質問に使った範囲','Response scope used for this question')}: ${c.binding.kind==='WHOLE'?t('回答全体','Whole response'):`[${c.binding.range.start}, ${c.binding.range.end}) UTF-8 bytes`}</p><details><summary>${t('この結果の記録情報','Record information for this result')}</summary><pre>${esc(JSON.stringify({result_id:c.result.id,evaluation_id:c.evaluation.id,original_id:c.original.id,binding_id:c.binding.id,choice_set_version:c.evaluation.choice_set_version,context:c.result.context},null,2))}</pre></details></section>`}
    <section class="card"><h2>${t('03-3 次にすること','03-3 Next steps')}</h2><div class="actions">${button('back-ai','02 AIで確認するへ戻る','Back to 02 Check with AI','',!c.execution)}${button('back-prepare','準備を見直す','Review preparation')}${button('choose-question','別の質問を選ぶ','Choose another question')}${button('next-question','次の質問へ','Next question','primary',!session||!!historyResult)}${button('retest','新しい回答で再テストする','Retest with a new response','',!c.execution||!!historyResult)}${historyResult?button('back-current','現在の試行へ戻る','Return to current attempt'):''}</div>
    <p class="small">${t('この汎用評価だけから変更候補や20項目の調整値は作成しません。Characterの編集はBuilderで行います。','These general evaluations do not create change candidates or tuning values for the 20 items. Character editing takes place in Builder.')}</p><a id="builder-link" class="button-link" href="./saku-builder.html">${t('Builderを開く','Open Builder')}</a></section></section>`;
}
function on(id, action) { if ($(id)) $(id).onclick=()=>guard(action); }
function bind() {
  $('locale').onchange=()=>guard(async()=>{ captureDrafts(); await saveDrafts(); language=$('locale').value; status=t('保存済み','Saved'); localStorage.setItem('saku.trainer.ux3.locale',language); });
  on('back-prepare',()=>navigate(1)); on('choose-question',()=>navigate(1)); on('back-ai',()=>navigate(2,{history:historyResult}));
  on('back-current',()=>navigate(session.view.stage===1?1:2));
  on('view-saved-result',()=>navigate(3,{history:historyResult}));
  on('history',async()=>{
    await saveDrafts(); const results=Object.values(session?.results||{});
    $('history-list').innerHTML=results.length?results.map(r=>`<div class="history-row"><span>${esc(r.context.question.id)} / ${esc(r.evaluation_snapshot.displayed_wording.conclusion[r.evaluation_snapshot.choices.conclusion])}<br><small>${esc(r.id)}</small></span><button data-result="${esc(r.id)}">${t('開く','Open')}</button></div>`).join(''):`<p>${t('保存された結果はありません。','No saved results.')}</p>`;
    $('history-dialog').showModal();
    for (const b of document.querySelectorAll('[data-result]')) b.onclick=()=>guard(async()=>{ $('history-dialog').close(); await navigate(3,{history:b.dataset.result}); });
    return false;
  });
  on('close-history',async()=>{ $('history-dialog').close(); });
  if ($('pick')) $('pick').onchange=()=>guard(async()=>{ const char=characters.get($('pick').value); if (!char) return; session=await store.create(char); stage=1; selectedSession=''; historyResult=null; draftsFromSession(); await refreshList(); status=t('新しいSessionを保存しました','New Session saved'); });
  for (const id of ['platform','question-language','test-scope','execution-mode']) if($(id)) $(id).onchange=()=>guard(savePreparation);
  for (const el of document.querySelectorAll('input[name="question"]')) el.onchange=()=>guard(savePreparation);
  if($('saved-session')) $('saved-session').onchange=()=>{ selectedSession=$('saved-session').value; $('resume-session').disabled=!selectedSession; $('delete-session').disabled=!selectedSession; };
  on('resume-session',async()=>{ const id=selectedSession; if(!id)return; await saveDrafts(); session=await store.activate(id); characters.set(session.source.character_id,session.source.snapshot); stage=session.view.stage; historyResult=session.view.history_result; draftsFromSession(); openSection=lineage().original?3:1; status=t('Sessionを再開しました','Session resumed'); });
  on('clear-session',async()=>{ await saveDrafts(); await store.detach(session.session_id); session=null; stage=1; historyResult=null; selectedSession=''; responseDraft=''; evaluationDraft=emptyEvaluation(); await refreshList(); status=t('保存して表示をクリアしました','Saved and cleared the view'); });
  on('delete-session',async()=>{
    const target=await store.load(selectedSession); if(!target)return;
    $('delete-description').textContent=`${target.source.snapshot.identity.display_name} / ${target.session_id}\n${t('質問','Questions')}: ${Object.keys(target.questions).length} · ${t('回答','Responses')}: ${Object.keys(target.originals).length} · ${t('評価','Evaluations')}: ${Object.keys(target.evaluations).length}`;
    $('delete-dialog').dataset.target=target.session_id; $('delete-dialog').dataset.version=String(target.version); $('delete-dialog').showModal();
    return false;
  });
  on('cancel-delete',async()=>{ $('delete-dialog').close(); });
  on('confirm-delete',async()=>{ const id=$('delete-dialog').dataset.target, version=Number($('delete-dialog').dataset.version); await store.delete(id,version,true); if(session?.session_id===id){session=null;stage=1;historyResult=null;} selectedSession=''; $('delete-dialog').close(); await refreshList(); status=t('指定したSessionを削除しました','The selected Session was deleted'); });
  for(const el of document.querySelectorAll('[data-legacy]')) el.onclick=()=>{
    const old=loadSession(localStorage,el.dataset.legacy); $('legacy-reference').textContent=old.ok?JSON.stringify(legacyReference(old.session),null,2):old.code;
  };
  on('start',async()=>{ await savePreparation(); const q=current(session).question?.snapshot.id || session.preparation.question_ids[0]; await start(q); });
  on('add-question',async()=>{
    const text=$('custom-question').value, expected=$('custom-expected').value, rubric=$('custom-rubric').value;
    if(!text.trim()||!expected.trim()||!rubric.trim()) throw new Error('PREPARATION_INCOMPLETE');
    const q=createUserQuestion({id:newId('USER'),text,locale:session.preparation.language,scope:session.preparation.scope});
    q.expected={[session.preparation.language]:expected}; q.rubric={[session.preparation.language]:rubric}; q.evaluation_definition_state='DEFINED';
    const p=structuredClone(session.preparation); p.custom_questions.push(q); p.question_ids.push(q.id); await run('prepare',{expected:session.preparation,preparation:p});
  });
  if($('attempt-question')) $('attempt-question').onchange=()=>guard(async()=>{const q=$('attempt-question').value;await saveDrafts();await run('view',{stage:2,question_attempt_id:q});historyResult=null;draftsFromSession();openSection=3;});
  if($('answer-input')) $('answer-input').oninput=()=>{
    captureDrafts(); $('answer-feedback').textContent=t('回答を入力しました。次に「回答を保存して評価へ」を押してください。','Response entered. Next, press “Save response and evaluate”.');
    if($('save-response')) $('save-response').disabled=!responseDraft.trim(); scheduleDraft();
  };
  on('correct-response',async()=>{correctionMode=true;responseDraft=lineage().original.text;openSection=2;});
  on('save-response',async()=>{captureDrafts();clearTimeout(draftTimer);draftTimer=null;const c=lineage();await run('response',{execution_id:c.execution.id,expected_original:session.response_heads[c.execution.id]||null,text:responseDraft});correctionMode=false;responseDraft='';evaluationDraft=emptyEvaluation();openSection=3;status=t('回答原文を保存しました。質問に使う範囲を選んでください。','Original Response saved. Choose its scope for this question.');});
  const map=async(kind,range={})=>{const c=lineage();await saveDrafts();await run('binding',{execution_id:c.execution.id,question_attempt_id:c.question.id,original_id:c.original.id,expected_binding:session.binding_heads[c.question.id]||null,kind,human_explicit:true,...range});evaluationDraft=emptyEvaluation();reevaluating=false;openSection=3;};
  on('bind-whole',()=>map('WHOLE')); on('bind-unresolved',()=>map('MAPPING_UNRESOLVED'));
  on('bind-partial',async()=>{const el=$('original-mapping'), range=selectionToUtf8(el.value,el.selectionStart,el.selectionEnd);await map('PARTIAL',range);});
  if($('evaluation-form')) $('evaluation-form').oninput=scheduleDraft;
  on('reevaluate',async()=>{reevaluating=true;evaluationDraft=emptyEvaluation();openSection=3;});
  on('evaluate',async()=>{captureDrafts();clearTimeout(draftTimer);draftTimer=null;const c=lineage();await run('evaluate',{execution_id:c.execution.id,question_attempt_id:c.question.id,binding_id:c.binding.id,expected_evaluation:session.evaluation_heads[c.binding.id]||null,language,...structuredClone(evaluationDraft)});stage=3;historyResult=null;reevaluating=false;});
  on('retest',async()=>{const c=current(session);await saveDrafts();const g=await groupFor(session,c.question.snapshot.id);await run('retest',{question_id:c.question.snapshot.id,expected_execution:session.group_heads[g.group]||null,retest_of:c.execution.id});stage=2;historyResult=null;openSection=1;draftsFromSession();});
  on('next-question',async()=>{const c=current(session),ids=session.preparation.question_ids;const next=ids[ids.indexOf(c.question?.snapshot.id)+1];if(next)await start(next);else await navigate(1);});
  if($('copy-prompt')) $('copy-prompt').onclick=async()=>{
    try { await navigator.clipboard.writeText(lineage().execution.pack.plain_text); $('copy-status').textContent=t('コピー済み。外部AIへ貼り付け、回答を取得して戻ってください。','Copied. Paste into your external AI and return with its response.'); $('ai-step-2').open=true;openSection=2; }
    catch { $('manual-copy').open=true; $('prompt-text').select();$('copy-status').textContent=t('コピーできませんでした。表示されたプロンプトを選択して手動でコピーしてください。','Copy failed. Select the displayed prompt and copy it manually.'); }
  };
}
async function savePreparation() {
  if(!session||!$('platform'))return;
  const old=session.preparation;
  const ids=[...document.querySelectorAll('input[name="question"]:checked')].map(x=>x.value);
  const p={...structuredClone(old),platform:$('platform').value,language:$('question-language').value,scope:$('test-scope').value,mode:$('execution-mode').value,
    question_ids:[...old.question_ids.filter(x=>ids.includes(x)),...ids.filter(x=>!old.question_ids.includes(x))]};
  if(p.scope!==old.scope) p.question_ids=[];
  if(JSON.stringify(p)!==JSON.stringify(old)) await run('prepare',{expected:old,preparation:p});
}
async function start(questionId) {
  const {group}=await groupFor(session,questionId);
  const resumes=Boolean(session.group_heads[group]), changed=!resumes&&Object.keys(session.executions).length>0;
  await run('start',{question_id:questionId,expected_execution:session.group_heads[group]||null});stage=2;historyResult=null;openSection=1;draftsFromSession();
  status=resumes?t('同じ条件の試行を再開しました','Resumed the attempt with the same conditions'):changed?t('条件を変更した新しい試行を開始しました。以前の記録は履歴に残っています。','Started an attempt with new conditions. Earlier records remain in history.'):t('新しい試行を準備しました','New attempt prepared');
}
async function init() {
  language=localStorage.getItem('saku.trainer.ux3.locale')==='en'?'en':'ja';
  store=await openStore();
  for(const entry of Library.list()) if(validateUnifiedV1(entry.character).ok) characters.set(entry.character.identity.character_id,entry.character);
  const params=new URLSearchParams(location.search);
  const handoff=consumeHandoff(localStorage,'trainer',{character_id:params.get('character_id')||'',character_revision:params.get('character_revision')||''});
  if(handoff.status==='REJECTED'||(params.get('character_id')&&handoff.status==='EMPTY')) throw new Error(`CHARACTER_HANDOFF_${handoff.reason||'MISSING'}`);
  const char=handoff.status==='ACCEPTED'?handoff.character:ActiveSaku.getWorkingCharacter();
  if(char&&!validateUnifiedV1(char).ok) throw new Error('CHARACTER_INVALID');
  if(char&&validateUnifiedV1(char).ok) characters.set(char.identity.character_id,char);
  const activeId=await store.active();
  if(activeId) session=await store.load(activeId);
  if(activeId === undefined && char && validateUnifiedV1(char).ok) session=await store.create(char);
  if(activeId && char && session && JSON.stringify(session.source.snapshot)!==JSON.stringify(char)) session=await store.create(char);
  if(handoff.status==='ACCEPTED'&&(!session||session.source.character_id!==char.identity.character_id||session.source.character_revision!==String(char.identity.character_revision)||JSON.stringify(session.source.snapshot)!==JSON.stringify(char))) session=await store.create(char);
  if(!activeId&&char&&handoff.status==='ACCEPTED') session=session||await store.create(char);
  // An explicit Clear view leaves active=null. A later load must not silently
  // select another Session. The Character picker starts a new one explicitly.
  if(session){characters.set(session.source.character_id,session.source.snapshot);stage=session.view.stage;historyResult=session.view.history_result;draftsFromSession();openSection=lineage().original?3:1;status=activeId===session.session_id?t('保存済みSessionを再開しました','Saved Session resumed'):t('新しいSessionを作成しました','New Session created');}
  await refreshList(); render();
}
window.addEventListener('beforeunload',event=>{if(draftTimer||busy){event.preventDefault();event.returnValue='';}});
init().catch(error=>{lastError=errorMessage(error);render();});
