import { describe, it, expect } from "vitest";
import { computeBoundaryMerge } from "./speakerMerge";
import type { Segment } from "@/types/meeting";

const seg = (
  id: number,
  seq: number,
  speaker: string,
  text = "x",
  start?: number,
  end?: number
): Segment => ({
  id: `seg_${String(id).padStart(6, "0")}`,
  sequenceId: seq,
  originalSpeaker: speaker,
  rawClovaKey: speaker,
  text,
  start,
  end,
});

describe("computeBoundaryMerge", () => {
  it("merges across boundary when gap < 500ms and no terminator", () => {
    const segs = [
      seg(1, 1, "1:1", "말하는 중", 0, 100),
      seg(2, 1, "1:2", "이어서", 100, 200),
      seg(3, 2, "2:1", "계속", 200, 300),
    ];
    const result = computeBoundaryMerge(segs);
    // last of chunk 1 is 1:2 end=200, first of chunk 2 is 2:1 start=200, gap=0, no terminator
    expect(result[2].originalSpeaker).toBe("1:2");
    expect(result[2].rawClovaKey).toBe("2:1");
  });

  it("does not merge when lastSeg ends with period", () => {
    const segs = [
      seg(1, 1, "1:1", "끝났다.", 0, 100),
      seg(2, 2, "2:1", "새 사람", 100, 200),
    ];
    expect(computeBoundaryMerge(segs)[1].originalSpeaker).toBe("2:1");
  });

  it("does not merge when lastSeg ends with ? or !", () => {
    for (const term of ["?", "!"]) {
      const segs = [
        seg(1, 1, "1:1", `끝났다${term}`, 0, 100),
        seg(2, 2, "2:1", "새 사람", 100, 200),
      ];
      expect(computeBoundaryMerge(segs)[1].originalSpeaker).toBe("2:1");
    }
  });

  it("does not merge when text ends with CJK fullwidth terminator", () => {
    const segs = [
      seg(1, 1, "1:1", "끝。", 0, 100),
      seg(2, 2, "2:1", "a", 100, 200),
    ];
    expect(computeBoundaryMerge(segs)[1].originalSpeaker).toBe("2:1");
  });

  it("does not merge when gap >= 500ms", () => {
    const segs = [
      seg(1, 1, "1:1", "말하다가", 0, 100),
      seg(2, 2, "2:1", "한참 뒤", 700, 800),
    ];
    expect(computeBoundaryMerge(segs)[1].originalSpeaker).toBe("2:1");
  });

  it("chains across three chunks when all gaps are tight and non-terminated", () => {
    const segs = [
      seg(1, 1, "1:1", "a", 0, 100),
      seg(2, 2, "2:2", "b", 100, 200),
      seg(3, 3, "3:3", "c", 200, 300),
    ];
    const result = computeBoundaryMerge(segs);
    expect(result[0].originalSpeaker).toBe("1:1");
    expect(result[1].originalSpeaker).toBe("1:1");
    expect(result[2].originalSpeaker).toBe("1:1");
  });

  it("skips pair when start/end missing", () => {
    const segs = [
      seg(1, 1, "1:1", "a"), // no timing
      seg(2, 2, "2:1", "b", 100, 200),
    ];
    expect(computeBoundaryMerge(segs)[1].originalSpeaker).toBe("2:1");
  });

  it("does not merge across a failed chunk (seq:? with no timing)", () => {
    const segs = [
      seg(1, 1, "1:1", "a", 0, 100),
      seg(2, 2, "2:?", "[실패]"), // no timing
      seg(3, 3, "3:1", "c", 200, 300),
    ];
    expect(computeBoundaryMerge(segs)[2].originalSpeaker).toBe("3:1");
  });

  it("is a no-op when boundary speakers are already the same", () => {
    const segs = [
      seg(1, 1, "1:1", "a", 0, 100),
      seg(2, 2, "1:1", "b", 100, 200),
    ];
    expect(computeBoundaryMerge(segs)[1].originalSpeaker).toBe("1:1");
  });

  it("does not mutate the input array or its segments", () => {
    const segs = [
      seg(1, 1, "1:1", "a", 0, 100),
      seg(2, 2, "2:1", "b", 100, 200),
    ];
    const before = JSON.stringify(segs);
    computeBoundaryMerge(segs);
    expect(JSON.stringify(segs)).toBe(before);
  });

  it("returns input unchanged when there's only one chunk", () => {
    const segs = [
      seg(1, 1, "1:1", "a", 0, 100),
      seg(2, 1, "1:2", "b", 100, 200),
    ];
    const result = computeBoundaryMerge(segs);
    expect(result[0].originalSpeaker).toBe("1:1");
    expect(result[1].originalSpeaker).toBe("1:2");
  });
});
