const STORAGE_KEY = "autonote_gemini_api_key";

export function getApiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function setApiKey(key: string) {
  if (key.trim()) {
    localStorage.setItem(STORAGE_KEY, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

/** fetch 헤더에 포함할 객체 반환 */
export function apiKeyHeader(): Record<string, string> {
  const key = getApiKey();
  return key ? { "x-gemini-key": key } : {};
}
