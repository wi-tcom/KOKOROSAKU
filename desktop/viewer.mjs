const text = value => typeof value === "string" && value.trim() ? value.trim() : "";
const first = (...values) => values.map(text).find(Boolean) || "";
const list = value => Array.isArray(value) ? value.filter(item => typeof item === "string" && item.trim()).map(item => item.trim()) : [];
const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function recordsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.characters)) return payload.characters;
  if (payload?.character && typeof payload.character === "object") return [payload.character];
  return payload && typeof payload === "object" ? [payload] : [];
}

function availabilityFrom(status) {
  if (["IMPORTED", "AVAILABLE", "UNLOCKED", "SAMPLE"].includes(status)) return "AVAILABLE";
  if (status === "LOCKED") return "LOCKED";
  if (["INVALID", "UNSUPPORTED", "NOT_CONFIGURED", "UNAVAILABLE"].includes(status)) return "UNAVAILABLE";
  return "UNKNOWN";
}

function onePlusSeven(character) {
  const composition = character.assistant_composition || character.composition || {};
  const seats = Object.keys(composition).filter(key => /^seat[1-8]$/.test(key) && composition[key]);
  const count = seats.length || (Array.isArray(character.seats) ? character.seats.length : 0);
  return { count, summary: count ? `${count}/8 seats configured` : "NOT_CONFIGURED" };
}

function axes(character) {
  const source = character.personality_axes || character.axes || {};
  const entries = Object.entries(source).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)).slice(0, 15).map(([key, value]) => ({ key, value: String(value) }));
  return { entries, summary: entries.length ? `${entries.length}/15 axes configured` : "NOT_CONFIGURED" };
}

function expertise(character) {
  const purpose = character.purpose || {};
  const professional = character.professional_reasoning || character.professional || character.expertise || {};
  return first(
    character.expertise_summary,
    character.professional_summary,
    professional.summary,
    professional.profile_display_name,
    purpose.primary_value,
    list(purpose.work_modes).join(" / ")
  ) || "NOT_CONFIGURED";
}

function expectedProfile(character) {
  const explicit = character.expected_profile || character.derived_profile || character.expected;
  if (typeof explicit === "string") return explicit;
  if (explicit && typeof explicit === "object") return first(explicit.summary, explicit.description, explicit.label) || "CONFIGURED";
  const strengths = list(character.conformance?.expected_strengths);
  return strengths.length ? strengths.join(" / ") : "NOT_CONFIGURED";
}

export function packageSummary(result = {}) {
  const manifest = result.manifest || {};
  return {
    status: text(result.status) || "UNKNOWN",
    code: text(result.code) || "NOT_PROVIDED",
    reason: text(result.reason) || "No current validation result is available.",
    product: text(manifest.product) || "UNKNOWN",
    version: text(manifest.package_version) || "UNKNOWN",
    compatibility: text(manifest.minimum_app_version) || "UNKNOWN",
    payload_hash: text(manifest.payload_hash) || "UNKNOWN",
    imported_path: text(result.imported_path) || "NOT_IMPORTED"
  };
}

export function parseViewerPayload(payloadJson, context = {}) {
  let payload;
  try { payload = typeof payloadJson === "string" ? JSON.parse(payloadJson) : payloadJson; }
  catch { return { records: [], parse_status: "INVALID", parse_reason: "Payload JSON could not be parsed." }; }
  const pkg = packageSummary(context);
  const availability = availabilityFrom(pkg.status);
  const records = recordsFromPayload(payload).filter(item => item && typeof item === "object").map((character, index) => {
    const identity = character.identity || {};
    const purpose = character.purpose || {};
    const schema = character.schema || {};
    const composition = onePlusSeven(character);
    const axisInfo = axes(character);
    return {
      id: first(identity.character_id, character.character_id, character.id) || `character-${index + 1}`,
      name: first(identity.display_name, character.display_name, character.meta?.name, character.name) || "Unnamed Character",
      role: first(identity.catalog?.role_label, character.role_label, character.character_core?.character_role) || "UNKNOWN",
      summary: first(purpose.summary, character.purpose_summary, character.summary) || "UNKNOWN",
      category: first(identity.catalog?.catalog_group, identity.category, character.category, purpose.category) || "UNKNOWN",
      revision: first(identity.character_revision, character.character_revision, character.revision, character.meta?.revision) || "UNKNOWN",
      availability,
      package_state: pkg.status,
      one_plus_seven: composition.summary,
      axes: axisInfo.entries,
      axes_summary: axisInfo.summary,
      expertise: expertise(character),
      expected_profile: expectedProfile(character),
      technical: {
        schema_id: first(schema.schema_id, character.schema_id) || "UNKNOWN",
        schema_version: first(schema.schema_version, character.schema_version) || "UNKNOWN",
        digest: first(character.character_digest, character.digest, character.provenance?.digest) || "NOT_PROVIDED",
        provenance: first(character.provenance?.source, character.provenance?.source_ref, character.source_ref) || "NOT_PROVIDED",
        compatibility: pkg.compatibility,
        verification_state: pkg.status
      },
      source_character: structuredClone(character)
    };
  });
  return { records, parse_status: "VALID", parse_reason: "", package: pkg };
}

export function workModesOf(record) {
  const modes = record && record.source_character && record.source_character.purpose
    ? record.source_character.purpose.work_modes : null;
  return Array.isArray(modes) ? modes.map(mode => String(mode).trim()).filter(Boolean) : [];
}

export function catalogFacets(records) {
  return {
    categories: [...new Set(records.map(record => record.category).filter(Boolean))].sort(natural.compare),
    // 向いている仕事. Taken from what the Character itself states in
    // purpose.work_modes - never inferred from an occupation or a name.
    work_modes: [...new Set(records.flatMap(record => workModesOf(record)))].sort(natural.compare),
    package_states: [...new Set(records.map(record => record.package_state).filter(Boolean))].sort(natural.compare)
  };
}

