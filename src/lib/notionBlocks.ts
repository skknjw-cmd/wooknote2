import type { NotionMeetingPayload, NotionFieldKey, NotionFieldMapping } from "@/types/meeting";

/** Notion rich_text 1개의 최대 길이. */
export const NOTION_TEXT_LIMIT = 2000;

/** Notion 요청 1건당 최대 자식 블록 수. */
export const NOTION_BLOCK_LIMIT = 100;

/** 긴 문자열을 Notion rich_text 한도에 맞게 쪼갠다. 빈 문자열은 빈 배열. */
export function splitText(text: string, limit: number = NOTION_TEXT_LIMIT): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += limit) {
    out.push(text.slice(i, i + limit));
  }
  return out;
}

/** 블록 배열을 Notion 요청 한도(기본 100개)에 맞게 나눈다. */
export function chunkBlocks<T>(blocks: T[], size: number = NOTION_BLOCK_LIMIT): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < blocks.length; i += size) {
    out.push(blocks.slice(i, i + size));
  }
  return out;
}

/** Notion 블록 요청 객체. SDK 타입 대신 필요한 모양만 정의한다. */
export type NotionRichText = {
  type: "text";
  text: { content: string };
  annotations?: { bold: true };
};

export type NotionBlock = {
  object: "block";
  type: "heading_2" | "paragraph";
  heading_2?: { rich_text: NotionRichText[] };
  paragraph?: { rich_text: NotionRichText[] };
};

function richText(content: string, bold = false): NotionRichText {
  const item: NotionRichText = { type: "text", text: { content } };
  if (bold) item.annotations = { bold: true };
  return item;
}

function heading(content: string): NotionBlock {
  return { object: "block", type: "heading_2", heading_2: { rich_text: [richText(content)] } };
}

function paragraph(rich: NotionRichText[]): NotionBlock {
  return { object: "block", type: "paragraph", paragraph: { rich_text: rich } };
}

/** 회의 정보 한 줄. 값이 있는 항목만 " · "로 잇는다. 전부 비면 빈 문자열. */
function meetingInfoLine(p: NotionMeetingPayload): string {
  const parts: string[] = [];
  if (p.meetingDate) parts.push(`일시: ${p.meetingDate}`);
  if (p.location) parts.push(`장소: ${p.location}`);
  if (p.attendees.length > 0) parts.push(`참석자: ${p.attendees.join(", ")}`);
  if (p.durationText) parts.push(`소요시간: ${p.durationText}`);
  return parts.join(" · ");
}

/**
 * 페이로드를 Notion 블록 배열로 변환한다.
 * 2000자를 넘는 발화는 여러 문단으로 나뉘며, 화자·시각 접두는 첫 문단에만 붙는다.
 */
export function buildBlocks(payload: NotionMeetingPayload): NotionBlock[] {
  const blocks: NotionBlock[] = [heading("회의 정보")];

  const info = meetingInfoLine(payload);
  if (info) blocks.push(paragraph([richText(info)]));

  blocks.push(heading("트랜스크립트"));

  for (const turn of payload.turns) {
    const body = turn.text.trim();
    if (!body) continue;

    const chunks = splitText(body);
    const prefix = turn.time ? ` ${turn.time}  ` : " ";

    chunks.forEach((chunk, i) => {
      if (i === 0) {
        // 접두(화자·시각)와 본문을 별개 rich_text 항목으로 분리한다.
        // 한 항목으로 합치면 접두 + 2000자 본문이 2000자 한도를 넘을 수 있다.
        blocks.push(paragraph([
          richText(`[${turn.speaker}]`, true),
          richText(prefix),
          richText(chunk),
        ]));
      } else {
        blocks.push(paragraph([richText(chunk)]));
      }
    });
  }

  return blocks;
}

/** dataSources.retrieve()가 돌려주는 속성 스키마 중 이 코드가 쓰는 부분만. */
export type NotionPropertySchema = Record<
  string,
  {
    type: string;
    /** select 타입일 때만 존재. 드롭다운에 채울 옵션. */
    select?: { options?: Array<{ name: string }> };
    /** status 타입일 때만 존재. API로 새 옵션을 만들 수 없어 기존 옵션과 대조해야 한다. */
    status?: { options?: Array<{ name: string }> };
  }
>;

/** 설정 화면 드롭다운이 쓰는 속성 정보. */
export type NotionPropertyInfo = {
  name: string;
  type: string;
  /** select·status일 때만. */
  options?: string[];
};

/** 스키마를 설정 화면이 쓸 목록으로 바꾼다. */
export function listProperties(schema: NotionPropertySchema): NotionPropertyInfo[] {
  return Object.entries(schema).map(([name, prop]) => {
    const options =
      prop.type === "select" ? prop.select?.options
      : prop.type === "status" ? prop.status?.options
      : undefined;
    return options
      ? { name, type: prop.type, options: options.map((o) => o.name) }
      : { name, type: prop.type };
  });
}

/**
 * 선택형 속성(select 또는 status)에 넣을 값을 정한다.
 *
 * select는 없는 옵션을 Notion이 자동으로 만들어 주지만, status는 API로 옵션을
 * 추가할 수 없다. 그래서 status는 기존 옵션과 이름이 일치할 때만 값을 넣는다.
 * Notion 한글 UI가 기본 제공하는 `상태`가 바로 이 status 타입이다.
 *
 * 넣을 수 없으면 reason을 돌려주고, reason이 빈 문자열이면 속성이 없거나
 * 선택형이 아니라는 뜻이다(기존처럼 이름만 기록한다).
 */
