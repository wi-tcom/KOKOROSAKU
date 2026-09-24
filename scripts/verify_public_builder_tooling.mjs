import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "tooling", "builder");
const ADOPTED_SCHEMA_MEMBER = "schemas/saku-unified-character.v1.schema.json";
const checks = [];
const check = (condition, label) => { assert.ok(condition, label); checks.push(label); };
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const RETIRED_NAME = new RegExp(["v", "next"].join(""), "i");

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}

// ── the committed projection is what the projection produces ───────────────
// Until 2026-09-23 this gate checked what the tree contains, never whether it
// still matches its sources — so `lib/speed-test-ui.mjs` sat in the public tree
// carrying a sentence that had already been revised where it comes from, and
// nothing said so. The question is not "is it there" or "is it the right
// version": it is **does projecting again produce these bytes**.
{
  const target = path.join(await mkdtemp(path.join(tmpdir(), "saku-projection-")), "builder");
  const build = spawn(process.execPath, [path.join(ROOT, "scripts/build_public_builder_tooling.mjs")], {
    cwd: ROOT, env: { ...process.env, SAKU_PUBLIC_TOOLING_TARGET: target }, windowsHide: true,
  });
  let noise = "";
  build.stdout.on("data", chunk => { noise += chunk; });
  build.stderr.on("data", chunk => { noise += chunk; });
  const code = await new Promise(resolve => build.on("close", resolve));
  assert.equal(code, 0, `PROJECTION a second projection could not be built:\n${noise}`);

  const relative = directory => files(directory).then(list => list.map(file => path.relative(directory, file).replaceAll(path.sep, "/")).sort());
  const [committed, projected] = await Promise.all([relative(PUBLIC), relative(target)]);

  // Two files are generated and then extended by hand: the READMEs carry a
  // section about importing the three sample Characters that the generator does
  // not write, which is why `npm run public:tooling` is followed by restoring
  // them from git. They are compared by what the generator still contributes.
  const HAND_EXTENDED = Object.freeze(["README.md", "README.ja.md"]);

  assert.deepEqual(projected, committed, "PROJECTION the committed tree holds exactly the files a projection produces");
  checks.push(`PROJECTION the committed tree holds exactly the ${committed.length} files a projection produces`);

  const drifted = [];
  for (const name of committed) {
    if (HAND_EXTENDED.includes(name)) continue;
    const [a, b] = await Promise.all([readFile(path.join(PUBLIC, name)), readFile(path.join(target, name))]);
    if (!a.equals(b)) drifted.push(name);
  }
  assert.deepEqual(drifted, [], `PROJECTION these committed files are not what projecting produces — run \`npm run public:tooling\`:\n  ${drifted.join("\n  ")}`);
  checks.push(`PROJECTION all ${committed.length - HAND_EXTENDED.length} generated files are byte-equal to a fresh projection`);

  for (const name of HAND_EXTENDED) {
    const committedLines = (await readFile(path.join(PUBLIC, name), "utf8")).split(/\r?\n/);
    const generatedLines = (await readFile(path.join(target, name), "utf8")).split(/\r?\n/).filter(line => line.trim());
    let at = 0;
    const missing = [];
    for (const line of generatedLines) {
      const found = committedLines.indexOf(line, at);
      if (found < 0) missing.push(line);
      else at = found + 1;
    }
    assert.deepEqual(missing, [], `PROJECTION ${name} no longer carries what the generator writes, in order — the generator changed and this file did not follow:\n  ${missing.join("\n  ")}`);
  }
  checks.push(`PROJECTION the ${HAND_EXTENDED.length} hand-extended READMEs still carry every line the generator writes, in order`);

  await rm(path.dirname(target), { recursive: true, force: true });
}

