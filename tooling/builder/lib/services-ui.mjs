// 04 「SAKU 診療所・AMU トレーニングセンター」 (Owner 2026-09-27, AMU DECISION
// 2026-09-27-11). 04 Trainer, the AI speed test and the external-review intake
// leave the Builder's screens; they become a separate tool later, and their
// files, records and test material stay. This page only links to wi-t.com and
// kokoroamu.jp.
//
// No prices (they live on the product pages). A link without a URL shows
// 「準備中」 and cannot be pressed. The host opens the default browser, and only
// for https on the hosts in service-links.mjs (main.rs open_service_link checks
// it again).
import { SERVICE_LINKS, serviceLinkState } from "./service-links.mjs";

/** Links that introduce something rather than take an application (shared ids with AMU Studio). */
export const INFORMATION_LINK_IDS = Object.freeze(["service_intro", "characters_intro", "store_packs"]);

// The visible text in one place for the writer team. The service texts are
// ライター&SNS's v2 (Wi-t_Site 9f31b8b), confirmed by the Owner on 2026-09-27
// (AMU DECISION 2026-09-27-14), in the same shape as AMU Studio's
// shells/motion-lite/service-links-panel.js @539c09f. The sentence that the
// services guarantee nothing is not on the screen: it is in the terms on the
// application page (Owner). The English is 英語翻訳チーム's 依頼 Y and Z (Wi-t_Site
// 03dacf0, d94698d) with the names the Owner chose on 2026-09-27: SAKU Repair Desk and
// AMU Evaluation Center (Wi-t_Site 4508d58).
// 「認定」 is not used: a signature shows where a file came from and that it
// has not changed since, no more.
export const SERVICES_WORDING_STATUS = "CONFIRMED";
export const SERVICES_WORDING = Object.freeze({
  ja: Object.freeze({
    title: "SAKU 診療所・AMU トレーニングセンター",
    intro: "SAKU 診療所と AMU トレーニングセンターは、キャラクターを正しく改善・修復するためのサポートサービスで、いまは準備中です。",
    // Naming both hosts tells the user which addresses to expect in the browser
    // (ライター&SNS 2026-09-27).
    hosts: "リンクは wi-t.com または kokoroamu.jp のページをブラウザで開きます。",
    sections: Object.freeze([
      // The introduction page (Owner 2026-09-27; the same section as AMU @90c8a9a). The line is ライター&SNS's
      // confirmed wording (via 統括 2026-09-27).
      Object.freeze({ id: "intro", title: "紹介ページ", lead: "", items: Object.freeze([
        Object.freeze({ link: "service_intro", lines: Object.freeze(["サービスの内容は、kokoroamu.jp の紹介ページでご覧いただけます。"]) }),
      ]) }),
      // The 64 Characters and the store (Owner 2026-09-30; ライター&SNS 2e20567, the same text as AMU Studio). No line
      // under the buttons: the 10 Characters outside the packs are explained on the introduction page.
      Object.freeze({ id: "characters", title: "キャラクター紹介", lead: "SAKU Character Pack に収録しているキャラクターを、得意なことと、人に引き継ぐことと一緒に紹介しています。パックは有料です。価格は商品ページに記載しています。", items: Object.freeze([
        Object.freeze({ link: "characters_intro", lines: Object.freeze([]) }),
        Object.freeze({ link: "store_packs", lines: Object.freeze([]) }),
      ]) }),
      Object.freeze({ id: "subscriptions", title: "サブスクリプション", lead: "月額のサービスです。毎月の内容と料金は申込ページに記載しています。", items: Object.freeze([
        Object.freeze({ link: "saku_clinic", lines: Object.freeze([
          "「診療」はソフトウェアの調査と修復のたとえで、医療や心理の診断ではありません。",
          "SAKU 診療所では、キャラクターの気になる振る舞いや、署名し直しが必要な変更について、ご相談をお受けします。原因を調べて修復の計画をご提案し、修復と署名の手続きまでご案内します。ご自身で直した後の再点検も 1 回含まれます。",
        ]) }),
        Object.freeze({ link: "amu_training", lines: Object.freeze([
          "AMU トレーニングセンターでは、SAKU・AMU のキャラクター 1 体を、業務の目標に合わせて試し、速さと振る舞いを測って評価します。結果をもとに改善案をお渡しし、改善した後の再評価も 1 回含まれます。メニューは、基本点検・スピードテスト・目的別の反復測定（ジム）・変更後の確認（リハビリ）の 4 つです。",
        ]) }),
        Object.freeze({ link: "set_plan", lines: Object.freeze(["セット — 上の両方が含まれます。"]) }),
      ]) }),
      Object.freeze({ id: "login", title: "登録済みの方", lead: "", items: Object.freeze([
        Object.freeze({ link: "member_login", lines: Object.freeze(["ログインして、申し込んだ内容や結果を確かめます。"]) }),
      ]) }),
      Object.freeze({ id: "signature", title: ".amupkg への WI-T.COM の署名", lead: "自分の AMU Studio で書き出した .amupkg は、自分の PC ではそのまま使えます。ほかの人に配る・販売するときに WI-T.COM の署名を付けたい場合は、申し込めるようになります（いまは準備中です）。申し込めるのは、SAKU 診療所の加入者、または個別対応（料金は申込ページに記載します）の予定です。", items: Object.freeze([
        Object.freeze({ link: "amupkg_signature", lines: Object.freeze([
          "送り方: .amupkg をそのまま添付します（.amupkg は ZIP の形なので、さらに ZIP にする必要はありません）。",
          "含まれないもの: API キーの値、会話の記録。",
          "含まれるもの: 8 席の人の呼び名と役割と、設定していれば AI 実行エンジンの実行パス（この PC のフォルダーの場所）。フォルダーの場所には、Windows のユーザー名が含まれることがあります。",
          "署名が示すこと: WI-T.COM が署名し、その後変わっていないことです。",
        ]) }),
      ]) }),
    ]),
    commonNote: "改善や修復の内容は、ご自身で確かめてから反映できます。配布用の署名は、WI-T.COM が正式な手続きで行います。",
    pending: "準備中",
    allPending: "受付の開始は kokoroamu.jp でお知らせします。",
    home: "ホーム",
    openFailed: "ブラウザを開けませんでした。",
  }),
  en: Object.freeze({
    title: "SAKU Repair Desk and AMU Evaluation Center",
    intro: "SAKU Repair Desk and AMU Evaluation Center are support services that help you improve and repair your Characters the right way, and they are currently in preparation.",
    hosts: "The links open pages on wi-t.com or kokoroamu.jp in your browser.",
    // The English has no 「診療」 disclaimer: the English name does not say Clinic (ライター&SNS).
    sections: Object.freeze([
      // AG1–AG3 (英語翻訳チーム via ライター&SNS 2026-09-27). The overview page is Japanese only for now, so the
      // line says so; drop "(in Japanese)" once an English page is public.
      Object.freeze({ id: "intro", title: "Overview page", lead: "", items: Object.freeze([
        Object.freeze({ link: "service_intro", lines: Object.freeze(["You can read about the services on the overview page at kokoroamu.jp (in Japanese)."]) }),
      ]) }),
      // 英語翻訳チーム 2026-09-30 (the same text as README_en.md, Wi-t_Site-en 2d6e94e). The button opens the Japanese page.
      Object.freeze({ id: "characters", title: "Character introductions", lead: "Meet the Characters in the SAKU Character Packs, with what each is good at and what each hands to a person. The packs are paid. Prices are shown on the product pages.", items: Object.freeze([
        Object.freeze({ link: "characters_intro", lines: Object.freeze([]) }),
        Object.freeze({ link: "store_packs", lines: Object.freeze([]) }),
      ]) }),
      Object.freeze({ id: "subscriptions", title: "Subscription", lead: "A monthly service. What each month includes and the fee are shown on the application page.", items: Object.freeze([
        Object.freeze({ link: "saku_clinic", lines: Object.freeze(["At SAKU Repair Desk, you can consult us about Character behavior you would like us to look at, and about changes that require a new signature. We look into the cause, propose a repair plan, and guide you through the repair and signature steps. One follow-up check after you make the fixes yourself is also included."]) }),
        Object.freeze({ link: "amu_training", lines: Object.freeze(["At AMU Evaluation Center, we try out one SAKU or AMU Character against your business goals, then measure and evaluate its speed and behavior. Based on the results, we give you suggestions for improvement, and one re-evaluation after you improve it is included. The menu has four options: Basic check, Speed test, Goal-based repeated measurement and Check after changes."]) }),
        Object.freeze({ link: "set_plan", lines: Object.freeze(["Bundle — includes both of the above."]) }),
      ]) }),
      Object.freeze({ id: "login", title: "Already registered", lead: "", items: Object.freeze([
        Object.freeze({ link: "member_login", lines: Object.freeze(["Log in to check what you applied for and the results."]) }),
      ]) }),
      Object.freeze({ id: "signature", title: "WI-T.COM signature for .amupkg", lead: "An .amupkg exported from your own AMU Studio can be used as it is on your own PC. If you want a WI-T.COM signature on it when you give it to others or sell it, you will be able to apply for one (this is in preparation now). Applications are planned to be accepted from SAKU Repair Desk subscribers, or by individual arrangement (the fee will be shown on the application page).", items: Object.freeze([
        Object.freeze({ link: "amupkg_signature", lines: Object.freeze(["How to send: attach the .amupkg as it is (an .amupkg is already in ZIP form, so there is no need to zip it again).", "Not included: API key values and conversation logs.", "Included: the names and roles of the people in the 8 seats and, if set, the run path of the AI execution engine (a folder location on this PC). The folder location may include your Windows user name.", "What the signature shows: that WI-T.COM signed it and that it has not changed since."]) }),
      ]) }),
    ]),
    commonNote: "You can check any improvement or repair yourself before you put it into your Character. WI-T.COM applies the signature for distribution through its official procedure.",
    pending: "In preparation",
    allPending: "The start of registration will be announced on kokoroamu.jp.",
    home: "Home",
    openFailed: "Could not open the browser.",
    // The link table (service-links.mjs, shared with AMU) carries the Japanese labels only.
    linkLabels: Object.freeze({ service_intro: "View the overview page", characters_intro: "See the Character introductions (in Japanese)", store_packs: "See the packs in the store", saku_clinic: "Register for SAKU Repair Desk", amu_training: "Register for AMU Evaluation Center", set_plan: "Register for both (bundle)", member_login: "Log in (already registered)", amupkg_signature: "Apply for a signature on an .amupkg" }),
  }),
});

