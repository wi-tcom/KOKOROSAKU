// The Character's own files and the gate before they leave, for ④ 出力 (Owner 2026-10-14 画面改修: the exports
// move to one screen). The same bytes and the same gate as ②'s tab downloads (tools/saku-builder.html toSakuJson,
// toYaml/yamlLines, normalizeForGuard/contactGuard); scripts/verify_character_output.mjs runs both on the same
// Characters and fails when they part.
//
// JSON: the Unified V1 Character, two-space indented. YAML: the same object in the Builder's YAML writer, which the
// individual import (yaml-lite parseCharacterText) reads back.

export function characterJsonText(character) {
  return JSON.stringify(character, null, 2);
}

function q(s) {
  if (s == null) s = "";
  s = String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t");
  return `"${s}"`;
}
const IND = n => "  ".repeat(n);
function yamlScalar(value) {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return q(String(value));
}
function yamlLines(value, indent = 0) {
  const lines = []; const pad = IND(indent);
  if (Array.isArray(value)) {
    if (!value.length) return [`${pad}[]`];
    value.forEach(item => {
      if (item && typeof item === "object") {
        const entries = Object.entries(item);
        if (!entries.length) { lines.push(`${pad}- {}`); return; }
        entries.forEach(([key, child], index) => {
          const prefix = index === 0 ? `${pad}- ` : IND(indent + 1);
          if (child && typeof child === "object") {
            lines.push(`${prefix}${key}:`);
            lines.push(...yamlLines(child, indent + 2));
          } else lines.push(`${prefix}${key}: ${yamlScalar(child)}`);
        });
      } else lines.push(`${pad}- ${yamlScalar(item)}`);
    });
    return lines;
  }
  Object.entries(value || {}).forEach(([key, child]) => {
    if (child && typeof child === "object") {
      if (Array.isArray(child) && child.length === 0) lines.push(`${pad}${key}: []`);
      else if (!Array.isArray(child) && Object.keys(child).length === 0) lines.push(`${pad}${key}: {}`);
      else { lines.push(`${pad}${key}:`); lines.push(...yamlLines(child, indent + 1)); }
    } else lines.push(`${pad}${key}: ${yamlScalar(child)}`);
  });
  return lines;
}

export function characterYamlText(character) {
  return `${yamlLines(character).join("\n")}\n`;
}

/** File names as ② writes them: <id>.saku-character.json, <id>.character.yaml. */
export function outputFilename(character, kind) {
  const slug = String(character?.identity?.character_id || "character").trim().replace(/[^a-z0-9-]/g, "") || "character";
  return kind === "yaml" ? `${slug}.character.yaml` : `${slug}.saku-character.json`;
}

// ── ContactGuard (the same rules as ②) ────────────────────────────────────────
export function normalizeForGuard(text) {
  let t = String(text || "");
  t = t.replace(/[​-‍⁠﻿­]/g, "");
  try { t = t.normalize("NFKC"); } catch { /* left as it is */ }
  return t;
}

export const CONTACT_GUARD_RULES = Object.freeze([
  ["メールアドレス", /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/i],
  ["メールアドレス", /[\w.+-]+\s*[\[(（]\s*at\s*[\])）]\s*[\w-]+(?:\s*[\[(（]\s*dot\s*[\])）]\s*|\.)[\w-]+/i],
  ["電話番号", /(?:\+?\d{1,3}|0\d{1,4})[\s()-]\d{1,4}[\s-]\d{3,4}/],
  ["電話番号", /(?:^|[^\d-])0\d{9,10}(?![\d-])/],
  ["URL", /(?:https?:\/\/|www\.)\S+/i],
  ["URL", /[\w-]+\.(?:com|jp|net|org|io|co\.jp|dev|app|site|info)(?:[\/:?#]|\b)/i],
  ["SNS ID", /(?:^|[^\w])(?:LINE|Discord|Instagram|SNS|X|Twitter|Telegram|WhatsApp|Facebook|Messenger|WeChat|微信|KakaoTalk|Skype|Signal)[\s:：@]+[\w.-]{3,}/i],
  ["住所らしい表現", /(?:都|道|府|県).{0,12}(?:市|区|町|村)/],
  ["住所らしい表現", /〒\s*\d{3}-?\d{4}/],
  ["口座・決済情報", /(?:口座番号|クレジットカード|カード番号|振込先|PayPay|bank\s*account)/i],
  ["QR誘導", /(?:QRコード|QRを)/i],
  ["秘密情報", /(?:password|パスワード|秘密鍵|api[_ -]?key|アクセストークン)/i],
  ["秘密情報", /(?:token|secret|passphrase|共有秘密|合言葉)\s*[:：=]\s*\S{8,}/i],
]);

/** { safe, hits: [label] } — what ②'s contactGuard returns for the same text. */
export function contactGuard(text) {
  const t = normalizeForGuard(text);
  const hits = [];
  for (const [label, rule] of CONTACT_GUARD_RULES) if (rule.test(t) && !hits.includes(label)) hits.push(label);
  return { safe: hits.length === 0, hits };
}

/**
 * Before a file leaves ④: the save check passed, ContactGuard found nothing, and a person confirmed this exact
 * text (the confirmation is bound to the text, as ②'s approval snapshot is).
 */
export function outputGate({ text, schemaOk, confirmedText }) {
  const guard = contactGuard(text);
  const confirmed = typeof confirmedText === "string" && confirmedText === text;
  return { ok: Boolean(schemaOk) && guard.safe && confirmed, schemaOk: Boolean(schemaOk), hits: guard.hits, confirmed };
}

/**
 * The terms notice an export of a changed pack Character carries (00A 2026-10-14, ADR-0026 §10, §14): the pack's
 * terms continue, it may not be redistributed, and it is modified. null for anything else.
 */
export function packTermsNotice(entry) {
  const provenance = entry && entry.provenance;
  const from = provenance && (provenance.kind === "PACK_EDITED" || provenance.kind === "SELF_MADE_ZIP") ? provenance.edited_from : null;
  if (!from || !from.pack_id) return null;
  return { pack_id: from.pack_id, pack_version: from.pack_version || "", license: from.license || "" };
}
