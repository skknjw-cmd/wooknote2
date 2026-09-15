import { describe, it, expect } from "vitest";
import { splitText } from "./notionBlocks";

describe("splitText", () => {
  it("한도 미만이면 1개로 반환한다", () => {
    expect(splitText("안녕하세요", 2000)).toEqual(["안녕하세요"]);
  });

  it("정확히 한도 길이면 1개로 반환한다", () => {
    const s = "가".repeat(2000);
    expect(splitText(s, 2000)).toEqual([s]);
  });

  it("한도를 1자 넘으면 2개로 쪼갠다", () => {
    const s = "가".repeat(2001);
    const out = splitText(s, 2000);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(2000);
    expect(out[1]).toBe("가");
    expect(out.join("")).toBe(s);
  });

  it("빈 문자열이면 빈 배열을 반환한다", () => {
    expect(splitText("", 2000)).toEqual([]);
  });

  it("limit 기본값은 2000이다", () => {
    expect(splitText("가".repeat(2001))).toHaveLength(2);
  });
});

import { chunkBlocks } from "./notionBlocks";

describe("chunkBlocks", () => {
  const nums = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("빈 배열이면 빈 배열을 반환한다", () => {
    expect(chunkBlocks([], 100)).toEqual([]);
  });

  it("99개는 1덩어리다", () => {
    const out = chunkBlocks(nums(99), 100);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(99);
  });

  it("정확히 100개도 1덩어리다", () => {
    const out = chunkBlocks(nums(100), 100);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(100);
  });

  it("101개는 100 + 1 두 덩어리다", () => {
    const out = chunkBlocks(nums(101), 100);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(100);
    expect(out[1]).toEqual([100]);
  });

  it("250개는 100 + 100 + 50 세 덩어리다", () => {
    const out = chunkBlocks(nums(250), 100);
    expect(out.map((c) => c.length)).toEqual([100, 100, 50]);
  });

  it("size 기본값은 100이다", () => {
    expect(chunkBlocks(nums(101))).toHaveLength(2);
  });
});

import { buildBlocks } from "./notionBlocks";
import type { NotionMeetingPayload } from "@/types/meeting";

const basePayload: NotionMeetingPayload = {
  title: "주간 회의",
  meetingDate: "2026-09-15",
  location: "",
  attendees: [],
  durationText: "",
  entryMethod: "live",
  turns: [],
};

/** 문단 블록의 전체 평문을 이어붙여 반환 (검증 편의용). */
function plain(block: { paragraph?: { rich_text: Array<{ text: { content: string } }> } }): string {
  return (block.paragraph?.rich_text ?? []).map((r) => r.text.content).join("");
}

describe("buildBlocks", () => {
  it("발화가 없으면 헤딩 2개와 회의 정보 문단만 만든다", () => {
    const blocks = buildBlocks({ ...basePayload, attendees: ["김팀장"] });
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe("heading_2");
    expect(blocks[1].type).toBe("paragraph");
    expect(blocks[2].type).toBe("heading_2");
  });

  it("회의 정보가 전부 비면 정보 문단을 생략한다", () => {
    const blocks = buildBlocks({ ...basePayload, meetingDate: "" });
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.type === "heading_2")).toBe(true);
  });

  it("값이 있는 항목만 가운뎃점으로 잇는다", () => {
    const blocks = buildBlocks({
      ...basePayload,
      location: "3층 회의실",
      attendees: ["김팀장", "이책임"],
      durationText: "1:23:45",
    });
    expect(plain(blocks[1])).toBe(
      "일시: 2026-09-15 · 장소: 3층 회의실 · 참석자: 김팀장, 이책임 · 소요시간: 1:23:45",
    );
  });

  it("발화 1개는 문단 1개가 되고 화자는 굵게 표시된다", () => {
    const blocks = buildBlocks({
      ...basePayload,
      turns: [{ speaker: "김팀장", time: "00:12", text: "시작하겠습니다." }],
    });
    expect(blocks).toHaveLength(4);
    const last = blocks[3];
    expect(last.type).toBe("paragraph");
    expect(last.paragraph!.rich_text[0].text.content).toBe("[김팀장]");
    expect(last.paragraph!.rich_text[0].annotations).toEqual({ bold: true });
    expect(plain(last)).toBe("[김팀장] 00:12  시작하겠습니다.");
  });

  it("시각이 비면 접두에 시각을 넣지 않는다", () => {
    const blocks = buildBlocks({
      ...basePayload,
      turns: [{ speaker: "화자 1", time: "", text: "내용" }],
    });
    expect(plain(blocks[3])).toBe("[화자 1] 내용");
  });

  it("2000자를 넘는 발화는 여러 문단으로 나뉘고 접두는 첫 문단에만 붙는다", () => {
    const long = "가".repeat(2500);
    const blocks = buildBlocks({
      ...basePayload,
      turns: [{ speaker: "김팀장", time: "00:12", text: long }],
    });
    // 헤딩2 + 정보1 + 헤딩2 + 문단2
    expect(blocks).toHaveLength(5);
    expect(blocks[3].paragraph!.rich_text[0].text.content).toBe("[김팀장]");
    expect(blocks[4].paragraph!.rich_text[0].text.content).toBe("가".repeat(500));
    expect(blocks[4].paragraph!.rich_text[0].annotations).toBeUndefined();
  });

  it("빈 텍스트 발화는 건너뛴다", () => {
    const blocks = buildBlocks({
      ...basePayload,
      turns: [{ speaker: "김팀장", time: "00:12", text: "   " }],
    });
    expect(blocks).toHaveLength(3);
  });
});
