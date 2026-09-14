export const REVIEW_STATES = Object.freeze(["MATCH", "DIFFERENT", "UNKNOWN", "NOT_TESTED", "INVALID"]);

const text = value => typeof value === "string" ? value.trim() : "";

export function classifyReviewRound(round, expected) {
  if (!round || !text(round.probeId) || !text(round.trait)) return "INVALID";
  if (!round.reviewed) return "NOT_TESTED";
  if (round.held || !text(round.answer) || round.score == null) return "UNKNOWN";
  const expectedScore = expected?.traits?.[round.trait]?.score;
  if (expectedScore == null || !Number.isFinite(Number(round.score))) return "UNKNOWN";
  return Math.abs(Number(round.score) - Number(expectedScore)) >= .25 ? "DIFFERENT" : "MATCH";
}

export function buildReviewResults({ character, expected, rounds = [], suggestions } = {}) {
  if (!character || !expected) {
    return { status: "INVALID", character: null, results: [], counts: { INVALID: 1 }, candidate_available: false };
  }
  const suggestionList = Array.isArray(suggestions?.suggestions) ? suggestions.suggestions : [];
  const results = rounds.map((round, index) => {
    const expectedTrait = expected.traits?.[round?.trait];
    const expectedScore = expectedTrait?.score;
    const observedScore = round?.score == null ? null : Number(round.score);
    const state = classifyReviewRound(round, expected);
    const suggestion = suggestionList.find(item => item.trait === round?.trait) || null;
    return {
      index,
      round: index + 1,
      probe_id: text(round?.probeId) || "INVALID",
      trait: text(round?.trait) || "INVALID",
      state,
      expected: expectedScore == null ? "UNKNOWN" : Number(expectedScore),
      observed: observedScore == null || !Number.isFinite(observedScore) ? "UNKNOWN" : observedScore,
      delta: expectedScore == null || observedScore == null || !Number.isFinite(observedScore)
        ? "UNKNOWN"
        : +(observedScore - Number(expectedScore)).toFixed(3),
      evidence_present: Boolean(text(round?.answer)),
      evidence_excerpt: text(round?.answer),
      evidence_source: text(round?.answer) ? "USER_PASTED_EXTERNAL_AI_RESPONSE" : "NONE",
      observation_source: round?.score == null ? "NONE" : "HUMAN_RUBRIC",
      suggestion: suggestion?.possible_explanation || "NOT_AVAILABLE",
      candidate_changes: Array.isArray(suggestion?.candidate_changes) ? structuredClone(suggestion.candidate_changes) : [],
    };
  });
  const counts = Object.fromEntries(REVIEW_STATES.map(state => [state, results.filter(result => result.state === state).length]));
  return {
    status: results.some(result => result.state !== "NOT_TESTED") ? "READY" : "NOT_TESTED",
    character: {
      id: character.identity?.character_id || "UNKNOWN",
      name: character.identity?.display_name || character.identity?.character_id || "Unknown Character",
      revision: character.identity?.character_revision || "UNKNOWN",
    },
    results,
    counts,
    candidate_available: results.some(result => result.candidate_changes.length > 0),
  };
}

export function reviewCopy(locale = "ja-JP") {
  return locale === "en-US" ? {
    nav: "Review Results", title: "Review Results", lead: "Review what was expected, what was observed, and what remains unknown.",
    boundaryTitle: "Review is not approval.", boundary: "This screen does not approve, certify, activate, or update Canonical Character data.",
    emptyTitle: "There are no test results to review yet.", emptyBody: "Run at least one Trainer probe, or return to the Character Viewer.",
    startTest: "Run a Trainer probe", backViewer: "Return to Viewer", status: "Review status", history: "Test history",
    character: "Character", revision: "Revision", probe: "Test / probe", expected: "Expected", observed: "Observed", diff: "Diff",
    suggestion: "Suggestion", candidate: "Candidate", source: "Source / evidence", details: "Technical evidence",
    noEvidence: "No independent observation evidence is available.", evidencePresent: "Pasted response and Human rubric are present.",
    unknown: "Unknown values are not promoted to MATCH.", continueTest: "Continue in Trainer", builder: "Open editable Candidate in Builder",
    builderUnavailable: "A Builder Candidate becomes available only when a supported difference has an explicit candidate change.",
    invalid: "Review data is invalid. Return to Trainer setup and load the Character again.",
    resultsAvailable: count => `${count} reviewed result(s)`, noSuggestion: "No change is suggested from the available evidence.",
  } : {
    nav: "結果を確認する", title: "結果を確認する", lead: "期待された傾向、観察された内容、まだ不明な内容を分けて確認します。",
    boundaryTitle: "Reviewは承認ではありません。", boundary: "この画面は承認・認証・revision有効化・Canonical Character更新を行いません。",
    emptyTitle: "確認できるtest結果はまだありません。", emptyBody: "Trainerで1件以上のProbeを実行するか、Character Viewerへ戻ってください。",
    startTest: "TrainerでProbeを実行", backViewer: "Viewerへ戻る", status: "Review状態", history: "test履歴",
    character: "Character", revision: "Revision", probe: "test / probe", expected: "Expected", observed: "Observed", diff: "Diff",
    suggestion: "Suggestion", candidate: "Candidate", source: "source / evidence", details: "技術的Evidence",
    noEvidence: "独立した観察Evidenceはありません。", evidencePresent: "貼り付け回答とHuman rubricがあります。",
    unknown: "不明な値をMATCHへ昇格しません。", continueTest: "Trainerを続ける", builder: "Builderで編集用Candidateを開く",
    builderUnavailable: "明示的な変更候補を持つ差分がある場合だけBuilder Candidateを作れます。",
    invalid: "Review dataが不正です。Trainer設定へ戻り、Characterを読み直してください。",
    resultsAvailable: count => `確認済み結果 ${count}件`, noSuggestion: "現在のEvidenceから変更提案はありません。",
  };
}
