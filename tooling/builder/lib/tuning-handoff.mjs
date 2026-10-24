// AI動作の調整 → ②キャラクター編集 (SAKU β.13 L12; Owner 結果 364, D-1〜D-11; 統括 2026-10-22 案 Y).
//
// 「この内容でキャラクター編集を開く」 writes nothing. The Character the tuning made is checked against the adopted Schema
// first (D-10): an error the tuning added stops it there, with the field. Otherwise the row's own Character is handed to ②
// as the opened Character (so ② sees the tuning as an unsaved change, I-1), and the tuned Character travels beside it under
// its own key. ② takes the tuned Character into its form. A field ② shows no input for still travels in the form (its
// `unified` part, unified-authoring.mjs fromUnifiedCharacter), so ②'s own save keeps it and leaving without saving drops
// it (案 Y, 統括 2026-10-22); ② only names those fields in its notice (T-4). Nothing here touches the list or the
// Workspace: the save is ②'s, through its own path (D-1).

export const TUNING_HANDOFF_KEY = "saku.desktop.pendingTuning";
export const TUNING_SCHEMA_REFUSED = "TUNING_SCHEMA_REFUSED";

const errorKey = error => `${error?.path ?? ""}|${error?.keyword ?? ""}|${error?.message ?? ""}`;
/**
 * D-10: the Schema errors the tuning added, or null. An error the row already had is not the tuning's (② refuses the save
 * for it as it always did); only what the tuning made wrong stops the tuning.
 */
export function tuningSchemaRefusal(originalErrors, tunedErrors) {
  const before = new Set((originalErrors || []).map(errorKey));
  const added = (tunedErrors || []).filter(error => !before.has(errorKey(error)));
  return added.length ? { code: TUNING_SCHEMA_REFUSED, errors: added } : null;
}

const identityOf = character => ({ id: String(character?.identity?.character_id ?? ""), revision: String(character?.identity?.character_revision ?? "") });

/** Put the tuned Character beside the hand-off of the row's own Character (① and ⑤ → ②). */
// 結果 420 (統括 2026-10-24): openOnly — a field ⑤ cannot take a text for; ② opens on the row's own Character at that field.
export function storeTuningHandoff(storage, { original, tuned, itemId, fields, openOnly = false }) {
  const { id, revision } = identityOf(original);
  storage.setItem(TUNING_HANDOFF_KEY, JSON.stringify({ character_id: id, character_revision: revision, item_id: String(itemId || ""), fields: [...fields], tuned, open_only: openOnly === true }));
}

/**
 * ② takes the tuning once (the key is removed whatever it holds). It is taken only for the Character ② opened: the same
 * Character ID and revision, and a tuned Character of the same Character ID. Anything else is dropped, not guessed at.
 */
export function takeTuningHandoff(storage, opened) {
  let raw = null;
  try { raw = storage.getItem(TUNING_HANDOFF_KEY); storage.removeItem(TUNING_HANDOFF_KEY); } catch { return null; }
  if (!raw) return null;
  let held;
  try { held = JSON.parse(raw); } catch { return null; }
  const { id, revision } = identityOf(opened);
  if (!held || !id || held.character_id !== id || held.character_revision !== revision) return null;
  if (identityOf(held.tuned).id !== id || !Array.isArray(held.fields) || held.fields.some(field => typeof field !== "string" || !field)) return null;
  return { tuned: held.tuned, itemId: String(held.item_id || ""), fields: held.fields, openOnly: held.open_only === true };
}

/** The tuned fields ② shows no input for (named in its notice, T-4), in the order they were tuned. */
export function fieldsWithoutInput(fields, formPaths) {
  const onForm = new Set(formPaths || []);
  return (fields || []).filter(field => !onForm.has(field));
}
