// A deliberately small YAML reader for Character files.
//
// Individual import accepts .yaml as well as .json, and Character definitions are
// authored as block YAML. A full YAML implementation is not needed for that and
// would be a large surface to trust; a partial one that guesses at syntax it does
// not really support is worse than none, because a silently mis-parsed Character
// looks like a successful import.
//
// So this supports exactly the subset those files use — nested block maps and
// sequences, single-line flow maps and lists, plain and quoted scalars, comments
// — and REFUSES everything else by name: anchors, aliases, merge keys, block
// scalars, tabs, multiple documents, flow that does not close on its line.
// Refusal is the feature. A file this cannot read is a file the Owner is told
// about, not one that imports wrongly.

export class YamlLiteError extends Error {
  constructor(message, line) {
    super(line ? `${message} (line ${line})` : message);
    this.name = "YamlLiteError";
    this.line = line || 0;
  }
}

const refuse = (message, line) => { throw new YamlLiteError(message, line); };

// Warnings are collected for the whole parse rather than threaded through every
// call, so a nested flow deep in the file can still report where it came from.
let activeWarnings = null;

// Remove a trailing comment, respecting quotes. In YAML a comment starts at a
// '#' that follows whitespace or begins the content.
function stripComment(text) {
  let quote = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\" && quote === '"') { i += 1; continue; }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "#" && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i);
  }
  return text;
}

function readLines(source) {
  const raw = String(source).replace(/\r\n?/g, "\n").split("\n");
  const lines = [];
  raw.forEach((text, index) => {
    const lineNo = index + 1;
    if (/^\s*$/.test(text)) return;
    if (/^\t/.test(text) || /^ *\t/.test(text)) refuse("Tab indentation is not supported", lineNo);
    const content = stripComment(text).replace(/\s+$/, "");
    if (!content.trim()) return;
    const indent = content.length - content.replace(/^ +/, "").length;
    const body = content.slice(indent);
    if (body === "---" || body === "...") { lines.push({ indent, body, lineNo, marker: true }); return; }
    lines.push({ indent, body, lineNo, marker: false });
  });
  // One document only. A leading '---' is just a start marker, but one that
  // appears after content has begun opens a second document, and the caller has
  // no way to say which Character it wanted.
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].marker) continue;
    const contentFollows = lines.slice(i + 1).some(line => !line.marker);
    if (i > 0 && contentFollows) refuse("Multiple YAML documents are not supported", lines[i].lineNo);
  }
  return lines.filter(line => !line.marker);
}

