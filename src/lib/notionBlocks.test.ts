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

import { buildBlocks, NOTION_TEXT_LIMIT } from "./notionBlocks";
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

  it("시각이 있고 첫 청크가 2000자 꽉 찬 발화도 모든 rich_text 항목이 2000자를 넘지 않는다", () => {
    const long = "가".repeat(2500);
    const blocks = buildBlocks({
      ...basePayload,
      turns: [{ speaker: "김팀장", time: "00:12", text: long }],
    });
    for (const block of blocks) {
      const richTexts = block.heading_2?.rich_text ?? block.paragraph?.rich_text ?? [];
      for (const rt of richTexts) {
        expect(rt.text.content.length).toBeLessThanOrEqual(NOTION_TEXT_LIMIT);
      }
    }
  });
});

import { filterProperties } from "./notionBlocks";

const fullSchema = {
  이름: { type: "title" },
  회의일시: { type: "date" },
  참석자: { type: "rich_text" },
  소요시간: { type: "rich_text" },
  상태: { type: "select" },
  입력방식: { type: "select" },
};

const payload: NotionMeetingPayload = {
  title: "주간 회의",
  meetingDate: "2026-09-15",
  location: "3층",
  attendees: ["김팀장", "이책임"],
  durationText: "1:23:45",
  entryMethod: "live",
  turns: [],
};

describe("filterProperties", () => {
  it("모든 속성이 있으면 전부 채우고 skipped는 비어 있다", () => {
    const { properties, skipped } = filterProperties(fullSchema, payload);
    expect(skipped).toEqual([]);
    expect(properties["이름"]).toEqual({ title: [{ text: { content: "주간 회의" } }] });
    expect(properties["회의일시"]).toEqual({ date: { start: "2026-09-15" } });
    expect(properties["참석자"]).toEqual({ rich_text: [{ text: { content: "김팀장, 이책임" } }] });
    expect(properties["소요시간"]).toEqual({ rich_text: [{ text: { content: "1:23:45" } }] });
    expect(properties["상태"]).toEqual({ select: { name: "분석대기" } });
    expect(properties["입력방식"]).toEqual({ select: { name: "live" } });
  });

  it("title 속성은 이름이 아니라 타입으로 찾는다", () => {
    const { properties, skipped } = filterProperties({ Name: { type: "title" } }, payload);
    expect(properties["Name"]).toEqual({ title: [{ text: { content: "주간 회의" } }] });
    expect(skipped).toEqual(["회의일시", "참석자", "소요시간", "상태", "입력방식"]);
  });

  it("없는 속성은 제외하고 skipped에 담는다", () => {
    const schema = { 이름: { type: "title" }, 회의일시: { type: "date" } };
    const { properties, skipped } = filterProperties(schema, payload);
    expect(Object.keys(properties).sort()).toEqual(["이름", "회의일시"]);
    expect(skipped).toEqual(["참석자", "소요시간", "상태", "입력방식"]);
  });

  it("타입이 다르면 제외하고 skipped에 담는다", () => {
    const schema = { ...fullSchema, 회의일시: { type: "rich_text" } };
    const { skipped } = filterProperties(schema, payload);
    expect(skipped).toContain("회의일시");
  });

  it("값이 빈 항목은 속성이 있어도 채우지 않고 skipped에도 넣지 않는다", () => {
    const { properties, skipped } = filterProperties(fullSchema, {
      ...payload,
      durationText: "",
      attendees: [],
    });
    expect(properties["소요시간"]).toBeUndefined();
    expect(properties["참석자"]).toBeUndefined();
    expect(skipped).toEqual([]);
  });

  it("title 속성이 없으면 제목을 버리지 않고 skipped에 이름을 담는다", () => {
    const { properties, skipped } = filterProperties({ 회의일시: { type: "date" } }, payload);
    expect(Object.keys(properties)).toEqual(["회의일시"]);
    expect(skipped).toContain("이름(title)");
  });
});

// ── status 타입 선택형 속성 ──
// Notion 한글 UI가 기본 제공하는 `상태`는 select가 아니라 status 타입이다.
// status는 API로 새 옵션을 만들 수 없을 뿐, 기존 옵션명과 일치하면 값 설정은 된다.

const statusSchema = (optionNames: string[]) => ({
  이름: { type: "title" },
  상태: { type: "status", status: { options: optionNames.map((name) => ({ name })) } },
});

