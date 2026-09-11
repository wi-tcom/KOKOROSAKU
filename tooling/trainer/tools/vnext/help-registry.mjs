// SAKU vNext — Field Help Registry（Single Source）
// -------------------------------------------------------------------------
// Builder / Trainer 双方が import する「どの項目に ⓘ Help を付けるか」の唯一の定義。
// Help 本文（Meaning / Example / Behavior Effect / Interaction / Caution）は Locale Pack が持つ
// （i18n.help(fieldKey)）。ここは Registry（キー集合）と、共通の描画・アクセシビリティ実装のみ。
// -------------------------------------------------------------------------

// Help を付ける field キー（Builder/Trainer 共通で同一定義を使う）。
export const HELP_FIELDS = [
  "character_id", "display_name", "catalog_group", "role_label",
  "hard_invariants", "human_handoff", "seat_archetype", "seat_intensity",
  "front_minority", "front_selection", "axes_presentation", "professional_reasoning",
  "ten_d", "work_mode_affinity", "internal_tension", "expected_vs_observed",
  "derived_metrics", "builder_candidate", "probe_scoring",
];

// ⓘ ボタンの HTML（アクセシブル: button + aria-label、キーボード focus 可）。
export function helpButtonHTML(i18n, fieldKey, moreLabel) {
  const label = (i18n.t("ui.help_for") || "Help") + ": " + (i18n.t("label." + fieldKey) || fieldKey);
  return `<button type="button" class="saku-help-btn" data-help="${fieldKey}" aria-label="${escapeAttr(label)}" aria-expanded="false" title="${escapeAttr(i18n.t("ui.help") || "Help")}">&#9432;</button>`;
}

function escapeAttr(s){ return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function esc(s){ return escapeAttr(s); }

// popover の中身（Meaning/Example/Behavior/Interaction/Caution）。
function panelHTML(i18n, fieldKey){
  const h = i18n.help(fieldKey);
  const title = i18n.t("label." + fieldKey) || fieldKey;
  const row = (labelKey, val) => val ? `<div class="saku-help-row"><b>${esc(i18n.t("ui." + labelKey))}</b><span>${esc(val)}</span></div>` : "";
  return `<div class="saku-help-title">${esc(title)}</div>`
    + row("meaning", h.meaning) + row("example", h.example) + row("behavior", h.behavior)
    + row("interaction", h.interaction) + row("caution", h.caution)
    + `<div class="saku-help-close-row"><button type="button" class="saku-help-close">${esc(i18n.t("ui.close")||"Close")}</button></div>`;
}

// 共通スタイル（両ツールが1回だけ挿入）。
export const HELP_CSS = `
.saku-help-btn{all:unset;cursor:pointer;color:var(--accent,#3a4a7a);font-size:13px;line-height:1;padding:0 3px;border-radius:50%;}
.saku-help-btn:focus-visible{outline:2px solid var(--accent,#3a4a7a);outline-offset:2px;}
.saku-help-pop{position:fixed;z-index:1000;max-width:320px;background:var(--panel,#fff);color:var(--ink,#222);border:1px solid var(--line,#ccc);border-radius:8px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.25);font-size:12px;line-height:1.45;}
.saku-help-title{font-weight:700;margin-bottom:6px;}
.saku-help-row{display:block;margin:4px 0;}
.saku-help-row b{display:inline-block;min-width:96px;color:var(--muted,#666);font-weight:600;}
.saku-help-close-row{text-align:right;margin-top:8px;}
.saku-help-close{all:unset;cursor:pointer;color:var(--accent,#3a4a7a);font-size:12px;border:1px solid var(--line,#ccc);border-radius:6px;padding:2px 8px;}
`;

// Builder / Trainer 共通の attach。root 内の [data-help] を拾い、click / Enter / Space / touch で開く。
// Escape / outside click / Close で閉じる。フォーカス移動可能。
export function attachHelp(root, i18n){
  if(!document.getElementById("saku-help-style")){
    const st=document.createElement("style"); st.id="saku-help-style"; st.textContent=HELP_CSS; document.head.appendChild(st);
  }
  let pop=null, opener=null;
  const close=()=>{ if(pop){ pop.remove(); pop=null; } if(opener){ opener.setAttribute("aria-expanded","false"); opener.focus?.(); opener=null; } };
  const open=(btn)=>{
    close();
    const key=btn.dataset.help;
    pop=document.createElement("div"); pop.className="saku-help-pop"; pop.setAttribute("role","dialog");
    pop.setAttribute("aria-label", i18n.t("label."+key)||key); pop.innerHTML=panelHTML(i18n,key);
    document.body.appendChild(pop);
    const r=btn.getBoundingClientRect();
    pop.style.top=Math.min(r.bottom+6, window.innerHeight-pop.offsetHeight-8)+"px";
    pop.style.left=Math.min(r.left, window.innerWidth-pop.offsetWidth-8)+"px";
    btn.setAttribute("aria-expanded","true"); opener=btn;
    pop.querySelector(".saku-help-close")?.addEventListener("click", close);
    pop.querySelector(".saku-help-close")?.focus();
  };
  root.addEventListener("click", (e)=>{
    const btn=e.target.closest?.(".saku-help-btn");
    if(btn){ e.preventDefault(); (opener===btn)?close():open(btn); return; }
    if(pop && !e.target.closest(".saku-help-pop")) close();
  });
  root.addEventListener("keydown",(e)=>{
    const btn=e.target.closest?.(".saku-help-btn");
    if(btn && (e.key==="Enter"||e.key===" ")){ e.preventDefault(); (opener===btn)?close():open(btn); }
  });
  document.addEventListener("keydown",(e)=>{ if(e.key==="Escape") close(); });
  return { close };
}
