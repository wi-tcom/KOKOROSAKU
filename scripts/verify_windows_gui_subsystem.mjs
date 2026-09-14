import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const argument = process.argv[2];
assert.ok(argument, "usage: node scripts/verify_windows_gui_subsystem.mjs <release-executable>");
const candidate = path.resolve(argument);
await stat(candidate);
const bytes = await readFile(candidate);
assert.ok(bytes.length >= 0x100, "PE executable is too small");
assert.equal(bytes.toString("ascii", 0, 2), "MZ", "DOS header is missing");
const peOffset = bytes.readUInt32LE(0x3c);
assert.equal(bytes.toString("ascii", peOffset, peOffset + 4), "PE\0\0", "PE signature is missing");
const optionalHeader = peOffset + 24;
const magic = bytes.readUInt16LE(optionalHeader);
assert.ok(magic === 0x10b || magic === 0x20b, "PE optional-header magic is unsupported");
const subsystem = bytes.readUInt16LE(optionalHeader + 68);
assert.equal(subsystem, 2, "release executable must use IMAGE_SUBSYSTEM_WINDOWS_GUI");

console.log("WINDOWS_GUI_SUBSYSTEM_VERIFY PASS");
console.log(`EXECUTABLE ${candidate}`);
console.log("END_USER_VISIBLE_CONSOLE 0");