const publicFiles = await files(PUBLIC);
check(publicFiles.length >= 25, `public tooling has a complete bounded tree (${publicFiles.length} files)`);
for (const file of publicFiles) {
  const relative = path.relative(PUBLIC, file).replaceAll(path.sep, "/");
  const source = await readFile(file, "utf8");
  check(!RETIRED_NAME.test(relative), `no retired taxonomy in package member path ${relative}`);
  if (relative !== ADOPTED_SCHEMA_MEMBER) {
    check(!RETIRED_NAME.test(source), `no retired taxonomy in ${relative}`);
  }
  check(!/C:\/Users|C:\\Users|OneDrive|(?:^|[^A-Za-z])file:/i.test(source), `no private host path or local protocol in ${relative}`);
}
const schemaBytes = await readFile(path.join(PUBLIC, ...ADOPTED_SCHEMA_MEMBER.split("/")));
const extensionBytes = await readFile(path.join(PUBLIC, "schemas", "character-extension.v1.schema.json"));
const faviconBytes = await readFile(path.join(PUBLIC, "favicon.ico"));
check(digest(schemaBytes) === "48a7241dac4653c94b0cb82971697deb804c23999548cb9c6b64563813bba817", "exact D-13 Character schema bytes");
check(digest(extensionBytes) === "2069021745e9ad98afc84e7dacdb0404c0993f3fcad4147590059764b3170b1b", "exact D-13 extension schema bytes");
check(digest(faviconBytes) === "52769ad1e2b7916cfb8d3800d362da8570016a20c6d0f3b653ee5140049e59b1", "exact Owner-authorized SAKU favicon bytes");
const about = await readFile(path.join(PUBLIC, "about.html"), "utf8");
check(about.includes("Current schema state") && about.includes("Adopted by D-13"), "About displays the D-13 adoption as current schema state");
check(!about.includes("SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE") && !about.includes("Candidate only; not Canonical adoption"), "About does not present historical schema candidate metadata as current state");
check(about.includes('rel="icon" href="./favicon.ico"'), "About references the package-local favicon");

