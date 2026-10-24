// What must not travel in a public bundle — the desktop installer (.desktop-dist) and the public web tool (tooling/builder).
// SAKU β.13 S-8 + L21 (設計 v4 §2 S-8; 統括の下調べ SCOPE_2026-10-22 S-8; 照らし VERIFY_2026-10-22_SAKU121_9bf4646 §8 N-1):
// one table for both checks (verify_desktop_host, verify_public_builder_tooling), so neither misses what the other stops.
//
//   a private host path    the Owner's user folder, written plainly or escaped in JS／JSON (C:\\Users), or OneDrive
//   a local protocol       file: with something after it; the two object keys of L19 (`file: entry.file`, `file: ch.file`) pass
//   an internal record     the folders the internal records live in (handoff-seat8, codex-handoff)
//   a secret               a private key block, or a privateKey field
//   a mail address         any address, except in third-party/ (the authors named by the licences we must carry) and an
//                          image's density suffix such as 128x128@2x.png
export const LEAK_PATTERNS = Object.freeze([
  ["a private host path", /C:\/Users|C:\\Users|C:\\\\Users|OneDrive/i],
  ["a local protocol", /(?:^|[^A-Za-z])file:(?!\s(?:entry|ch)\.file\b)/i],
  ["an internal record", /handoff-seat8|codex-handoff/i],
  ["a secret", /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bprivateKey\b/],
  ["a mail address", /[A-Za-z0-9._%+-]+@(?![0-9]+x\.)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/],
]);

const mailExempt = relative => /^third-party\//.test(relative);

/** The names of what leaks in one file (relative to the bundle's root, with "/"). Empty when nothing does. */
export function leaksIn(relative, text) {
  return LEAK_PATTERNS.filter(([name, pattern]) => !(name === "a mail address" && mailExempt(relative)) && pattern.test(text)).map(([name]) => name);
}

// The check itself: what it must stop, and what it lets through.
export const LEAK_EXAMPLES = Object.freeze({
  stops: Object.freeze([
    ["app.mjs", "file:///C:/x"], ["app.mjs", "file: D:\\work\\a.zip"], ["app.mjs", "file: /home/me/a.zip"], ["app.mjs", "file: \\\\server\\share"],
    ["app.mjs", "src=\"file:x\""], ["app.mjs", "C:\\Users\\me"], ["app.mjs", "C:/Users/me"], ["app.mjs", "OneDrive"],
    ["app.mjs", "\"C:\\\\Users\\\\me\\\\a.json\""], ["app.mjs", "// handoff-seat8/NOTICE.md"], ["data.json", "\"codex-handoff-20260911/brand/a.md\""],
    ["key.pem", "-----BEGIN PRIVATE KEY-----"], ["key.pem", "-----BEGIN EC PRIVATE KEY-----"], ["app.mjs", "{ privateKey: k }"],
    ["app.mjs", "contact someone@example.com"], ["third-party-notes.md", "a@b.org"],
  ]),
  passes: Object.freeze([
    ["app.mjs", "{ file: entry.file, zip_sha256 }"], ["app.mjs", "{ saveable: true, file: ch.file, bytes }"],
    ["resources/brand.json", "\"128x128@2x.png\": {"], ["third-party/THIRD_PARTY_LICENSE_MANIFEST.json", "\"Jane Doe <jane@example.org>\""],
    ["app.mjs", "a public key, not a private one"],
  ]),
});
