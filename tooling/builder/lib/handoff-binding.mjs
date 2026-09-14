const STORAGE_KEYS = Object.freeze({
  character: Object.freeze({ payload: "saku.desktop.pendingCharacter", binding: "saku.desktop.pendingCharacterBinding" }),
  trainer: Object.freeze({ payload: "saku.desktop.pendingTrainerCharacter", binding: "saku.desktop.pendingTrainerCharacterBinding" }),
});

export function handoffContentDigest(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function keysFor(kind) {
  const keys = STORAGE_KEYS[kind];
  if (!keys) throw new Error(`UNKNOWN_HANDOFF_KIND:${kind}`);
  return keys;
}

export function clearHandoff(storage, kind) {
  const keys = keysFor(kind);
  storage.removeItem(keys.payload);
  storage.removeItem(keys.binding);
}

export function storeHandoff(storage, kind, character) {
  const keys = keysFor(kind);
  const payload = JSON.stringify(structuredClone(character));
  const parsed = JSON.parse(payload);
  const binding = {
    character_id: parsed?.identity?.character_id || "",
    character_revision: String(parsed?.identity?.character_revision ?? "UNKNOWN"),
    content_digest: handoffContentDigest(payload),
  };
  storage.setItem(keys.payload, payload);
  storage.setItem(keys.binding, JSON.stringify(binding));
  return { payload, binding };
}

export function consumeHandoff(storage, kind, expected = {}) {
  const keys = keysFor(kind);
  const payloadText = storage.getItem(keys.payload);
  const bindingText = storage.getItem(keys.binding);
  if (payloadText === null && bindingText === null) return { status: "EMPTY" };

  const reject = (reason) => {
    clearHandoff(storage, kind);
    return { status: "REJECTED", reason };
  };
  if (payloadText === null || bindingText === null) return reject("HANDOFF_BINDING_MISSING");

  try {
    const character = JSON.parse(payloadText);
    const binding = JSON.parse(bindingText);
    const characterId = character?.identity?.character_id || "";
    const characterRevision = String(character?.identity?.character_revision ?? "");
    if (binding?.character_id !== characterId) return reject("HANDOFF_BINDING_IDENTITY_MISMATCH");
    if (String(binding?.character_revision ?? "") !== characterRevision) return reject("HANDOFF_BINDING_REVISION_MISMATCH");
    if (binding?.content_digest !== handoffContentDigest(payloadText)) return reject("HANDOFF_BINDING_CONTENT_MISMATCH");
    if (expected.character_id && expected.character_id !== characterId) return reject("HANDOFF_ROUTE_IDENTITY_MISMATCH");
    if (expected.character_revision && String(expected.character_revision) !== characterRevision) return reject("HANDOFF_ROUTE_REVISION_MISMATCH");
    clearHandoff(storage, kind);
    return { status: "ACCEPTED", character, character_id: characterId, character_revision: characterRevision };
  } catch {
    return reject("HANDOFF_PAYLOAD_INVALID");
  }
}
