import type { NotionMeetingPayload } from "@/types/meeting";

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
        blocks.push(paragraph([
          richText(`[${turn.speaker}]`, true),
          richText(`${prefix}${chunk}`),
        ]));
      } else {
        blocks.push(paragraph([richText(chunk)]));
      }
    });
  }

  return blocks;
}