const wording = locale => (locale === "en-US" && SERVICES_WORDING.en) || SERVICES_WORDING.ja;
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);

/** The page's markup for a locale and a link table (pure: the gate renders it too). */
export function servicesMarkup(locale = "ja-JP", table = SERVICE_LINKS) {
  const w = wording(locale);
  const byId = new Map(table.links.map(link => [link.id, link]));
  // Every application shows as 「準備中」 until its URL is set: its button stays on the
  // screen, cannot be pressed and carries the pending mark, and while all five are
  // unset one line says where the start is announced. Until 2026-09-28 the
  // buttons were hidden while all five were unset (ライター&SNS de9924e); the Owner
  // then asked that SAKU 診療所 and AMU トレーニングセンター read as 準備中 (via 統括,
  // 「SAKU診療所とAMUトレーニングセンター、ERABAZU工房は準備中としてください。」), which is
  // also how AMU Studio shows them. The pages that only introduce something are not
  // applications — the services' introduction page (Owner 2026-09-27), and the 64-Character
  // introduction page and the store (Owner 2026-09-30) — so they do not count towards
  // 「受付の開始は…」.
  const allPending = table.links.filter(link => !INFORMATION_LINK_IDS.includes(link.id)).every(link => serviceLinkState(link).state === "PENDING");
  const control = id => {
    const link = byId.get(id);
    const { state, url } = serviceLinkState(link);
    const label = w.linkLabels?.[id] ?? link?.label_ja ?? id;
    return state === "READY"
      ? `<button type="button" class="primary" data-service-link="${esc(id)}" data-service-url="${esc(url)}">${esc(label)}</button>`
      : `<button type="button" data-service-link="${esc(id)}" data-service-state="PENDING" disabled>${esc(label)}<span class="service-pending">${esc(w.pending)}</span></button>`;
  };
  const sections = w.sections.map(section => `<div class="service-block" data-service-block="${esc(section.id)}"><h2>${esc(section.title)}</h2>`
    + (section.lead ? `<p class="service-note">${esc(section.lead)}</p>` : "")
    + `<ul class="service-list">${section.items.map(item => `<li class="service-item" data-service-item="${esc(item.link)}">${item.lines.map(line => `<p>${esc(line)}</p>`).join("")}${control(item.link)}</li>`).join("")}</ul></div>`).join("");
  return `<header><div class="brand">SAKU <strong>SERVICES</strong></div><div class="header-actions"><a id="to-home" class="button-link" href="../index.html?stay=1">${esc(w.home)}</a></div></header>`
    + `<main class="layout"><section class="card" data-services="${esc(table.schema)}"${allPending ? " data-services-state=\"ALL_PENDING\"" : ""}><h1>${esc(w.title)}</h1><p>${esc(w.intro)}</p>`
    // Where the links open is said whenever a button can be pressed (ライター&SNS 2026-09-27), so an
    // unfamiliar address in the browser is expected.
    + (allPending ? `<p class="service-all-pending" data-service-note="all-pending">${esc(w.allPending)}</p>` : "")
    + (table.links.some(link => serviceLinkState(link).state === "READY") ? `<p class="service-note" data-service-note="hosts">${esc(w.hosts)}</p>` : "")
    + sections
    + `<p class="service-note" data-service-note="common">${esc(w.commonNote)}</p><p id="service-status" role="status" class="service-note"></p></section></main>`;
}

function localeNow() {
  try { return localStorage.getItem("saku.ui.locale") === "en-US" ? "en-US" : "ja-JP"; } catch { return "ja-JP"; }
}

async function open(url) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (invoke) return invoke("open_service_link", { url });
  window.open(url, "_blank", "noopener");   // the static page, in a browser already
}

export function mountServices(root = document.getElementById("services-root")) {
  if (!root) return;
  const locale = localeNow();
  root.innerHTML = servicesMarkup(locale);
  document.title = wording(locale).title;
  document.documentElement.lang = locale === "en-US" ? "en" : "ja";
  root.querySelectorAll("[data-service-url]").forEach(button => button.addEventListener("click", async () => {
    try { await open(button.dataset.serviceUrl); }
    catch { const status = document.getElementById("service-status"); if (status) status.textContent = wording(locale).openFailed; }
  }));
}

if (typeof document !== "undefined" && document.getElementById("services-root")) mountServices();