function resolveChoice(
  prop: NotionPropertySchema[string] | undefined,
  optionName: string,
): { value: unknown } | { reason: string } {
  if (prop?.type === "select") {
    return { value: { select: { name: optionName } } };
  }
  if (prop?.type === "status") {
    const has = prop.status?.options?.some((o) => o.name === optionName) ?? false;
    return has
      ? { value: { status: { name: optionName } } }
      : { reason: `status 옵션 "${optionName}" 없음` };
  }
  return { reason: "" };
}

/** skipped에 남길 문자열. 매핑된 경우 어느 속성을 노렸는지 함께 적는다. */
function skipLabel(fieldLabel: string, target: string | null, reason: string): string {
  if (target === null) return reason ? `${fieldLabel}(${reason})` : fieldLabel;
  return `${fieldLabel}(→${target}${reason ? `: ${reason}` : ""})`;
}

/**
 * 데이터 소스 스키마에 실제로 존재하고 타입까지 맞는 속성만 남긴다.
 * title은 이름이 DB마다 다르므로(한글 "이름", 영문 "Name") 타입으로 찾는다.
 *
 * fields를 넘기면 앱 필드를 사용자가 고른 속성·옵션에 넣는다. 넘기지 않으면
 * 하드코딩 이름으로 추정하는 기존 동작을 그대로 쓴다.
 */
export function filterProperties(
  schema: NotionPropertySchema,
  payload: NotionMeetingPayload,
  fields?: Partial<Record<NotionFieldKey, NotionFieldMapping>> | null,
): { properties: Record<string, unknown>; skipped: string[] } {
  const properties: Record<string, unknown> = {};
  const skipped: string[] = [];
  // target(속성 이름) → 그 속성을 먼저 차지한 필드 라벨. 같은 속성을 두 필드가
  // 가리킬 때 나중 필드가 덮어쓰지 않고 이유를 남기게 하려고 기록해 둔다.
  const claimedBy: Record<string, string> = {};

  // title: 타입으로 탐색
  const titleName = Object.keys(schema).find((k) => schema[k].type === "title");
  if (titleName) {
    properties[titleName] = { title: [{ text: { content: payload.title } }] };
    claimedBy[titleName] = "이름";
  } else {
    skipped.push("이름(title)");
  }

  const attendeesText = payload.attendees.join(", ");

  // 값 속성 (date / rich_text)
  const valuePlans: Array<{
    key: NotionFieldKey;
    name: string;
    type: string;
    value: unknown | null;
  }> = [
    { key: "meetingDate", name: "회의일시", type: "date", value: payload.meetingDate ? { date: { start: payload.meetingDate } } : null },
    { key: "attendees", name: "참석자", type: "rich_text", value: attendeesText ? { rich_text: [{ text: { content: attendeesText } }] } : null },
    { key: "durationText", name: "소요시간", type: "rich_text", value: payload.durationText ? { rich_text: [{ text: { content: payload.durationText } }] } : null },
  ];

  for (const plan of valuePlans) {
    if (plan.value === null) continue; // 값이 없으면 조용히 건너뜀
    const m = fields?.[plan.key];
    if (m && m.property === null) continue; // 일부러 쓰지 않는 필드
    const target = m?.property ?? plan.name;
    if (schema[target]?.type !== plan.type) {
      skipped.push(skipLabel(plan.name, m ? target : null, m ? `${plan.type} 아님` : ""));
      continue;
    }
    if (target in properties) {
      // 다른 필드가 이미 같은 속성을 차지함 — 먼저 온 값을 지키고 이유를 남긴다.
      skipped.push(skipLabel(plan.name, m ? target : null, `${claimedBy[target]}와 같은 속성`));
      continue;
    }
    properties[target] = plan.value;
    claimedBy[target] = plan.name;
  }

  // 선택형 속성 (select 또는 status). skipped 순서는 위 목록 뒤를 잇는다.
  const choicePlans: Array<{ key: NotionFieldKey; name: string; defaultOption: string | null }> = [
    { key: "status", name: "상태", defaultOption: "분석대기" },
    { key: "entryMethod", name: "입력방식", defaultOption: payload.entryMethod || null },
  ];

  for (const plan of choicePlans) {
    const m = fields?.[plan.key];
    if (m && m.property === null) continue; // 일부러 쓰지 않는 필드
    const optionName = m?.option ?? plan.defaultOption;
    if (!optionName) continue; // 넣을 값이 없으면 조용히 건너뜀
    const target = m?.property ?? plan.name;
    if (target in properties) {
      // 다른 필드가 이미 같은 속성을 차지함 — 먼저 온 값을 지키고 이유를 남긴다.
      skipped.push(skipLabel(plan.name, m ? target : null, `${claimedBy[target]}와 같은 속성`));
      continue;
    }
    const resolved = resolveChoice(schema[target], optionName);
    if ("value" in resolved) {
      properties[target] = resolved.value;
      claimedBy[target] = plan.name;
    } else {
      skipped.push(skipLabel(plan.name, m ? target : null, resolved.reason));
    }
  }

  return { properties, skipped };
}
