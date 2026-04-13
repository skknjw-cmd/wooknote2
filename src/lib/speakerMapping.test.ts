import { describe, it, expect } from "vitest";
import { parseAttendees } from "./speakerMapping";

describe("parseAttendees", () => {
  it("splits on commas and trims", () => {
    expect(parseAttendees("홍길동, 김영희, 박철수")).toEqual([
      "홍길동",
      "김영희",
      "박철수",
    ]);
  });

  it("removes empty entries and duplicates preserving first occurrence", () => {
    expect(parseAttendees("홍길동,,김영희 , 홍길동")).toEqual([
      "홍길동",
      "김영희",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(parseAttendees("")).toEqual([]);
    expect(parseAttendees("   ")).toEqual([]);
  });
});

import { getSpeakerStats } from "./speakerMapping";
import type { Segment } from "@/types/meeting";

const seg = (i: number, sp: string, text = "x"): Segment => ({
  id: `seg_${String(i).padStart(6, "0")}`,
  sequenceId: Number(sp.split(":")[0]),
  originalSpeaker: sp,
  text,
});

describe("getSpeakerStats", () => {
  it("returns empty array for no segments", () => {
    expect(getSpeakerStats([])).toEqual([]);
  });

  it("counts occurrences per original speaker in encounter order", () => {
    const segs = [
      seg(1, "1:1"),
      seg(2, "1:2"),
      seg(3, "1:1"),
      seg(4, "2:1"),
    ];
    const stats = getSpeakerStats(segs);
    expect(stats).toEqual([
      { originalSpeaker: "1:1", count: 2, globalIndex: 1 },
      { originalSpeaker: "1:2", count: 1, globalIndex: 2 },
      { originalSpeaker: "2:1", count: 1, globalIndex: 3 },
    ]);
  });

  it("assigns globalIndex on first encounter, not on later occurrences", () => {
    const segs = [
      seg(1, "A:A"),
      seg(2, "B:B"),
      seg(3, "A:A"),
      seg(4, "C:C"),
      seg(5, "B:B"),
    ];
    expect(getSpeakerStats(segs)).toEqual([
      { originalSpeaker: "A:A", count: 2, globalIndex: 1 },
      { originalSpeaker: "B:B", count: 2, globalIndex: 2 },
      { originalSpeaker: "C:C", count: 1, globalIndex: 3 },
    ]);
  });
});

import { resolveSegments } from "./speakerMapping";
import type { SpeakerMapping } from "@/types/meeting";

describe("resolveSegments", () => {
  it("falls back to 화자 N when no mapping", () => {
    const segs: Segment[] = [
      seg(1, "1:1", "안녕하세요"),
      seg(2, "1:2", "반갑습니다"),
    ];
    expect(resolveSegments(segs, {})).toBe(
      "화자 1: 안녕하세요\n\n화자 2: 반갑습니다"
    );
  });

  it("uses mapping when present", () => {
    const segs: Segment[] = [seg(1, "1:1", "안녕")];
    const map: SpeakerMapping = { "1:1": "홍길동" };
    expect(resolveSegments(segs, map)).toBe("홍길동: 안녕");
  });

  it("speakerOverride wins over mapping", () => {
    const segs: Segment[] = [
      { ...seg(1, "1:1", "안녕"), speakerOverride: "김영희" },
    ];
    const map: SpeakerMapping = { "1:1": "홍길동" };
    expect(resolveSegments(segs, map)).toBe("김영희: 안녕");
  });

  it("merges consecutive same-speaker segments into one block", () => {
    const segs: Segment[] = [
      seg(1, "1:1", "첫 번째"),
      seg(2, "1:1", "두 번째"),
      seg(3, "1:2", "다른 사람"),
      seg(4, "1:1", "다시 첫 번째"),
    ];
    const map: SpeakerMapping = { "1:1": "홍길동", "1:2": "김영희" };
    expect(resolveSegments(segs, map)).toBe(
      "홍길동: 첫 번째\n두 번째\n\n김영희: 다른 사람\n\n홍길동: 다시 첫 번째"
    );
  });

  it("treats empty-string mapping as no mapping (falls back to 화자 N)", () => {
    const segs: Segment[] = [seg(1, "1:1", "안녕")];
    const map: SpeakerMapping = { "1:1": "" };
    expect(resolveSegments(segs, map)).toBe("화자 1: 안녕");
  });

  it("treats whitespace-only override as no override (falls back to mapping)", () => {
    const segs: Segment[] = [
      { ...seg(1, "1:1", "안녕"), speakerOverride: "   " },
    ];
    const map: SpeakerMapping = { "1:1": "홍길동" };
    expect(resolveSegments(segs, map)).toBe("홍길동: 안녕");
  });

  it("renders empty-text segments without crashing (current behavior)", () => {
    const segs: Segment[] = [
      seg(1, "1:1", ""),
      seg(2, "1:1", "둘째"),
    ];
    const map: SpeakerMapping = { "1:1": "홍길동" };
    expect(resolveSegments(segs, map)).toBe("홍길동: \n둘째");
  });
});
