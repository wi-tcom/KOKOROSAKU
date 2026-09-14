// 15 Axes → renderer projection.
//
// The 15 personality axes are a SAKU Character's *semantic preferences*. The
// renderer is where those preferences become something a downstream surface can
// act on. Until now only two axes reached a renderer target the contract names,
// and one reached the wrong layer, so eleven preferences were carried in the
// Character, saved, exported — and dropped before anything could use them.
//
// The mapping below is not authored here. It is transcribed from the verified
// authoritative contract and must not be edited to mean something else:
//
//   source role  SAKU_UNIFIED_AMU_HYDRATION_RESERVED_EXTENSION_PACKET
//   source file  02_saku-15-axes-layer-mapping.candidate.tsv
//   mapping  sha256 0f31871fbcf7ffec38f39808ff43cc121c41da97cc86ca350cc65976035f48f5
//   manifest sha256 aaa5d19d916af0d6dd0d96a56fedb1604cff324e5dfd9e416185a0fbf52e16bb
//
// The recorded digests bind this transcription to its source packet. This copy
// remains a derivation and never becomes the authority.
//
// The boundary the contract draws, and this module keeps:
//
//   semantic preference          belongs to the SAKU Character
//   physical rendering/execution belongs to the renderer named by the contract
//
// So `i_thinking_pause_ms` becomes a bounded presentation *timing hint* and is
// never a sleep; `l_weathering_presentation` becomes a visual token and never
// touches memory retention; `j_theme_color` becomes a colour *token* and never a
// colour asset. Nothing here converts one axis into another's vocabulary.

export const AXIS_CONTRACT = [
  { axis: "a_motif", meaning: "Recurring expressive motif preference", renderer_target: "presentation.motif_token", owner: "PRESENTATION_RENDERER", end_to_end: "CHARACTER_AXIS_TO_GENERIC_PROFILE_TO_PRESENTATION_TOKEN" },
  { axis: "b_companion_domain", meaning: "Preferred companion relationship/domain framing", renderer_target: "prompt.companion_domain_guidance", owner: "PROMPT_RENDERER", end_to_end: "CHARACTER_AXIS_TO_GENERIC_PROFILE_TO_PROMPT_GUIDANCE" },
  { axis: "c_intelligence_vector", meaning: "Reasoning emphasis tendency; not verified competence", renderer_target: "prompt.cognitive_tendency", owner: "PROMPT_RENDERER", end_to_end: "CHARACTER_AXIS_TO_GENERIC_PROFILE_TO_PROMPT_GUIDANCE" },
  { axis: "d_socratic_angle", meaning: "Preferred questioning and perspective-shift strategy", renderer_target: "prompt.questioning_strategy", owner: "PROMPT_RENDERER", end_to_end: "CHARACTER_AXIS_TO_GENERIC_PROFILE_TO_PROMPT_GUIDANCE" },
  { axis: "e_vocabulary_tone", meaning: "Lexical and tonal expression preference", renderer_target: "prompt.vocabulary_tone", owner: "PROMPT_RENDERER", end_to_end: "CHARACTER_AXIS_TO_GENERIC_PROFILE_TO_PROMPT_GUIDANCE" },
  { axis: "f_acknowledgement", meaning: "Preferred acknowledgement expression and response posture", renderer_target: "prompt.acknowledgement_style", owner: "PROMPT_RENDERER", end_to_end: "CHARACTER_AXIS_TO_GENERIC_PROFILE_TO_PROMPT_GUIDANCE" },
  { axis: "g_pulse", meaning: "Response-rhythm metaphor; not a literal wait command", renderer_target: "presentation.response_rhythm", owner: "PRESENTATION_RENDERER", end_to_end: "CHARACTER_AXIS_TO_GENERIC_PROFILE_TO_PRESENTATION_RHYTHM" },
  { axis: "h_tactile", meaning: "Tactile metaphor for expression; not a physical haptic resource", renderer_target: "presentation.tactile_metaphor", owner: "PRESENTATION_RENDERER", end_to_end: "CHARACTER_AXIS_TO_GENERIC_PROFILE_TO_PRESENTATION_TOKEN" },
  { axis: "i_thinking_pause_ms", meaning: "Pacing/presentation preference retained losslessly; not LLM thinking time or a sleep command", renderer_target: "presentation.pacing_timing_hint", owner: "PRESENTATION_RENDERER_OR_AMU_RUNTIME", end_to_end: "CHARACTER_AXIS_TO_GENERIC_PROFILE_TO_BOUNDED_PRESENTATION_TIMING_HINT" },
  { axis: "j_theme_color", meaning: "Semantic visual color tendency; not a physical color asset", renderer_target: "presentation.theme_color_token", owner: "PRESENTATION_RENDERER", end_to_end: "CHARACTER_AXIS_TO_GENERIC_PROFILE_TO_PRESENTATION_COLOR_TOKEN" },
  { axis: "k_whitespace_percent", meaning: "Preferred whitespace density for presentation", renderer_target: "presentation.layout_whitespace", owner: "PRESENTATION_RENDERER", end_to_end: "CHARACTER_AXIS_TO_GENERIC_PROFILE_TO_LAYOUT_CONSTRAINT" },
  { axis: "l_weathering_presentation", meaning: "Visual weathering metaphor only; never memory deletion or retention", renderer_target: "presentation.weathering_visual", owner: "PRESENTATION_RENDERER", end_to_end: "CHARACTER_AXIS_TO_GENERIC_PROFILE_TO_VISUAL_EFFECT_TOKEN" },
  { axis: "m_error_narrative", meaning: "Narrative style for explaining errors; not correctness or retry policy", renderer_target: "prompt.error_narration_style", owner: "PROMPT_RENDERER", end_to_end: "CHARACTER_AXIS_TO_GENERIC_PROFILE_TO_PROMPT_GUIDANCE" },
  { axis: "n_crystallization", meaning: "Preferred synthesis and conclusion pattern", renderer_target: "prompt.synthesis_pattern", owner: "PROMPT_RENDERER", end_to_end: "CHARACTER_AXIS_TO_GENERIC_PROFILE_TO_PROMPT_GUIDANCE" },
  { axis: "o_closing", meaning: "Semantic closing expression; physical animation remains external", renderer_target: "prompt.closing_expression + presentation.closing_animation", owner: "PROMPT_RENDERER_AND_PRESENTATION_RENDERER", end_to_end: "CHARACTER_AXIS_TO_GENERIC_PROFILE_TO_PROMPT_AND_PRESENTATION_TOKENS" },
];

