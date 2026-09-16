/**
 * Notion 페이지 id → 열 수 있는 URL. id가 없으면 null.
 *
 * Notion은 하이픈이 있든 없든 같은 페이지를 열어 주지만, 저장된 id의 모양이
 * 경로에 따라 다르므로(생성 응답은 하이픈 있음) 한 가지로 맞춰 둔다.
 */
export function notionPageUrl(pageId?: string): string | null {
  const id = (pageId ?? "").trim().replace(/-/g, "");
  if (!id) return null;
  return `https://notion.so/${id}`;
}
