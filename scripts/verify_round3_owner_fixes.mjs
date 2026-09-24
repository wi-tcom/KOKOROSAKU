import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  process.env.SAKU_CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
let chrome = "";
for (const candidate of candidates) {
  try { if ((await stat(candidate)).isFile()) { chrome = candidate; break; } } catch { /* next */ }
}
if (!chrome) { console.error("ROUND3_OWNER_FIXES NOT_AVAILABLE / CHROME_NOT_FOUND"); process.exit(2); }

const samples = JSON.parse(await readFile(path.join(ROOT, "desktop/resources/source/oss-sample-characters.json"), "utf8")).characters;
const mime = new Map([[".html", "text/html; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".json", "application/json; charset=utf-8"], [".svg", "image/svg+xml"]]);
const tauriMock = `<script>window.__TAURI__={core:{invoke:async command=>{if(command==="get_runtime_state")return {workspace:"C:/round3",first_run:false,install_dir:"i",config_dir:"c",log_dir:"l",cache_dir:"ca"};if(command==="list_workspace_characters")return [];throw new Error("UNEXPECTED_COMMAND:"+command)}}};</script>`;
const requiredSeatBoundary = process.env.SAKU_ROUND3_NEGATIVE === "1" ? "INTENTIONAL_MISSING_SEAT_BOUNDARY" : "席8の人間判断を代行しません";
const harness = `<!doctype html><meta charset="utf-8"><title>ROUND3_RUNNING</title><div id="frames"></div><pre id="result" data-status="RUNNING"></pre><script type="module">
const samples=${JSON.stringify(samples)}, checks=[], measurements=[];
const requiredSeatBoundary=${JSON.stringify(requiredSeatBoundary)};
const check=(ok,name)=>{if(!ok)throw new Error(name);checks.push(name)};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const poll=async fn=>{for(let i=0;i<120;i++){if(fn())return;await wait(50)}throw new Error("timeout")};
const load=async width=>{const frame=document.createElement("iframe");frame.style.cssText="width:"+width+"px;height:900px;border:0";frame.src="/desktop/index.html";document.getElementById("frames").append(frame);await new Promise(resolve=>frame.addEventListener("load",resolve,{once:true}));await poll(()=>frame.contentWindow.__saku_home);await wait(250);return frame};
try{
  const active=await import("/tools/unified-v1/active-saku.mjs");
  for(const character of samples){
    active.setActive(character,{source:"round3-measurement"});
    const frame=await load(760),doc=frame.contentDocument;
    doc.getElementById("run-on-ai-platform").click();
    await poll(()=>doc.getElementById("platform-panel").hidden===false);
    const prompt=doc.getElementById("platform-launch").value;
    const fields={
      identity:prompt.includes("【Identity】")&&prompt.includes(character.identity.display_name)&&prompt.includes(character.identity.character_id),
      purpose:prompt.includes("【Purpose / Values】")&&prompt.includes(character.purpose.summary)&&prompt.includes(character.purpose.primary_value),
      values:prompt.includes("価値観:")&&(character.character_core.values||[]).every(value=>prompt.includes(value)),
      voice:prompt.includes("【Voice / Expression】")&&prompt.includes("話し方（voice）:"),
      seat7:prompt.includes("席7の機能:")&&prompt.includes(requiredSeatBoundary),
      seat8:prompt.includes("席8は人間です。AIがこの席を埋めることはできません。"),
    };
    Object.entries(fields).forEach(([field,ok])=>check(ok,character.identity.character_id+" prompt contains "+field));
    measurements.push({character_id:character.identity.character_id,display_name:character.identity.display_name,characters:prompt.length,utf8_bytes:new TextEncoder().encode(prompt).length,fields});
    frame.remove();
  }

  active.clearActive();
  localStorage.setItem("saku.workspace.library",JSON.stringify({version:1,entries:[
    {entry_id:"older",character:samples[0],source:"FILE",schema:{kind:"UNIFIED_V1_CHARACTER",schema_id:samples[0].schema.schema_id,schema_version:samples[0].schema.schema_version},added_at:"2026-09-15T01:00:00.000Z",batch:"2026-09-15T01:00:00.000Z",deleted:false},
    {entry_id:"newer",character:{...samples[0],identity:{...samples[0].identity,character_revision:"1.1.0"}},source:"BUILDER",schema:{kind:"UNIFIED_V1_CHARACTER",schema_id:samples[0].schema.schema_id,schema_version:samples[0].schema.schema_version},added_at:"2026-09-15T02:00:00.000Z",batch:"2026-09-15T02:00:00.000Z",deleted:false}
  ]}));
  const frame=await load(760),doc=frame.contentDocument,win=frame.contentWindow;
  const localTime=win.__saku_home.formatLocalTimestamp("2026-09-15T03:01:00.000Z");
  check(!localTime.includes("T03:01")&&!localTime.endsWith("03:01:00"),"Import history does not display sliced UTC");
  check(/GMT|UTC|JST|日本標準時|協定世界時/.test(localTime),"Import history displays a timezone");
  doc.getElementById("view-characters").click();
  await poll(()=>doc.querySelectorAll(".catalog-card").length===2);
  const latest=doc.querySelectorAll(".catalog-latest-badge");
  check(latest.length===1,"Exactly one latest revision badge for duplicate character_id");
  check(latest[0].closest(".catalog-card").querySelector("[data-open-id]").dataset.openId==="newer","Latest revision badge identifies newest entry");
  const cards=[...doc.querySelectorAll("#home-content .entry-card")];
  doc.getElementById("viewer-back").click();
  check(doc.documentElement.scrollWidth<=doc.documentElement.clientWidth,"Home has no horizontal overflow at 760px");
  check(new Set(cards.map(card=>Math.round(card.getBoundingClientRect().top))).size>1,"Home cards wrap at 760px");
  frame.remove();localStorage.removeItem("saku.workspace.library");active.clearActive();
  const output={status:"PASS",passed:checks.length,measurements,local_time_example:localTime,checks};
  const node=document.getElementById("result");node.dataset.status="PASS";node.textContent=JSON.stringify(output);document.title="ROUND3_PASS";
}catch(error){const node=document.getElementById("result");node.dataset.status="FAIL";node.textContent=JSON.stringify({status:"FAIL",passed:checks.length,error:String(error&&error.message||error),checks,measurements});document.title="ROUND3_FAIL"}
</script>`;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/__round3__.html") { response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); response.end(harness); return; }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(ROOT + path.sep) || !(await stat(target)).isFile()) throw new Error("not found");
    let body = await readFile(target);
    if (relative === "desktop/index.html") body = Buffer.from(body.toString("utf8").replace("</head>", tauriMock + "</head>"));
    response.writeHead(200, { "content-type": mime.get(path.extname(target).toLowerCase()) || "application/octet-stream", "cache-control": "no-store" }); response.end(body);
  } catch (error) { response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); response.end(String(error.message || error)); }
});