describe("filterProperties — status 타입", () => {
  it("status 옵션에 분석대기가 있으면 status 형태로 채운다", () => {
    const { properties, skipped } = filterProperties(statusSchema(["분석대기", "분석완료"]), payload);
    expect(properties["상태"]).toEqual({ status: { name: "분석대기" } });
    expect(skipped).not.toContain("상태");
  });

  it("status 옵션에 분석대기가 없으면 건너뛰고 이유를 남긴다", () => {
    const { properties, skipped } = filterProperties(statusSchema(["시작전", "완료"]), payload);
    expect(properties["상태"]).toBeUndefined();
    expect(skipped.find((s) => s.startsWith("상태"))).toBe('상태(status 옵션 "분석대기" 없음)');
  });

  it("status 속성에 options가 아예 없으면 건너뛴다", () => {
    const schema = { 이름: { type: "title" }, 상태: { type: "status" } };
    const { properties, skipped } = filterProperties(schema, payload);
    expect(properties["상태"]).toBeUndefined();
    expect(skipped.find((s) => s.startsWith("상태"))).toBe('상태(status 옵션 "분석대기" 없음)');
  });

  it("select 타입이면 기존대로 select 형태로 채운다 (옵션 검사 없음)", () => {
    const schema = { 이름: { type: "title" }, 상태: { type: "select" } };
    const { properties } = filterProperties(schema, payload);
    expect(properties["상태"]).toEqual({ select: { name: "분석대기" } });
  });

  it("입력방식도 status 타입이면 같은 규칙을 따른다", () => {
    const withOption = {
      이름: { type: "title" },
      입력방식: { type: "status", status: { options: [{ name: "live" }, { name: "text" }] } },
    };
    expect(filterProperties(withOption, payload).properties["입력방식"]).toEqual({ status: { name: "live" } });

    const withoutOption = {
      이름: { type: "title" },
      입력방식: { type: "status", status: { options: [{ name: "audio" }] } },
    };
    const { properties, skipped } = filterProperties(withoutOption, payload);
    expect(properties["입력방식"]).toBeUndefined();
    expect(skipped.find((s) => s.startsWith("입력방식"))).toBe('입력방식(status 옵션 "live" 없음)');
  });

  it("date·rich_text 속성은 status 규칙의 영향을 받지 않는다", () => {
    const schema = { 이름: { type: "title" }, 회의일시: { type: "date" }, 참석자: { type: "rich_text" } };
    const { properties } = filterProperties(schema, payload);
    expect(properties["회의일시"]).toEqual({ date: { start: "2026-09-15" } });
    expect(properties["참석자"]).toEqual({ rich_text: [{ text: { content: "김팀장, 이책임" } }] });
  });
});

import { listProperties } from "./notionBlocks";

describe("listProperties", () => {
  it("빈 스키마는 빈 배열", () => {
    expect(listProperties({})).toEqual([]);
  });

  it("이름과 타입을 보존한다", () => {
    const out = listProperties({ 이름: { type: "title" }, 회의일자: { type: "date" } });
    expect(out).toEqual([
      { name: "이름", type: "title" },
      { name: "회의일자", type: "date" },
    ]);
  });

  it("select는 옵션 이름을 뽑는다", () => {
    const out = listProperties({
      진행: { type: "select", select: { options: [{ name: "대기" }, { name: "완료" }] } },
    });
    expect(out).toEqual([{ name: "진행", type: "select", options: ["대기", "완료"] }]);
  });

  it("status도 옵션 이름을 뽑는다", () => {
    const out = listProperties({
      상태: { type: "status", status: { options: [{ name: "시작 전" }, { name: "진행 중" }] } },
    });
    expect(out).toEqual([{ name: "상태", type: "status", options: ["시작 전", "진행 중"] }]);
  });

  it("옵션이 없는 타입에는 options 키를 넣지 않는다", () => {
    const out = listProperties({ 참석자: { type: "rich_text" } });
    expect(out[0]).not.toHaveProperty("options");
  });

  it("select인데 options가 비어 있으면 빈 배열", () => {
    const out = listProperties({ 진행: { type: "select", select: { options: [] } } });
    expect(out).toEqual([{ name: "진행", type: "select", options: [] }]);
  });
});

import type { NotionFieldKey, NotionFieldMapping } from "@/types/meeting";

type Fields = Partial<Record<NotionFieldKey, NotionFieldMapping>>;

