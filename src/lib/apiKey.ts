const GEMINI_KEY = "autonote_gemini_api_key";
const OPENAI_KEY = "autonote_openai_api_key";
const CLOVA_URL_KEY = "autonote_clova_url";
const CLOVA_SECRET_KEY = "autonote_clova_secret_key";
const STT_PROVIDER_KEY = "autonote_stt_provider";
const NOTION_TOKEN_KEY = "autonote_notion_token";
const NOTION_DB_KEY = "autonote_notion_db";

export type SttProvider = "gemini" | "openai" | "clova";

// ── Gemini ──────────────────────────────────────────────────────
export function getApiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(GEMINI_KEY) ?? "";
}

export function setApiKey(key: string) {
  if (key.trim()) {
    localStorage.setItem(GEMINI_KEY, key.trim());
  } else {
    localStorage.removeItem(GEMINI_KEY);
  }
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

export function apiKeyHeader(): Record<string, string> {
  const key = getApiKey();
  return key ? { "x-gemini-key": key } : {};
}

// ── OpenAI ──────────────────────────────────────────────────────
export function getOpenAiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(OPENAI_KEY) ?? "";
}

export function setOpenAiKey(key: string) {
  if (key.trim()) {
    localStorage.setItem(OPENAI_KEY, key.trim());
  } else {
    localStorage.removeItem(OPENAI_KEY);
  }
}

export function openAiKeyHeader(): Record<string, string> {
  const key = getOpenAiKey();
  return key ? { "x-openai-key": key } : {};
}

// ── Clova Speech ────────────────────────────────────────────────
export function getClovaUrl(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(CLOVA_URL_KEY) ?? "";
}

export function setClovaUrl(url: string) {
  if (url.trim()) {
    localStorage.setItem(CLOVA_URL_KEY, url.trim());
  } else {
    localStorage.removeItem(CLOVA_URL_KEY);
  }
}

export function getClovaSecretKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(CLOVA_SECRET_KEY) ?? "";
}

export function setClovaSecretKey(key: string) {
  if (key.trim()) {
    localStorage.setItem(CLOVA_SECRET_KEY, key.trim());
  } else {
    localStorage.removeItem(CLOVA_SECRET_KEY);
  }
}

export function clovaKeyHeaders(): Record<string, string> {
  const url = getClovaUrl();
  const key = getClovaSecretKey();
  const headers: Record<string, string> = {};
  if (url) headers["x-clova-url"] = url;
  if (key) headers["x-clova-key"] = key;
  return headers;
}

// ── Notion ──────────────────────────────────────────────────────

/**
 * 붙여넣은 값에서 32자 hex 데이터베이스 ID를 뽑는다.
 * Notion URL, 하이픈이 든 UUID, 순수 ID를 모두 받아들인다.
 *
 * 1. `?` 뒤(쿼리 문자열)를 먼저 버린다 — `?v=<32자 hex>` 뷰 ID가 절대 잡히지 않도록.
 * 2. 하이픈을 제거한다(하이픈이 든 UUID 대응).
 * 3. 뒤에 hex가 더 붙지 않는 **마지막** 32자 구간을 고른다. 제목 슬러그가
 *    `2026-09-15-` / `DB-` / `%ED%9A%8C...-`(URL 인코딩된 `회의록`)처럼 hex 문자를
 *    앞에 보태 hex 구간이 32자보다 길어져도, 부정 전방탐색이 실제 ID 32자에 정확히 맞는다.
 *
 * 못 찾으면 빈 문자열.
 */
export function extractDatabaseId(input: string): string {
  const withoutQuery = input.trim().split("?")[0];
  const compact = withoutQuery.replace(/-/g, "");
  const matches = compact.match(/[0-9a-fA-F]{32}(?![0-9a-fA-F])/g);
  return matches ? matches[matches.length - 1] : "";
}

export function getNotionToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NOTION_TOKEN_KEY) ?? "";
}

export function setNotionToken(token: string) {
  if (token.trim()) {
    localStorage.setItem(NOTION_TOKEN_KEY, token.trim());
  } else {
    localStorage.removeItem(NOTION_TOKEN_KEY);
  }
}

export function getNotionDbId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NOTION_DB_KEY) ?? "";
}

/** 입력값에서 ID를 추출해 저장한다. 추출에 실패하면 저장하지 않고 기존 값을 지운다. */
export function setNotionDbId(input: string) {
  const id = extractDatabaseId(input);
  if (id) {
    localStorage.setItem(NOTION_DB_KEY, id);
  } else {
    localStorage.removeItem(NOTION_DB_KEY);
  }
}

export function hasNotionConfig(): boolean {
  return getNotionToken().length > 0 && getNotionDbId().length > 0;
}

export function notionKeyHeaders(): Record<string, string> {
  return {
    "x-notion-token": getNotionToken(),
    "x-notion-db": getNotionDbId(),
  };
}

const CLOVA_CREDIT_KEY = "autonote_clova_credit";
const GEMINI_PAY_AS_YOU_GO_KEY = "autonote_gemini_pay_as_you_go";
const GEMINI_ACCUMULATED_INPUT_KEY = "autonote_gemini_accumulated_input";
const GEMINI_ACCUMULATED_OUTPUT_KEY = "autonote_gemini_accumulated_output";

// ── STT Provider ─────────────────────────────────────────────────
export function getSttProvider(): SttProvider {
  if (typeof window === "undefined") return "gemini";
  return (localStorage.getItem(STT_PROVIDER_KEY) as SttProvider) ?? "gemini";
}

export function setSttProvider(provider: SttProvider) {
  localStorage.setItem(STT_PROVIDER_KEY, provider);
}

/** 현재 선택된 STT 프로바이더의 API 키 헤더 반환 */
export function sttKeyHeader(): Record<string, string> {
  const provider = getSttProvider();
  if (provider === "openai") return openAiKeyHeader();
  if (provider === "clova") return clovaKeyHeaders();
  return apiKeyHeader();
}

// ── Billing Configuration & Statistics ─────────────────────────
export function getClovaCredit(): number {
  if (typeof window === "undefined") return 0;
  return parseFloat(localStorage.getItem(CLOVA_CREDIT_KEY) ?? "0") || 0;
}

export function setClovaCredit(credit: number) {
  localStorage.setItem(CLOVA_CREDIT_KEY, String(credit));
}

export function getGeminiPayAsYouGo(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(GEMINI_PAY_AS_YOU_GO_KEY) === "true";
}

export function setGeminiPayAsYouGo(val: boolean) {
  localStorage.setItem(GEMINI_PAY_AS_YOU_GO_KEY, String(val));
}

export function getGeminiAccumulatedTokens(): { input: number; output: number } {
  if (typeof window === "undefined") return { input: 0, output: 0 };
  const input = parseInt(localStorage.getItem(GEMINI_ACCUMULATED_INPUT_KEY) ?? "0", 10) || 0;
  const output = parseInt(localStorage.getItem(GEMINI_ACCUMULATED_OUTPUT_KEY) ?? "0", 10) || 0;
  return { input, output };
}

export function accumulateGeminiTokens(input: number, output: number) {
  const current = getGeminiAccumulatedTokens();
  localStorage.setItem(GEMINI_ACCUMULATED_INPUT_KEY, String(current.input + input));
  localStorage.setItem(GEMINI_ACCUMULATED_OUTPUT_KEY, String(current.output + output));
}

export function resetAccumulatedBilling() {
  localStorage.removeItem(GEMINI_ACCUMULATED_INPUT_KEY);
  localStorage.removeItem(GEMINI_ACCUMULATED_OUTPUT_KEY);
}
