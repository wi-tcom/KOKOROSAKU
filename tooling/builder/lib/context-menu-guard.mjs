// The WebView's own right-click menu (戻る・最新の情報に更新・印刷) is not offered outside the fields: 「最新の情報に更新」
// dropped unsaved input (2026-10-15 keying round 2 m3). In a field, the menu stays for cut, copy and paste.
// One rule for every page of the desktop app (SAKU β.13 S-10 = L3): the shared frame (app-frame.mjs), the pages without it
// (Trainer, speed test, external review, the Unified V1 page), and — as INLINE_GUARD, written in by
// scripts/generate_frozen_ia_manual.mjs — the manual and the Help pages, which load no module.

export const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

export function editableTarget(target) {
  const element = target && target.nodeType === 1 ? target : target && target.parentElement;
  return Boolean(element && element.closest && element.closest(EDITABLE_SELECTOR));
}

export function keepContextMenuToFields(doc) {
  if (doc.__sakuContextMenuKept) return;
  doc.__sakuContextMenuKept = true;
  doc.addEventListener("contextmenu", event => { if (!editableTarget(event.target)) event.preventDefault(); });
}

/** A page without the frame: in the desktop app only (the host's global is there); a browser keeps its own menu. */
export function keepContextMenuToFieldsInApp(win = globalThis) {
  if (win && win.__TAURI__ && win.document) keepContextMenuToFields(win.document);
}

/** keepContextMenuToFieldsInApp as one classic script, for the pages that load no module. */
export const INLINE_GUARD = `if(window.__TAURI__&&!document.__sakuContextMenuKept){document.__sakuContextMenuKept=true;document.addEventListener("contextmenu",e=>{const t=e.target&&e.target.nodeType===1?e.target:e.target&&e.target.parentElement;if(!(t&&t.closest&&t.closest(${JSON.stringify(EDITABLE_SELECTOR)})))e.preventDefault();});}`;
