const GEMINI_KEY = "autonote_gemini_api_key";
const OPENAI_KEY = "autonote_openai_api_key";
const CLOVA_URL_KEY = "autonote_clova_url";
const CLOVA_SECRET_KEY = "autonote_clova_secret_key";
const STT_PROVIDER_KEY = "autonote_stt_provider";

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
