import { describe, it, expect } from "vitest";
import { formatTime, nextSpeakerBase, assembleTurns, type RawSegment } from "./turnAssembly";
import type { TurnSegment } from "@/types/meeting";

const turn = (id: number, sp: number, t: string, text: string): TurnSegment => ({ id, sp, t, text });

/** 기본 옵션. 각 테스트에서 필요한 값만 덮어쓴다. */
function opts(over: Partial<Parameters<typeof assembleTurns>[2]> = {}) {
  return {
    baseMs: 0,
    chunkStartMs: 0,
    letterMap: new Map<string, number>(),
    speakerBase: 1,
    isFirstChunkOfSession: false,
    ...over,
  };
}

describe("formatTime", () => {
  it("밀리초를 MM:SS로 바꾼다", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(12_000)).toBe("00:12");
    expect(formatTime(125_000)).toBe("02:05");
  });

  it("60분을 넘으면 분이 계속 늘어난다", () => {
    expect(formatTime(3_725_000)).toBe("62:05");
  });
});

describe("nextSpeakerBase", () => {
  it("발화가 없으면 1", () => {
    expect(nextSpeakerBase([])).toBe(1);
  });

  it("최대 화자 번호 다음", () => {
    expect(nextSpeakerBase([turn(1, 1, "00:00", "a"), turn(2, 2, "00:01", "b")])).toBe(3);
  });

  it("번호가 띄엄띄엄해도 최대값 기준", () => {
    expect(nextSpeakerBase([turn(1, 5, "00:00", "a")])).toBe(6);
  });
});

describe("assembleTurns", () => {
  const seg = (clovaLabel: string, text: string): RawSegment => ({ clovaLabel, text });

  it("빈 조각 배열이면 prev를 그대로 돌려준다", () => {
    const prev = [turn(1, 1, "00:00", "안녕")];
    expect(assembleTurns(prev, [], opts())).toEqual(prev);
  });

  it("prev를 변형하지 않는다", () => {
    const prev = [turn(1, 1, "00:00", "안녕")];
    const snapshot = JSON.parse(JSON.stringify(prev));
    assembleTurns(prev, [seg("1", "반갑습니다")], opts());
    expect(prev).toEqual(snapshot);
  });

  it("공백뿐인 조각은 버린다", () => {
    expect(assembleTurns([], [seg("1", "   ")], opts())).toEqual([]);
  });

  it("같은 화자가 연달아 나오면 한 발화로 합친다", () => {
    const out = assembleTurns([], [seg("1", "안녕"), seg("1", "하세요")], opts());
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("안녕 하세요");
  });

  it("화자가 바뀌면 새 발화를 만든다", () => {
    const out = assembleTurns([], [seg("1", "안녕"), seg("2", "네")], opts());
    expect(out.map((t) => [t.sp, t.text])).toEqual([[1, "안녕"], [2, "네"]]);
  });

  it("id는 prev의 최대값에서 이어진다", () => {
    const out = assembleTurns([turn(7, 1, "00:00", "a")], [seg("2", "b"), seg("3", "c")], opts());
    expect(out.map((t) => t.id)).toEqual([7, 8, 9]);
  });

  it("baseMs와 chunkStartMs를 더해 시각을 만든다", () => {
    const out = assembleTurns([], [seg("1", "안녕")], opts({ baseMs: 600_000, chunkStartMs: 15_000 }));
    expect(out[0].t).toBe("10:15");
  });

  it("문자 레이블을 화자 번호로 매핑한다", () => {
    const letterMap = new Map<string, number>();
    const out = assembleTurns([], [seg("A", "안녕"), seg("B", "네")], opts({ letterMap }));
    expect(out.map((t) => t.sp)).toEqual([1, 2]);
    expect(letterMap.get("A")).toBe(1);
    expect(letterMap.get("B")).toBe(2);
  });

  it("같은 문자가 다시 나오면 같은 화자 번호를 쓴다", () => {
    const letterMap = new Map<string, number>();
    assembleTurns([], [seg("A", "안녕")], opts({ letterMap }));
    const out = assembleTurns([], [seg("B", "네"), seg("A", "다시")], opts({ letterMap }));
    expect(out.map((t) => t.sp)).toEqual([2, 1]);
  });

  // ── speakerBase (스펙 §6 주의) ──

  it("speakerBase가 1이면 숫자 레이블이 그대로 화자 번호가 된다 (기존 동작 보존)", () => {
    const out = assembleTurns([], [seg("1", "안녕"), seg("2", "네")], opts({ speakerBase: 1 }));
    expect(out.map((t) => t.sp)).toEqual([1, 2]);
  });

  it("speakerBase가 3이면 숫자 레이블도 밀려서 3, 4가 된다", () => {
    const out = assembleTurns([], [seg("1", "안녕"), seg("2", "네")], opts({ speakerBase: 3 }));
    expect(out.map((t) => t.sp)).toEqual([3, 4]);
  });

  it("speakerBase가 3이면 문자 레이블도 3부터 시작한다", () => {
    const letterMap = new Map<string, number>();
    const out = assembleTurns([], [seg("A", "안녕"), seg("B", "네")], opts({ speakerBase: 3, letterMap }));
    expect(out.map((t) => t.sp)).toEqual([3, 4]);
  });

  it("레이블 0은 1로 본 뒤 speakerBase를 더한다", () => {
    const out = assembleTurns([], [seg("0", "안녕")], opts({ speakerBase: 3 }));
    expect(out[0].sp).toBe(3);
  });

  // ── 청크 경계를 넘는 병합 ──

  it("첫 청크가 아니면 직전 청크의 같은 화자 발화에 이어붙인다", () => {
    // 한 사람이 15초 경계를 넘어 계속 말하는 경우. 여기서 새 발화를 만들면 한 사람의
    // 말이 청크마다 토막 난다. prev가 비어 있지 않고 마지막 발화의 sp가 같아야 검증된다.
    const prev = [turn(3, 2, "00:15", "앞 청크에서 하던 말")];
    const out = assembleTurns(
      prev,
      [seg("2", "이어서 하는 말")],
      opts({ chunkStartMs: 30_000, isFirstChunkOfSession: false }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(3);
    expect(out[0].t).toBe("00:15");
    expect(out[0].text).toBe("앞 청크에서 하던 말 이어서 하는 말");
  });

  // ── 이어 녹음 첫 청크 ──

  it("이어 녹음 첫 청크는 화자가 같아도 이전 세션 발화에 합치지 않는다", () => {
    const prev = [turn(1, 1, "00:10", "1차 마지막")];
    const out = assembleTurns(prev, [seg("1", "2차 첫마디")], opts({ isFirstChunkOfSession: true }));
    expect(out).toHaveLength(2);
    expect(out[1].text).toBe("2차 첫마디");
  });

  it("이어 녹음 첫 청크 안에서는 같은 화자끼리 정상적으로 합친다", () => {
    const prev = [turn(1, 1, "00:10", "1차 마지막")];
    const out = assembleTurns(
      prev,
      [seg("1", "2차"), seg("1", "첫마디")],
      opts({ isFirstChunkOfSession: true }),
    );
    expect(out).toHaveLength(2);
    expect(out[1].text).toBe("2차 첫마디");
  });
});
