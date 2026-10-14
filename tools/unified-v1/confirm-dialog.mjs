// O-11 (2026-09-24 regression, Owner: fix every one, the Golden page included):
// the WebView's confirm() titles its box with the host name, 「tauri.localhost の内容」.
// This is the app's own confirmation instead.
//
//   confirmDialog({ title, message, confirmLabel, cancelLabel }) → Promise<boolean>
//   choiceDialog({ title, message, choices: [{ value, label, primary }], cancelValue }) → Promise<value>
//   alertDialog({ title, message, okLabel }) → Promise<void>
//
// The caller passes text already in the display language. The dialog itself
// fixes three things for every screen (ライター&SNS 8d9118e): Esc cancels, the
// focus starts on the safe side (cancel), and the buttons are always in the same
// order (the action, then cancel). A second call while one is open waits its turn.
//
// 2026-10-14 keying 4-16 ① / 4-17: a three-way choice (save / leave without saving / back) and a one-button notice,
// so window.alert's 「tauri.localhost の内容」 box is not needed either.
//
// It is also set as `window.sakuConfirm` / `window.sakuChoice` / `window.sakuAlert` so the Golden page's classic
// script can reach it; where it is missing, that page falls back to confirm() / alert().
import { adoptCss } from "./adopt-css.mjs";

const STYLE_ID = "saku-confirm-style";
const CSS = `
dialog.saku-confirm{border:1px solid #c9c4b8;border-radius:10px;padding:0;max-width:min(520px,calc(100vw - 32px));box-shadow:0 12px 40px rgba(0,0,0,.18);font:inherit;color:inherit;background:#fffdf8}
dialog.saku-confirm::backdrop{background:rgba(20,20,20,.35)}
dialog.saku-confirm h2{margin:0;padding:16px 20px 0;font-size:1.05rem}
dialog.saku-confirm p{margin:0;padding:10px 20px 0;white-space:pre-wrap;line-height:1.6}
dialog.saku-confirm .saku-confirm-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;padding:16px 20px}
dialog.saku-confirm button{font:inherit;padding:6px 14px;border-radius:6px;border:1px solid #9a9486;background:#fff;cursor:pointer}
dialog.saku-confirm button[data-confirm-action]{background:#2f4a3a;border-color:#2f4a3a;color:#fff}
`;

let queue = Promise.resolve();

// buttons: [{ value, label, primary, safe }] in display order; `safe` takes the focus; cancelValue is what Esc gives.
function open({ title = "", message = "", buttons, cancelValue }, doc) {
  return new Promise(resolve => {
    // The app's CSP drops a <style> element made at run time; the sheet is adopted instead.
    adoptCss(doc, STYLE_ID, CSS);
    const dialog = doc.createElement("dialog");
    dialog.className = "saku-confirm";
    dialog.setAttribute("role", "alertdialog");
    const heading = doc.createElement("h2");
    heading.id = `saku-confirm-title-${Date.now().toString(36)}`;
    heading.textContent = title;
    const body = doc.createElement("p");
    body.id = `${heading.id}-body`;
    body.textContent = message;
    dialog.setAttribute("aria-labelledby", heading.id);
    dialog.setAttribute("aria-describedby", body.id);
    const actions = doc.createElement("div");
    actions.className = "saku-confirm-actions";
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(value);
    };
    let focusTarget = null;
    for (const spec of buttons) {
      const button = doc.createElement("button");
      button.type = "button";
      // The action, the safe way back (cancel), and any third way between them (e.g. leave without saving).
      if (spec.primary) button.dataset.confirmAction = ""; else if (spec.safe) button.dataset.confirmCancel = ""; else button.dataset.confirmAlt = "";
      button.dataset.choice = String(spec.value);
      button.textContent = spec.label;
      button.addEventListener("click", () => finish(spec.value));
      actions.append(button);
      if (spec.safe) focusTarget = button;
    }
    dialog.append(heading, body, actions);
    // Esc raises `cancel` on a modal dialog; closing any other way is a cancel too.
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(cancelValue); });
    dialog.addEventListener("close", () => finish(cancelValue));
    doc.body.append(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
    (focusTarget || actions.lastElementChild)?.focus();
  });
}

function enqueue(options, doc) {
  const next = queue.then(() => open(options, doc));
  queue = next.catch(() => {});
  return next;
}

export function confirmDialog({ title = "", message = "", confirmLabel = "OK", cancelLabel = "Cancel" } = {}, doc = globalThis.document) {
  return enqueue({ title, message, cancelValue: false, buttons: [
    { value: true, label: confirmLabel, primary: true },
    { value: false, label: cancelLabel, safe: true },
  ] }, doc);
}

/** choices in display order, the first one primary; the last one is the safe choice that Esc and the focus take. */
export function choiceDialog({ title = "", message = "", choices = [], cancelValue = null } = {}, doc = globalThis.document) {
  const safe = cancelValue ?? choices.at(-1)?.value ?? null;
  return enqueue({ title, message, cancelValue: safe, buttons: choices.map((choice, index) => ({
    value: choice.value, label: choice.label, primary: Boolean(choice.primary ?? index === 0), safe: choice.value === safe,
  })) }, doc);
}

export function alertDialog({ title = "", message = "", okLabel = "OK" } = {}, doc = globalThis.document) {
  return enqueue({ title, message, cancelValue: undefined, buttons: [{ value: undefined, label: okLabel, primary: true, safe: true }] }, doc).then(() => undefined);
}

if (typeof window !== "undefined") {
  window.sakuConfirm = options => confirmDialog(options);
  window.sakuChoice = options => choiceDialog(options);
  window.sakuAlert = options => alertDialog(options);
}
