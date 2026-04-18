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

import { proposeExcessMerge } from "./speakerMerge";

describe("proposeExcessMerge", () => {
  it("returns empty when attendeeCount <= 0", () => {
    const segs = [seg(1, 1, "1:1", "a", 0, 100)];
    expect(proposeExcessMerge(segs, 0)).toEqual([]);
    expect(proposeExcessMerge(segs, -1)).toEqual([]);
  });

  it("returns empty when each chunk has <= attendeeCount distinct speakers", () => {
    const segs = [
      seg(1, 1, "1:1", "a", 0, 100),
      seg(2, 1, "1:2", "b", 100, 200),
      seg(3, 2, "2:1", "c", 200, 300),
      seg(4, 2, "2:2", "d", 300, 400),
    ];
    expect(proposeExcessMerge(segs, 2)).toEqual([]);
  });

  it("proposes intra-chunk merges for a single over-split chunk", () => {
    const segs = [
      seg(1, 1, "1:1", "x", 0, 50),
      seg(2, 1, "1:1", "x", 100, 150),
      seg(3, 1, "1:1", "x", 250, 300),
      seg(4, 1, "1:2", "y", 350, 400),
      seg(5, 1, "1:2", "y", 550, 600),
      seg(6, 1, "1:3", "z", 100, 120), // 1-utter excess, near 1:1
      seg(7, 1, "1:4", "w", 700, 720), // 1-utter excess, near 1:2 tail
    ];
    const props = proposeExcessMerge(segs, 2);
    expect(props).toHaveLength(2);
    const p3 = props.find((p) => p.from === "1:3");
    const p4 = props.find((p) => p.from === "1:4");
    expect(p3?.to).toBe("1:1");
    expect(p4?.to).toBe("1:2");
  });

  it("never proposes cross-chunk merges (intra-chunk safety invariant)", () => {
    const segs = [
      seg(1, 1, "1:1", "x", 0, 100),
      seg(2, 1, "1:2", "y", 100, 200),
      seg(3, 1, "1:3", "z", 200, 300),
      seg(4, 2, "2:1", "a", 400, 500),
      seg(5, 2, "2:2", "b", 500, 600),
      seg(6, 2, "2:3", "c", 600, 700),
    ];
    const props = proposeExcessMerge(segs, 2);
    expect(props.length).toBeGreaterThan(0);
    for (const p of props) {
      expect(p.from.split(":")[0]).toBe(p.to.split(":")[0]);
    }
  });

  it("does NOT propose merges when each chunk has exactly attendeeCount speakers (dominant-speaker trap regression)", () => {
    // A dominates globally (1:1, 2:1, 3:1 are frequent), B is less frequent
    // (1:2, 2:2, 3:2). Each chunk has exactly 2 speakers. attendeeCount = 2.
    // A global-top-N algorithm would misclassify B as excess; per-chunk
    // algorithm correctly returns zero proposals.
    const segs = [
      seg(1, 1, "1:1", "x", 0, 100),
      seg(2, 1, "1:1", "x", 100, 200),
      seg(3, 1, "1:2", "y", 200, 300),
      seg(4, 2, "2:1", "x", 400, 500),
      seg(5, 2, "2:1", "x", 500, 600),
      seg(6, 2, "2:2", "y", 600, 700),
      seg(7, 3, "3:1", "x", 800, 900),
      seg(8, 3, "3:2", "y", 900, 1000),
    ];
    expect(proposeExcessMerge(segs, 2)).toEqual([]);
  });

  it("falls back to most-frequent chunk-major when excess has no timing", () => {
    const segs = [
      seg(1, 1, "1:1", "x", 0, 100),
      seg(2, 1, "1:1", "x", 100, 200),
      seg(3, 1, "1:2", "y", 300, 400),
      seg(4, 1, "1:3", "z"), // no timing
    ];
    expect(proposeExcessMerge(segs, 2)).toEqual([{ from: "1:3", to: "1:1" }]);
  });

  it("breaks adjacency ties by higher within-chunk utterance count", () => {
    // 1:1 count 3 at 0,100,200; 1:2 count 2 at 300,400; 1:3 count 1 at 250.
    // Distance from 1:3 (250) to 1:1 = min(250,150,50) = 50.
    // Distance from 1:3 (250) to 1:2 = min(50,150) = 50. Tie.
    // Break by count: 1:1 (3) > 1:2 (2) → pick 1:1.
    const segs = [
      seg(1, 1, "1:1", "x", 0, 10),
      seg(2, 1, "1:1", "x", 100, 110),
      seg(3, 1, "1:1", "x", 200, 210),
      seg(4, 1, "1:2", "y", 300, 310),
      seg(5, 1, "1:2", "y", 400, 410),
      seg(6, 1, "1:3", "z", 250, 260),
    ];
    expect(proposeExcessMerge(segs, 2)).toEqual([{ from: "1:3", to: "1:1" }]);
  });

  it("evaluates each chunk independently", () => {
    // Chunk 1 has 3 speakers (over), chunk 2 has 2 (under). One proposal from chunk 1.
    const segs = [
      seg(1, 1, "1:1", "x", 0, 100),
      seg(2, 1, "1:1", "x", 100, 200),
      seg(3, 1, "1:2", "y", 200, 300),
      seg(4, 1, "1:3", "z", 300, 400),
      seg(5, 2, "2:1", "a", 500, 600),
      seg(6, 2, "2:2", "b", 600, 700),
    ];
    const props = proposeExcessMerge(segs, 2);
    expect(props).toHaveLength(1);
    expect(props[0].from.startsWith("1:")).toBe(true);
  });

  it("does not mutate input segments", () => {
    const segs = [
      seg(1, 1, "1:1", "x", 0, 100),
      seg(2, 1, "1:2", "y", 200, 300),
      seg(3, 1, "1:3", "z", 400, 500),
    ];
    const before = JSON.stringify(segs);
    proposeExcessMerge(segs, 2);
    expect(JSON.stringify(segs)).toBe(before);
  });
});
