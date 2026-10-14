// CSS that a module adds at run time (2026-10-14 keying). The desktop app's CSP gets a nonce from Tauri for the
// <style> elements written in the pages, and with a nonce present 'unsafe-inline' no longer counts: a <style> element
// or a style="" attribute made at run time is dropped. A constructed stylesheet (CSSOM) is not, so the sheet is adopted
// into the document; a document without adoptedStyleSheets gets a <style> element as before.
const adopted = new WeakMap();

export function adoptCss(doc, id, css) {
  if (!doc) return;
  let ids = adopted.get(doc);
  if (!ids) { ids = new Set(); adopted.set(doc, ids); }
  if (ids.has(id) || doc.getElementById(id)) return;
  const View = doc.defaultView;
  if (View && typeof View.CSSStyleSheet === "function" && "adoptedStyleSheets" in doc) {
    try {
      const sheet = new View.CSSStyleSheet();
      sheet.replaceSync(css);
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
      ids.add(id);
      return;
    } catch { /* fall through to the element */ }
  }
  const style = doc.createElement("style");
  style.id = id;
  style.textContent = css;
  doc.head.append(style);
  ids.add(id);
}