describe("filterProperties — 매핑", () => {
  it("fields를 넘기지 않으면 기존 동작 그대로", () => {
    const without = filterProperties(fullSchema, payload);
    const withNull = filterProperties(fullSchema, payload, null);
    expect(withNull).toEqual(without);
  });

  it("키가 없는 필드는 하드코딩 이름으로 찾는다", () => {
    const fields: Fields = { status: { property: null } };
    const { properties } = filterProperties(fullSchema, payload, fields);
    expect(properties["회의일시"]).toEqual({ date: { start: "2026-09-15" } });
  });

  it("property가 null이면 채우지 않고 skipped에도 넣지 않는다", () => {
    const fields: Fields = { durationText: { property: null } };
    const { properties, skipped } = filterProperties(fullSchema, payload, fields);
    expect(properties["소요시간"]).toBeUndefined();
    expect(skipped.some((s) => s.startsWith("소요시간"))).toBe(false);
  });

  it("매핑된 이름의 속성에 넣는다", () => {
    const schema = { 이름: { type: "title" }, 회의일자: { type: "date" } };
    const fields: Fields = { meetingDate: { property: "회의일자" } };
    const { properties } = filterProperties(schema, payload, fields);
    expect(properties["회의일자"]).toEqual({ date: { start: "2026-09-15" } });
    expect(properties["회의일시"]).toBeUndefined();
  });

  it("매핑 대상 속성이 스키마에 없으면 이유와 함께 skipped", () => {
    const schema = { 이름: { type: "title" } };
    const fields: Fields = { meetingDate: { property: "없는속성" } };
    const { skipped } = filterProperties(schema, payload, fields);
    expect(skipped).toContain("회의일시(→없는속성: date 아님)");
  });

  it("매핑 대상의 타입이 안 맞으면 이유와 함께 skipped", () => {
    const schema = { 이름: { type: "title" }, 메모: { type: "rich_text" } };
    const fields: Fields = { meetingDate: { property: "메모" } };
    const { properties, skipped } = filterProperties(schema, payload, fields);
    expect(properties["메모"]).toBeUndefined();
    expect(skipped).toContain("회의일시(→메모: date 아님)");
  });

  it("선택형에 옵션을 지정하면 그 옵션을 넣는다 (select)", () => {
    const schema = { 이름: { type: "title" }, 진행: { type: "select" } };
    const fields: Fields = { status: { property: "진행", option: "대기" } };
    const { properties } = filterProperties(schema, payload, fields);
    expect(properties["진행"]).toEqual({ select: { name: "대기" } });
  });

  it("선택형에 옵션을 지정하면 그 옵션을 넣는다 (status, 옵션 존재)", () => {
    const schema = {
      이름: { type: "title" },
      진행: { type: "status", status: { options: [{ name: "대기" }, { name: "완료" }] } },
    };
    const fields: Fields = { status: { property: "진행", option: "대기" } };
    const { properties } = filterProperties(schema, payload, fields);
    expect(properties["진행"]).toEqual({ status: { name: "대기" } });
  });

  it("status 옵션이 없으면 매핑해도 건너뛰고 이유를 남긴다", () => {
    const schema = {
      이름: { type: "title" },
      진행: { type: "status", status: { options: [{ name: "완료" }] } },
    };
    const fields: Fields = { status: { property: "진행", option: "대기" } };
    const { properties, skipped } = filterProperties(schema, payload, fields);
    expect(properties["진행"]).toBeUndefined();
    expect(skipped).toContain('상태(→진행: status 옵션 "대기" 없음)');
  });

  it("옵션을 지정하지 않으면 기본값으로 떨어진다", () => {
    const schema = { 이름: { type: "title" }, 진행: { type: "select" } };
    const fields: Fields = { status: { property: "진행" } };
    const { properties } = filterProperties(schema, payload, fields);
    expect(properties["진행"]).toEqual({ select: { name: "분석대기" } });
  });

  it("입력방식도 매핑된다", () => {
    const schema = { 이름: { type: "title" }, 방식: { type: "select" } };
    const fields: Fields = { entryMethod: { property: "방식", option: "라이브" } };
    const { properties } = filterProperties(schema, payload, fields);
    expect(properties["방식"]).toEqual({ select: { name: "라이브" } });
  });

  it("값 필드 두 개가 같은 속성을 가리키면 먼저 온 쪽이 이기고 나중 것은 skipped에 이유와 함께 남는다", () => {
    const schema = { 이름: { type: "title" }, 메모: { type: "rich_text" } };
    const fields: Fields = {
      attendees: { property: "메모" },
      durationText: { property: "메모" },
    };
    const { properties, skipped } = filterProperties(schema, payload, fields);
    expect(properties["메모"]).toEqual({ rich_text: [{ text: { content: "김팀장, 이책임" } }] });
    expect(skipped).toContain("소요시간(→메모: 참석자와 같은 속성)");
  });

  it("값 필드와 선택형 필드가 같은 속성을 가리켜도 같은 규칙을 적용한다", () => {
    const schema = { 이름: { type: "title" }, 메모: { type: "rich_text" } };
    const fields: Fields = {
      durationText: { property: "메모" },
      status: { property: "메모", option: "아무값" },
    };
    const { properties, skipped } = filterProperties(schema, payload, fields);
    expect(properties["메모"]).toEqual({ rich_text: [{ text: { content: "1:23:45" } }] });
    expect(skipped).toContain("상태(→메모: 소요시간와 같은 속성)");
  });

  it("서로 다른 속성을 가리키면 충돌 없이 둘 다 채워진다", () => {
    const schema = {
      이름: { type: "title" },
      참석자용: { type: "rich_text" },
      소요시간용: { type: "rich_text" },
    };
    const fields: Fields = {
      attendees: { property: "참석자용" },
      durationText: { property: "소요시간용" },
    };
    const { properties, skipped } = filterProperties(schema, payload, fields);
    expect(properties["참석자용"]).toEqual({ rich_text: [{ text: { content: "김팀장, 이책임" } }] });
    expect(properties["소요시간용"]).toEqual({ rich_text: [{ text: { content: "1:23:45" } }] });
    expect(skipped.some((s) => s.includes("같은 속성"))).toBe(false);
  });
});
