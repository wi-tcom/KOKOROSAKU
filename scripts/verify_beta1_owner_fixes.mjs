import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromeCandidates = [
  process.env.SAKU_CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
let chrome = "";
for (const candidate of chromeCandidates) {
  try { if ((await stat(candidate)).isFile()) { chrome = candidate; break; } }
  catch { /* use the next standard path */ }
}
if (!chrome) {
  console.error("BETA1_OWNER_FIXES NOT_AVAILABLE / CHROME_NOT_FOUND");
  process.exit(2);
}

const mime = new Map([
  [".html", "text/html; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".svg", "image/svg+xml"],
]);
const exactSavePath = "C:\\Beta 1\\character.yaml";
const tauriMock = `<script>
window.__BETA1_SAVE_MODE="SAVED";
window.__BETA1_LAST_SAVE=null;
window.__TAURI__={
  core:{invoke:async(command,args)=>{
    if(command==="get_runtime_state")return {first_run:false,workspace:"C:\\\\BetaWorkspace",install_dir:"C:\\\\Program Files\\\\SAKU",config_dir:"C:\\\\Config",log_dir:"C:\\\\Logs",cache_dir:"C:\\\\Cache"};
    if(command==="save_builder_file"){
      window.__BETA1_LAST_SAVE=args;
      if(window.__BETA1_SAVE_MODE==="SAVED")return {status:"SAVED",path:${JSON.stringify(exactSavePath)},filename:args.filename,bytes:args.content.length,reason:null};
      if(window.__BETA1_SAVE_MODE==="CANCELLED")return {status:"CANCELLED",path:null,filename:args.filename,bytes:0,reason:null};
      return {status:"ERROR",path:null,filename:args.filename,bytes:0,reason:"TEST_WRITE_DENIED"};
    }
    throw new Error("UNEXPECTED_COMMAND:"+command);
  }},
  event:{listen:async()=>()=>{}}
};
</script>`;

const harness = `<!doctype html><meta charset="utf-8"><title>BETA1_OWNER_FIXES_RUNNING</title>
<iframe id="builder" src="/tools/__beta1_builder__.html" style="width:1280px;height:820px;border:0"></iframe>
<pre id="result" data-status="RUNNING"></pre>
<script type="module">
const result=document.getElementById("result"),checks=[];
const check=(condition,name)=>{if(!condition)throw new Error(name);checks.push(name);};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const poll=async fn=>{for(let i=0;i<120;i++){if(fn())return;await wait(50);}throw new Error("timeout");};
const click=element=>element.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}));
const input=(element,value)=>{element.value=value;element.dispatchEvent(new Event("input",{bubbles:true}));};
const change=(element,value)=>{element.value=value;element.dispatchEvent(new Event("change",{bubbles:true}));};
try{
  const frame=document.getElementById("builder");
  await new Promise(resolve=>frame.addEventListener("load",resolve,{once:true}));
  let w=frame.contentWindow,d=frame.contentDocument;
  await poll(()=>w.SAKU_GOLDEN_UI&&w.SAKU_FROZEN_IA&&d.querySelectorAll(".frozen-chapter").length===5&&!d.querySelector("#openDesktopHome").hidden);
  w.confirm=()=>true;
  w.alert=message=>{w.__BETA1_ALERT=String(message)};

  click(d.querySelector("#loadExample"));
  input(d.querySelector('[data-path="meta.name"]'),"テスト人物");
  input(d.querySelector('[data-path="meta.slug"]'),"beta-one");
  const yamlBeforeHelp=d.querySelector("#yaml").textContent;
  const helpTab=Array.from(d.querySelectorAll("#pvTabs button")).find(button=>button.textContent.trim()==="Help");
  check(Boolean(helpTab),"Help tab exists");
  // The guidance moved out of every field and into the Help tab's tree on
  // 2026-09-23 (Owner: the inline block repeated what the tree already shows).
  // The same rows are checked, in the place that now holds them.
  click(helpTab);await wait(120);
  check(d.querySelector('[data-canonical-path="purpose.summary"] .registry-help')===null,"the inline per-field Help block is gone");
  const purposeNode=d.querySelector('#contextHelp [data-help-field="purpose.summary"]');
  check(Boolean(purposeNode),"the Help tab's tree carries the field");
  purposeNode.querySelectorAll("details").forEach(node=>{node.open=true;});
  check(/何を書くか/.test(purposeNode.textContent),"Help has novice guidance sections");
  check(purposeNode.querySelectorAll(".help-detail-rows dt").length>=4,"Help has the four required sections");
  check(d.querySelector('main.form [data-canonical-path="purpose.summary"] .field-current-note [data-help-link]')!==null,"and the field itself carries the one link into it");
  click(d.querySelector('[data-builder-locale="en-US"]'));await wait(120);
  const purposeNodeEn=d.querySelector('#contextHelp [data-help-field="purpose.summary"]');
  purposeNodeEn.querySelectorAll("details").forEach(node=>{node.open=true;});
  check(/What to write/.test(purposeNodeEn.textContent),"Help guidance English");
  check(d.querySelector('[data-path="meta.name"]').value==="テスト人物","UI language does not translate Character data");
  click(Array.from(d.querySelectorAll("#pvTabs button")).find(button=>/character\.yaml/.test(button.textContent)));
  check(d.querySelector("#yaml").textContent===yamlBeforeHelp,"Help does not mutate Character output");

  w.__BETA1_SAVE_MODE="SAVED";click(d.querySelector("#downloadBtn"));await poll(()=>w.__BETA1_LAST_SAVE||d.querySelector("#saveFeedback")?.textContent);
  check(Boolean(w.__BETA1_LAST_SAVE),"Native save invoked (alert: "+String(w.__BETA1_ALERT||"none")+"; feedback: "+String(d.querySelector("#saveFeedback")?.textContent||"none")+"; toast: "+String(d.querySelector("#toast")?.textContent||"none")+")");
  check(/.character.yaml$/.test(w.__BETA1_LAST_SAVE.filename),"Native save writes the working file (saw: "+w.__BETA1_LAST_SAVE.filename+")");
  check(w.__BETA1_LAST_SAVE.filename!=="character.yaml","Native save filename identifies the Character");
  check(w.__BETA1_LAST_SAVE.content.length>0,"Native save content non-empty");
  check(w.__BETA1_LAST_SAVE.dialogTitle==="Save SAKU Builder output","Native save dialog title English");
  check(d.querySelector("#saveFeedback").textContent==="Saved\\n"+${JSON.stringify(exactSavePath)},"English success shows exact destination: "+JSON.stringify(d.querySelector("#saveFeedback").textContent));
  w.__BETA1_SAVE_MODE="CANCELLED";click(d.querySelector("#downloadBtn"));await wait(50);
  check(d.querySelector("#saveFeedback").textContent==="Save cancelled","Cancel never reports success");
  w.__BETA1_SAVE_MODE="ERROR";click(d.querySelector("#downloadBtn"));await wait(50);
  check(/Save failed: TEST_WRITE_DENIED/.test(d.querySelector("#saveFeedback").textContent),"Error reason shown without success");
  click(d.querySelector('[data-builder-locale="ja-JP"]'));await wait(50);
  w.__BETA1_SAVE_MODE="SAVED";click(d.querySelector("#downloadBtn"));await wait(50);
  check(w.__BETA1_LAST_SAVE.dialogTitle==="SAKU Builderの出力を保存","Native save dialog title Japanese");
  check(d.querySelector("#saveFeedback").textContent==="保存しました\\n"+${JSON.stringify(exactSavePath)},"Japanese success shows exact destination");

  click(d.querySelector("#resetAll"));
  check(d.querySelector('[data-path="meta.name"]').value==="","Start over clears Character before navigation");
  check(d.querySelector("#qsRows")===null,"retired Boundary Quick Setup cannot retain residual state");
  check(d.querySelector("#yaml").hidden===false&&d.querySelector("#contextHelp").hidden===true,"Start over resets preview and Help state");
  await poll(()=>frame.contentWindow.location.pathname.endsWith("/index.html"));
  w=frame.contentWindow;check(new URL(w.location.href).searchParams.get("stay")==="1","Start over navigates to existing top screen");

  result.dataset.status="PASS";result.textContent=JSON.stringify({status:"PASS",passed:checks.length,checks});document.title="BETA1_OWNER_FIXES_PASS";
}catch(error){
  result.dataset.status="FAIL";result.textContent=JSON.stringify({status:"FAIL",passed:checks.length,error:String(error&&error.message||error),checks});document.title="BETA1_OWNER_FIXES_FAIL";
}
</script>`;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/__beta1__.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(harness); return;
    }
    if (url.pathname === "/tools/__beta1_builder__.html") {
      const source = await readFile(path.join(ROOT, "tools/saku-builder.html"), "utf8");
      const marker = '<script type="module" src="./v1/builder-golden-ui.mjs"></script>';
      if (!source.includes(marker)) throw new Error("builder module marker not found");
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(source.replace(marker, tauriMock + marker)); return;
    }
    if (url.pathname === "/index.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(await readFile(path.join(ROOT, "desktop/index.html"))); return;
    }
    if (url.pathname === "/tools/v1/saku-unified-character.v1.schema.json") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(await readFile(path.join(ROOT, "tests/fixtures/canonical/saku-unified-character.v1.schema.json"))); return;
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "desktop/index.html";
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(ROOT + path.sep) || !(await stat(target)).isFile()) throw new Error("not found");
    response.writeHead(200, { "content-type": mime.get(path.extname(target).toLowerCase()) || "application/octet-stream", "cache-control": "no-store" });
    response.end(await readFile(target));
  } catch (error) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(String(error.message || error));
  }
});