export function filterCatalog(records, options = {}) {
  const query = text(options.query).toLocaleLowerCase();
  const availability = text(options.availability) || "ALL";
  const packageState = text(options.packageState) || "ALL";
  const category = text(options.category) || "ALL";
  const workMode = text(options.workMode) || "ALL";
  const sort = text(options.sort) || "name";
  const filtered = records.filter(record => {
    // Searching should reach the words that help you choose: what it is for, who
    // it is for, what it will not take on, and the work it says it suits.
    const purpose = (record.source_character && record.source_character.purpose) || {};
    const haystack = [record.name, record.role, record.category, purpose.summary, purpose.primary_value,
      ...(Array.isArray(purpose.target_users) ? purpose.target_users : []),
      ...(Array.isArray(purpose.non_goals) ? purpose.non_goals : []),
      ...workModesOf(record)].filter(Boolean).join("\n").toLocaleLowerCase();
    return (!query || haystack.includes(query)) &&
      (availability === "ALL" || record.availability === availability) &&
      (packageState === "ALL" || record.package_state === packageState) &&
      (category === "ALL" || record.category === category) &&
      (workMode === "ALL" || workModesOf(record).includes(workMode));
  });
  const selector = sort === "role" ? record => `${record.role}\n${record.category}\n${record.name}` : sort === "category" ? record => `${record.category}\n${record.role}\n${record.name}` : sort === "revision" ? record => `${record.revision}\n${record.name}` : record => record.name;
  return [...filtered].sort((a, b) => natural.compare(selector(a), selector(b)));
}

const compareFields = [
  ["role", record => record.role], ["category", record => record.category], ["one_plus_seven", record => record.one_plus_seven],
  ["axes", record => record.axes.length ? JSON.stringify(record.axes) : record.axes_summary], ["expertise", record => record.expertise],
  ["expected_profile", record => record.expected_profile], ["revision", record => record.revision], ["availability", record => record.availability]
];

function compareCell(record, getter, key) {
  if (key !== "availability" && ["UNAVAILABLE", "LOCKED"].includes(record.availability)) return { state: "NOT_AVAILABLE", value: "NOT_AVAILABLE" };
  const value = getter(record);
  if (value === "NOT_CONFIGURED" || value === "NOT_PROVIDED") return { state: "NOT_AVAILABLE", value };
  if (value === "UNKNOWN" || value === "" || value == null) return { state: "UNKNOWN", value: "UNKNOWN" };
  return { state: "VALUE", value };
}

export function compareCharacters(records) {
  if (records.length < 2) return [];
  return compareFields.map(([field, getter]) => {
    const cells = records.map(record => compareCell(record, getter, field));
    let state;
    if (cells.some(cell => cell.state === "NOT_AVAILABLE")) state = "NOT_AVAILABLE";
    else if (cells.some(cell => cell.state === "UNKNOWN")) state = "UNKNOWN";
    else state = cells.every(cell => cell.value === cells[0].value) ? "SAME" : "DIFFERENT";
    return { field, state, cells };
  });
}

export function viewerCopy(locale = "ja-JP") {
  return locale === "en-US" ? {
    characters: "Characters", details: "Character details", unknown: "Not provided", all: "All", available: "Available", unavailable: "Unavailable", locked: "Locked", unverified: "Unknown / unverified",
    role: "Role / overview", category: "Category", revision: "Revision / version", availability: "Availability", packageState: "Package / import state",
    composition: "1+7 structure", axes: "15 axes", expertise: "Expertise / professional", expected: "Expected Profile", technical: "Technical details",
    schema: "Schema / version", digest: "Digest", provenance: "Provenance / source", compatibility: "Compatibility", verification: "Verification state",
    status: "Status", product: "Product", version: "Version", hash: "Hash", reason: "Reason", compareColumn: "Compare", stateField: "State / field", handoff: "Handoff",
    test: "Test in Trainer", review: "Review Results", edit: "Create editable copy in Builder", compare: "Compare selected Characters", clear: "Clear selection",
    selectCompare: "Select for comparison", resultCount: count => `${count} result(s)`, selectedCount: count => `${count} selected for comparison`,
    noResults: "No Characters match the current search and filters.", recover: "Clear the search or filters to see the catalog again.", compareNeedsTwo: "Select at least two Characters to compare."
  } : {
    characters: "キャラクター", details: "Character詳細", unknown: "情報なし", all: "すべて", available: "利用可能", unavailable: "利用不可", locked: "ロック中", unverified: "不明 / 未検証",
    role: "役割 / 概要", category: "カテゴリ", revision: "revision / version", availability: "利用可能状態", packageState: "Package / import状態",
    composition: "1+7構造", axes: "15軸", expertise: "専門性 / Professional", expected: "Expected Profile", technical: "詳細情報",
    schema: "Schema / version", digest: "Digest", provenance: "Provenance / source", compatibility: "Compatibility", verification: "検証状態",
    status: "状態", product: "製品", version: "Version", hash: "Hash", reason: "理由", compareColumn: "比較", stateField: "状態 / 項目", handoff: "導線",
    test: "Trainerで試す", review: "結果を確認する", edit: "Builderで編集用コピーを作る", compare: "選択したCharacterを比較", clear: "選択を解除",
    selectCompare: "比較対象に選択", resultCount: count => `${count}件を表示`, selectedCount: count => `比較対象 ${count}件`,
    noResults: "検索・絞り込み条件に一致するCharacterがありません。", recover: "検索語または絞り込みを解除するとCatalogを再表示できます。", compareNeedsTwo: "比較するCharacterを2件以上選択してください。"
  };
}