export const AXIS_IDS = AXIS_CONTRACT.map(row => row.axis);

// A target string may name more than one leaf (o_closing names two). Split on
// the contract's own separator rather than guessing which leaf is "primary".
export function targetsOf(row) {
  return row.renderer_target.split("+").map(part => part.trim()).filter(Boolean);
}

export function layerOf(target) {
  const layer = String(target).split(".")[0];
  return layer === "prompt" || layer === "presentation" ? layer : "UNKNOWN";
}

// The Character's own value, untouched. A missing axis is reported as absent
// rather than substituted, so a silent drop is distinguishable from a value the
// Character never carried.
function axisValue(character, axis) {
  const axes = (character && character.personality_axes) || {};
  const value = axes[axis];
  if (value === undefined || value === null || value === "") return { present: false, value: null };
  return { present: true, value };
}

// i_thinking_pause_ms is a pacing preference, not a duration to wait. It is
// carried as a bounded hint and labelled as one; nothing in this module or its
// callers may turn it into a delay.
export const PACING_HINT_BOUNDS = { min: 0, max: 10000 };
function boundedTimingHint(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return { value: null, bounded: false, note: "NOT_A_NUMBER" };
  const bounded = Math.max(PACING_HINT_BOUNDS.min, Math.min(PACING_HINT_BOUNDS.max, raw));
  return {
    value: bounded,
    bounded: bounded !== raw,
    unit: "ms",
    kind: "PRESENTATION_TIMING_HINT",
    not: "NOT_LLM_THINKING_TIME_NOT_SLEEP",
  };
}

/**
 * Project every axis onto the renderer target the contract names.
 *
 * Returns the two renderer surfaces plus a per-axis trace, so a caller — or a
 * test — can see which axis produced which leaf without re-deriving it.
 */
export function renderAxes(character) {
  const prompt = {};
  const presentation = {};
  const trace = [];
  for (const row of AXIS_CONTRACT) {
    const { present, value } = axisValue(character, row.axis);
    const leaves = targetsOf(row);
    const emitted = [];
    for (const target of leaves) {
      const layer = layerOf(target);
      const leaf = target.slice(target.indexOf(".") + 1);
      const payload = {
        axis: row.axis,
        meaning: row.meaning,
        owner: row.owner,
        present,
        value: row.axis === "i_thinking_pause_ms" && present ? boundedTimingHint(value) : value,
      };
      if (layer === "prompt") prompt[leaf] = payload;
      else if (layer === "presentation") presentation[leaf] = payload;
      emitted.push({ target, layer, leaf });
    }
    trace.push({ axis: row.axis, present, renderer_target: row.renderer_target, owner: row.owner, emitted });
  }
  return { prompt, presentation, trace };
}

// Human-readable labels for the prompt surface. These name the slot, not the
// axis's meaning — the meaning travels in the payload and comes from the
// contract, so nothing here can quietly redefine an axis.
const PROMPT_LABELS = {
  companion_domain_guidance: "関係・領域の構え",
  cognitive_tendency: "推論の重心",
  questioning_strategy: "問いの立て方",
  vocabulary_tone: "語彙と語調",
  acknowledgement_style: "受け止め方",
  error_narration_style: "誤りの説明の仕方",
  synthesis_pattern: "結論の結び方",
  closing_expression: "締めくくりの表現",
};

/**
 * The prompt lines the 15 Axes contribute. Presentation-owned axes are absent
 * by design: the contract puts them on the presentation renderer, and a
 * Presentation axis is not required to appear in prompt text.
 */
export function promptAxisLines(character) {
  const { prompt } = renderAxes(character);
  const lines = [];
  for (const leaf of Object.keys(PROMPT_LABELS)) {
    const slot = prompt[leaf];
    if (!slot || !slot.present) continue;
    lines.push(`${PROMPT_LABELS[leaf]}: ${slot.value}`);
  }
  return lines;
}

/**
 * The presentation tokens the 15 Axes contribute, for a surface that renders
 * them. Values are carried as tokens; turning a token into a colour, a font or
 * an animation is the renderer's job, not this module's.
 */
export function presentationTokens(character) {
  const { presentation } = renderAxes(character);
  const tokens = [];
  for (const [leaf, slot] of Object.entries(presentation)) {
    if (!slot.present) continue;
    const value = leaf === "pacing_timing_hint" ? `${slot.value.value}${slot.value.unit}` : slot.value;
    tokens.push({ leaf, axis: slot.axis, value, meaning: slot.meaning, owner: slot.owner });
  }
  return tokens;
}

/** Which axes carry no value on this Character. Absent is not the same as dropped. */
export function absentAxes(character) {
  return AXIS_CONTRACT.filter(row => !axisValue(character, row.axis).present).map(row => row.axis);
}