const adoptedSchema = JSON.parse(schemaBytes.toString("utf8"));
const retiredTaxonomyOccurrences = [];
function collectRetiredTaxonomy(value, pointer = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectRetiredTaxonomy(item, `${pointer}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const childPointer = `${pointer}.${key}`;
      if (RETIRED_NAME.test(key)) retiredTaxonomyOccurrences.push({ kind: "KEY", pointer: childPointer, value: key });
      collectRetiredTaxonomy(item, childPointer);
    }
    return;
  }
  if (typeof value === "string" && RETIRED_NAME.test(value)) {
    retiredTaxonomyOccurrences.push({ kind: "VALUE", pointer, value });
  }
}
collectRetiredTaxonomy(adoptedSchema);
check(
  retiredTaxonomyOccurrences.length === 4,
  "D-13 exact schema retains its four immutable historical taxonomy occurrences",
);

const chromeCandidates = [process.env.SAKU_CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].filter(Boolean);
let chrome = "";
for (const candidate of chromeCandidates) { try { if ((await stat(candidate)).isFile()) { chrome = candidate; break; } } catch {} }
if (!chrome) { console.error("PUBLIC_TOOLING NOT_AVAILABLE / CHROME_NOT_FOUND"); process.exit(2); }

const harness = `<!doctype html><meta charset="utf-8"><pre id="result" data-status="RUNNING"></pre><script type="module">
const result=document.getElementById('result'),checks=[];const ok=(value,label)=>{if(!value)throw new Error(label);checks.push(label)};const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const load=async source=>{const frame=document.createElement('iframe');frame.style='width:1280px;height:900px';frame.src=source;document.body.append(frame);await new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));await wait(1200);return frame};
try{localStorage.clear();const builder=await load('/tooling/builder/index.html'),bd=builder.contentDocument,bw=builder.contentWindow;ok(Boolean(bw.SAKU_UNIFIED),'Builder Unified V1 module loaded');ok(Boolean(bw.SAKU_FROZEN_IA),'Builder Frozen IA module loaded');ok(bd.querySelectorAll('[data-canonical-path]').length===47,'Builder exposes exactly 47 authoring homes');ok(bd.querySelector('#openTrainer')?.getAttribute('href')==='./trainer.html','Builder links to the public Trainer');ok(bd.querySelector('meta[name="saku-character-selection"]')?.content==='disabled','Static manifest disables Character selection');ok(!bd.getElementById('authoringPickCharacter'),'Static Builder omits unavailable Character selection');const trainer=await load('/tooling/builder/trainer.html'),td=trainer.contentDocument;await wait(1500);ok(Boolean(td.getElementById('stage-01')),'Trainer preparation stage loaded; body='+td.body.innerText.slice(0,500));ok(td.querySelectorAll('#training-method-fields select').length>=5,'Trainer five preparation selectors loaded');td.getElementById('locale').value='en';td.getElementById('locale').dispatchEvent(new Event('change',{bubbles:true}));await wait(100);ok(td.querySelector('h1')?.textContent==='01 Prepare','Trainer JA/EN switch works');result.textContent=JSON.stringify({status:'PASS',checks});result.dataset.status='PASS'}catch(error){result.textContent=JSON.stringify({status:'FAIL',checks,error:String(error.stack||error)});result.dataset.status='FAIL'}
</script>`;
const mime = new Map([[".html", "text/html; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".json", "application/json; charset=utf-8"], [".md", "text/markdown; charset=utf-8"]]);
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/__public_tooling") { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(harness); return; }
    const file = path.resolve(ROOT, decodeURIComponent(url.pathname).replace(/^\/+/, ""));
    if (!file.startsWith(`${ROOT}${path.sep}`)) throw new Error("outside root");
    const bytes = await readFile(file);
    response.writeHead(200, { "content-type": mime.get(path.extname(file)) || "application/octet-stream" });
    response.end(bytes);
  } catch {
    if (!response.headersSent) response.writeHead(404);
    if (!response.writableEnded) response.end("not found");
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const profile = await mkdtemp(path.join(tmpdir(), "saku-public-tooling-"));
const child = spawn(chrome, ["--headless=new", "--enable-logging=stderr", "--disable-gpu", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let dom = "", browserErrors = "", socket;
child.stderr.on("data", chunk => { browserErrors += chunk; });
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; break; }
    catch { await pause(100); }
  }
  if (!port) throw new Error("Chrome control port unavailable");
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/__public_tooling`)}`, { method: "PUT" })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => { socket.onopen = resolve; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
  };
  const call = (method, params = {}) => new Promise(resolve => {
    const id = ++sequence;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const status = await call("Runtime.evaluate", { expression: "document.getElementById('result')?.dataset.status", returnByValue: true });
    if (["PASS", "FAIL"].includes(status.result?.result?.value)) break;
    await pause(100);
  }
  dom = (await call("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true })).result.result.value;
} finally {
  socket?.close();
  child.kill();
  await new Promise(resolve => child.exitCode !== null ? resolve() : child.once("exit", resolve));
  server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(error => console.warn(`CLEANUP_SKIPPED browser profile left at ${profile}: ${error?.code || error}`));
}
const body = /<pre[^>]*>([\s\S]*?)<\/pre>/.exec(dom)?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") || "";
const report = JSON.parse(body || '{"status":"FAIL","error":"NO_BROWSER_REPORT"}');
if (report.status !== "PASS") throw new Error(`${report.error || "PUBLIC_BROWSER_SMOKE_FAILED"}\n${browserErrors}`.trim());
checks.push(...report.checks);

const PACKAGE_PREFIX = "KOKOROSAKU-v0.1.0-beta.3";
const zipWorkspace = await mkdtemp(path.join(tmpdir(), "saku-public-zip-"));
const zipSource = path.join(zipWorkspace, "source", PACKAGE_PREFIX);
const zipArchive = path.join(zipWorkspace, `${PACKAGE_PREFIX}.zip`);
const zipExtracted = path.join(zipWorkspace, "extracted", PACKAGE_PREFIX);
const quotePowerShell = value => `'${String(value).replaceAll("'", "''")}'`;
const runPowerShell = command => new Promise((resolve, reject) => {
  const process = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", errors = "";
  process.stdout.on("data", chunk => { output += chunk; });
  process.stderr.on("data", chunk => { errors += chunk; });
  process.on("close", code => code === 0 ? resolve(output) : reject(new Error(`POWERSHELL_${code}: ${errors || output}`)));
});