await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const profile=await mkdtemp(path.join(tmpdir(),"saku-builder-beta1-"));
const child=spawn(chrome,["--headless=new","--disable-gpu","--disable-background-networking","--no-first-run","--no-default-browser-check","--user-data-dir="+profile,"--window-size=1280,820","--virtual-time-budget=20000","--dump-dom","http://127.0.0.1:"+server.address().port+"/__beta1__.html"],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
let output="",errors="";child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");child.stdout.on("data",chunk=>output+=chunk);child.stderr.on("data",chunk=>errors+=chunk);
const exitCode=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill();reject(new Error("Chrome timeout"));},60000);child.on("error",reject);child.on("exit",code=>{clearTimeout(timeout);resolve(code);});}).catch(error=>{errors+="\n"+error.message;return -1;});
server.close();await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(error => console.warn(`CLEANUP_SKIPPED browser profile left at ${profile}: ${error?.code || error}`));
const match=output.match(/<pre id="result" data-status="PASS">([\s\S]*?)<\/pre>/);
if(exitCode!==0||!match){
  console.error("BETA1_OWNER_FIXES FAIL");
  const failed=output.match(/<pre id="result" data-status="FAIL">([\s\S]*?)<\/pre>/);
  if(failed)console.error(failed[1].replace(/&quot;/g,'"').replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">"));
  console.error(errors.trim().slice(-3000));process.exit(1);
}
const report=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">"));
console.log("BETA1_OWNER_FIXES PASS "+report.passed+"/"+report.passed);
for(const name of report.checks)console.log("  PASS "+name);
