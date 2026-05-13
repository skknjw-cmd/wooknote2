const GEMINI_KEY = "autonote_gemini_api_key";
const OPENAI_KEY = "autonote_openai_api_key";
const STT_PROVIDER_KEY = "autonote_stt_provider";

export type SttProvider = "gemini" | "openai";

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
  return getSttProvider() === "openai" ? openAiKeyHeader() : apiKeyHeader();
}