// Flow collections: { key: value, ... } and [ item, ... ]. The Character files
// use these constantly for one-line records such as a seat or a catalog entry.
// A flow that does not close on its own line is refused rather than continued,
// because continuing it means guessing where the author meant it to end.
function parseFlow(text, lineNo, warnings) {
  let i = 0;
  const error = message => refuse(message, lineNo);
  const skip = () => { while (i < text.length && /\s/.test(text[i])) i += 1; };

  function readQuoted() {
    const quote = text[i];
    let end = -1;
    for (let j = i + 1; j < text.length; j += 1) {
      if (text[j] === "\\" && quote === '"') { j += 1; continue; }
      if (text[j] === quote) { end = j; break; }
    }
    if (end < 0) error("Unterminated quoted scalar in a flow collection");
    const raw = text.slice(i, end + 1);
    i = end + 1;
    return scalar(raw, lineNo);
  }

  function readPlain() {
    const start = i;
    while (i < text.length && !",{}[]:".includes(text[i])) i += 1;
    const raw = text.slice(start, i).trim();
    if (raw === "") error("Empty value in a flow collection");
    return scalar(raw, lineNo);
  }

  function readValue() {
    skip();
    if (i >= text.length) error("Flow collection ended early");
    const ch = text[i];
    if (ch === "{") return readMap();
    if (ch === "[") return readList();
    if (ch === '"' || ch === "'") return readQuoted();
    if (ch === "&" || ch === "*") error("Anchors and aliases are not supported");
    return readPlain();
  }

  function readKey() {
    skip();
    const ch = text[i];
    if (ch === '"' || ch === "'") return readQuoted();
    const start = i;
    while (i < text.length && text[i] !== ":" && text[i] !== "," && text[i] !== "}") i += 1;
    const raw = text.slice(start, i).trim();
    if (raw === "") error("Empty key in a flow mapping");
    if (raw.startsWith("<<")) error("Merge keys are not supported");
    return raw;
  }

  function readMap() {
    i += 1; // consume '{'
    const map = {};
    skip();
    if (text[i] === "}") { i += 1; return map; }
    for (;;) {
      const key = readKey();
      skip();
      let value = null;
      if (text[i] === ":") { i += 1; value = readValue(); }
      else if (text[i] === "," || text[i] === "}") {
        // Legal YAML — a key with no value — but in these files it is almost
        // always an unquoted comma inside a plain scalar, which silently cuts
        // the real value short. Parse it the way every YAML reader does, and
        // say so, rather than inventing a different meaning.
        if (warnings) warnings.push({
          line: lineNo,
          code: "FLOW_KEY_WITHOUT_VALUE",
          detail: key,
          message: `"${key}" has no value. If the source meant it as text, the value above it was cut at a comma and needs quoting.`,
        });
      } else error("Expected ':' in a flow mapping");
      if (Object.prototype.hasOwnProperty.call(map, key)) error(`Duplicate key: ${key}`);
      map[key] = value;
      skip();
      if (text[i] === ",") { i += 1; skip(); if (text[i] === "}") { i += 1; return map; } continue; }
      if (text[i] === "}") { i += 1; return map; }
      error("Expected ',' or '}' in a flow mapping");
    }
  }

  function readList() {
    i += 1; // consume '['
    const list = [];
    skip();
    if (text[i] === "]") { i += 1; return list; }
    for (;;) {
      list.push(readValue());
      skip();
      if (text[i] === ",") { i += 1; skip(); if (text[i] === "]") { i += 1; return list; } continue; }
      if (text[i] === "]") { i += 1; return list; }
      error("Expected ',' or ']' in a flow sequence");
    }
  }

  const value = readValue();
  skip();
  if (i !== text.length) error("Unexpected content after a flow collection");
  return value;
}

function scalar(text, lineNo) {
  const value = text.trim();
  if (value === "") return "";
  if (value.startsWith("&") || value.startsWith("*")) refuse("Anchors and aliases are not supported", lineNo);
  if (value === "|" || value === ">" || /^[|>][-+\d]*$/.test(value)) refuse("Block scalars are not supported", lineNo);
  if (value.startsWith("{") || value.startsWith("[")) return parseFlow(value, lineNo, activeWarnings);
  if (value.startsWith('"')) {
    if (!value.endsWith('"') || value.length < 2) refuse("Unterminated double-quoted scalar", lineNo);
    try { return JSON.parse(value); }
    catch { refuse("Double-quoted scalar could not be read", lineNo); }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) refuse("Unterminated single-quoted scalar", lineNo);
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value === "null" || value === "~" || value === "Null" || value === "NULL") return null;
  if (value === "true" || value === "True" || value === "TRUE") return true;
  if (value === "false" || value === "False" || value === "FALSE") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  return value;
}

// Split "key: value" at the first colon that ends the key. Quoted keys are rare
// in these files but cost nothing to allow.
function splitKey(body, lineNo) {
  if (body.startsWith('"') || body.startsWith("'")) {
    const quote = body[0];
    let end = -1;
    for (let i = 1; i < body.length; i += 1) {
      if (body[i] === "\\" && quote === '"') { i += 1; continue; }
      if (body[i] === quote) { end = i; break; }
    }
    if (end < 0) refuse("Unterminated quoted key", lineNo);
    const rest = body.slice(end + 1).trimStart();
    // A quoted string with no colon after it is a scalar, not a key. Saying so
    // lets `- "text"` stay a sequence item instead of becoming a broken mapping.
    if (!rest.startsWith(":")) return null;
    return { key: scalar(body.slice(0, end + 1), lineNo), rest: rest.slice(1).trim() };
  }
  const colon = body.search(/:(\s|$)/);
  if (colon < 0) return null;
  const key = body.slice(0, colon).trim();
  if (key.startsWith("<<")) refuse("Merge keys are not supported", lineNo);
  if (key.startsWith("&") || key.startsWith("*")) refuse("Anchors and aliases are not supported", lineNo);
  return { key, rest: body.slice(colon + 1).trim() };
}