let extractedRelativeLinkCount = 0;
let zipReport;
try {
  await mkdir(zipSource, { recursive: true });
  await cp(path.join(ROOT, "tooling"), path.join(zipSource, "tooling"), { recursive: true });
  await mkdir(path.join(zipSource, "docs", "getting-started"), { recursive: true });
  for (const name of ["builder-quickstart.md", "builder-quickstart.ja.md"])
    await cp(path.join(ROOT, "docs", "getting-started", name), path.join(zipSource, "docs", "getting-started", name));
  for (const name of ["SECURITY.md", "LICENSE-DOCS.md"])
    await cp(path.join(ROOT, name), path.join(zipSource, name));

  await runPowerShell(`Compress-Archive -LiteralPath ${quotePowerShell(zipSource)} -DestinationPath ${quotePowerShell(zipArchive)} -Force`);
  check((await stat(zipArchive)).size > 0, "public ZIP fixture was created");
  await mkdir(path.dirname(zipExtracted), { recursive: true });
  await runPowerShell(`Expand-Archive -LiteralPath ${quotePowerShell(zipArchive)} -DestinationPath ${quotePowerShell(path.dirname(zipExtracted))} -Force`);
  check((await stat(path.join(zipExtracted, "tooling", "builder", "index.html"))).isFile(), "public ZIP extracts to the documented prefix directory");

  const extractedBuilder = path.join(zipExtracted, "tooling", "builder");
  for (const file of await files(extractedBuilder)) {
    const extension = path.extname(file).toLowerCase();
    if (![".html", ".htm", ".md"].includes(extension)) continue;
    const source = await readFile(file, "utf8");
    const references = [];
    if ([".html", ".htm"].includes(extension))
      for (const match of source.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) references.push(match[1]);
    if (extension === ".md")
      for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
        const raw = match[1].trim();
        references.push(raw.startsWith("<") ? raw.slice(1, raw.indexOf(">")) : raw.split(/\s+/)[0]);
      }
    for (const reference of references) {
      if (!reference || reference.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith("//")) continue;
      const target = path.resolve(path.dirname(file), decodeURIComponent(reference.split(/[?#]/)[0]));
      check(target === zipExtracted || target.startsWith(`${zipExtracted}${path.sep}`), `extracted relative link stays inside prefix: ${path.relative(zipExtracted, file)} -> ${reference}`);
      await stat(target);
      extractedRelativeLinkCount += 1;
    }
  }
  check(extractedRelativeLinkCount > 0, `extracted relative links resolve (${extractedRelativeLinkCount})`);

  const zipHarness = [
    '<!doctype html><meta charset="utf-8"><pre id="zip-result" data-status="RUNNING"></pre><script type="module">',
    `const PREFIX=${JSON.stringify(`/${PACKAGE_PREFIX}`)};`,
    'const result=document.getElementById("zip-result"),checks=[];const ok=(value,label)=>{if(!value)throw new Error(label);checks.push(label)};',
    'const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const until=async test=>{for(let i=0;i<150;i++){if(test())return;await wait(100)}throw new Error("BROWSER_WAIT_TIMEOUT")};',
    'const load=async url=>{const frame=document.createElement("iframe");frame.style="width:1280px;height:900px";frame.src=url;document.body.append(frame);await new Promise(resolve=>frame.addEventListener("load",resolve,{once:true}));await until(()=>frame.contentWindow.SAKU_UNIFIED);return frame};',
    'try{',
    'localStorage.clear();',
    'for(const kind of ["schema","extension"]){const invalid=await import("/__invalid_"+kind+"/tooling/builder/lib/adopted-schema-validator.mjs");let rejected=false;try{await invalid.loadAdoptedSchema()}catch(error){rejected=String(error).includes("SHA256 mismatch")}ok(rejected,"tampered "+kind+" fixture is rejected by exact digest");}',
    'const rootValidator=await import("/tooling/builder/lib/adopted-schema-validator.mjs?root");const rootSchema=await rootValidator.loadAdoptedSchema();ok(Boolean(rootSchema),"root serve loads exact adopted schema");',
    'const extensionRef=String(rootSchema.properties.extensions.$ref),extensionId=extensionRef.split("#")[0],resolver=rootValidator.ADOPTION_STATUS.resolver_mapping[extensionId];ok(resolver?.bundled_relative_url==="../schemas/character-extension.v1.schema.json","absolute extension $ref has the exact bundled resolver mapping");ok(rootSchema.__externalSchemas?.[extensionId]?.$id===extensionId,"absolute extension $ref resolves to the bundled extension schema");',
    'const rootBuilder=await load("/tooling/builder/index.html");ok(rootBuilder.contentDocument.querySelectorAll("[data-canonical-path]").length===47,"root serve Builder is complete");',
    'const rootTrainer=document.createElement("iframe");rootTrainer.src="/tooling/builder/trainer.html";document.body.append(rootTrainer);await new Promise(resolve=>rootTrainer.addEventListener("load",resolve,{once:true}));await until(()=>rootTrainer.contentDocument.getElementById("stage-01"));ok(true,"root serve Trainer loads");',
    'const before=await fetch(PREFIX+"/tooling/schemas/saku-unified-character.v1.schema.json",{cache:"no-store"});const after=await fetch(PREFIX+"/tooling/builder/schemas/saku-unified-character.v1.schema.json",{cache:"no-store"});ok(before.status===404,"document-relative legacy schema path is measured as HTTP 404");ok(after.status===200,"module-relative bundled schema path is measured as HTTP 200");',
    'const prefixValidator=await import(PREFIX+"/tooling/builder/lib/adopted-schema-validator.mjs?prefix");const prefixSchema=await prefixValidator.loadAdoptedSchema();ok(Boolean(prefixSchema.__externalSchemas?.[extensionId]),"prefix serve loads schema and its absolute extension mapping");',
    'for(const [label,prefix] of [["root",""],["prefix",PREFIX]]){',
    'localStorage.clear();const frame=await load(prefix+"/tooling/builder/index.html"),d=frame.contentDocument,w=frame.contentWindow;w.alert=()=>{};w.confirm=()=>true;d.getElementById("loadExample").click();await wait(500);',
    'const entries=()=>JSON.parse(localStorage.getItem("saku.workspace.library")||"{}").entries||[];const countBefore=entries().length;ok(!w.__TAURI__,label+" uses browser persistence without a native bridge mock");d.getElementById("saveUnifiedCharacter").click();await until(()=>entries().length===countBefore+1);ok(entries().length===countBefore+1,label+" explicit Save persists one Character");',
    'const exportedCharacter=JSON.parse(w.toSakuJson(w.__saku_data()));ok((await w.SAKU_ADOPTED_VALIDATE(exportedCharacter)).ok,label+" export validates against bundled schema");',
    'const yamlTab=[...d.querySelectorAll("#pvTabs button")].find(button=>button.textContent.includes("character.yaml"));yamlTab.click();const approval=d.getElementById("exportApproval");if(!approval.checked)approval.click();let blob,downloadName;w.URL.createObjectURL=value=>{blob=value;return "blob:test-export"};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){downloadName=this.download};d.getElementById("downloadBtn").click();await until(()=>blob&&downloadName);const exported=await blob.text();ok(downloadName.endsWith(".yaml")&&exported.length>0,label+" Download emits an actual YAML payload");',
    'const name=d.querySelector("[data-path=\\"meta.name\\"]");name.value="Changed before reimport";name.dispatchEvent(new w.Event("input",{bubbles:true}));ok(JSON.parse(w.toSakuJson(w.__saku_data())).identity.display_name!==exportedCharacter.identity.display_name,label+" pre-import state differs");ok(await w.importCharacterYaml(exported)===true,label+" YAML reimport explicitly succeeds");const reimported=JSON.parse(w.toSakuJson(w.__saku_data()));ok(JSON.stringify(reimported)===JSON.stringify(exportedCharacter),label+" save/export/reimport round trip restores exact Character");frame.remove();}',
    'result.textContent=JSON.stringify({status:"PASS",checks,beforeStatus:before.status,afterStatus:after.status});result.dataset.status="PASS";',
    '}catch(error){result.textContent=JSON.stringify({status:"FAIL",checks,error:String(error.stack||error)});result.dataset.status="FAIL"}',
    '</script>',
  ].join("\n");

  const zipServer = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname === "/__zip_prefix_gate") { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(zipHarness); return; }
      const invalid = /^\/__invalid_(schema|extension)(\/.*)$/.exec(url.pathname);
      const pathname = invalid ? invalid[2] : url.pathname;
      const prefixed = pathname === `/${PACKAGE_PREFIX}` || pathname.startsWith(`/${PACKAGE_PREFIX}/`);
      const relative = prefixed ? pathname.slice(PACKAGE_PREFIX.length + 1) : pathname;
      const file = path.resolve(zipExtracted, decodeURIComponent(relative).replace(/^\/+/, ""));
      if (!file.startsWith(`${zipExtracted}${path.sep}`)) throw new Error("outside extracted prefix");
      let bytes = await readFile(file);
      const tamperTarget = invalid?.[1] === "schema" ? "saku-unified-character.v1.schema.json" : "character-extension.v1.schema.json";
      if (invalid && path.basename(file) === tamperTarget) bytes = Buffer.concat([bytes, Buffer.from("\n")]);
      response.writeHead(200, { "content-type": mime.get(path.extname(file)) || "application/octet-stream" });
      response.end(bytes);
    } catch {
      if (!response.headersSent) response.writeHead(404);
      if (!response.writableEnded) response.end("not found");
    }
  });
  await new Promise(resolve => zipServer.listen(0, "127.0.0.1", resolve));
  const zipProfile = await mkdtemp(path.join(tmpdir(), "saku-public-prefix-browser-"));
  const zipChild = spawn(chrome, ["--headless=new", "--disable-gpu", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${zipProfile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let zipSocket, zipDom = "", zipErrors = "";
  zipChild.stderr.on("data", chunk => { zipErrors += chunk; });
  try {
    let port;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { port = (await readFile(path.join(zipProfile, "DevToolsActivePort"), "utf8")).split("\n")[0]; break; }
      catch { await pause(100); }
    }
    if (!port) throw new Error("ZIP Chrome control port unavailable");
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${zipServer.address().port}/__zip_prefix_gate`)}`, { method: "PUT" })).json();
    zipSocket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(resolve => { zipSocket.onopen = resolve; });
    let sequence = 0;
    const pending = new Map();
    zipSocket.onmessage = event => { const message = JSON.parse(event.data); if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); } };
    const call = (method, params = {}) => new Promise(resolve => { const id = ++sequence; pending.set(id, resolve); zipSocket.send(JSON.stringify({ id, method, params })); });
    for (let attempt = 0; attempt < 450; attempt += 1) {
      const status = await call("Runtime.evaluate", { expression: "document.getElementById('zip-result')?.dataset.status", returnByValue: true });
      if (["PASS", "FAIL"].includes(status.result?.result?.value)) break;
      await pause(100);
    }
    zipDom = (await call("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true })).result.result.value;
  } finally {
    zipSocket?.close();
    zipChild.kill();
    await new Promise(resolve => zipChild.exitCode !== null ? resolve() : zipChild.once("exit", resolve));
    zipServer.close();
    await rm(zipProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
  const zipBody = /<pre[^>]*>([\s\S]*?)<\/pre>/.exec(zipDom)?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") || "";
  zipReport = JSON.parse(zipBody || '{"status":"FAIL","error":"NO_ZIP_BROWSER_REPORT"}');
  if (zipReport.status !== "PASS") throw new Error(`${zipReport.error || "ZIP_PREFIX_BROWSER_GATE_FAILED"}\n${zipErrors}`.trim());
  checks.push(...zipReport.checks);
} finally {
  await rm(zipWorkspace, { recursive: true, force: true });
}
for (const label of checks) console.log(`  PASS ${label}`);
console.log(`PUBLIC_BUILDER_TOOLING PASS ${checks.length}/${checks.length}`);
console.log(`ZIP_EXTRACT_PREFIX ${PACKAGE_PREFIX} PASS`);
console.log(`SCHEMA_FETCH_BEFORE HTTP_${zipReport.beforeStatus}`);
console.log(`SCHEMA_FETCH_AFTER HTTP_${zipReport.afterStatus}`);
console.log(`EXTRACTED_RELATIVE_LINKS PASS ${extractedRelativeLinkCount}/${extractedRelativeLinkCount}`);
console.log("SAVE_EXPORT_REIMPORT PASS");
console.log("FILE_PROTOCOL NOT_EVALUATED / HTTP_REQUIRED");
console.log("PUBLICATION 0 / RELEASE 0");