await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const profile=await mkdtemp(path.join(tmpdir(),"saku-round3-"));
const child=spawn(chrome,["--headless=new","--disable-gpu","--disable-background-networking","--no-first-run","--no-default-browser-check","--user-data-dir="+profile,"--window-size=900,1000","--virtual-time-budget=20000","--dump-dom",`http://127.0.0.1:${server.address().port}/__round3__.html`],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
let stdout="",stderr="";child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");child.stdout.on("data",chunk=>stdout+=chunk);child.stderr.on("data",chunk=>stderr+=chunk);
const code=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill();reject(new Error("Chrome timeout"))},60000);child.on("error",reject);child.on("exit",value=>{clearTimeout(timeout);resolve(value)})}).catch(error=>{stderr+="\n"+error.message;return -1});
server.close();await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(error => console.warn(`CLEANUP_SKIPPED browser profile left at ${profile}: ${error?.code || error}`));
const match=stdout.match(/<pre id="result" data-status="PASS">([\s\S]*?)<\/pre>/);
const decode=text=>text.replace(/&quot;/g,'"').replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">");
if(code!==0||!match){console.error("ROUND3_OWNER_FIXES FAIL");const failed=stdout.match(/<pre id="result" data-status="FAIL">([\s\S]*?)<\/pre>/);if(failed)console.error(decode(failed[1]));else console.error(stderr.slice(-3000));process.exit(1)}
const report=JSON.parse(decode(match[1]));
console.log(`ROUND3_OWNER_FIXES PASS ${report.passed}/${report.passed}`);
for(const item of report.measurements)console.log(`PROMPT_MEASUREMENT ${item.character_id} characters=${item.characters} utf8_bytes=${item.utf8_bytes} fields=identity,purpose,values,voice,seat7,seat8`);
console.log(`LOCAL_TIME_EXAMPLE ${report.local_time_example}`);