function parseBlock(lines, start, indent) {
  const first = lines[start];
  if (first.body.startsWith("- ") || first.body === "-") return parseSequence(lines, start, indent);
  return parseMapping(lines, start, indent);
}

function parseMapping(lines, start, indent) {
  const map = {};
  let index = start;
  while (index < lines.length && lines[index].indent >= indent) {
    const line = lines[index];
    if (line.indent > indent) refuse("Unexpected indentation", line.lineNo);
    if (line.body.startsWith("- ")) refuse("A sequence item cannot appear where a mapping key is expected", line.lineNo);
    const split = splitKey(line.body, line.lineNo);
    if (!split) refuse("Expected 'key: value'", line.lineNo);
    if (Object.prototype.hasOwnProperty.call(map, split.key)) refuse(`Duplicate key: ${split.key}`, line.lineNo);
    if (split.rest !== "") {
      map[split.key] = scalar(split.rest, line.lineNo);
      index += 1;
      continue;
    }
    // The value is a nested block, or nothing at all.
    const next = lines[index + 1];
    if (!next || next.indent <= line.indent) {
      // A sequence may sit at the same indentation as its key.
      if (next && next.indent === line.indent && next.body.startsWith("- ")) {
        const [value, after] = parseSequence(lines, index + 1, next.indent);
        map[split.key] = value; index = after; continue;
      }
      map[split.key] = null; index += 1; continue;
    }
    const [value, after] = parseBlock(lines, index + 1, next.indent);
    map[split.key] = value;
    index = after;
  }
  return [map, index];
}

function parseSequence(lines, start, indent) {
  const list = [];
  let index = start;
  while (index < lines.length && lines[index].indent === indent && (lines[index].body.startsWith("- ") || lines[index].body === "-")) {
    const line = lines[index];
    const inline = line.body === "-" ? "" : line.body.slice(2).trim();
    if (inline === "") {
      const next = lines[index + 1];
      if (!next || next.indent <= indent) { list.push(null); index += 1; continue; }
      const [value, after] = parseBlock(lines, index + 1, next.indent);
      list.push(value); index = after; continue;
    }
    // A flow collection must be recognised before the "- key: value" shape,
    // because "- { id: x, statement: y }" contains a colon that is not a key.
    if (inline.startsWith("{") || inline.startsWith("[")) {
      list.push(parseFlow(inline, line.lineNo, activeWarnings));
      index += 1;
      continue;
    }
    const split = splitKey(inline, line.lineNo);
    if (split) {
      // "- key: value" opens a mapping whose indentation starts after the dash.
      const itemIndent = indent + 2;
      const synthetic = [{ indent: itemIndent, body: inline, lineNo: line.lineNo, marker: false }];
      let scan = index + 1;
      while (scan < lines.length && lines[scan].indent >= itemIndent) { synthetic.push(lines[scan]); scan += 1; }
      const [value] = parseMapping(synthetic, 0, itemIndent);
      list.push(value); index = scan; continue;
    }
    list.push(scalar(inline, line.lineNo));
    index += 1;
  }
  return [list, index];
}

export function parseYamlWithReport(source) {
  const warnings = [];
  activeWarnings = warnings;
  try {
    const lines = readLines(source);
    if (!lines.length) return { value: null, warnings };
    const [value, index] = parseBlock(lines, 0, lines[0].indent);
    if (index < lines.length) refuse("Unexpected content after the document", lines[index].lineNo);
    return { value, warnings };
  } finally {
    activeWarnings = null;
  }
}

export function parseYaml(source) {
  return parseYamlWithReport(source).value;
}

// Accepts either format and says which it read, so a caller can report honestly
// rather than claiming "imported" for something it guessed at.
export function parseCharacterText(text, filename = "") {
  const trimmed = String(text).replace(/^﻿/, "").trim();
  const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  if (looksJson || /\.json$/i.test(filename)) {
    try { return { format: "JSON", value: JSON.parse(trimmed), warnings: [] }; }
    catch (error) { throw new YamlLiteError(`JSON could not be read: ${error.message}`); }
  }
  const report = parseYamlWithReport(trimmed);
  return { format: "YAML", value: report.value, warnings: report.warnings };
}
