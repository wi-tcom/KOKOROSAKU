import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const candidates=[process.env.SAKU_CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].filter(Boolean);
let chrome="";
for(const candidate of candidates){try{if((await stat(candidate)).isFile()){chrome=candidate;break;}}catch{/* next */}}
if(!chrome){console.error("PREVIEW_XSS NOT_AVAILABLE / CHROME_NOT_FOUND");process.exit(2);}

const harness=`<!doctype html><meta charset="utf-8"><title>PREVIEW_XSS_RUNNING</title>
<iframe id="builder" src="/tools/saku-builder.html"></iframe><pre id="result" data-status="RUNNING"></pre>
<script type="module">
const result=document.getElementById("result"),frame=document.getElementById("builder");
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  await new Promise(resolve=>frame.addEventListener("load",resolve,{once:true}));
  const w=frame.contentWindow,d=frame.contentDocument;
  let executions=0;w.alert=()=>{executions++;};
  const input=d.querySelector('[data-path="meta.name"]');
  const vectors=['<img src=x onerror=alert(1)>','<script>alert(1)<'+'/script>','<svg onload=alert(1)>','& < > " \\''];
  let rawElements=0,escapedVisible=true;
  for(const vector of vectors){
    input.value=vector;input.dispatchEvent(new Event("input",{bubbles:true}));await wait(40);
    rawElements+=d.querySelectorAll('#yaml img,#yaml script,#yaml svg').length;
    const yamlVisible=JSON.stringify(vector).slice(1,-1);
    escapedVisible=escapedVisible&&d.querySelector('#yaml').textContent.includes(yamlVisible);
  }
  if(rawElements!==0||executions!==0||!escapedVisible)throw new Error(JSON.stringify({rawElements,executions,escapedVisible}));
  result.dataset.status="PASS";result.textContent=JSON.stringify({status:"PASS",rawElements,executions,escapedVisible});document.title="PREVIEW_XSS_PASS";
}catch(error){result.dataset.status="FAIL";result.textContent=JSON.stringify({status:"FAIL",error:String(error)});document.title="PREVIEW_XSS_FAIL";}
</script>`;

const mime=new Map([[".html","text/html; charset=utf-8"],[".mjs","text/javascript; charset=utf-8"],[".css","text/css; charset=utf-8"]]);
const server=createServer(async(request,response)=>{try{
  const url=new URL(request.url,"http://127.0.0.1");
  if(url.pathname==="/__preview_xss__.html"){response.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});response.end(harness);return;}
  const relative=decodeURIComponent(url.pathname).replace(/^\/+/,"");const target=path.resolve(ROOT,relative);
  if(!target.startsWith(ROOT+path.sep)||!(await stat(target)).isFile())throw new Error("not found");
  response.writeHead(200,{"content-type":mime.get(path.extname(target).toLowerCase())||"application/octet-stream","cache-control":"no-store"});response.end(await readFile(target));
}catch(error){response.writeHead(404,{"content-type":"text/plain; charset=utf-8"});response.end(String(error.message||error));}});

await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const profile=await mkdtemp(path.join(tmpdir(),"saku-preview-xss-"));
const child=spawn(chrome,["--headless=new","--disable-gpu","--disable-background-networking","--disable-breakpad","--disable-crash-reporter","--no-first-run","--no-default-browser-check","--user-data-dir="+profile,"--virtual-time-budget=8000","--dump-dom","http://127.0.0.1:"+server.address().port+"/__preview_xss__.html"],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
let output="",errors="";child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");child.stdout.on("data",chunk=>output+=chunk);child.stderr.on("data",chunk=>errors+=chunk);
const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error("Chrome timeout"));},30000);child.on("error",reject);child.on("exit",value=>{clearTimeout(timer);resolve(value);});}).catch(error=>{errors+=error.message;return -1;});
server.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
const match=output.match(/<pre id="result" data-status="PASS">([\s\S]*?)<\/pre>/);
if(code!==0||!match){console.error("PREVIEW_XSS FAIL");console.error(errors.slice(-2000));console.error(output.slice(-2000));process.exit(1);}
const report=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">"));
console.log(`PREVIEW_XSS PASS raw_elements=${report.rawElements} event_executions=${report.executions} escaped_visible=${report.escapedVisible}`);
