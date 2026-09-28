// O-11 (2026-09-24 regression, Owner: fix every one, the Golden page included):
// the WebView's confirm() titles its box with the host name, 「tauri.localhost の内容」.
// This is the app's own confirmation instead.
//
//   confirmDialog({ title, message, confirmLabel, cancelLabel }) → Promise<boolean>
//
// The caller passes text already in the display language. The dialog itself
// fixes three things for every screen (ライター&SNS 8d9118e): Esc cancels, the
// focus starts on the safe side (cancel), and the buttons are always in the same
// order (the action, then cancel). A second call while one is open waits its turn.
//
// It is also set as `window.sakuConfirm` so the Golden page's classic script can
// reach it; where it is missing, that page falls back to confirm().

const STYLE_ID = "saku-confirm-style";
const CSS = `
dialog.saku-confirm{border:1px solid #c9c4b8;border-radius:10px;padding:0;max-width:min(520px,calc(100vw - 32px));box-shadow:0 12px 40px rgba(0,0,0,.18);font:inherit;color:inherit;background:#fffdf8}
dialog.saku-confirm::backdrop{background:rgba(20,20,20,.35)}
dialog.saku-confirm h2{margin:0;padding:16px 20px 0;font-size:1.05rem}
dialog.saku-confirm p{margin:0;padding:10px 20px 0;white-space:pre-wrap;line-height:1.6}
dialog.saku-confirm .saku-confirm-actions{display:flex;gap:8px;justify-content:flex-end;padding:16px 20px}
dialog.saku-confirm button{font:inherit;padding:6px 14px;border-radius:6px;border:1px solid #9a9486;background:#fff;cursor:pointer}
dialog.saku-confirm button[data-confirm-action]{background:#2f4a3a;border-color:#2f4a3a;color:#fff}
`;

let queue = Promise.resolve();

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.append(style);
}

function open({ title = "", message = "", confirmLabel = "OK", cancelLabel = "Cancel" }, doc) {
  return new Promise(resolve => {
    ensureStyle(doc);
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
    const ok = doc.createElement("button");
    ok.type = "button"; ok.dataset.confirmAction = ""; ok.textContent = confirmLabel;
    const cancel = doc.createElement("button");
    cancel.type = "button"; cancel.dataset.confirmCancel = ""; cancel.textContent = cancelLabel;
    actions.append(ok, cancel);
    dialog.append(heading, body, actions);
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(value);
    };
    ok.addEventListener("click", () => finish(true));
    cancel.addEventListener("click", () => finish(false));
    // Esc raises `cancel` on a modal dialog; closing any other way is a cancel too.
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(false); });
    dialog.addEventListener("close", () => finish(false));
    doc.body.append(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
    cancel.focus();
  });
}

export function confirmDialog(options = {}, doc = globalThis.document) {
  const next = queue.then(() => open(options, doc));
  queue = next.catch(() => {});
  return next;
}

if (typeof window !== "undefined") window.sakuConfirm = options => confirmDialog(options);
