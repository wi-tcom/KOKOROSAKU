// Links to wi-t.com's services (on wi-t.com and kokoroamu.jp) (Owner 2026-09-27, AMU DECISION 2026-09-27-11):
// SAKU 診療所, AMU トレーニングセンター, both as a set, the members' login, and the
// application for wi-t.com's signature on an .amupkg. They take
// the place of 04 Trainer, which leaves the Builder's screens.
//
// The same ids and the same Japanese labels as AMU Studio's table
// (KOKOROAMU-STUDIO specification/wi-t-service-links.js @9e6fcb0), so one set of URLs
// serves both products. No prices here: prices live on the product pages only.
// `url: null` means 「準備中」; a URL goes in here, in one place, once it is set.

export const SERVICE_LINKS_SCHEMA = "wi-t.service-links/1";

export const SERVICE_LINKS = Object.freeze({
  schema: SERVICE_LINKS_SCHEMA,
  updated: "2026-09-27",
  links: Object.freeze([
    // The introduction page, already public (Owner 2026-09-27: 「アプリのリンクの表に support.kokoroamu.jp
    // （紹介ページ）を足す」; AMU @90c8a9a, DECISION 2026-09-27-19). The five application links stay 準備中.
    Object.freeze({ id: "service_intro", label_ja: "紹介ページを見る", url: "https://support.kokoroamu.jp/" }),
    Object.freeze({ id: "saku_clinic", label_ja: "SAKU 診療所に登録する", url: null }),
    Object.freeze({ id: "amu_training", label_ja: "AMU トレーニングセンターに登録する", url: null }),
    Object.freeze({ id: "set_plan", label_ja: "両方に登録する（セット）", url: null }),
    Object.freeze({ id: "member_login", label_ja: "ログインする（登録済みの方）", url: null }),
    // 「認定」ではなく「署名」: a signature shows where it came from and that it has not
    // changed since, no more (ライター&SNS de9924e; the Owner's own words say 署名).
    Object.freeze({ id: "amupkg_signature", label_ja: ".amupkg への署名を申し込む", url: null }),
  ]),
});

/** The hosts a link may open (AMU Studio's SERVICE_LINK_HOSTS @eb2ccec): wi-t.com and
 * kokoroamu.jp (Owner 2026-09-27: SAKU 診療所 and AMU トレーニングセンター live on kokoroamu.jp),
 * and support.kokoroamu.jp, where the subscription site puts its pages (Owner 2026-09-27). */
export const SERVICE_LINK_HOSTS = Object.freeze(["wi-t.com", "www.wi-t.com", "kokoroamu.jp", "www.kokoroamu.jp", "support.kokoroamu.jp"]);

/**
 * The same rule as AMU Studio's isAllowedServiceUrl: https on SERVICE_LINK_HOSTS
 * only, at most 500 characters from [A-Za-z0-9:/._~%?=&#+-], no credentials, no
 * port. The host checks the same rule again before it opens a browser, so a page
 * that is tampered with cannot open anything else.
 */
export function isAllowedServiceUrl(url) {
  if (typeof url !== "string" || url.length > 500 || !/^[A-Za-z0-9:/._~%?=&#+-]+$/.test(url)) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  return u.protocol === "https:" && SERVICE_LINK_HOSTS.includes(u.hostname) && !u.username && !u.password && !u.port;
}

/** The link's state for the screen: READY with a URL, or PENDING (「準備中」). */
export function serviceLinkState(link) {
  return link && isAllowedServiceUrl(link.url) ? { state: "READY", url: link.url } : { state: "PENDING", url: null };
}
